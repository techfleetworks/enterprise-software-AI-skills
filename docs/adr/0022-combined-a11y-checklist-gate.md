---
status: "accepted"
date: 2026-10-12
decision-makers: mdenner
---

# One combined accessibility checklist that satisfies WCAG, Section 508, and the ADA, with a gate

## Context and Problem Statement

A product has to satisfy several overlapping accessibility rules at once: WCAG, Section 508 for US
federal reach, and the ADA. The request was to make specific skills that gate and check for all of
them, with a single combined list that requires a website to comply with all of them. Three source
checklists were provided: the WCAG 3.0 requirements, the ADA Checklist for Existing Facilities
(adata.org), and the WebAIM Section 508 checklist. Read directly, they do not combine cleanly:

* WCAG 3.0 is a W3C Working Draft (a Group Note Draft, not endorsed), so nothing can conform to it yet.
* The ADA Checklist for Existing Facilities is for physical buildings and does not address the web.
* The WebAIM Section 508 checklist page is self-marked out of date (it maps the pre-2017 provisions).

The durable, correct relationship is that the stable web standards nest: Section 508 of 2017
incorporates WCAG 2.0 Level A and AA by reference; the ADA, via the DOJ Title II rule of 2024, requires
WCAG 2.1 AA; and WCAG 2.2 contains both. So one checklist can require compliance with all of them, and
it must be gated, not just documented.

## Decision Drivers

* Produce one combined checklist that, if met, satisfies 508 and the ADA web standard and exceeds them.
* Gate it, so "we meet all three" is a recorded verdict per criterion, not an unproven claim.
* Be honest about automation: automated tools catch only part of accessibility, so the gate must force
  human verification where a criterion is not fully machine-testable.
* Dependency-free and vendor-neutral.

## Considered Options

* **One combined checklist = WCAG 2.2 Level A and AA**, plus a conformance-record gate.
* Three separate per-standard checklists and gates (one for 508, one for ADA, one for WCAG 3.0).
* Leave it as prose in the skill and rely on the existing axe gate.

## Decision Outcome

Chosen option: "one combined checklist = WCAG 2.2 A and AA, plus a gate." WCAG 2.2 A and AA is the
strict superset of every stable web requirement the sources point to, so a single list avoids three
drifting copies of overlapping criteria (one owner). The checklist
(`assets/combined-a11y-checklist.json`) enumerates all 55 WCAG 2.2 A and AA success criteria, each
tagged with the version that introduced it, whether Section 508 also requires it (`s508`, a WCAG 2.0
criterion), whether ADA Title II also requires it (`ada`, a WCAG 2.0 or 2.1 criterion), and a `method`
of automated, both, or manual. WCAG 3.0 is recorded as direction only, and the physical ADA facilities
checklist is noted as out of scope for a website.

The gate (`scripts/check-a11y-checklist.mjs`) reads the checklist and a project's conformance record and
fails unless every criterion has a valid verdict: `pass-automated` (allowed only for an
automated-method criterion), `pass-manual` (reviewer and date required), or `not-applicable` (reason
required). A criterion whose method is `both` or `manual` cannot be closed by `pass-automated` alone,
which is how the honest limit of automated testing is enforced rather than described. This gate composes
with the existing `check-axe-results.mjs` (ADR-0013): axe proves the automated subset is clean, and this
gate proves every criterion in the superset has a verdict.

### Consequences

* Good, because one list satisfies and exceeds 508 and the ADA Title II web standard, with no duplicate
  per-standard lists to drift apart.
* Good, because "comply with all of them" is now structural: a missing or placeholder verdict on any of
  the 55 criteria fails the build.
* Good, because the automated-versus-manual distinction is enforced, so a green axe run cannot be
  mistaken for full conformance.
* Bad (honest limit), because the gate checks that a verdict is recorded, not that the manual review was
  thorough. A dishonest `pass-manual` passes. That residue is judgment for `judge-arch` and real
  keyboard and screen-reader testing, which the skill still requires.
* Neutral, because WCAG 3.0 remains draft; when it stabilizes, the checklist and gate get a new column,
  not a rewrite.

### Confirmation

`test/a11y-checklist.test.mjs` (19 tests): a complete record passes, including the real committed
combined checklist against the example record; a missing verdict, an invalid status, `pass-automated` on
a manual or both criterion, a manual pass with no reviewer or no ISO date, a placeholder reviewer or note
(`TBD`, `n/a`), an impossible or out-of-range date (`0000-00-00`, `2026-99-99`), and a not-applicable
with no reason all fail; a missing file, invalid JSON, an empty checklist, and missing args all fail
closed (exit 2). All run in CI via `npm test`, and the discrimination gate confirms the tests fail when the
check is stubbed to a no-op.

## More Information

Criteria and plain-language requirements are from WCAG 2.2 (w3.org/TR/WCAG22) and WebAIM's current WCAG
2 checklist (webaim.org/standards/wcag/checklist). This is the second mechanical gate in the
`universal-accessibility-wcag` skill, alongside `check-axe-results.mjs` (ADR-0013), added in the Track-B
deep rewrite of the requirements skills.
