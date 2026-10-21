// Consumer-lifecycle integration test (ADR-0069). The #112 bugs and the esk-genesis no-clobber upgrade bug
// all live in the EXISTING-consumer path, which this repo's origin self-dogfood never exercises: the origin
// has one real gate copy, its own npm-script hook, and is never "upgraded over itself". This test stands up a
// real consumer and UPGRADES it, so that whole class of bug cannot ship again.
//
// It proves: re-running esk-genesis on a consumer whose pre-push hook and enterprise-gates.yml have gone
// stale brings BOTH back to current. It is a discrimination test: if esk-genesis reverts to no-clobber on
// those two files (the v1.2.0->1.2.1 defect), the stale content survives the re-run and these assertions FAIL.
import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, writeFileSync, readFileSync, existsSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";

const REPO = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const GENESIS = join(REPO, ".claude", "skills", "bootstrap", "scripts", "esk-genesis.mjs");
const norm = (s) => s.replace(/\r\n/g, "\n");
const readNorm = (p) => norm(readFileSync(p, "utf8"));

// Run esk-genesis against a throwaway consumer. No .git in the target, so it never spawns git for hooksPath.
function runGenesis(target) {
  return spawnSync(process.execPath, [GENESIS, "--source", REPO, "--target", target, "--yes"], { encoding: "utf8" });
}

test("esk-genesis refreshes a stale pre-push hook and workflow on re-run (consumer upgrade)", () => {
  const target = mkdtempSync(join(tmpdir(), "esk-consumer-"));
  try {
    // 1. Fresh install: capture the current (correct) hook and workflow the installer produces.
    const first = runGenesis(target);
    assert.equal(first.status, 0, `fresh install failed:\n${first.stdout}\n${first.stderr}`);
    const hookPath = join(target, ".githooks", "pre-push");
    const wfPath = join(target, ".github", "workflows", "enterprise-gates.yml");
    assert.ok(existsSync(hookPath), "fresh install did not write .githooks/pre-push");
    assert.ok(existsSync(wfPath), "fresh install did not write .github/workflows/enterprise-gates.yml");
    const hookCurrent = readNorm(hookPath);
    const wfCurrent = readNorm(wfPath);

    // The shipped workflow must carry the #112.3 fix (GATE_DIR on the gate step). Guards the fix is present,
    // and the refresh assertion below guards it reaches an existing consumer.
    assert.match(wfCurrent, /GATE_DIR/, "the generated workflow must set GATE_DIR (the #112.3 fix)");

    // 2. Simulate a v1.2.0-era consumer: both esk-genesis-owned files have gone stale on disk.
    writeFileSync(hookPath, "#!/usr/bin/env node\n// STALE v1.2.0 pre-push hook - must be refreshed on re-run\n");
    writeFileSync(wfPath, "name: enterprise-gates\n# STALE v1.2.0 workflow - must be refreshed on re-run\n");
    assert.notEqual(readNorm(hookPath), hookCurrent, "precondition: hook is stale");
    assert.notEqual(readNorm(wfPath), wfCurrent, "precondition: workflow is stale");

    // 3. The upgrade: re-run the installer, exactly what a consumer does to pick up a fix.
    const second = runGenesis(target);
    assert.equal(second.status, 0, `re-run failed:\n${second.stdout}\n${second.stderr}`);

    // 4. Both must be back to current. FAILS if esk-genesis is no-clobber on these files (the ADR-0069 bug).
    assert.equal(readNorm(hookPath), hookCurrent,
      "pre-push hook was NOT refreshed on re-run: esk-genesis is no-clobber on the hook, so a hook fix never reaches an existing consumer (ADR-0069)");
    assert.equal(readNorm(wfPath), wfCurrent,
      "enterprise-gates.yml was NOT refreshed on re-run: esk-genesis is no-clobber on the workflow, so a workflow fix never reaches an existing consumer (ADR-0069)");
  } finally {
    rmSync(target, { recursive: true, force: true });
  }
});
