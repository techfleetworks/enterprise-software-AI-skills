---
status: "accepted"
date: 2026-10-10
decision-makers: mdenner
---

# Enforce the test pyramid shape with a mechanical gate

## Context and Problem Statement

`comprehensive-test-strategy` teaches the test pyramid — many unit, some integration, few e2e — and
warns that inverting it yields the "ice-cream cone": a slow, flaky suite nobody trusts. But a pyramid
erodes gradually: each PR adds one more e2e test "just to be safe," and nothing flags the drift until
CI takes forty minutes and everyone re-runs until green. The skill said "keep the shape" in prose;
nothing measured it. The repo's thesis is to make a skill's rule structural, with a discriminating
test so the gate can't rot.

## Decision Drivers

* Measure the actual shape from real test results, not a guess, and fail when it drifts.
* Vendor-neutral: work with any runner, not one framework's reporter.
* Dependency-free (ships and is copied with the skill).
* Honest about the one input it needs (a report) and about classification being config-driven.

## Considered Options

* A `check-test-shape.mjs` gate that reads a JUnit XML report and enforces configured shape thresholds.
* Count test *files* by directory instead of parsing a report (no report needed, but a weak proxy).
* Leave the pyramid to review and the prose rules of thumb.

## Decision Outcome

Chosen option: "parse a JUnit report." JUnit XML is the near-universal test-report format (most runners
emit it directly or via a reporter), so the gate stays runner-agnostic. It classifies each `<testcase>`
into a layer by matching its `classname`/`name` against config glob/substring patterns, then enforces
any of: a `minShare` floor per layer (unit base), a `maxShare` cap (e2e top), `requirePyramid` (counts
non-increasing down the `layers` list, which is declared **base→top** — so it works for any layer
names, not just unit/integration/e2e), a `maxUnclassifiedShare` guard, and an optional `maxTotalSeconds`
runtime cap per layer. Two integrity rules keep the gate from silently no-opping: the pyramid order is
derived from the declared layers (never hardcoded names), and `maxUnclassifiedShare` **defaults to 0.2
whenever any shape threshold is set**, so a verdict is never rendered on a tiny classified sample while
most tests are untagged. Counting tests (not files) reflects the real pyramid; the report is the honest,
measured input.

### Consequences

* Good, because pyramid erosion now fails CI the PR it happens, instead of being discovered when the suite is already an ice-cream cone.
* Good, because classification is config-driven (globs on classname/path), so it adapts to any repo's layout without code changes.
* Good, because the unclassified guard refuses to "pass" a suite it can't actually measure (fail-closed).
* Bad (honest limit), because it depends on the repo producing a JUnit report and on layer patterns being maintained; a mis-tagged test lands in "unclassified," and if that exceeds the guard the gate fails until patterns are fixed.
* Neutral, because it is a reference gate an adopting repo points at its report + a `test-shape.json` in CI.

### Confirmation

`test/test-shape.test.mjs` (14 tests): a healthy pyramid passes; an inverted cone, an over-cap e2e
share, an under-floor unit base, a violated `requirePyramid` order (incl. with **custom layer names**),
an over-cap unclassified share (incl. via the **default** guard with no explicit key), and an
over-budget layer runtime each fail; glob classification and a `>`-in-classname case are proven; and a
zero-testcase report, a missing report, and a layerless config each fail closed (exit 2). All run in CI
via `npm test`.

## More Information

Rules trace to `comprehensive-test-strategy/references/test-pyramid-and-types.md` (Fowler/Vocke, *The
Practical Test Pyramid*). Fourth Phase-3 structural gate (after migration-safety 0009, untagged-PII
0010, OWASP lints 0011); an accessibility (axe) CI scaffold follows as the last Phase-3 item.
