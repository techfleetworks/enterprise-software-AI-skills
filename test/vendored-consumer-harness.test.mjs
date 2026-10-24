// Vendored-consumer CI harness (ADR-0073, issues #133 + #119). Every consumer-install bug so far has lived in
// the EXISTING/VENDORING consumer path that the origin self-dogfood never exercises. This builds the documented
// vendoring layout (the skills copied under .claude/skills, a Python + npm consumer), runs esk-genesis, then
// runs EXACTLY the scaffolded workflow steps - the gate matrix, then for each gate `run-manifest-gates --only
// <id>` with the GATE_* env, then that gate's discrimination test with GATE_DIR - and asserts every step exits
// 0. So a change that breaks a vendoring consumer turns this red upstream, before release: the structural guard
// that keeps the whole consumer-install bug class from recurring.
//
// #119: a child `node --test` inherits NODE_TEST_CONTEXT from this parent run and would report exit 0 even when
// its tests FAIL (a vacuous harness that proves nothing). Every child here runs with NODE_TEST_CONTEXT and
// NODE_TEST_WORKER_ID stripped, so a neutered copied gate test is actually caught. A separate guard test below
// proves the stripping works.
//
// Skips if git is unavailable (CI/ubuntu always has it). Heavy (nested process spawns); generous timeout.
import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, writeFileSync, readFileSync, existsSync, rmSync, cpSync, copyFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";

const REPO = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const GENESIS = join(REPO, ".claude/skills/bootstrap/scripts/esk-genesis.mjs");
const upstreamRepo = JSON.parse(readFileSync(join(REPO, "gate-manifest.json"), "utf8")).generatedFrom.split("@")[0];

// A child env with the node:test context stripped (#119), so a child `node --test` reports its REAL exit code.
const childEnv = (extra = {}) => {
  const e = { ...process.env, ...extra };
  delete e.NODE_TEST_CONTEXT;
  delete e.NODE_TEST_WORKER_ID;
  return e;
};

test("a vendoring consumer passes every scaffolded gate and its discrimination test (#133)", (t) => {
  if (spawnSync("git", ["--version"]).status !== 0) { t.skip("git unavailable (CI/ubuntu runs this)"); return; }
  const C = mkdtempSync(join(tmpdir(), "vendor-consumer-"));
  try {
    // 1. A real repo that VENDORS the skills, with a Python + npm consumer shape (the reported topology).
    spawnSync("git", ["-C", C, "init", "-q"]);
    cpSync(join(REPO, ".claude", "skills"), join(C, ".claude", "skills"), { recursive: true });
    writeFileSync(join(C, "package.json"), JSON.stringify({ name: "consumer", version: "0.0.0" }, null, 2) + "\n");
    writeFileSync(join(C, "pyproject.toml"), "[project]\nname = \"consumer\"\n");
    writeFileSync(join(C, "app.py"), "def add(a, b):\n    return a + b\n");

    // 2. esk-genesis installs the gates.
    const g = spawnSync(process.execPath, [GENESIS, "--source", REPO, "--target", C, "--yes"], { encoding: "utf8" });
    assert.equal(g.status, 0, `esk-genesis failed on a vendoring consumer:\n${g.stdout}\n${g.stderr}`);

    // 3. A release-shaped upstream manifest for the provenance gate (offline): the consumer's own 1.3.x manifest
    //    IS the release manifest, so pointing GATE_UPSTREAM_FILE at a copy makes provenance compare it to itself.
    const upstreamFile = join(C, ".upstream-manifest.json");
    copyFileSync(join(C, "gate-manifest.json"), upstreamFile);
    const gateEnv = childEnv({
      GATE_REPO_ROOT: C,
      GATE_MANIFEST_FILE: join(C, "gate-manifest.json"),
      GATE_DIR: join(C, "scripts", "ci"),
      GATE_UPSTREAM_FILE: upstreamFile,
      GATE_UPSTREAM_REPO: upstreamRepo,
    });

    // 4. The setup step: the gate ids come from the matrix.
    const mx = spawnSync(process.execPath, [join(C, "scripts/ci/gate-matrix.mjs")], { cwd: C, encoding: "utf8", env: gateEnv });
    assert.equal(mx.status, 0, `gate-matrix failed:\n${mx.stdout}\n${mx.stderr}`);
    const gateIds = JSON.parse(mx.stdout);
    assert.ok(Array.isArray(gateIds) && gateIds.length >= 8, `expected >=8 gate ids, got ${mx.stdout}`);
    // Forward guard (review note): `run-manifest-gates --only <id>` exit code reflects only a REQUIRED gate's
    // failure; an advisory-lane gate that FAILED would exit 0 and pass here vacuously. Every gate is lane
    // "required" today; assert that, so adding an advisory gate forces a deliberate update to this harness.
    const consumerManifest = JSON.parse(readFileSync(join(C, "gate-manifest.json"), "utf8"));
    for (const g of consumerManifest.gates) {
      assert.equal(g.lane, "required", `gate "${g.id}" is not lane:required; this harness's per-gate exit-0 check assumes required gates - update it before adding an advisory gate`);
    }

    // 5. The gate step for EVERY gate (the #133 install-green core): each gate runs green on the vendored
    //    layout, and its discrimination test file is actually installed (#128 cross-check).
    for (const id of gateIds) {
      const run = spawnSync(process.execPath, [join(C, "scripts/ci/run-manifest-gates.mjs"), "--only", id], { cwd: C, encoding: "utf8", env: gateEnv });
      assert.equal(run.status, 0, `gate "${id}" FAILED on the vendoring consumer:\n${run.stdout}\n${run.stderr}`);
      assert.ok(existsSync(join(C, "test", `${id}.test.mjs`)), `gate "${id}" names a discrimination test not installed in the consumer`);
    }

    // 6. The discrimination-test step, exercised on a REPRESENTATIVE gate in the consumer layout. Running all
    //    of them nested is prohibitively heavy on some hosts; arch-gate is the gate whose scripts/ci-vs-
    //    .claude/skills resolution and anchored-ignore behavior are most load-bearing for a vendoring consumer,
    //    and every gate test shares the identical three-way GATE_DIR resolution, so this validates the pattern
    //    plus the #119 stripping (a neutered copied test would be caught). NODE_TEST_CONTEXT is stripped so the
    //    child reports its real exit code.
    const dt = spawnSync(process.execPath, ["--test", join(C, "test", "arch-gate.test.mjs")], { cwd: C, encoding: "utf8", env: childEnv({ GATE_DIR: join(C, "scripts", "ci") }) });
    assert.equal(dt.status, 0, `arch-gate discrimination test FAILED in the consumer layout:\n${dt.stdout}\n${dt.stderr}`);

    // 7. #120 (behavioral): parity/provenance must run DIRECTLY in the generated workflow, not THROUGH the runner
    //    they verify. Neuter the runner, then show both halves: running parity through the no-op runner passes
    //    vacuously (the hole), while running parity's own script directly - exactly what the workflow now does -
    //    still CATCHES the drifted runner. Done last (it tampers with the runner) so earlier steps are unaffected.
    const runnerPath = join(C, "scripts", "ci", "run-manifest-gates.mjs");
    writeFileSync(runnerPath, "process.exit(0);\n"); // neuter: its sha now differs from the manifest
    const throughRunner = spawnSync(process.execPath, [runnerPath, "--only", "skill-gate-parity"], { cwd: C, encoding: "utf8", env: gateEnv });
    assert.equal(throughRunner.status, 0, "a no-op runner makes parity pass THROUGH the runner — the #120 hole the workflow must avoid");
    const direct = spawnSync(process.execPath, [join(C, "scripts", "ci", "check-skill-gate-parity.mjs")], { cwd: C, encoding: "utf8", env: gateEnv });
    assert.notEqual(direct.status, 0, "running parity's own script directly (as the generated workflow now does) must still CATCH the drifted runner");
  } finally {
    // Best-effort: a Windows file lock throwing from rmSync must not mask the test verdict (CI/Linux unaffected).
    try { rmSync(C, { recursive: true, force: true }); } catch { /* leave the temp dir rather than throw */ }
  }
});

// #119 guard: the harness strips NODE_TEST_CONTEXT so a failing child `node --test` is really seen as failing.
// If the strip regressed, a vacuous harness would pass with broken gate tests. This proves the strip detects.
test("harness is not vacuous: a failing child node --test is detected with NODE_TEST_CONTEXT stripped (#119)", () => {
  const d = mkdtempSync(join(tmpdir(), "vacuity-"));
  try {
    const f = join(d, "fails.test.mjs");
    writeFileSync(f, "import{test}from'node:test';import assert from'node:assert/strict';test('must fail',()=>assert.equal(1,2));\n");
    const stripped = spawnSync(process.execPath, ["--test", f], { encoding: "utf8", env: childEnv({}) });
    assert.notEqual(stripped.status, 0, "a failing child test MUST be detected when NODE_TEST_CONTEXT is stripped");
  } finally {
    try { rmSync(d, { recursive: true, force: true }); } catch { /* cleanup best-effort */ }
  }
});
