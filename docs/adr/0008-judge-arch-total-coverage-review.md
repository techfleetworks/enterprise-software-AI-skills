---
status: "accepted"
date: 2026-10-10
decision-makers: mdenner
---

# Deepen judge-arch to a total-coverage, logged, mutation-tested review

## Context and Problem Statement

`judge-arch` was a solid but *advisory* review rubric: it described the four questions and a grep-test,
but nothing forced a review to actually cover the whole change, nothing recorded that it happened, and
nothing proved the mechanical half could still detect. A reviewer could sample two files, write "looks
fine", and ship drift. This is the first Track-B skill rewrite to the depth of `bdd-comprehensive-testing`,
with an explicit goal from the user: make it *structurally impossible not to look* for architectural
issues. The honest constraint: you cannot mechanically guarantee a reviewer *perceives* every subtle
problem — judgment is irreducible. So what, exactly, can be made structural, and how is the residual
shrunk rather than merely tolerated?

## Decision Drivers

* Total coverage of the changed surface, not a sample — every changed file × every question.
* The review must leave a durable, tamper-evident record (receipts + history), not vanish into chat.
* The mechanical detection floor must be provably non-vacuous (a gate that can't detect is worse than none).
* Be honest about the irreducible residual (novel judgment) and shrink it with every catch.

## Considered Options

* Deepen the skill + add a coverage gate + a mutation-test gate + an append-only review log.
* Keep judge-arch advisory and rely on reviewer diligence.
* Rely only on the mechanical `arch-gate` (drop the judgment layer).

## Decision Outcome

Chosen option: "deepen + two new gates + the log." The rewrite adds: 12 non-negotiables (total
file×question matrix, mandatory fresh context, evidence on every verdict *including `cleared`*, severity,
categorization, ask-when-the-standard-is-uncertain, the append-only log, and proven completeness); an
append-only review log (`docs/arch-reviews/log.jsonl` + a generated `.md` view); and a four-gate suite —
`arch-gate` (mechanical) + **`check-arch-review-coverage`** (fails unless the log covers every changed
file × every question with evidence) + **`check-arch-rules-discriminate`** (planted violations the
mechanical layer must flag — a mutation test for the reviewer) + the evidence-contract gate. A dedicated
"Shrinking the judgment gap" section names five mechanisms (ratchet every catch into a rule; mutation-test
the reviewer; evidence on `cleared`; adversarial second pass; escaped-defect feedback) that move work out
of perception into proven mechanical detection.

### Consequences

* Good, because a change cannot be called "reviewed" unless a complete, evidenced matrix is logged, and the mechanical floor is proven to detect — "not looking" (skipping, sampling, silent-clear, vacuous gate) is now structurally impossible.
* Good, because every greppable catch ratchets into an `arch-gate` rule, so the judgment-dependent surface shrinks monotonically.
* Good, because judge-arch now carries the evidence contract and comes off the skill-evidence allowlist (now 3 of 15 compliant).
* Bad (honest limit), because a genuinely novel design smell can still escape a single pass — bounded by fresh context, the full matrix, the adversarial pass, and the ratchet, but not reducible to zero.
* Neutral, because the review log + the two gates are reference designs an adopting repo wires to its stack; the shipped example + fixtures prove them end to end.

### Confirmation

`test/arch-review-gates.test.mjs` (10 tests): `check-arch-review-coverage` flags an unreviewed file, a
missing question, a `cleared` cell with no evidence, a bad-severity finding, an un-recorded grep-battery,
an empty log, and a non-append log; `check-arch-rules-discriminate` flags every planted violation with the
real arch-gate and FAILS against a no-op arch-gate. `check-skill-evidence-contract .` shows judge-arch
compliant. All run in CI via `npm test`.

## More Information

See `judge-arch/references/grep-battery.md` and `references/review-log-and-coverage.md`. The remaining 12
skills follow this template (Track B); each comes off the allowlist as it is rewritten.
