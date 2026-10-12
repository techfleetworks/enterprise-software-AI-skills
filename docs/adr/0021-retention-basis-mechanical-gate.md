---
status: "accepted"
date: 2026-10-12
decision-makers: mdenner
---

# Enforce a lawful basis and a retention period for every personal-data entry

## Context and Problem Statement

`compliance-data-lifecycle` teaches two obligations that recur across every consumer privacy regime:
hold personal data only with a lawful basis (GDPR Article 6, and the equivalent in the US state laws
and other regimes), and keep it no longer than necessary (GDPR Article 5(1)(e) storage limitation,
and the retention limits in the state and international laws). The skill already enforces that a
PII-looking column is classified in a committed data map (`check-untagged-pii.mjs`, ADR-0010), but
once classified, nothing stopped a personal field from having no recorded basis and no retention. A
field can be marked `restricted` and then sit forever with no decision about why it is held or when it
is deleted, which is exactly the gap that breaks a deletion request and a retention audit later. The
repo's thesis is that a skill's guidance must be structurally enforced, not advisory.

## Decision Drivers

* Make the lawful-basis and retention obligations structural at merge time, not a reviewer's memory.
* Reuse the single data map that `check-untagged-pii` already requires, so there is one source of
  truth and no second inventory to drift.
* Dependency-free and vendor-neutral (it ships and is copied with the skill).
* A placeholder is not a decision, mirroring the reason-required waiver discipline elsewhere in the repo.

## Considered Options

* A second bespoke gate, `check-retention-basis.mjs`, reading the same data map.
* Extend `check-untagged-pii.mjs` to also require basis and retention.
* Leave it as prose and rely on review.

## Decision Outcome

Chosen option: "a second bespoke gate reading the same data map." Keeping it separate preserves the
one-gate-one-concern-one-discriminating-test pattern the repo already uses (migration-safety, PII,
alert-hygiene), so each gate stays small and its test stays focused. The two gates share one data
owner: the committed data map file. `check-untagged-pii` enforces that every personal column is in the
map; `check-retention-basis` enforces that every personal entry in the map carries a non-empty `basis`
(or `lawfulBasis`) and `retention`. A `not-personal` entry is exempt, since there is no personal data
to hold a basis or a retention for. A placeholder (empty, `n/a`, `tbd`, `todo`, `?`, `none`,
`unknown`, or under three characters) does not count, the same way a reason-less waiver does not count
in the migration-safety and alert-hygiene gates. A terse class-only entry has nowhere to record the
two fields, so a personal field in that form fails with a message pointing to the object form.

### Consequences

* Good, because a classified personal field with no decided basis or retention now fails CI.
* Good, because it reuses the existing data map, so there is no second inventory and no drift.
* Good, because the skill now carries a second mechanical gate directly serving its privacy section.
* Bad (honest limit), because it checks that a basis and a retention are RECORDED, not that they are
  correct or lawful. Whether "legitimate interests" is the right basis, or whether a retention period
  is defensible, is judgment for `judge-arch` and counsel. The gate removes the silent-omission gap,
  not the judgment.
* Neutral, because it is a reference gate an adopting repo points at its own data map in CI, and it
  fails closed on a missing map, invalid JSON, or an invalid class.

### Confirmation

`test/retention-basis.test.mjs` (13 tests): a personal entry with both fields passes, as does the
object form and the `lawfulBasis` alias; a personal entry missing retention, missing basis, or holding
a placeholder (`tbd`, `n/a`) fails with the gap named; a terse class-only personal entry fails; a
`not-personal` entry lacking both is exempt; a bare (table-less) `not-personal` key fails closed
(exit 2), matching the ADR-0010 guard in `check-untagged-pii` so both gates treat the shared map
identically; a missing map, invalid JSON, an invalid class, and an omitted `--map` all fail closed
(exit 2). The existing example data map passes. All run in CI via
`npm test`, and the discrimination gate confirms the tests fail when the check is stubbed to a no-op.

## More Information

Rules trace to `compliance-data-lifecycle/references/privacy-gdpr-ccpa.md` and
`references/data-classification-and-retention.md`, and to the primary sources the skill cites (GDPR
Articles 5 and 6). This is the second gate added in the Track-B deep rewrite of
`compliance-data-lifecycle`, alongside the existing `check-untagged-pii.mjs` (ADR-0010).
