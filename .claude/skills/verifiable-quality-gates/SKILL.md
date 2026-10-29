---
name: verifiable-quality-gates
description: "When you write, review, or rely on an automated check (a CI guard, a custom lint rule, a schema or config validator, an architecture fitness function): make it provably detect what it claims. Every check gets a committed test that FAILS when the check is neutralized (proven mechanically by a mutation gate), fails closed, and proves each invariant at the layer that owns it. Triggers on adding or changing a CI check or guard, a check that 'passes' but might not be catching anything, a green build you do not fully trust, or making quality gates self-proving."
---

# Verifiable quality gates: prove your checks actually detect

## Why this exists

A quality gate is only worth the failures it catches. But a gate is code: a regex, a threshold, a query, a
walk over files. And code silently stops working. Someone tightens a pattern so it now matches nothing. A
refactor inverts a condition. A data source moves and the check quietly reads empty. The gate keeps exiting
0. The build stays green. And the exact violation it was built to stop sails through, invisibly, because
nothing announces that a check went blind.

This is the most dangerous failure in a CI system, because it inverts the signal you trust most. A green
check now means "the check ran," not "the thing it guards is true." Test suites have a name for a test that
asserts nothing, vacuous, and a whole discipline for catching them: mutation testing. The idea is old and
well founded. DeMillo, Lipton, and Sayward introduced it in 1978 on two assumptions that still hold: the
competent programmer assumption (programmers write programs "close to being correct") and the coupling
effect, which they describe as "tests of a program that uncover simple errors are also effective in
uncovering much more complex errors." A later survey by Papadakis and colleagues (2019) frames the method as
using artificial defects to measure how adequate the tests are: if the tests fail to reveal the seeded
defects, "we should not be confident on our testing and should improve our test suites." In practice you seed
a program with small changes called mutants, run the tests, and the fraction of mutants the tests kill tells
you how much the tests actually detect. A mutant the tests do not kill is a hole in the tests. This skill
applies that same discipline to the checks themselves.

The rule is simple and absolute: a check you have never proven can detect a violation is not protection, it
is theater. Every automated check must be provably able to fail for the right reason, and that proof must be
mechanical, so it holds for every future change and every future author, not a one-time manual demo that
rots.

## The core rule

> Every automated check has a committed test that runs the REAL check end to end and discriminates: the
> test must FAIL when the check is replaced by a no-op. A test that still passes against a do-nothing check
> asserts nothing about detection. It is vacuous, and it means a broken check would ship green.

Two mechanical gates enforce this, and they are themselves ordinary checks (yes, they guard each other):

1. **Coverage gate.** Every check has a committed test that runs it. See `scripts/check-has-test.mjs`.
2. **Discrimination gate.** A mutation test: replace each check with a no-op and require its test to fail.
   See `scripts/verify-check-discrimination.mjs`.

## Why coverage alone is not enough (and why mutation is the stronger signal)

A natural question is "why not just measure code coverage of the checks?" Because coverage measures what code
ran, not whether anything was asserted about it. Inozemtseva and Holmes tested this directly in 2014 and
found that, once you control for the size of the test suite, coverage is only low to moderately correlated
with how many faults the suite actually catches. Coverage tells you where you have no tests; it does not tell
you whether the tests you have can detect a fault. Fowler makes the same point: test coverage is useful for
finding untested code, but a coverage number is a poor measure of how good the tests are, and turning it into
a target makes it worse (Goodhart's law: a measure that becomes a target stops measuring).

Mutation detection is the stronger signal. Just and colleagues showed in 2014 that a test suite's ability to
kill mutants is correlated with its ability to catch real faults, even after controlling for coverage, which
is exactly the property coverage lacks. That is why the discrimination gate no-ops each check and requires
its test to go red: it is a mutation test aimed at the gates, and it measures detection, not execution.

## The workflow, for every check you add, change, or inherit

### 1. Write the check to fail closed and emit evidence
Before worrying about its test, make the check honest:
- **Fail closed.** A missing input, an internal error, an empty scan, or a zero-file match must exit
  non-zero, never a silent exit 0. "I found nothing to check" and "I checked and everything passed" are
  different outcomes and must have different exit codes. The most common false-green bug is a check that
  skips itself into a pass.
- **Emit evidence on success.** Print what was inspected and how much (counts, paths), so a passing run is
  auditable: "OK, 214 files scanned, 0 violations," not just "OK."
- **No error swallowing.** No exit 0 inside a catch, no returning a pass on a thrown exception. A check that
  cannot run must say so and fail, not shrug and go green.

### 2. Write a committed test that runs the REAL check end to end
Not a unit test of an extracted helper. Run the actual check (spawn it, or call its entry point) against
fixtures, and assert its exit code or reported result. Testing an extracted predicate in isolation proves
the predicate, not the check that ships, and the wiring between them is exactly where checks go blind. Keep
the real invocation in the test. See `references/check-test-patterns.md` for faithful-fixture patterns,
including checks rooted at their own file location (which need a copy-into-fixture approach) and checks gated
on a live database, API, or network (which need a test-only input seam).

Cover, at minimum:
- the happy path, which passes (exit 0),
- each distinct real violation, which fails (non-zero), with a fixture that reproduces the check's actual
  pattern, not a contrived trigger,
- fail-closed paths: missing input and zero-scan both fail,
- any escape hatch the check honors, which passes.

### 3. Prove the test DISCRIMINATES (do not skip, this is the whole point)
A test that runs the check but asserts nothing tied to detection would let a broken check ship green. Prove
it cannot, mechanically:

> Replace the check with a no-op that always passes. Run its test. The test must fail. If it still passes,
> the test is vacuous. Fix the test, not the check.

Do this for every check at once with the mutation gate (`scripts/verify-check-discrimination.mjs`): it stubs
each check to a no-op, runs the check-test suite, and requires every check's test to go red. Any test that
stays green is reported and blocks the merge. This turns "we think our checks work" into a deterministic,
every-PR guarantee. See `references/mutation-gate.md`. This is the same move a mutation-testing tool like
Stryker or PIT makes on application code; here it is aimed at the gates.

### 4. Prove each invariant at the layer that OWNS it, do not stack blind monitors
Before adding a check, ask who already enforces this. If a database constraint or trigger, a type, or a
service boundary already makes the bad state impossible, prove the invariant there (a test next to that
owner), and do not add a separate after-the-fact monitor that re-checks the same fact from further away. A
second, weaker checker of a guarantee something else owns is the "two owners of one guarantee" smell: it
drifts, and worse, it is often unwired (runs nowhere) or untestable (only a live system could trigger it),
so it provides confidence without protection. Delete dead and redundant checks. A check that runs in no
pipeline is not a safety net, it is a comment that lies. See `references/owning-layer-and-ratchet.md`.

### 5. Ratchet, do not big-bang
Retrofitting existing checks with tests takes time. Use a shrink-only allowlist of checks that predate the
requirement: the coverage gate blocks any new untested check immediately, while the backlog is burned down
one entry at a time. Once a check has a real, discriminating test its name must come off the allowlist, and
`check-has-test` FAILS until it does, so the list can only shrink. This tightens in one direction without a
flag day. See
`references/owning-layer-and-ratchet.md`.

## Comparing a change against a base build

"This change adds no new failures" is a claim, and it fails the same way a vacuous check does: the
comparison can be built so it could never have found a failure. In an audited run an agent reported
"0 new failures, CLEAN" from a script that sorted gates by an `ok` field no gate record had, so
"passed in base, failed in changed" could never be true. In the same run a gate failing in both builds
got worse (420 problems to 430) and a pass-or-fail comparison could not see it.

Two rules make a before-and-after comparison able to fail:

1. **Compare only on fields proven present. A missing field is an error, not an empty status.** Confirm
   the field you compare on exists on every record first; if it is absent, stop with an error naming
   the field and print no count. A field read as empty and then treated as "no change" is how a clean
   verdict gets reported without a comparison.

   ```
   # never: a status field no record has, read as "unchanged" -> new-failure list can never fill
   status = rec.get("ok") or rec.get("passed")

   # always: proven-present or it is a hard error
   if status_field not in rec: die(f'"{status_field}" absent from {gate}; cannot compute pass/fail')
   ```

2. **For gates red in both builds, compare per-case results or problem counts; any increase is new**
   until it is explained or fixed. This needs gate records that keep the per-case results, or a count
   plus a hash of the case list, not just the last output line. A both-red gate with only a last line
   cannot be proven to have not gotten worse, so it is reported UNVERIFIABLE and blocks "clean".

The reference script `scripts/compare-gate-runs.mjs` embodies both rules, and its discriminating test
(`test/compare-gate-runs.test.mjs`) proves it: rename the status field and it must error; add one
problem inside a red gate and it must report it. **The claim rule:** a "0 new failures" or "clean"
claim may only cite a run that was able to find a failure, with its command, exit code, and output
hash; without that citation the verdict is `not-assessed`, never `proven`. See
`references/comparing-against-a-base-build.md`.

## What "fixed" and "verified" mean (a defect test is a discrimination test)

A defect is **fixed** only when a committed test is **red on the code before the fix, green after it, and
red again when the fix is reverted** (each run recorded with its command and exit). The red-on-revert run
is the discrimination proof from the core rule, aimed at the fix: it shows the test can detect the fix
being lost, so the regression cannot silently return. A defect marked fixed with no red-on-revert run is
`not-assessed`, never a pass. **Verified** means a re-runnable command, its exit code, and an output hash
are in the receipt. A test that turns green with no edit aimed at it is an **unexplained pass**: revert
each edit in turn and name the one that turns it red again before counting it as a fix. These definitions
are owned by the evidence contract
([`skeptical-audit/references/evidence-discipline.md`](../skeptical-audit/references/evidence-discipline.md),
section 6) and raised as smoke alarms by `claim-lint`.

## Mechanical gate

This skill ships its own two gates, and they guard each other. `scripts/check-has-test.mjs` (the coverage
gate) fails when a check has no committed test that runs it, honoring the shrink-only allowlist.
`scripts/verify-check-discrimination.mjs` (the discrimination gate) no-ops each check in turn, runs the
check-test suite, and fails if any check's test stays green. Both are dependency-free and run in CI as
blocking checks, and both have their own discriminating tests in `test/verifiable-gates.test.mjs`, so the
gates that prove other checks are themselves proven.

## Definition of done for a check
- [ ] Fails closed (missing input, internal error, or zero-scan exits non-zero) and prints evidence on success.
- [ ] Has a committed test that runs the real check and asserts its exit code.
- [ ] That test reproduces the check's real violation (faithful fixture) and covers the fail-closed paths.
- [ ] The test DISCRIMINATES, proven by the mutation gate (no-op the check, its test fails).
- [ ] The invariant is not already owned elsewhere (if it is, prove it there and delete this check).
- [ ] The coverage and discrimination gates are wired into CI as blocking checks.
- [ ] The run reports its **evidence ledger**: for each check, the detection claim, its state, the re-runnable source (the test run and the mutation-gate result), and any check still on the allowlist as a stated gap.

## How this pairs with the other skills
- **`comprehensive-test-strategy`** owns mutation testing of your application code; this skill applies the
  same idea one level up, to the checks and gates that guard the code. One proves the product works, the
  other proves the guards that prove the product.
- **`judge-arch` and `arch-encode`** turn caught mistakes into mechanical gate rules; this skill is how you
  keep those gates honest. An `arch-encode` rule you never proved can detect is the same theater as any other
  unproven check.
- **`architectural-decision-records`.** Deleting a redundant monitor in favor of proving an invariant at its
  owning layer is an architecturally significant decision; record it as an ADR (see the worked example in
  `references/owning-layer-and-ratchet.md`).

## Reference files

| Topic | File |
|---|---|
| Building the discrimination (mutation) gate: the no-op mutant, running the suite, requiring failure, restoring safely, failing closed | `references/mutation-gate.md` |
| Faithful, discriminating check-tests: fixtures, checks rooted at their own location, test-only seams for database/API/network-gated checks, how a coverage gate credits a test | `references/check-test-patterns.md` |
| Prove-at-the-owning-layer, deleting dead or redundant monitors, the shrink-only allowlist ratchet | `references/owning-layer-and-ratchet.md` |
| Comparing a change against a base build so a "no new failures" claim can actually fail (proven-present fields, worsening inside red gates) | `references/comparing-against-a-base-build.md` |
| Dependency-free reference coverage gate (every check has a test that runs it) | `scripts/check-has-test.mjs` |
| Dependency-free reference mutation gate (no-op each check, require its test to fail) | `scripts/verify-check-discrimination.mjs` |
| Dependency-free reference build-comparison script (new failures and worsened red gates, fails closed on a missing field) | `scripts/compare-gate-runs.mjs` |
| Example configuration for both engines | `assets/verifiable-gates.config.example.json` |

## Evidence & skeptical assessment (required)

"This check can detect a violation" is a factual claim, so it follows the repo's evidence discipline
(canonical contract: [`skeptical-audit/references/evidence-discipline.md`](../skeptical-audit/references/evidence-discipline.md)).
This skill is the engine that lifts a claim to `proven`: a claim reaches `proven` only when a committed,
discriminating gate keeps it true on every change, which is exactly what the two gates here produce. The run
emits an **evidence ledger** so no detection claim is trusted on assumption.

| Claim | Reaches `observed` by | Becomes `proven` when |
|---|---|---|
| "This check detects its violation" | running the check against a faithful fixture and seeing it exit non-zero | the discrimination gate no-ops the check and its test goes red, in the blocking CI set |
| "This check fails closed" | running it with a missing input or zero-scan and seeing a non-zero exit | a committed test asserts the fail-closed exit codes and discriminates |
| "Coverage of the checks is not the goal; detection is" | the suite reports mutation results, not just a coverage number | the discrimination gate is the merge-blocking signal, not a coverage threshold |
| "No check is a blind monitor of a guarantee owned elsewhere" | the invariant is shown proven at its owning layer (a test next to the owner) | the redundant monitor is deleted and an ADR records why |
| "This change adds no new failures vs the base build" | a comparison that reads fields proven present (not an absent field read as empty) exits 0 | the comparison also counts worsening inside gates that are red in both builds, and the claim cites its command, exit code, and output hash |

**Definition of done:** every check fails closed and emits evidence; has a committed test that runs the real
check; that test discriminates (proven by the mutation gate); redundant monitors are deleted in favor of the
owning layer; the two gates run as blocking CI checks; and the run reports the evidence ledger with every
allowlisted check named as an open gap. A detection claim reaches `proven` only through the discrimination
gate; until then it is `observed` at best.

## Why this holds for every developer and every agent

It binds everyone because the proof lives in committed gates and tests, not memory. Agents get the discipline
through the always-on hook, which lists this skill in `always-on/enterprise-skills-always-on.md`. People and
agents alike are held by the coverage and discrimination gates in CI: a new untested check cannot merge, and
a vacuous test is caught by the no-op mutation and blocks the merge. It survives any one person because the
gates, their tests, and the allowlist are all in git. The honest limit: the discrimination gate proves a
check can detect the violation the test plants, not that the test plants every violation worth catching. What
it makes impossible is shipping a check that detects nothing. Widening what each test plants stays a matter
of judgment, caught by a `judge-arch` review and by the escaped-defect loop (an escaped bug is a missing
fixture).

## Sources and attribution

- Richard A. DeMillo, Richard J. Lipton, Frederick G. Sayward, "Hints on Test Data Selection: Help for the
  Practicing Programmer," IEEE Computer 11(4), 1978 (<https://www.inf.pucrs.br/~zorzo/cs/demillo-mutants.pdf>):
  the origin of mutation testing, the competent-programmer hypothesis, and the coupling effect (a test that
  catches simple seeded faults also catches complex ones). `[documented]`
- Mike Papadakis, Marinos Kintis, Jie Zhang, Yue Jia, Yves Le Traon, Mark Harman, "Mutation Testing Advances:
  An Analysis and Survey," 2019 (<https://mutationtesting.uni.lu/survey.pdf>): mutation testing as seeding
  artificial defects to measure test adequacy, and the rule that tests which fail to reveal the seeded defects
  should be improved. Read in place of the earlier Jia and Harman 2011 survey, whose open copy would not
  fetch. `[documented]`
- Laura Inozemtseva and Reid Holmes, "Coverage Is Not Strongly Correlated with Test Suite Effectiveness,"
  ICSE 2014 (<https://www.cs.ubc.ca/~rtholmes/papers/icse_2014_inozemtseva.pdf>): the finding that coverage,
  controlled for suite size, is only low to moderately correlated with fault detection, which is why this
  skill does not treat coverage as the quality bar. `[documented]`
- René Just, Darioush Jalali, Laura Inozemtseva, Michael D. Ernst, Reid Holmes, Gordon Fraser, "Are Mutants a
  Valid Substitute for Real Faults in Software Testing?", FSE 2014
  (<https://homes.cs.washington.edu/~rjust/publ/mutants_real_faults_fse_2014.pdf>): mutant detection
  correlates with real-fault detection even after controlling for coverage, which is the evidence that the
  discrimination (mutation) signal is the one worth gating on. `[documented]`
- Martin Fowler, "TestCoverage," 2012 (<https://martinfowler.com/bliki/TestCoverage.html>): coverage is a
  tool for finding untested code, not a numeric quality measure, and a coverage target is counterproductive.
  `[documented]`
- Stryker Mutator (<https://stryker-mutator.io/docs/>) and PIT / PITest (<https://pitest.org/>): production
  mutation-testing tools for application code; the same "test your tests" idea this skill applies to the
  gates. `[documented]`
