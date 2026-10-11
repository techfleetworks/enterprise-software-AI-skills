---
status: "accepted"
date: 2026-10-10
decision-makers: mdenner
---

# Enforce data classification with an untagged-PII gate

## Context and Problem Statement

`compliance-data-lifecycle` requires a **data map / inventory** — every data element assigned a class
on creation, because classification drives encryption, access, logging, retention, and (critically)
the ability to execute deletion and export requests. Until now this was prose: someone could add an
`email`, `ssn`, or `dob` column and leave it unclassified, and nothing would notice until a DSAR or a
breach made the gap expensive. The repo's thesis is that a skill's rule must be mechanically
enforced with a discriminating test, not left advisory.

## Decision Drivers

* Make "every PII field is classified" structural: an unclassified PII-looking column fails CI.
* Record decisions, don't hide them — a false positive is resolved by an explicit `not-personal`
  classification, not a silent suppression.
* Dependency-free and vendor-neutral (ships and is copied with the skill).
* Avoid flood: the name heuristic must be focused enough that the gate isn't ignored as noise.

## Considered Options

* A `check-untagged-pii.mjs` gate: scan SQL schema for PII-looking columns, require each in a data map.
* Validate the whole data map (class + lawful basis + retention) against the schema.
* Leave classification to review and the prose checklist.

## Decision Outcome

Chosen option: "the untagged-PII gate." It reads column names from `CREATE TABLE` blocks and
`ADD COLUMN` (line-oriented), flags any whose name matches a tunable PII heuristic, and fails unless
each is declared in a committed JSON data map with a recognized class
(`public|internal|confidential|restricted|not-personal`). A name that looks like PII but isn't is
declared `not-personal` — the decision is recorded, not suppressed. The gate deliberately checks
*presence of a classification*, not the correctness of lawful-basis/retention (which need human
judgment); it makes the omission impossible, not the judgment automatic.

### Consequences

* Good, because you cannot ship a PII column that nobody classified — the data map stays complete for personal data, which is what makes deletion/export/audit executable.
* Good, because the `not-personal` escape forces a conscious, recorded decision on false positives instead of a silent ignore.
* Bad (honest limit), because it is a line-oriented SQL reader, not a parser: a single-line `CREATE TABLE` or a non-SQL ORM schema is out of scope, and the name heuristic can miss a creatively-named field (it errs toward flagging and the indicator list is tunable).
* Neutral, because it is a reference gate an adopting repo points at its schema directory and its own data map in CI.

### Confirmation

`test/untagged-pii.test.mjs` (9 tests): a fully-classified schema passes (table-qualified and bare
keys); an undeclared `phone`/`ssn` fails with the field named; non-PII columns and `CONSTRAINT` lines
are ignored; a false positive declared `not-personal` passes; an invalid class, a missing map, and a
zero-scan each fail closed (exit 2). All run in CI via `npm test`.

## More Information

Rules trace to `compliance-data-lifecycle/references/data-classification-and-retention.md`. Second of
the Phase-3 structural starter gates (after the migration-safety gate, ADR-0009); OWASP lints, a
test-shape gate, and an axe gate follow, each in its owning skill with its own discriminating test.
