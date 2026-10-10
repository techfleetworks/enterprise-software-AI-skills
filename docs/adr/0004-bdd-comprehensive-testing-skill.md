---
status: "accepted"
date: 2026-10-10
decision-makers: mdenner
---

# Create the bdd-comprehensive-testing skill as the owner of the Gherkin behavioral layer

## Context and Problem Statement

The repo referenced a skill named `bdd-comprehensive-testing` in 30+ places — as the owner of the
Gherkin/behavioral layer, the permanent feature-file store, and the `ci-cd-wiring` other skills plug
into — but no such skill existed (the audit's S1/S2). The links dead-ended, and the promised
"executable scenarios in a permanent, CI-wired index" had no owner. How should the repo close this
gap so the references resolve and the behavioral-testing discipline is actually enforceable, not just
described?

## Decision Drivers

* 30+ existing references must resolve to a real, present skill, and the two cited anchors
  ("Storing BDD scenarios permanently", `ci-cd-wiring`) must be defined.
* The behavioral layer must be *enforced*, not advisory — complete coverage, legal Gherkin, and real
  execution gated on every push (mdenner's "structurally impossible to fail silently" bar).
* Records must survive any individual and be semantically queryable by every developer.
* The gates must themselves be proven (discriminating tests), per `verifiable-quality-gates`.

## Considered Options

* Create a new `bdd-comprehensive-testing` skill owning the Gherkin layer, with enforcement gates.
* Rename all 30+ references to the existing `comprehensive-test-strategy` skill.
* Leave the references dangling and document the gap.

## Decision Outcome

Chosen option: "create the new skill", because renaming would still leave S2 unresolved (no owner for
the Gherkin layer, undefined anchors) and would overload `comprehensive-test-strategy`, whose own text
disclaims that ownership. The new skill makes every reference resolve and gives the behavioral layer a
real, enforced home. It mandates: the complete use-case × audience matrix written out as Gherkin (not
just identified); a shared semantic taxonomy (`@audience`/`@usecase`/`@category`/`@quality`/`@severity`
+ derived domain); a committed, generated datastore plus an append-only coverage log; and a gate suite
— `check-gherkin-valid` (the official @cucumber/gherkin parser as the oracle), `check-bdd-tags`
(vocabulary), `check-bdd-coverage` (matrix + datastore sync + append-only log), and `check-bdd-executed`
(the suite actually ran and every scenario passed) — each proven by a discriminating test.

### Consequences

* Good, because all 30+ references resolve, the anchors are defined, and the behavioral layer is both complete (static gates) and real (execution gate), gated on every push.
* Good, because the records are committed, categorized, logged, and survive any single developer.
* Bad, because the gate scripts take a devDependency on `@cucumber/gherkin` (the parser oracle) — the first dependency in the repo; CI now runs `npm ci`. Justified: regex-parsing Gherkin would reintroduce the false-positive/negative risk the skill forbids.
* Neutral, because the datastore/log formats are reference designs an adopting repo wires to its own stack; the shipped example proves them end-to-end.

### Confirmation

`test/bdd-gates.test.mjs` runs the real gate scripts against fixtures and asserts each detects its
failure mode (malformed Gherkin, off-vocabulary tag, datastore drift, happy-only feature, edited log,
a scenario that never ran). `grep -rn bdd-comprehensive-testing` resolves only to the present folder;
the two anchors are defined in `SKILL.md`. All run in CI via `npm test`.

## More Information

See the skill's `references/bdd-gates.md` for the gate suite and `references/storage-and-ci-wiring.md`
for the datastore, log, and CI wiring. Companion to `comprehensive-test-strategy` (the full test
pyramid beyond behavioral Gherkin).
