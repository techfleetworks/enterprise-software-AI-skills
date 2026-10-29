---
status: "accepted"
date: 2026-10-29
decision-makers: mdenner
---

# Combinatorial testing, and a tested checker before "0 found" counts

## Context and Problem Statement

Issue #182 (one of ten from an agent-session audit) found two gaps in how interaction defects are tested. A
privacy leak that only happened when two inputs appeared together was tested on a hand-picked 5 by 5 grid, and
combinatorial testing (NIST SP 800-142) came in only after the operator asked for it. Separately, the checker
that decided "leaked or not" had its own bugs: it missed a leak of "Dr Example" when the secret was "Dr.
Example", and it flagged "75k" as a leak because "75k" appears inside "175k". A search of `.claude/skills` and
`always-on` for `combinatorial testing | 800-142 | covering array | pairwise | t-way` returned zero lines, so
`comprehensive-test-strategy` had no text on either topic.

## Considered Options

- **Documentation only**: add a combinatorial-testing reference and a written oracle rule, and rely on habit.
- **Documentation plus runnable machinery**: ship the reference, plus a coverage measurer and a worked tested
  oracle, so the two scenarios execute against real code and the skill carries reusable tools.
- **Where the oracle rule lives**: `comprehensive-test-strategy` (which owns the test strategy) versus
  `verifiable-quality-gates` (which owns "prove a check can detect"). The oracle rule is the same principle
  applied to a content-comparison checker, so it could sit in either.

## Decision

Ship the reference and the machinery, in `comprehensive-test-strategy`:

1. **`references/combinatorial-testing.md`** links NIST SP 800-142 and covers when to use combinatorial testing
   (defects from inputs acting together), how to list factors and their value classes, how to choose a strength
   `t` (pairwise by default), how to build a covering array (NIST ACTS or PICT), how to measure and report the
   share of combinations covered, and how to handle constraints (value combinations that cannot occur).
2. **`scripts/coverage-measure.mjs`** (dependency-free, Node built-ins only) reads a plan (factors, strength,
   rows, optional constraints) and reports the measured share of t-way combinations the rows cover: exit 0 at
   full coverage (a covering array), exit 1 with the gaps when short, fail closed (exit 2) on a bad plan or a
   row with an undeclared value. This is how "we tested a grid" becomes a measured percentage.
3. **The oracle rule, in SKILL.md Step 6**: any check that decides pass or fail (a leak checker, a grader, a
   comparison script) is an oracle, and its "0 found" does not count until it has its own passing tests for
   value variants (punctuation, case, spacing, Unicode), one value found inside a larger one, and empty input.
   **`scripts/leak-check.mjs`** is the worked example, a reference leak checker that normalizes to whole tokens
   so "Dr Example" leaks "Dr. Example" while "75k" is not flagged inside "175k", pinned by `test/leak-check.test.mjs`.
   The rule is placed here (not in `verifiable-quality-gates`) because it is part of the test strategy, and it
   cross-references `verifiable-quality-gates` as the same "prove it can fail" principle applied to an oracle.

The documentation-only option is rejected for the reason the audit shows across these issues: the discipline was
not applied without concrete machinery, and the two scenarios need real code to be non-vacuous. Two small
single-purpose scripts are added (no new abstraction), matching the skill's existing `check-test-shape.mjs`
pattern. Each ships a discriminating test, and the two scenarios drive the real scripts (a hand-picked grid
measures short while a covering array measures full; the checker catches the variant leak and ignores the
substring, where a naive substring checker gets both wrong).

## Consequences

* An interaction defect is now tested with a covering array of a stated strength, and `coverage-measure.mjs`
  reports the measured share instead of assuming it; a checker's "0 found" is backed by the checker's own tests,
  with `leak-check.mjs` as the reference.
* Honest limits. `coverage-measure.mjs` measures the rows you give it against the model you declare; it does not
  generate the array (use ACTS or PICT) and cannot know a factor or value class you failed to list. `leak-check.mjs`
  is a reference checker for human-readable text secrets at token boundaries (whole-token, case- and punctuation-
  and NFKC-insensitive), not a universal data-loss tool. Three classes are out of its scope and stay a matter of
  review: a secret that is a common word; a secret split by markup; and, as the flip side of the whole-token model
  that avoids the "75k" false alarm, a secret embedded inside a larger alphanumeric token with no delimiter (a
  high-entropy machine secret like an API key concatenated into a longer string), which the whole-token match does
  not catch. For machine secrets, pair it with a substring or entropy check. The oracle rule is enforced for the leak checker shipped here (its tests are
  committed and run in CI); for an arbitrary checker a developer writes, "refused if the tests are missing" is a
  discipline the scenario demonstrates by contrast with a naive checker, not a mechanical gate over every
  checker in the repo.
* The two scenarios (`interaction-defects-use-covering-array`, `oracle-unit-tested`) are `@audience:agent` and
  run on the executable BDD harness (ADR-0091).
