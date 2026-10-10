---
status: "accepted"
date: 2026-10-10
decision-makers: mdenner
---

# Align the test-strategy skills with Fowler's Practical Test Pyramid

## Context and Problem Statement

A skeptical audit of `comprehensive-test-strategy` and `bdd-comprehensive-testing` against Martin
Fowler / Ham Vocke's *The Practical Test Pyramid* (retrieved 2026-10-10) found 11 gaps, each with
observable proof (a `file:line` or a zero-hit grep) — recorded in
`docs/audit/test-pyramid-gap-analysis.md`. Three were High: the "push tests down / delete redundant
higher-level tests" rules of thumb (absent entirely), exploratory testing (absent entirely), and the
fact that acceptance tests can live low in the pyramid (we framed BDD/acceptance as top-only). The
last of these matters most: our BDD skill mandates "ALL use cases × ALL audiences, every push," which
— taken naively — risks the ice-cream cone Fowler warns against, and our skills didn't state the
reconciliation (run behavioral coverage at the lowest layer that proves it). How should we close the
gaps without diluting the existing (accurate) guidance?

## Decision Drivers

* Close every proven gap, prioritizing the three High ones.
* Make the BDD "total coverage every push" mandate explicitly consistent with the pyramid (no ice-cream cone).
* Keep guidance concrete and cited to the primary source; no invented ratios or statistics.
* Additive — don't contradict what the skills already got right (pyramid shape, CDC, Testcontainers, mutation/coverage gates).

## Considered Options

* Enrich the existing references + SKILL and add two focused new references (test code quality, exploratory testing).
* Rewrite the test skills around the article wholesale.
* Leave the gaps and only link to the article.

## Decision Outcome

Chosen option: "enrich + two new references", because the skills' existing content is accurate and the
gaps are specific; targeted additions close them without a disruptive rewrite. Changes: `test-pyramid-
and-types.md` gains solitary/sociable units, narrow/broad integration, subcutaneous tests, the
in-memory-DB caveat, the private-method/SRP rule, and a **Rules of thumb** block (push-down, the
lower-level-gap rule, delete-the-duplicate, acceptance-can-live-low); `contract-testing.md` gains the
third-party-fake-drift → contract-test pairing; two new references cover test code quality (DAMP vs
DRY, Rule of Three, one-behavior-per-test, deleting redundant tests) and exploratory testing; and the
SKILL adds the push-down principle, an exploratory-testing step, and stage-by-speed-not-type.

### Consequences

* Good, because the two test skills now match a widely-cited industry reference, and the BDD mandate is explicitly reconciled with the pyramid (cover every behavior, but subcutaneously / at the lowest layer).
* Good, because the gaps were closed with observable proof and the fix is cited, not asserted.
* Neutral, because this is guidance (prose); it changes no gate yet.
* Bad (open gap), because "the suite is actually pyramid-shaped" is still `[documented]` advice, not `[proven]` — no committed gate measures a real suite's layer ratios/runtimes.

### Confirmation

Re-running the audit's baseline grep now returns hits for every previously-missing term
(solitary/sociable, narrow/broad integration, subcutaneous, push-down, sunk cost, exploratory, Rule of
Three, DAMP). The gap-analysis document lists each gap, its proof, and the closing edit.

## More Information

A future `check-test-shape` gate (ratios of unit:integration:e2e from test reports) would lift
"pyramid-shaped" from advice to a proven gate — tracked as the stated limitation in the gap analysis.
