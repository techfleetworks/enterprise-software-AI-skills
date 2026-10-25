#!/usr/bin/env node
// bootstrap-v2-machinery: run-manifest-gates
/**
 * AGGREGATOR-001 - run every gate the manifest lists, as one check (bootstrap-v2, ADR-0043).
 *
 * WHAT: Reads gate-manifest.json and runs each listed gate script. A `required` gate that exits
 *       non-zero fails the aggregator (exit 1). An `advisory` gate that fails is reported but does not
 *       block. The point: a consumer repo wires ONE required status check (this), and adding/removing a
 *       gate in the manifest never changes the required-check set.
 *
 * HOW:  For each gate it resolves the script relative to the manifest, refuses a path that escapes the
 *       repo, and runs it (node for .mjs/.cjs/.js, bash for .sh) with no extra args. It collects exit
 *       codes, prints a summary, and aggregates. Fails CLOSED (exit 2) if the manifest is missing or
 *       malformed, or if a listed gate's script is missing or escapes the repo (it cannot run what the
 *       manifest promised, so it must not report green).
 *
 * WHY:  The manifest is the source of truth for which gates must run (ADR-0041); the parity gate
 *       (ADR-0042) proves the committed gates MATCH it. This aggregator is what actually RUNS them under
 *       a single required check, so enforcement is manifest-driven and branch protection is touched once.
 *
 * FIX:  If a required gate failed, read its own output above and fix what it flags. If the aggregator
 *       fails closed, run the parity gate: a missing/escaping script means the repo is out of parity
 *       with the manifest.
 *
 * ARGS:  a gate may declare `invoke` in the manifest (an array of string CLI args, e.g. the paths to scan);
 *        the aggregator passes them to the gate script with no shell. A gate with no `invoke` runs with no
 *        arguments, as before. This is how an engineering gate that scans the consumer's code says what to
 *        scan (ADR-0059).
 *
 * Exit codes: 0 = all required gates passed; 1 = a required gate failed; 2 = fail-closed.
 * Seams for tests: GATE_MANIFEST_FILE, GATE_RUNNER (override the node binary). Pinned by
 * test/run-manifest-gates.test.mjs.
 */
import { readFileSync, existsSync, appendFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { resolve, dirname, sep } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..", "..", "..");
const MANIFEST = process.env.GATE_MANIFEST_FILE ? resolve(process.env.GATE_MANIFEST_FILE) : resolve(ROOT, "gate-manifest.json");
const BASE = dirname(MANIFEST);
const NODE = process.env.GATE_RUNNER || process.execPath;
// A VACUOUS pass is a gate that exits 0 having found nothing in its scope to check (no .sql files, no source
// files, no alert blocks). The --allow-empty gates print exactly this marker on that branch and never on a real
// pass, so it is the signal the aggregator uses to tell "passed, nothing to check" from "passed, checked and
// clean" (#150, ADR-0089). A vacuous pass still exits 0 (its matrix job stays green); it is only RENDERED apart.
const VACUOUS_MARKER = /--allow-empty; whole-repo scope/;

const failClosed = (msg) => {
  console.error(`✖ run-manifest-gates (fail-closed): ${msg}`);
  process.exit(2);
};

let manifest;
try {
  manifest = JSON.parse(readFileSync(MANIFEST, "utf8"));
} catch (e) {
  failClosed(`cannot read/parse ${MANIFEST}: ${e.message}`);
}
if (!manifest || typeof manifest !== "object" || !Array.isArray(manifest.gates)) {
  failClosed(`${MANIFEST} is not a gate manifest (no gates array).`);
}
if (manifest.gates.length === 0) {
  failClosed(`${MANIFEST} lists zero gates - enforcement would be silently off.`);
}

// --only <id>: run a SINGLE gate by id, reusing every per-gate safeguard below (within-repo, invoke
// validation, lane handling, fail-closed). The per-skill CI matrix (gate-matrix.mjs) uses this to give one
// check line per gate; the matrix is generated from this same manifest, so a gate with no matching id means
// the matrix is out of sync and we fail closed rather than silently skip it.
const onlyIdx = process.argv.indexOf("--only");
const ONLY = onlyIdx !== -1 ? process.argv[onlyIdx + 1] : null;
let gatesToRun = manifest.gates;
if (onlyIdx !== -1) {
  if (!ONLY) failClosed("--only requires a gate id");
  gatesToRun = manifest.gates.filter((g) => g?.id === ONLY);
  if (gatesToRun.length === 0) failClosed(`--only "${ONLY}": no gate with that id in the manifest (the per-gate matrix is out of sync).`);
}

const within = (p) => p === BASE || p.startsWith(BASE + sep);
const requiredFailures = [];
const advisoryFailures = [];
const summary = [];

for (const gate of gatesToRun) {
  if (typeof gate?.id !== "string" || typeof gate?.script !== "string") {
    failClosed(`${MANIFEST} has a malformed gate entry (id/script must be strings).`);
  }
  if (gate.lane !== "required" && gate.lane !== "advisory") {
    failClosed(`gate "${gate.id}": lane must be exactly "required" or "advisory" (got ${JSON.stringify(gate.lane)}) - an unknown lane would silently downgrade a required gate.`);
  }
  const scriptPath = resolve(BASE, gate.script);
  if (!within(scriptPath) || !existsSync(scriptPath)) {
    failClosed(`gate "${gate.id}": script ${gate.script} is missing or escapes the repo - run the parity gate.`);
  }
  // Optional per-gate CLI args (schema: gate.invoke): how an engineering gate declares what to scan.
  // Validate strictly (array of strings, or absent) and fail closed otherwise, so a malformed invoke can
  // never silently drop the gate's arguments and make it scan nothing. Passed with NO shell, so a value
  // can never inject a command; and the manifest is itself parity- and provenance-protected.
  let invokeArgs = [];
  if (gate.invoke !== undefined) {
    if (!Array.isArray(gate.invoke) || gate.invoke.some((a) => typeof a !== "string")) {
      failClosed(`gate "${gate.id}": invoke must be an array of strings when present (got ${JSON.stringify(gate.invoke)}).`);
    }
    invokeArgs = gate.invoke;
  }
  const runner = gate.script.endsWith(".sh") ? "bash" : NODE;
  console.log(`\n── gate: ${gate.id} (${gate.lane})${invokeArgs.length ? " " + invokeArgs.join(" ") : ""} ──`);
  // Capture (not inherit) so we can detect a vacuous pass from the gate's own output, then re-emit that output
  // verbatim so a human still sees exactly what the gate printed. Gates are small and fast, so buffering is fine.
  const res = spawnSync(runner, [scriptPath, ...invokeArgs], { encoding: "utf8" });
  if (res.stdout) process.stdout.write(res.stdout);
  if (res.stderr) process.stderr.write(res.stderr);
  const code = res.status === null ? 1 : res.status; // signal/crash → treat as failure
  // Vacuous only when the gate PASSED (code 0) and reported it scanned nothing in scope; a failure that happened
  // to print the marker is still a failure, never "vacuous".
  const vacuous = code === 0 && VACUOUS_MARKER.test((res.stdout || "") + (res.stderr || ""));
  summary.push({ id: gate.id, lane: gate.lane, code, vacuous });
  if (code !== 0) (gate.lane === "required" ? requiredFailures : advisoryFailures).push(gate.id);
}

console.log("\n── aggregate ──");
for (const s of summary) {
  const mark = s.code !== 0 ? "✗" : s.vacuous ? "○" : "✓";
  const note = s.vacuous ? " vacuous (nothing in scope)" : "";
  console.log(`  ${mark} ${s.id} (${s.lane}) exit ${s.code}${note}`);
}
if (advisoryFailures.length) console.log(`  advisory failures (non-blocking): ${advisoryFailures.join(", ")}`);

// Surface vacuous passes so a green board is not mistaken for "every gate examined the code". A vacuous pass is
// still a pass (it does not fail the aggregator); it is only reported distinctly here and in the CI job summary.
const vacuousGates = summary.filter((s) => s.vacuous).map((s) => s.id);
if (vacuousGates.length) {
  const msg = `${vacuousGates.length} gate(s) passed VACUOUSLY (nothing in their scope to check): ${vacuousGates.join(", ")}. A vacuous pass is not evidence the code was examined.`;
  console.log(`\nℹ ${msg}`);
  if (process.env.GITHUB_ACTIONS) process.stdout.write(`::warning title=enterprise-gates vacuous passes::${msg}\n`);
  if (process.env.GITHUB_STEP_SUMMARY) {
    try { appendFileSync(process.env.GITHUB_STEP_SUMMARY, `\n> **enterprise-gates:** ${msg}\n`); } catch { /* best-effort; never fail the gate on a summary write */ }
  }
}

if (requiredFailures.length) {
  console.error(`\n✖ run-manifest-gates: ${requiredFailures.length} required gate(s) failed: ${requiredFailures.join(", ")}`);
  process.exit(1);
}
console.log(`\n✓ run-manifest-gates: all ${summary.filter((s) => s.lane === "required").length} required gate(s) passed${vacuousGates.length ? ` (${vacuousGates.length} vacuously; see note above)` : ""}.`);
