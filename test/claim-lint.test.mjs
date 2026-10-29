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

// --- ISSUE-180: skeptical-audit additions (mistakes before and around a claim) ---
// Each pair discriminates: bad -> exit 1 under --strict; good -> exit 0.
test("180 OWNERSHIP: an ownership assumption with no observed owner is flagged; with an owner record it passes", () => {
  assert.equal(run("The plan assumes the LoginModule owns the keep-that-secret request.\n", ["--strict"]), 1);
  assert.equal(run("The masker module owns the keep-that-secret request (owner: src/mask.ts:42).\n", ["--strict"]), 0);
});
test("180 DOWNGRADE: a downgrade with no next step is flagged; naming the next step passes", () => {
  assert.equal(run("I downgraded the uptime claim to not-assessed.\n", ["--strict"]), 1);
  assert.equal(run("I downgraded uptime to not-assessed. Next step: run the 24h soak (owner: me) to raise it.\n", ["--strict"]), 0);
});
test("180 HEADLINE: headlining the most favorable cut is flagged; a predeclared headline with all cuts passes", () => {
  assert.equal(run("I headlined the most favorable cut (3.0%).\n", ["--strict"]), 1);
  assert.equal(run("Headline (declared before measuring): 6.2%. Cuts: 35%, 6.2%, 3.0%.\n", ["--strict"]), 0);
});
test("180 DONE-INFERRED: 'done' on mostly-inferred evidence is flagged; an observed majority passes", () => {
  assert.equal(run("The audit row is done. Evidence: 12 observed records and 47 inferred records.\n", ["--strict"]), 1);
  assert.equal(run("The audit row is done [observed]. Evidence: 50 observed records and 2 inferred records.\n", ["--strict"]), 0);
});
test("180 COMPARE: 'A is safer than B' with no measurement is an untagged claim; a cited comparison passes", () => {
  assert.equal(run("The LLM layer is safer than the rule gate.\n", ["--strict"]), 1);
  assert.equal(run("The LLM layer is safer than the rule gate [observed]: benchmark ran 2026-10-29.\n", ["--strict"]), 0);
  assert.equal(run("The model is the primary control.\n", ["--strict"]), 1);
});

// #180 no-false-positive guards (from the fresh-context review): the five rules must NOT fire on ordinary
// engineering, git, legal, or domain vocabulary, or they train people to ignore the tool.
test("180 no-FP: git 'cherry-pick' and 'most favorable way' are not HEADLINE findings", () => {
  assert.equal(run("We cherry-picked the hotfix onto the 2.1 release branch.\n", ["--strict"]), 0);
  assert.equal(run("The court ruled in the most favorable way.\n", ["--strict"]), 0);
});
test("180 no-FP: ordinary comparatives ('more work/common than') are not COMPARE findings", () => {
  assert.equal(run("The migration is more work than expected.\n", ["--strict"]), 0);
  assert.equal(run("This failure is more common than people assume.\n", ["--strict"]), 0);
});
test("180 no-FP: ordinary 'now reported/inferred' are not DOWNGRADE findings (needs a downgrade verb)", () => {
  assert.equal(run("The crash is now reported to the vendor and tracked as VND-12.\n", ["--strict"]), 0);
  assert.equal(run("The locale is now inferred from the Accept-Language header.\n", ["--strict"]), 0);
});
test("180 no-FP: ordinary domain ownership ('the user owns their data') is not an OWNERSHIP finding", () => {
  assert.equal(run("Under GDPR the user owns their data and may export it.\n", ["--strict"]), 0);
  assert.equal(run("The platform team is responsible for triage this week.\n", ["--strict"]), 0);
});
test("180 no-FP: a 'done' line with unrelated co-located counts is not misattributed as DONE-INFERRED", () => {
  // The counts are not in an evidence/records context, and the state tokens ground the line.
  assert.equal(run("The onboarding wizard is done. We saw 3 observed anomalies in logs; the graph has 5 inferred edges.\n", ["--strict"]), 0);
});

// --- ISSUE-181: EVIDENCE-WORDS - a chosen/fixed set described, on the same line, as a NUMERIC tries/odds/rate
// result is flagged. A no-op claim-lint (always exit 0) flips every must-flag case below, so these discriminate.
test("181: a fixed set of chosen combinations framed as 'N out of N tries' is flagged (exit 1)", () => {
  assert.equal(run("The 25 chosen combinations reproduced it, 25 out of 25 tries.\n", ["--strict"]), 1);
});
test("181: a chosen set framed as a failure rate is flagged (exit 1)", () => {
  assert.equal(run("All 25 chosen combinations failed, a 100% failure rate.\n", ["--strict"]), 1);
});
test("181: a chosen set framed as a percentage of the time is flagged (exit 1)", () => {
  assert.equal(run("All 25 chosen combinations failed 100% of the time.\n", ["--strict"]), 1);
});
test("181: a hand-picked set framed as numeric odds is flagged (exit 1)", () => {
  assert.equal(run("The 25 hand-picked cases failed; the probability of that is 1 in 1000.\n", ["--strict"]), 1);
});
test("181: 'no randomness' does not disarm the rule - a deterministic set as a rate is flagged (exit 1)", () => {
  // Regression for the dead-branch bug: RANDOM_SET must be affirmative-only, so "no randomness" still checks.
  assert.equal(run("The 25 deterministic combinations, no randomness involved, hit a 100 percent failure rate.\n", ["--strict"]), 1);
});
test("181: keeping the evidence words ('all N chosen combinations failed') passes (exit 0)", () => {
  assert.equal(run("observed: all 25 chosen combinations failed, each run once.\n", ["--strict"]), 0);
});
test("181 no-FP: a genuinely random set of trials described as tries is NOT flagged", () => {
  // The report calls the set random, so "N out of N tries" is the right evidence word, not a reframing.
  assert.equal(run("We ran 25 random trials and 25 out of 25 failed.\n", ["--strict"]), 0);
});
test("181 no-FP: 'tries' with no chosen-set signal in context is NOT flagged", () => {
  assert.equal(run("It reproduced on 25 out of 25 tries in the fuzzer.\n", ["--strict"]), 0);
});
test("181 no-FP: a chosen set with no tries/odds/rate framing is NOT flagged", () => {
  assert.equal(run("We hand-picked 25 combinations and all 25 failed.\n", ["--strict"]), 0);
});
// The four co-occurrence false positives the fresh-context review found: a bare noun ("attempts"), a
// cross-line pairing, and "curated ... error rate" must all pass now.
test("181 no-FP: a bare count of 'attempts' (no N-out-of-N) is NOT flagged", () => {
  assert.equal(run("The retry logic caps at 3 attempts per request.\n", ["--strict"]), 0);
});
test("181 no-FP: a chosen-set word and a framing word on DIFFERENT lines are NOT flagged", () => {
  assert.equal(run("The retry logic caps at 3 attempts per request.\nThe backoff schedule is a fixed table of 1s, 2s, 4s.\n", ["--strict"]), 0);
});
test("181 no-FP: 'deterministic' modifying a process (not a set), with 'attempts', is NOT flagged", () => {
  assert.equal(run("The deterministic retry caps at 5 attempts before lockout.\n", ["--strict"]), 0);
});
test("181 no-FP: a regression set with a plain error rate (no strong chosen-set word) is NOT flagged", () => {
  assert.equal(run("We ran the curated regression set and saw a 0 percent error rate.\n", ["--strict"]), 0);
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
