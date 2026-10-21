// Discriminating tests for .claude/skills/judge-arch/scripts/gate-matrix.mjs.
// It must emit the manifest's gate ids as a JSON array for the per-skill CI matrix, and fail CLOSED
// (exit 2, never an empty matrix that would look green) on any manifest it cannot enumerate.
import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtempSync, writeFileSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const REPO = resolve(dirname(fileURLToPath(import.meta.url)), "..");
// Resolve in either layout (upstream, or a consumer's scripts/ci) - copied verbatim into consumers.
const UPSTREAM = resolve(REPO, ".claude/skills/judge-arch/scripts/gate-matrix.mjs");
// Resolve the gate to the copy CI actually runs, not a vendored .claude/skills copy (issue #112). A consumer
// keeps the gate at scripts/ci/gate-matrix.mjs (its GATE_DIR path, which the workflow sets); vendoring the skills also
// drops a copy under .claude/skills that must NOT be the one tested. Prefer the GATE_DIR copy; fall back to the
// upstream skill copy (this repo has no scripts/ci).
const CI_DIR = process.env.GATE_DIR || resolve(REPO, "scripts/ci");
const CONSUMER = resolve(CI_DIR, "gate-matrix.mjs");
const CHECK = [CONSUMER, UPSTREAM].find((p) => existsSync(p)) ?? UPSTREAM;
test("gate resolution: tests the scripts/ci (GATE_DIR) copy CI runs, not a vendored .claude/skills copy (issue #112)", () => {
  // In a consumer that vendors the skills both copies exist; the discrimination test must exercise the
  // scripts/ci copy the aggregator runs. Upstream has no scripts/ci, so this is a no-op pass there.
  if (existsSync(CONSUMER)) assert.equal(CHECK, CONSUMER, "must test the scripts/ci (GATE_DIR) gate, not the .claude/skills copy");
});

function run(manifest) {
  const dir = mkdtempSync(join(tmpdir(), "gm-"));
  const f = join(dir, "gate-manifest.json");
  writeFileSync(f, typeof manifest === "string" ? manifest : JSON.stringify(manifest));
  const r = spawnSync(process.execPath, [CHECK], { encoding: "utf8", env: { ...process.env, GATE_MANIFEST_FILE: f } });
  return { status: r.status, out: (r.stdout || "").trim(), err: r.stderr || "" };
}
const gate = (id) => ({ id, origin: "upstream", skill: "x", script: `scripts/ci/check-${id}.mjs`, sha256: "a".repeat(64), test: `test/${id}.test.mjs`, lane: "required" });

test("emits the gate ids as a JSON array in manifest order", () => {
  const r = run({ version: "1.2.0", gates: [gate("alpha"), gate("beta"), gate("gamma")], aggregator: { requiredCheck: "enterprise-gates" } });
  assert.equal(r.status, 0, r.err);
  assert.deepEqual(JSON.parse(r.out), ["alpha", "beta", "gamma"]);
});
test("output is valid JSON parseable by a workflow fromJSON (single-line array)", () => {
  const r = run({ version: "1.2.0", gates: [gate("only")], aggregator: { requiredCheck: "x" } });
  assert.equal(r.status, 0, r.err);
  assert.doesNotThrow(() => JSON.parse(r.out));
  assert.ok(!r.out.includes("\n"), "must be a single-line array for GITHUB_OUTPUT");
});

// --- fail closed: never emit an empty/partial matrix that would run zero checks and look green ----
test("fails closed (exit 2) when the manifest is missing", () => {
  const dir = mkdtempSync(join(tmpdir(), "gm-none-"));
  const r = spawnSync(process.execPath, [CHECK], { encoding: "utf8", env: { ...process.env, GATE_MANIFEST_FILE: join(dir, "nope.json") } });
  assert.equal(r.status, 2);
});
test("fails closed (exit 2) on invalid JSON", () => {
  assert.equal(run("{ not json").status, 2);
});
test("fails closed (exit 2) when there is no gates array", () => {
  assert.equal(run({ version: "1.2.0" }).status, 2);
});
test("fails closed (exit 2) on zero gates (an empty matrix would look green)", () => {
  assert.equal(run({ version: "1.2.0", gates: [], aggregator: { requiredCheck: "x" } }).status, 2);
});
test("fails closed (exit 2) on a non-string gate id", () => {
  assert.equal(run({ version: "1.2.0", gates: [{ id: 42 }], aggregator: { requiredCheck: "x" } }).status, 2);
});
test("fails closed (exit 2) on a duplicate gate id (each must map to one check line)", () => {
  assert.equal(run({ version: "1.2.0", gates: [gate("dup"), gate("dup")], aggregator: { requiredCheck: "x" } }).status, 2);
});
test("fails closed (exit 2) on an id with shell metacharacters (ids feed a CI shell matrix, anti-injection)", () => {
  // An id interpolated into the workflow's shell matrix must be safe. A quote + metachar would break out.
  assert.equal(run({ version: "1.2.0", gates: [{ id: 'a";rm -rf /"', script: "scripts/ci/x.mjs", sha256: "a".repeat(64), test: "t", origin: "upstream", skill: "x", lane: "required" }], aggregator: { requiredCheck: "x" } }).status, 2);
});
test("fails closed (exit 2) on an id with a space or uppercase (outside [a-z0-9-])", () => {
  assert.equal(run({ version: "1.2.0", gates: [gate("Bad Id")], aggregator: { requiredCheck: "x" } }).status, 2);
});
test("accepts a normal kebab-case id (no false positive)", () => {
  assert.equal(run({ version: "1.2.0", gates: [gate("no-ua-sniffing")], aggregator: { requiredCheck: "x" } }).status, 0);
});
