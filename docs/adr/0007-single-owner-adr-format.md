---
status: "accepted"
date: 2026-10-10
decision-makers: mdenner
---

# One owner for the ADR format, with a validator that catches real placeholders

## Context and Problem Statement

The repo defined the ADR format in **two** places that disagreed (audit S8): the
`architectural-decision-records` skill (MADR by default — `0001` 4-digit ids, `## Considered
Options`, Decision Drivers/Outcome/Confirmation) and, separately, an inline template in
`enterprise-architecture-standards/references/enterprise-governance-standards.md` (`# ADR-00X`,
`## Alternatives considered`, 3-digit ids). `enterprise-architecture-standards/SKILL.md` even pointed
readers to the governance ref "for the format." Two formats for one artifact is the exact
data-ownership drift this repo warns against. Separately, the ADR validator `check_adr.sh` only flagged
`{…}` placeholders — it missed the governance template's `<…>` placeholders (so an unfilled
governance-format ADR passed), and it false-positived on any `{…}` (e.g. a JSON snippet). How should
the repo have one authoritative ADR format and a validator that actually catches unfilled templates
without false positives?

## Decision Drivers

* One owner per fact (the repo's own data-ownership rule) — a single ADR format, defined once.
* The validator must catch real unfilled placeholders (`{short title}`, `<ADR-00Y>`) and not fire on legitimate content (command args like `<owner>/<repo>`, fenced JSON/code).
* No churn to already-committed ADRs.

## Considered Options

* Make the `architectural-decision-records` skill the single owner; delete the rival inline template; harden the validator.
* Keep both templates and try to reconcile their wording.
* Drop the validator's placeholder check to avoid false positives.

## Decision Outcome

Chosen option: "single owner + harden the validator." The inline ADR template is removed from
`enterprise-governance-standards.md`, which now **defers to the `architectural-decision-records`
skill** for format, numbering, storage, and lifecycle; `enterprise-architecture-standards/SKILL.md`
Step 2 points at that skill, not the governance ref. `check_adr.sh` now strips fenced code first, then
flags descriptive placeholders — `{… …}` / `<… …>` (bracketed text with a space) and ADR-ref stubs
(`<ADR-NNNN>`, `<ADR-00Y>`) — while leaving single-token command args (`<owner>`, `<repo>`, `<sha>`)
and fenced JSON/generics alone.

### Consequences

* Good, because there is now one ADR format with one owner; the governance ref can't drift from the skill.
* Good, because an unfilled governance-style ADR (`<short title>`) is now caught, and the `{ "a": 1 }` false positive is gone.
* Neutral, because remaining template nits inside the ADR skill (Nygard H1 numbering vs MADR, status-set/casing differences, the writing-guide "After" example) are deferred to that skill's own Track-B rewrite (B2).
* Bad (minor), because `check_adr.sh` now depends on bash semantics for the fence-strip; its test skips where bash is absent (CI always has it).

### Confirmation

`bash architectural-decision-records/scripts/check_adr.sh docs/adr/` → all 6 existing ADRs PASS
(incl. ADR-0003, which contains `<owner>/<repo>`). `test/check-adr.test.mjs` proves the validator flags
`<short title>`, `{option 1}`, and `<ADR-00Y>`, and does not flag `<owner>/<repo>` or fenced JSON —
runs in CI via `npm test` (45/45).

## More Information

This ADR is part of the content-correctness change that also fixed Postgres migration mechanics (S11),
the OWASP controlled-entry count (S7), unsourced statistics (S10), and the microservices availability
arithmetic (S12).
