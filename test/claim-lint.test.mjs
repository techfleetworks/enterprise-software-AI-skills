// Discriminating tests for skeptical-audit/scripts/claim-lint.mjs
//
// These spawn the REAL script against controlled fixtures and assert its exit code, per
// verifiable-quality-gates/references/check-test-patterns.md. The load-bearing case is S4:
// without --strict, findings must WARN (exit 0); with --strict, findings must BLOCK (exit 1).
// Against the old `process.exit(strict ? 1 : 1)` bug the "warn-only" assertion fails — that is
// what makes this test discriminate.
import { test } from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { writeFileSync, mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const REPO = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const CHECK = resolve(REPO, "skeptical-audit/scripts/claim-lint.mjs");

function run(fixtureText, args = []) {
  const dir = mkdtempSync(join(tmpdir(), "claim-lint-"));
  const file = join(dir, "draft.md");
  writeFileSync(file, fixtureText);
  try {
    execFileSync(process.execPath, [CHECK, file, ...args], { stdio: "pipe" });
    return 0;
  } catch (e) {
    return e.status ?? 1;
  }
}

const CLEAN = "# Plan\n\nThis document describes the rollout steps and the people involved.\n";
const UNTAGGED = "# Report\n\nThe deployment is live and every request is handled.\n"; // claim, no evidence state
const TAGGED = "# Report\n\nThe deployment is live [observed]: `curl` returned 200 at 12:00 UTC.\n";

test("clean draft passes (exit 0)", () => {
  assert.equal(run(CLEAN), 0);
});

test("untagged claim WARNS without --strict (exit 0)", () => {
  // The S4 fix: findings alone no longer block. The old bug exited 1 here.
  assert.equal(run(UNTAGGED), 0);
});

test("untagged claim BLOCKS with --strict (exit 1) — discriminating", () => {
  assert.equal(run(UNTAGGED, ["--strict"]), 1);
});

test("evidence-tagged claim passes even with --strict (exit 0)", () => {
  assert.equal(run(TAGGED, ["--strict"]), 0);
});

test("missing file fails closed (exit 2)", () => {
  try {
    execFileSync(process.execPath, [CHECK], { stdio: "pipe" });
    assert.fail("expected non-zero exit");
  } catch (e) {
    assert.equal(e.status, 2);
  }
});
