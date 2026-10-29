// Discriminating tests for .claude/skills/skeptical-audit/scripts/claim-lint.mjs
//
// These spawn the REAL script against controlled fixtures and assert its exit code, per
// .claude/skills/verifiable-quality-gates/references/check-test-patterns.md. The load-bearing case is S4:
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
const CHECK = resolve(REPO, ".claude/skills/skeptical-audit/scripts/claim-lint.mjs");

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
const TAGGED_PROVEN = "# Report\n\nThe deployment is live [proven]: the smoke test returned 200 on every push.\n";

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

test("hardening: catches 'build passes', 'is tested', and the hedges 'maybe'/'perhaps' (discriminating)", () => {
  assert.equal(run("The build passes.\n", ["--strict"]), 1);
  assert.equal(run("The auth module is tested.\n", ["--strict"]), 1);
  assert.equal(run("Maybe the cache is stale; perhaps it self-heals.\n", ["--strict"]), 1);
});
test("hardening: a claim backed by an evidence state on the NEXT line is NOT flagged (no false positive)", () => {
  assert.equal(run("The tests pass.\nEvidence: proven by `npm test`.\n", ["--strict"]), 0);
});
test("hardening: 'should be removed' reads as an instruction, not a hedge (no false positive)", () => {
  assert.equal(run("This deprecated flag should be removed in the next release.\n", ["--strict"]), 0);
});
test("hardening: an UNRELATED evidence line below a claim does not silence it (binding, discriminating)", () => {
  assert.equal(run("The build passes.\nproven: the migration ran cleanly.\n", ["--strict"]), 1);
});
test("hardening: a soft-confidence hedge with a participle ('should be cached by now') is still flagged", () => {
  assert.equal(run("The result should be cached by now.\n", ["--strict"]), 1);
});

// `proven` is the sixth, strongest evidence state; it must be recognized like the others. Before the fix the
// STATE regex omitted it, so a proven-tagged claim was flagged as untagged and exited 1 here (discriminating).
test("a 'proven'-tagged claim passes even with --strict (exit 0) - proven is a recognized state", () => {
  assert.equal(run(TAGGED_PROVEN, ["--strict"]), 0);
});

// Hedge matching is word-boundary, not substring: these must NOT be flagged as hedges.
// With --strict, a (false) hedge finding would exit 1; the correct behavior is exit 0.
const FALSE_HEDGE_UNLIKELY = "# Note\n\nA regression here is unlikely to recur after the backfill.\n"; // not "likely"
const FALSE_HEDGE_BECOME = "# Note\n\nThe rollout should become smoother once caches warm.\n"; // not "should be"
// A genuine standalone hedge MUST still be caught (proves the boundary fix didn't neuter detection).
const REAL_HEDGE = "# Note\n\nThe migration is likely to succeed on the first attempt.\n";

test("does NOT flag 'likely' inside 'unlikely' (word-boundary, discriminating)", () => {
  assert.equal(run(FALSE_HEDGE_UNLIKELY, ["--strict"]), 0);
});

test("does NOT flag 'should be' inside 'should become' (word-boundary, discriminating)", () => {
  assert.equal(run(FALSE_HEDGE_BECOME, ["--strict"]), 0);
});

test("still flags a genuine standalone hedge ('likely') with --strict (exit 1)", () => {
  assert.equal(run(REAL_HEDGE, ["--strict"]), 1);
});

// --- ISSUE-179: high-stakes claims need a specific record, not merely an evidence state ---
// Each pair discriminates: the "bad" case exits 1 under --strict (the rule fires); if the rule were
// disabled or claim-lint no-op'd, the bad case would stop flagging and these would fail.
test("179 FIX: 'fixed' with no revert record is flagged (exit 1); with a revert record it passes (exit 0)", () => {
  assert.equal(run("The login crash is now fixed.\n", ["--strict"]), 1);
  assert.equal(run("The login crash is now fixed.\nrevert-check: `npm test` red before, green after, red on revert.\n", ["--strict"]), 0);
});
test("179 FIX: 'the bug is resolved' is flagged without a revert record (discriminating)", () => {
  assert.equal(run("The race-condition bug is resolved.\n", ["--strict"]), 1);
});
test("179 FIX: an incidental pass needs attribution (revert record) before it counts", () => {
  assert.equal(run("The year test now passes.\n", ["--strict"]), 1);
});
test("179 VERIFY: 'verified' with no re-runnable command is flagged (exit 1); with command+exit+hash it passes", () => {
  assert.equal(run("I verified the masking logic.\n", ["--strict"]), 1);
  assert.equal(run("I verified the masking logic.\nverified-by: `npm test -- mask` exit 0 sha256 ab12cd.\n", ["--strict"]), 0);
});
test("179 SUITE: a suite-backed claim with no named cases + not-checked is flagged; with them it passes", () => {
  assert.equal(run("The 75-case suite passes.\n", ["--strict"]), 1);
  assert.equal(run("Year answers work (cases: full day-month-year, partial date; not-checked: time-only).\nThe 75-case suite passes.\n", ["--strict"]), 0);
});
test("179 DONE: 'done' while a HIGH finding is open is flagged; with no open HIGH it is not", () => {
  assert.equal(run("Review returned 1 HIGH finding, still open.\nThe work is done and ready to ship.\n", ["--strict"]), 1);
  assert.equal(run("The work is done [observed]: all gates green.\n", ["--strict"]), 0);
});
test("179: a 'not-checked' scoping line is evidence, not a claim (no false positive on 'checked')", () => {
  assert.equal(run("Shapes not-checked: time-only inputs.\n", ["--strict"]), 0);
});
test("179 VERIFY: domain vocabulary ('email must be verified') is NOT flagged (no false positive)", () => {
  assert.equal(run("The user's email must be verified before checkout.\n", ["--strict"]), 0);
});
test("179 VERIFY: 'I verified' with an inline evidence state is grounded (no false positive)", () => {
  assert.equal(run("I verified the fix [observed]: re-ran `npm test`, all green.\n", ["--strict"]), 0);
});
test("179 scoping: a scoping phrase does not smuggle a co-located untagged claim past the linter (discriminating)", () => {
  // The record/scoping token must not suppress a genuine claim on the same line.
  assert.equal(run("The error path is not covered by tests, but the build passes.\n", ["--strict"]), 1);
  assert.equal(run("Covered cases: login, logout; the deployment is live and running.\n", ["--strict"]), 1);
});

test("missing file fails closed (exit 2)", () => {
  try {
    execFileSync(process.execPath, [CHECK], { stdio: "pipe" });
    assert.fail("expected non-zero exit");
  } catch (e) {
    assert.equal(e.status, 2);
  }
});

// --- ISSUE-140: --help exits 0 with usage; an unknown flag is rejected ---
test("ISSUE-140: claim-lint --help prints usage and exits 0", () => {
  const out = execFileSync("node", [CHECK, "--help"], { encoding: "utf8" });
  assert.match(out, /usage:/i);
});
test("ISSUE-140: claim-lint rejects an unknown flag (exit 2)", () => {
  const dir = mkdtempSync(join(tmpdir(), "cl-help-"));
  const f = join(dir, "draft.md");
  writeFileSync(f, "# ok\n");
  let code = 0, out = "";
  try { execFileSync("node", [CHECK, f, "--stric"], { encoding: "utf8", stdio: "pipe" }); } catch (e) { code = e.status; out = (e.stdout || "") + (e.stderr || ""); }
  assert.equal(code, 2);
  assert.match(out, /unknown flag/);
});
