// Proves run-manifest-gates (AGGREGATOR-001, bootstrap-v2) actually aggregates: it builds throwaway
// fixture repos with trivial gate scripts (some exit 0, some exit 1) and a manifest listing them, runs
// the real aggregator, and asserts exit codes - all required pass → 0, a required failure → 1, an
// advisory-only failure → 0 (non-blocking), and missing/malformed/missing-script → 2 (fail-closed).
// The test FAILS if the aggregator stops aggregating (discrimination), so a broken aggregator cannot pass.
import { test } from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from "node:fs";
import { resolve, join } from "node:path";
import { tmpdir } from "node:os";

// The aggregator is MACHINERY, and esk-genesis copies machinery SCRIPTS but not machinery TESTS (only gate
// tests travel to a consumer). So this test stays upstream-only and resolves the aggregator at its upstream
// path; no consumer-layout fallback is needed (unlike the gate tests, ADR-0057).
const AGG = resolve(process.cwd(), ".claude/skills/judge-arch/scripts/run-manifest-gates.mjs");
const created = [];

/** gates: [{id, lane, exit, writeScript?, script?, sh?}]. Returns the fixture root. */
function fixture({ gates = [], rawManifest, omitManifest = false } = {}) {
  const root = mkdtempSync(join(tmpdir(), "agg-"));
  created.push(root);
  mkdirSync(join(root, "scripts", "ci"), { recursive: true });
  const manifestGates = [];
  for (const g of gates) {
    const rel = g.script ?? `scripts/ci/check-${g.id}.${g.sh ? "sh" : "mjs"}`;
    const body = g.sh ? `exit ${g.exit ?? 0}\n` : `process.exit(${g.exit ?? 0});\n`;
    if (g.writeScript !== false) writeFileSync(join(root, rel), body);
    manifestGates.push({ id: g.id, script: rel, sha256: "0".repeat(64), test: `test/${g.id}.test.mjs`, lane: g.lane ?? "required" });
  }
  if (!omitManifest) {
    writeFileSync(
      join(root, "gate-manifest.json"),
      rawManifest ?? JSON.stringify({ version: "1.0.0", gates: manifestGates, aggregator: { requiredCheck: "gate" } }),
    );
  }
  return root;
}

function run(root) {
  try {
    execFileSync("node", [AGG], { stdio: "pipe", env: { ...process.env, GATE_MANIFEST_FILE: join(root, "gate-manifest.json") } });
    return 0;
  } catch (e) {
    return e.status ?? 1;
  }
}

test("AGG: passes (0) when all required gates pass", () => {
  assert.equal(run(fixture({ gates: [{ id: "a", exit: 0 }, { id: "b", exit: 0 }] })), 0);
});

test("AGG: FAILS (1) when a required gate fails", () => {
  assert.equal(run(fixture({ gates: [{ id: "a", exit: 0 }, { id: "b", exit: 1 }] })), 1);
});

test("AGG: passes (0) when only an advisory gate fails (non-blocking)", () => {
  assert.equal(run(fixture({ gates: [{ id: "a", exit: 0, lane: "required" }, { id: "b", exit: 1, lane: "advisory" }] })), 0);
});

// --- --only <id>: run a single gate for the per-skill CI matrix (P5a) ------------------------------
function runArgs(root, args) {
  try {
    execFileSync("node", [AGG, ...args], { stdio: "pipe", env: { ...process.env, GATE_MANIFEST_FILE: join(root, "gate-manifest.json") } });
    return 0;
  } catch (e) {
    return e.status ?? 1;
  }
}
test("AGG --only: runs ONLY the named gate - passes when that gate passes even though another would fail", () => {
  const root = fixture({ gates: [{ id: "a", exit: 0 }, { id: "b", exit: 1 }] });
  assert.equal(runArgs(root, ["--only", "a"]), 0, "only a ran (passed); b's failure must be ignored");
});
test("AGG --only: FAILS (1) when the named gate fails (discriminating)", () => {
  const root = fixture({ gates: [{ id: "a", exit: 0 }, { id: "b", exit: 1 }] });
  assert.equal(runArgs(root, ["--only", "b"]), 1);
});
test("AGG --only: fails CLOSED (2) on an unknown gate id (matrix out of sync with the manifest)", () => {
  const root = fixture({ gates: [{ id: "a", exit: 0 }] });
  assert.equal(runArgs(root, ["--only", "ghost"]), 2);
});
test("AGG --only: fails CLOSED (2) when no id is given", () => {
  const root = fixture({ gates: [{ id: "a", exit: 0 }] });
  assert.equal(runArgs(root, ["--only"]), 2);
});

test("AGG: fails CLOSED (2) when the manifest is missing", () => {
  assert.equal(run(fixture({ gates: [{ id: "a", exit: 0 }], omitManifest: true })), 2);
});

test("AGG: fails CLOSED (2) when a required gate's script is missing", () => {
  assert.equal(run(fixture({ gates: [{ id: "a", exit: 0, writeScript: false }] })), 2);
});

test("AGG: fails CLOSED (2) on a malformed manifest (no gates array)", () => {
  assert.equal(run(fixture({ rawManifest: JSON.stringify({ version: "1.0.0" }) })), 2);
});

test("AGG: fails CLOSED (2) when a script path escapes the repo (path traversal)", () => {
  assert.equal(run(fixture({ gates: [{ id: "a", script: "../escape.mjs", writeScript: false }] })), 2);
});

// Discriminates the .sh -> bash branch: `exit 0` is a clean pass under bash but a ReferenceError
// (non-zero) under node, so a passing (exit 0) required .sh gate proves the aggregator ran it with
// bash. If the bash special-case were removed and node ran the shell script, this would exit 1.
// (Requires bash on PATH; CI runs on ubuntu where it is present.)
test("AGG: passes (0) when a required .sh gate exits 0 under bash (bash runner branch)", () => {
  assert.equal(run(fixture({ gates: [{ id: "a", sh: true, exit: 0 }] })), 0);
});

test("AGG: fails CLOSED (2) when the gates array is empty (enforcement off)", () => {
  assert.equal(run(fixture({ rawManifest: JSON.stringify({ version: "1.0.0", gates: [], aggregator: { requiredCheck: "gate" } }) })), 2);
});

test("AGG: fails CLOSED (2) when a required gate's lane is unknown (would silently downgrade)", () => {
  assert.equal(run(fixture({ gates: [{ id: "a", exit: 1, lane: "requird" }] })), 2);
});

// gate.invoke: the aggregator passes declared CLI args to the gate (ADR-0059). The fixture gate exits 0
// ONLY if it received the arg "SCAN_ME", so a passing run proves the arg was actually delivered.
function invokeFixture(invoke) {
  const root = mkdtempSync(join(tmpdir(), "agg-invoke-"));
  created.push(root);
  mkdirSync(join(root, "scripts", "ci"), { recursive: true });
  writeFileSync(join(root, "scripts/ci/check-needs-arg.mjs"), 'process.exit(process.argv.includes("SCAN_ME") ? 0 : 1);\n');
  const gate = { id: "needs-arg", script: "scripts/ci/check-needs-arg.mjs", sha256: "0".repeat(64), test: "test/needs-arg.test.mjs", lane: "required" };
  if (invoke !== undefined) gate.invoke = invoke;
  writeFileSync(join(root, "gate-manifest.json"), JSON.stringify({ version: "1.0.0", gates: [gate], aggregator: { requiredCheck: "gate" } }));
  return root;
}

test("AGG: passes gate.invoke args to the gate (discriminating)", () => {
  assert.equal(run(invokeFixture(["SCAN_ME"])), 0, "the gate must receive its invoke arg");
  assert.equal(run(invokeFixture(undefined)), 1, "without invoke the gate does not get the arg and fails (proves invoke is really passed, not ignored)");
});

test("AGG: fails closed (2) on a malformed invoke (not an array of strings)", () => {
  assert.equal(run(invokeFixture("SCAN_ME")), 2, "a string invoke must fail closed, never be silently dropped (which would make the gate scan nothing)");
  assert.equal(run(invokeFixture([1, 2])), 2, "non-string invoke elements must fail closed");
});

process.on("exit", () => {
  for (const d of created) {
    try {
      rmSync(d, { recursive: true, force: true });
    } catch {
      /* best-effort */
    }
  }
});
