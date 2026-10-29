---
status: "accepted"
date: 2026-10-29
decision-makers: mdenner
---

# Define "fixed" and "verified": red before, green after, red again on revert

## Context and Problem Statement

Issue #179 (one of ten from an agent-session audit) found a harm-critical fix marked "fixed + verified" while
reverting the fix left the harm-gate test green, so no test could catch the fix being lost. A separate case: a
year-answer suite passed 75 cases while a real input shape (a full day-month-year date) returned UNKNOWN, because
no case in the suite used that shape. The skills had no definition of "fixed" or "verified", and nothing stopped a
"done" claim while a confirmed HIGH review finding sat open. These are evidence-discipline gaps: a word was used
above the evidence behind it.

## Considered Options

- **Document the definitions only** (in `skeptical-audit`), and rely on review and habit to apply them.
- **Document the definitions AND raise them as mechanical smoke alarms**: extend `claim-lint` to flag the loose
  words, and, for the "HIGH blocks done" rule, add a checker.
- For "HIGH blocks done" specifically: **a `claim-lint` prose rule** (guess an open HIGH from the report text) vs
  **a dedicated checker that reads the structured fresh-context review log**.

## Decision

1. **Definitions, in the evidence contract.** `skeptical-audit/references/evidence-discipline.md` (section 6) now
   defines: a defect is **fixed** only when a committed test is red before the fix, green after it, and red again
   when the fix is reverted (each run recorded with its command and exit); **verified** means a re-runnable command,
   its exit code, and an output hash are in the receipt; a green suite proves only the cases it contains, so a
   suite-backed claim names its covering cases and lists the shapes it did not check; an unexplained pass (a test
   that turns green with no edit aimed at it) is attributed by reverting each edit in turn before it counts; and a
   HIGH (or critical) review finding blocks "done" until it is fixed or an operator waives it. `verifiable-quality-gates`
   adds the "fixed = a red-on-revert discrimination test" framing and links the contract.

2. **`claim-lint` raises the loose words as smoke alarms.** Document-level grounding (the record may sit in a fenced
   block the per-line scan skips): `fixed`/`resolved` without a revert record, `verified` without a command + exit +
   hash, a suite-backed claim without its cases + not-checked shapes, and `done` while an open HIGH is named in the
   same report. Document-level grounding was chosen over line-adjacent because evidence commonly lives in fenced
   blocks, which the per-line loop skips.

3. **`check-open-high-findings.mjs` is the mechanical "HIGH blocks done".** It reads the structured review log and
   fails when any HIGH finding has no resolution and no operator waiver. The structured-log checker was chosen over
   a `claim-lint` prose rule because the review log already records severity and resolution as data, which is more
   reliable than guessing an open HIGH from prose. The finish check (issue #174) will call it at task end; it also
   runs on its own with `--change`.

The first option (document only) is rejected: the audit's finding is that the discipline was documented-ish and not
followed, so the words need a mechanical smoke alarm. Each new script and rule ships a discriminating test.

## Consequences

* "fixed", "verified", and "done" now carry a defined bar, and a report that uses them loosely is flagged by
  `claim-lint --strict` (a blocking form) before it is sent. A green suite can no longer stand in for a behavior it
  never tested without naming the gap.
* A confirmed HIGH review finding mechanically blocks "done" via `check-open-high-findings.mjs`, so a known HIGH
  cannot be left open under a "done" claim.
* Honest limits: `claim-lint` is a smoke alarm, not a judge. It catches the loose word, not the subtle gap, so the
  skeptic's loop still owns the subtle ones; document-level grounding means one revert record in a report grounds
  its fixed-claims, which is deliberate leniency for a smoke alarm. `check-open-high-findings` trusts the review log:
  it proves no HIGH is recorded open, not that the review found every HIGH there was. The ENFORCEMENT at task end
  (refusing to finish) lands with the finish check in issue #174; this change ships the definitions, the rules, and
  the checker they call.
* The scenarios run on the executable BDD harness (ADR-0091); `features/bdd-config.json` now declares the `operator`
  audience, covered by the HIGH-blocks-done scenario.
