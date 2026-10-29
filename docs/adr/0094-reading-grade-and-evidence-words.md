---
status: "accepted"
date: 2026-10-29
decision-makers: mdenner
---

# Reports to people meet the asked reading grade and keep the evidence words

## Context and Problem Statement

Issue #181 (one of ten from an agent-session audit) found two failures in an agent's own reports to the
people it works for. The operator asked for a 7th-grade explanation; the first reply measured grade 10.1
(Flesch-Kincaid), and it took two more requests to reach grade 7.7. And when a result was made simple, the
wording changed what the evidence said: a fixed grid of 25 chosen combinations, each run once, by a program
with no randomness, became "25 out of 25 tries". The skills covered plain language for UI copy only
(`usability-ux-universal-design` aimed at about an 8th-grade level for labels and microcopy); nothing covered
an agent's reports, nothing measured the grade before sending, and no rule kept the evidence words when a
report was simplified.

## Considered Options

- **Documentation and review only**: state the two rules and rely on habit and the fresh-context review.
- **Document the rules AND ship the machinery**: a readability measurement script for the reading grade, and
  a `claim-lint` smoke alarm for the one evidence-words slip a line-level check can see.
- **Where the reading-grade rule lives**: `usability-ux-universal-design` (which owns plain language) versus
  `skeptical-audit` (which owns evidence).
- **How the evidence-words rule is enforced**: a dedicated new script versus a rule added to the existing
  `claim-lint`.

## Decision

Ship the machinery, split by ownership along the repo's boundary-placement rule:

1. **The reading-grade rule and the readability script go in `usability-ux-universal-design`**, because reading
   grade is a plain-language concern. `scripts/readability.mjs` (dependency-free, Node built-ins only) reports
   the Flesch-Kincaid grade of a draft's prose and, with `--max-grade N`, exits 1 when the draft is above the
   target, so a report drafted above the grade the operator asked for is rewritten, not sent. It scores prose
   only: it skips fenced code blocks, table rows, inline code, URLs, and file-path tokens, so a report full of
   commands is graded on the sentences a person reads. It fails closed (exit 2) on no countable prose, an
   unreadable file, or a missing or non-numeric `--max-grade` (including the value dropped by an unset shell
   variable), so a draft with no measurable grade and a gate with no target are never a silent pass.
2. **The evidence-words rule goes in `skeptical-audit`**, because it is about evidence, not style. The contract
   (`references/evidence-discipline.md`, section 8) says simplifying keeps the counts and totals, "chosen"
   versus "random", and the evidence state, and never turns a fixed or chosen set into tries, odds, or a rate.
   It is enforced by adding a rule to the existing `claim-lint` (matching #178/#179/#180), not a new script:
   a line that, on that same line, frames a result as a NUMERIC tries, odds, or rate (a count out of a count,
   an N% rate, numeric odds) while naming the set chosen or fixed, and does not call the set random, is
   flagged. The framing is required to be numeric, and the two signals required to share one line, so that
   common bare nouns ("attempts", "error rate") and unrelated adjacent sentences are not flagged.

The documentation-only option is rejected for the same reason as #179 and #180: the audit shows the discipline
was not applied without a mechanical nudge. The reading-grade rule is a genuine mechanical measurement (unlike
"is this intuitive?"), so it earns a script; overall usability stays judgment, and the skill still ships no
pass/fail gate on "usable". Each piece ships a discriminating test (a no-op flips the must-flag cases) and the
two issue scenarios run on the executable BDD harness (ADR-0091).

## Consequences

* An agent report drafted above the grade the operator set is caught by `readability.mjs --max-grade N` before
  it is sent, and a report that reframes a chosen or fixed set as tries, odds, or a rate is caught by
  `claim-lint --strict`.
* Honest limits. The grade is a rule-of-thumb syllable estimate, so a low grade means short words and short
  sentences, not that the meaning is clear; it is a floor to clear, not a verdict on being understood. The
  evidence-words smoke alarm catches only the one detectable contradiction (a chosen or fixed set framed, on
  the same line, as a numeric tries, odds, or rate result, when that line does not call the set random); it
  cannot see a simplification that silently drops "chosen", rounds "12 of 59" to "most", or writes the slip
  with a bare noun and no number, which stays owned by the fresh-context review and the finish check. The optional finish-check hook that would run `readability.mjs` on the final message when a
  grade is set depends on the Stop/SubagentStop hook substrate (#174), which this change does not build.
* The two scenarios (`plain-language-meets-grade`, `plain-language-keeps-evidence`) are `@audience:operator`
  and run on the harness; the step definitions drive the real `readability.mjs` and `claim-lint.mjs`.
