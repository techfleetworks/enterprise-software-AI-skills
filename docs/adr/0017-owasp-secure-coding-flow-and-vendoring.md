---
status: "accepted"
date: 2026-10-11
decision-makers: mdenner
---

# Enforce the OWASP secure-coding selection flow, and vendor OWASP text license-compliantly

## Context and Problem Statement

The OWASP skill routes to a file per cheat sheet (ADR-0016), but two things were missing. First, nothing made
a developer or agent actually use the right cheat sheet when coding a feature; the guidance was available but
skippable. Second, the cheat sheets carry precise, verbatim instructions that teams want available, but the
OWASP Cheat Sheet Series and the OWASP Top 10 for Large Language Model Applications are licensed CC-BY-SA-4.0,
while this repo is MIT, so the exact text cannot simply be pasted into the skill files without breaking the
license. We needed a forced, enforced selection flow and a license-compliant way to carry the exact text.

## Decision Drivers

* Force the cheat-sheet choice the way pattern-selector forces a pattern, structured on a process developers
  recognize.
* Make it impossible to SKIP or silently REGRESS on a security-relevant change, enforced mechanically with a
  discriminating test, while being honest that choosing the right sheet is judgment.
* Give teams the precise, accurate instructions without inventing content and without breaking CC-BY-SA.
* Keep the repo's MIT license clean.

## Considered Options

* Structure the selection flow on OWASP's own Threat Modeling Process and enforce the outcome with a
  change-type to required-scenario gate; carry the exact OWASP text by vendoring it from source into a separate
  CC-BY-SA directory (aggregation), with own-words per-sheet files that quote short attributed excerpts.
* Paste each cheat sheet verbatim into the per-sheet files. Rejected: it relicenses CC-BY-SA text as MIT
  (ShareAlike forbids this) and mass-reproduces copyrighted pages.
* Keep the guidance advisory (no enforcement gate). Rejected: it stays skippable, which is the problem.

## Decision Outcome

Chosen option: "threat-modeling flow plus an enforcement gate plus compliant vendoring."

The selection flow in the OWASP SKILL.md follows OWASP's Threat Modeling Process in four steps (scope the work
and select the sheets; determine and rank threats; determine countermeasures and a risk response; assess the
work as a security-decision record). The flow produces a security-decision record and the `@security`
scenarios that test each countermeasure.

`scripts/check-security-coverage.mjs` enforces the flow at the outcome: it maps the changed code to the
security surfaces it touches (`assets/security-coverage.config.json`) and fails closed when a triggered surface
has no matching `@security` scenario in the shared feature index and no valid, unexpired waiver. It ships with
a discriminating test, so a security-relevant change with nothing testing it cannot pass CI and cannot regress
silently. The honest limit is stated in the skill: the gate makes skipping and regressing impossible, not
choosing the perfect sheet, which stays a judgment call for judge-arch, and every gap found becomes a new
surface rule so the judgment surface shrinks.

For the exact text, `tools/vendor-owasp.mjs` (`npm run vendor:owasp`) fetches the OWASP Cheat Sheet Series and
the OWASP Top 10 for LLM Applications from their upstream repositories into `third_party/owasp/` (gitignored),
with the upstream licenses and a committed `NOTICE.md`. This is a clean aggregation: the CC-BY-SA text sits in
its own directory under its own license, separate from the MIT skill files, and is pulled from source rather
than reproduced here. The per-sheet skill files describe the controls in their own words and quote short,
attributed excerpts, which is compatible with MIT. The README records the dual-licensing.

## Consequences

* Good, because a security-relevant change must carry a tested countermeasure or an explicit waiver; the flow
  cannot be skipped silently.
* Good, because the precise OWASP instructions are available two ways (comprehensive own-words files plus the
  vendored exact text) without breaking CC-BY-SA or the repo's MIT license.
* Good, because the flow uses OWASP's own recognized process, so it is familiar and auditable.
* Bad (honest limit), because the enforcement gate verifies the outcome (a scenario exists for a triggered
  surface), not that the right sheet was chosen or the scenario is strong. That residual is judgment, caught by
  judge-arch, and reduced over time as gaps become new surface rules.
* Neutral, because the surface-to-scenario map is a starting set that each adopting repo tunes for its stack.

### Confirmation

`test/owasp-security-coverage.test.mjs` exercises the enforcement gate: a SQL change with its scenario passes;
without a scenario it fails (discriminating); a non-security change triggers nothing; a scenario whose
`@security` and topic tags are on separate lines is still matched; a valid waiver suppresses and an expired one
does not; and the fail-closed paths (empty config, a triggered surface with no features dir, a waiver missing a
field, and a waiver with an unparseable `expires` date) all exit 2. `test/owasp-cheatsheet-catalog.test.mjs` and `test/owasp-security-features.test.mjs`
keep the per-sheet catalog and the `@security` feature honest. All run in CI via npm test. The vendoring tool
lives in tools/ (not scripts/) so it is not held to the offline-gate rule, and `third_party/` is excluded from
the architecture gate.

## More Information

Builds on ADR-0016 (per-cheat-sheet catalog) and the pattern-selector model (ADR-0014). The OWASP Threat
Modeling Process was read at community.owasp.org/Threat_Modeling_Process (2026-10-11). Additional AI-security
sources (the OWASP GenAI agentic threats document and the GenAI Security Project repositories) are recorded for
the AI and agent cheat-sheet content waves, where they will be mined in their own words and vendored, not
reproduced.
