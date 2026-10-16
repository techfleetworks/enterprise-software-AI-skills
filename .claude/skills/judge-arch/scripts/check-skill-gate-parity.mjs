#!/usr/bin/env node
// bootstrap-v2-gate: skill-gate-parity
/**
 * PARITY-001 - a consumer repo's committed CI gates must match its gate-manifest.json (ADR-0041).
 *
 * WHAT: Fails if a repo's committed gate scripts drift from, are missing against, or exceed the
 *       manifest's allow-list: (a) a manifest gate whose script is absent, (b) a committed gate whose
 *       sha256 differs from the manifest's recorded hash (drift / tamper), (c) a manifest gate whose
 *       discrimination `test` is absent, (d) a committed gate script in the gate directory that the
 *       manifest does not list (unsanctioned - the manifest is an allow-list).
 *
 * HOW:  Reads gate-manifest.json, then for each listed gate checks the script exists and its sha256
 *       (node:crypto over the file bytes) equals the manifest value, and the test file exists. Then it
 *       lists the gate directory (default scripts/ci/check-*.mjs) and fails on any script not in the
 *       manifest. Paths are read; nothing is executed. Fail-closed (exit 2) if the manifest is missing,
 *       unparseable, or not shaped like a manifest (no gates array).
 *
 * WHY:  Bootstrap-v2 keeps a consumer repo's CI gates matched to its installed skills. The manifest is
 *       the single source of truth (ADR-0041); without an enforcer the committed gates can silently
 *       drift from it, a gate can be weakened in place, or an unsanctioned gate can be slipped in. This
 *       is the gate that makes drift a red CI state (the sync-drift and malicious-actor features).
 *
 * FIX:  Re-sync: copy the manifest's gate scripts into place (so hashes match), add any missing test,
 *       and either add an unsanctioned script to the manifest (if it is a sanctioned repo-local gate,
 *       with origin "repo-local") or remove it. Bump a gate's manifest sha256 only when its content
 *       legitimately changes, in the same commit as the script.
 *
 * Exit codes: 0 = in parity; 1 = drift/missing/unsanctioned; 2 = fail-closed.
 * Seams for tests: GATE_MANIFEST_FILE (manifest path), GATE_DIR (gate-script directory),
 * GATE_GLOB_PREFIX (basename prefix of gate scripts, default "check-"). Pinned by
 * test/skill-gate-parity.test.mjs.
 */
import { readFileSync, readdirSync, existsSync, statSync } from "node:fs";
import { createHash } from "node:crypto";
import { resolve, dirname, join, sep, basename } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..", "..", "..");
const MANIFEST = process.env.GATE_MANIFEST_FILE
  ? resolve(process.env.GATE_MANIFEST_FILE)
  : resolve(ROOT, "gate-manifest.json");
const GATE_DIR = process.env.GATE_DIR ? resolve(process.env.GATE_DIR) : resolve(ROOT, "scripts", "ci");
const PREFIX = process.env.GATE_GLOB_PREFIX ?? "check-";
const BASE = process.env.GATE_MANIFEST_FILE ? resolve(process.env.GATE_MANIFEST_FILE, "..") : ROOT;

const fail = (lines) => {
  console.error("✖ check-skill-gate-parity: the committed gates do not match gate-manifest.json:");
  for (const l of lines) console.error(`   • ${l}`);
  process.exit(1);
};
const failClosed = (msg) => {
  console.error(`✖ check-skill-gate-parity (fail-closed): ${msg}`);
  process.exit(2);
};

let manifest;
try {
  manifest = JSON.parse(readFileSync(MANIFEST, "utf8"));
} catch (e) {
  failClosed(`cannot read/parse ${MANIFEST}: ${e.message}`);
}
if (!manifest || typeof manifest !== "object" || !Array.isArray(manifest.gates)) {
  failClosed(`${MANIFEST} is not a gate manifest (no gates array). Refusing to pass.`);
}

const sha256 = (file) => createHash("sha256").update(readFileSync(file)).digest("hex");
const violations = [];
const sanctioned = new Set();

const within = (p) => p === BASE || p.startsWith(BASE + sep);
for (const gate of manifest.gates) {
  // Fail closed on a malformed gate entry rather than crashing on path.resolve(undefined).
  if (typeof gate?.id !== "string" || typeof gate?.script !== "string" || typeof gate?.sha256 !== "string") {
    failClosed(`${MANIFEST} has a malformed gate entry (id, script, sha256 must each be a string).`);
  }
  const scriptPath = resolve(BASE, gate.script);
  // A manifest must not point a gate script outside the repo (path traversal via `../`): refuse to
  // read/hash an arbitrary file, and treat it as a parity violation rather than silently following it.
  if (!within(scriptPath)) {
    violations.push(`gate "${gate.id}": script ${gate.script} escapes the repo (path traversal).`);
    continue;
  }
  sanctioned.add(resolve(scriptPath)); // record for the allow-list pass, even if missing
  if (!existsSync(scriptPath)) {
    violations.push(`gate "${gate.id}": script ${gate.script} is missing.`);
    continue;
  }
  const actual = sha256(scriptPath);
  if (actual !== gate.sha256) {
    violations.push(
      `gate "${gate.id}": ${gate.script} sha256 ${actual.slice(0, 12)}… != manifest ${String(gate.sha256).slice(0, 12)}… (drift/tamper).`,
    );
  }
  if (!gate.test) {
    violations.push(`gate "${gate.id}": names no discrimination test (every gate must name one).`);
  } else if (!existsSync(resolve(BASE, gate.test))) {
    violations.push(`gate "${gate.id}": discrimination test ${gate.test} is missing.`);
  }
}

// Machinery (the aggregator and the like) is not a gate, but it ships and must not drift: hold each
// machinery script to its manifest sha256 the same way, and sanction it so the allow-list does not flag
// it. It carries no discrimination-test requirement here (it is not a gate that judges code).
for (const mach of Array.isArray(manifest.machinery) ? manifest.machinery : []) {
  if (typeof mach?.id !== "string" || typeof mach?.script !== "string" || typeof mach?.sha256 !== "string") {
    failClosed(`${MANIFEST} has a malformed machinery entry (id, script, sha256 must each be a string).`);
  }
  const scriptPath = resolve(BASE, mach.script);
  if (!within(scriptPath)) {
    violations.push(`machinery "${mach.id}": script ${mach.script} escapes the repo (path traversal).`);
    continue;
  }
  // Machinery is exempt from the per-gate discrimination-test requirement, so a gate must not masquerade
  // as machinery to skip it: a machinery script may not use the gate "check-" prefix.
  if (basename(mach.script).startsWith(PREFIX)) {
    violations.push(`machinery "${mach.id}": script ${mach.script} uses the gate "${PREFIX}" prefix; machinery must not look like a gate (it skips the discrimination-test requirement).`);
    continue;
  }
  sanctioned.add(resolve(scriptPath));
  if (!existsSync(scriptPath)) {
    violations.push(`machinery "${mach.id}": script ${mach.script} is missing.`);
    continue;
  }
  const actual = sha256(scriptPath);
  if (actual !== mach.sha256) {
    violations.push(
      `machinery "${mach.id}": ${mach.script} sha256 ${actual.slice(0, 12)}… != manifest ${String(mach.sha256).slice(0, 12)}… (drift/tamper).`,
    );
  }
}

// Allow-list pass: every committed gate script must be sanctioned by the manifest.
let dirEntries = [];
try {
  dirEntries = existsSync(GATE_DIR) && statSync(GATE_DIR).isDirectory() ? readdirSync(GATE_DIR) : [];
} catch {
  dirEntries = [];
}
for (const name of dirEntries) {
  if (!name.startsWith(PREFIX) || !/\.(mjs|cjs|js|ts|sh)$/.test(name)) continue;
  const abs = resolve(GATE_DIR, name);
  if (!sanctioned.has(abs)) {
    violations.push(`unsanctioned gate ${join(GATE_DIR === resolve(ROOT, "scripts", "ci") ? "scripts/ci" : GATE_DIR, name)} is not listed in the manifest (allow-list).`);
  }
}

if (violations.length) fail(violations);
console.log(
  `✓ check-skill-gate-parity: ${manifest.gates.length} gate(s) match the manifest (hashes, tests present, no unsanctioned scripts).`,
);
