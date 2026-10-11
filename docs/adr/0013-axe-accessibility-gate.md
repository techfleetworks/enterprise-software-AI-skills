---
status: "accepted"
date: 2026-10-11
decision-makers: mdenner
---

# Accessibility gate: a tested verdict + a documented browser scaffold

## Context and Problem Statement

`universal-accessibility-wcag` requires an axe-core check that runs in CI and fails the build on
violations. But a real axe scan needs a browser and a running app (axe-core + Playwright), so —
unlike the repo's other Phase-3 gates — it cannot be a self-contained, dependency-free script, and
the browser-driving step cannot run in *this* repo's own CI (there is no app to scan). The risk is
shipping an "accessibility gate" that is really just an untested convenience wrapper, where the part
that decides pass/fail could silently be wrong (treat violations as a pass, honor an expired
suppression) with nothing proving otherwise.

## Decision Drivers

* The pass/fail VERDICT must be provably correct (discriminating-tested), because that is what can
  silently be wrong.
* Be honest that the browser scan needs real dependencies + a running app and can't run in this CI.
* Match the skill's own discipline: fail on critical/serious; allowlist only with a WCAG-SC
  justification and an expiry ("never blindly suppress"); a clean run means "no detectable issues."

## Considered Options

* Split: a dependency-free, tested `check-axe-results.mjs` verdict + a documented `run-axe.mjs`
  Playwright scaffold that produces the results it judges.
* One monolithic runner (Playwright + axe + verdict together) — can't be unit-tested without a browser.
* Only document axe in prose (no script) — leaves the verdict logic unwritten and unenforced.

## Decision Outcome

Chosen option: "split verdict + scaffold." `check-axe-results.mjs` is dependency-free: it reads an
axe results file (one run, or an array of per-page runs), fails on any violation whose `impact` is in
`failOn` (default critical/serious) unless an allowlist entry covers the rule — and an allowlist entry
requires rule + reason + a parseable, unexpired `expires` (an expired entry stops suppressing, and a
stale entry is reported for removal). It fails closed on unreadable/unparseable input, a bad impact
name, or zero runs (an unscanned result is not a pass). `run-axe.mjs` is the honestly-labelled
scaffold: it dynamically imports Playwright + `@axe-core/playwright`, scans the configured pages, and
writes the results array the verdict consumes. The verdict is the gate; the scaffold is the plumbing.

### Consequences

* Good, because the decision that actually gates merges is dependency-free and discriminating-tested — a broken verdict (passing violations, honoring an expired waiver) fails a test.
* Good, because the gate inherits the skill's allowlist discipline (SC + reason + expiry, shrink-only), so suppressions are visible and time-boxed, not silent.
* Bad / honest limit, because the browser scan itself is NOT run or tested in this repo (no app); an adopter installs two devDependencies and wires `run-axe.mjs` into their e2e stage. And axe catches only ~30–40% of issues — the gate is explicitly "no detectable issues," not "accessible"; the manual keyboard + screen-reader layers remain required.
* Neutral, because both scripts are reference implementations an adopting repo copies and points at its own pages + config.

## Confirmation

`test/axe-results.test.mjs` (15 tests): a clean run passes; a critical and a serious violation fail
while a moderate passes under the default threshold; `failOn` is honored; a valid unexpired allowlist
entry suppresses while an expired one does not and a reason-less or bad-`expires` entry fails closed; a
multi-page array aggregates and one bad page fails; an empty results array, an unknown impact, a
violation with a **missing/unrecognized impact**, an **empty `failOn`**, and a missing file each fail
**closed** (exit 2) — the gate has no fail-open path. All run in CI via `npm test`. (The `run-axe.mjs`
browser scaffold is deliberately not tested here — it needs Playwright + a running app.)

## More Information

Grounded in `requirements/universal-accessibility-wcag/references/accessibility-testing.md`. Final
Phase-3 structural gate (after migration-safety 0009, untagged-PII 0010, OWASP lints 0011, test-shape
0012). Phase 3's five gates are now complete; the per-skill Track-B deep rewrites follow.
