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
 * LIMIT: gates are run with no runtime arguments. A gate that needs inputs (e.g. a changed-file list)
 *        is not yet expressible in the manifest; an `args`/`requires` field is a future schema addition.
 *
 * Exit codes: 0 = all required gates passed; 1 = a required gate failed; 2 = fail-closed.
 * Seams for tests: GATE_MANIFEST_FILE, GATE_RUNNER (override the node binary). Pinned by
 * test/run-manifest-gates.test.mjs.
 */
import { readFileSync, existsSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { resolve, dirname, sep } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..", "..", "..");
const MANIFEST = process.env.GATE_MANIFEST_FILE ? resolve(process.env.GATE_MANIFEST_FILE) : resolve(ROOT, "gate-manifest.json");
const BASE = dirname(MANIFEST);
const NODE = process.env.GATE_RUNNER || process.execPath;

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

const within = (p) => p === BASE || p.startsWith(BASE + sep);
const requiredFailures = [];
const advisoryFailures = [];
const summary = [];

for (const gate of manifest.gates) {
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
  const runner = gate.script.endsWith(".sh") ? "bash" : NODE;
  console.log(`\n── gate: ${gate.id} (${gate.lane}) ──`);
  const res = spawnSync(runner, [scriptPath], { stdio: "inherit" });
  const code = res.status === null ? 1 : res.status; // signal/crash → treat as failure
  summary.push({ id: gate.id, lane: gate.lane, code });
  if (code !== 0) (gate.lane === "required" ? requiredFailures : advisoryFailures).push(gate.id);
}

console.log("\n── aggregate ──");
for (const s of summary) console.log(`  ${s.code === 0 ? "✓" : "✗"} ${s.id} (${s.lane}) exit ${s.code}`);
if (advisoryFailures.length) console.log(`  advisory failures (non-blocking): ${advisoryFailures.join(", ")}`);

if (requiredFailures.length) {
  console.error(`\n✖ run-manifest-gates: ${requiredFailures.length} required gate(s) failed: ${requiredFailures.join(", ")}`);
  process.exit(1);
}
console.log(`\n✓ run-manifest-gates: all ${summary.filter((s) => s.lane === "required").length} required gate(s) passed.`);
