---
status: "accepted"
date: 2026-10-10
decision-makers: mdenner
---

# Restructure OWASP into one file per cheat sheet with an enforced executable-scenario mandate

## Context and Problem Statement

The owasp-secure-coding-bdd skill carried its guidance in a handful of broad cluster reference files plus a
flat index that claimed "120 cheat sheets." The live OWASP Cheat Sheet Series now has 137 sheets, so the index
was stale, and the clustering made it hard to route to a single sheet or to hold each one to the same bar. Two
things needed to be true: the skill should route to every individual cheat sheet, and, more importantly, using
the skill on real code should always produce an executable test of the secure coding, not just prose. The user
directed both: one file per cheat sheet under one always-on skill, and every security control must create a BDD
scenario that actually runs, in the same place as every other scenario.

## Decision Drivers

* One reference file per OWASP cheat sheet, routed from a single always-on SKILL.md (no catalog bloat of 137
  separate skills, no drift between an index and the files).
* Every security control ships an executable @security BDD scenario added to the shared feature-file index, so
  the secure coding is tested in CI, not asserted in prose.
* Hold each per-sheet file to the repo template with the attacker's view, cited only to sources actually read.
* Enforce it mechanically, fail closed, with a discriminating test, and let the catalog grow one cluster at a
  time (a ratchet) rather than in one unreviewable change.

## Considered Options

* One always-on owasp-secure-coding-bdd skill whose SKILL.md is a routing index to 137 per-sheet files under
  references/cheatsheets/, with a completeness gate and the executable-scenario mandate.
* One top-level skill per cheat sheet (137 skills), which would flood the skill catalog and the always-on
  directive.
* Group the sheets into a handful of topic skills, which keeps some clustering but still splits ownership.

## Decision Outcome

Chosen option: "one skill, one file per sheet." references/cheatsheets-manifest.json is the authoritative list
of all 137 sheets, built from the OWASP sitemap. SKILL.md is the always-on security entry: it holds the
137-row routing index, the per-sheet template, and the non-negotiable that each control's @security Gherkin
scenario is added to the shared feature-file index that bdd-comprehensive-testing owns and wired into CI.
scripts/check-cheatsheet-catalog.mjs is the completeness gate: for every sheet marked done it requires the
file, every template section, a citation URL, an executable @security Gherkin scenario (a @security tag plus
Scenario plus Given, When, Then, not prose), and an index entry, with no orphan files, and it reports progress
toward 137. The catalog is a ratchet: sheets are migrated in waves, and the gate passes on whatever is done so
far while the backlog stays visible in the manifest.

This PR ships the foundation plus three exemplar sheets (SQL Injection Prevention, Cross Site Scripting
Prevention, Password Storage), each hardened with the attacker's view from Georgia Weidman's Penetration
Testing (2014), cited to the OWASP sheet and the Weidman chapter both read this session. Their @security
scenarios also live in assets/example/features/owasp-security.feature, validated as real runnable Gherkin by
bdd-comprehensive-testing's official-parser gate. The skill comes off the evidence allowlist and its SKILL.md
plus the per-sheet files join the house-style no-em-dash ratchet.

> Addendum (2026-10-11): as of Wave 3, the example `@security` scenarios no longer live in a single
> `assets/example/features/owasp-security.feature`. That seed file is removed and the scenarios are split into
> one feature file per stack layer under `assets/example/features/` (for example `frontend.feature`,
> `backend-input.feature`, `auth-sessions.feature`). The authoritative pointer is the SKILL.md Reference-files
> row; the rest of this record stands as the point-in-time foundation decision.

### Consequences

* Good, because the skill routes to any single cheat sheet, and the stale 120 count is replaced by the real
  137 from an authoritative source.
* Good, because a security control can no longer ship as advice: the gate rejects a per-sheet file whose
  scenario is prose, and the scenarios live where the other scenarios run, so the secure coding is tested.
* Good, because the ratchet keeps each migration PR small and reviewable instead of one unreadable 137-file
  change.
* Bad (honest limit), because the catalog gate proves a sheet is complete and its scenario is real Gherkin, and
  the BDD gates prove the scenario parses and runs; none of them proves the chosen control is the right one for
  the threat. That stays a matter of the attacker-view threat modeling and a judge-arch review.
* Neutral, because the interim cluster references remain during the migration and are removed as their content
  moves into the per-sheet files.

### Confirmation

test/owasp-cheatsheet-catalog.test.mjs exercises the gate: a compliant done sheet passes; a missing file, a
missing section, a Sources block with no URL, a prose (not Gherkin) @security scenario, a non-indexed sheet, an
orphan file, and a file marked done:false all fail (exit 1); an empty or missing manifest fails closed (exit
2). test/owasp-security-features.test.mjs runs bdd-comprehensive-testing's check-gherkin-valid over the OWASP
feature and asserts it parses and carries at least three @security scenarios. The catalog gate and both tests
run in CI via npm test, and the house-style ratchet plus the evidence-contract gate hold the SKILL.md.

## More Information

Builds on the pattern-selector completeness-gate approach (ADR-0014) and the operationalized architecture gate
(ADR-0015). The 134 remaining cheat sheets migrate in later waves, each a small PR that marks sheets done and
adds their files, with the gate green throughout. Weidman's book was provided by the user and verified
authentic before use.
