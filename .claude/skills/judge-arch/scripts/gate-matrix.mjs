#!/usr/bin/env node
// bootstrap-v2-machinery: gate-matrix
/**
 * gate-matrix - emit the manifest's gate ids as a JSON array, for the per-skill CI matrix.
 *
 * WHAT: Reads gate-manifest.json and prints a compact JSON array of gate ids to stdout, e.g.
 *       ["skill-gate-parity","manifest-provenance",...]. The scaffolded enterprise-gates workflow feeds
 *       this into a GitHub Actions matrix (`fromJSON`), so every gate the manifest lists becomes one check
 *       line in the PR - automatically, on every run, with no per-gate branch-protection wiring. The single
 *       REQUIRED check stays the summary job that `needs` all matrix jobs; this only adds visibility and is
 *       drift-proof by construction (the matrix is generated from the same manifest the aggregator runs).
 *
 * WHY: a per-gate matrix must be derived from the manifest, never hand-maintained in YAML - a hand-listed
 *      matrix would silently drift from the gate set (a new gate would get no check line, or a dropped gate
 *      would keep a stale one). Deriving it here means the matrix cannot disagree with what actually runs.
 *
 * Exit 0 = printed the array. 2 = fail-closed (cannot read/parse the manifest, no gates array, zero gates,
 *          or a malformed gate id) - a CI matrix step that cannot enumerate the gates must fail, not emit an
 *          empty matrix that would run zero checks and look green.
 *
 * Inputs: GATE_MANIFEST_FILE (the manifest path); defaults to the repo-root gate-manifest.json resolved
 * relative to this script's install location (four levels up, matching the aggregator).
 */
import { readFileSync, existsSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..", "..", "..");
const MANIFEST = process.env.GATE_MANIFEST_FILE ? resolve(process.env.GATE_MANIFEST_FILE) : resolve(ROOT, "gate-manifest.json");

const failClosed = (msg) => {
  console.error(`✖ gate-matrix (fail-closed): ${msg}`);
  process.exit(2);
};

if (!existsSync(MANIFEST)) failClosed(`manifest not found: ${MANIFEST}`);
let manifest;
try {
  manifest = JSON.parse(readFileSync(MANIFEST, "utf8"));
} catch (e) {
  failClosed(`cannot parse ${MANIFEST}: ${e.message}`);
}
if (!manifest || typeof manifest !== "object" || !Array.isArray(manifest.gates)) {
  failClosed(`${MANIFEST} is not a gate manifest (no gates array).`);
}
if (manifest.gates.length === 0) {
  failClosed(`${MANIFEST} lists zero gates - an empty matrix would run zero checks and look green.`);
}

const ids = [];
for (const g of manifest.gates) {
  if (typeof g?.id !== "string" || g.id.length === 0) {
    failClosed(`a gate entry has a missing or non-string id (${JSON.stringify(g?.id)}).`);
  }
  // The ids are interpolated into a shell matrix in the consumer's CI workflow (each becomes an argument to
  // run-manifest-gates --only and a test path). Refuse any id outside [a-z0-9-] starting alphanumeric, so a
  // crafted id can never carry shell metacharacters into that matrix - fail closed, like the other checks.
  if (!/^[a-z0-9][a-z0-9-]*$/.test(g.id)) {
    failClosed(`gate id "${g.id}" has characters outside [a-z0-9-] (must start alphanumeric) - ids feed a CI shell matrix, so an unsafe id is refused.`);
  }
  if (ids.includes(g.id)) failClosed(`duplicate gate id "${g.id}" - ids must be unique so each maps to one check line.`);
  ids.push(g.id);
}

process.stdout.write(JSON.stringify(ids) + "\n");
