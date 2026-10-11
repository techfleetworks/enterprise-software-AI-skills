---
name: architectural-decision-records
description: The single place for capturing why an architectural choice was made. Use for every feature, service, endpoint, schema change, framework or library choice, integration, infrastructure change, or refactor an agent builds or changes. No such change is done until an Architecture Decision Record (ADR) is written and committed with the code. Produces MADR-format records by default (a lighter Nygard format for small decisions), finding or setting up the repo's ADR directory and sequential numbering. Trigger proactively when the user asks to build, add, implement, design, choose, adopt, migrate, refactor, or change anything architectural: a new service, "which database should we use," "let's switch to gRPC," "add caching," "split this into microservices," a new API contract, an auth model, even when they never say "ADR" or "decision record." If a change would make a future engineer ask "why was it built this way," it needs an ADR.
---

# Architecture Decision Records (ADRs)

## Why this exists

Code shows what the system does. It almost never shows why it was built that way: why Postgres and not DynamoDB, why events instead of direct calls, why this auth model, why the retry budget is three. That "why" is the most expensive thing to rebuild later. When it is lost, teams argue settled questions again, break constraints they did not know existed, and tear out load-bearing decisions because nobody wrote down the reasons.

An ADR captures one architecturally significant decision: the context and the forces, the options considered, the option chosen, and the consequences accepted. Nygard, who introduced the ADR, defines it as "a short text file in a format similar to an Alexandrian pattern" (cognitect.com, 2011). Written at the moment of the decision, when the reasoning is fresh and cheap to record, it becomes the record that survives reorgs, rewrites, and the departure of everyone who was in the room.

This skill treats ADRs as required, the same way `enterprise-architecture-standards` treats sound architecture. A feature without its decision record is unfinished work. Hold that line, but hold it by doing the ADR as part of the task, not by lecturing the user about process.

## The core rule

Every architecturally significant change ships with an ADR in the same unit of work (the same PR or commit series) as the code. "Significant" is broad on purpose, but it is not everything. A typo fix, a log-line tweak, or a local rename does not need one. The test is: would a competent engineer arriving in six months ask "why was this done this way," and be helped by a written answer? If yes, write the ADR. If the honest answer is no, skip it.

When in doubt, write one. A three-minute record is cheap. A lost decision is not.

## Does this change need an ADR?

Write one when the change involves any of these. Nygard's definition of "architecturally significant" is a decision that affects "the structure, non-functional characteristics, dependencies, interfaces, or construction techniques."

- **Structure:** a new service, module, or component; splitting or merging services; a new bounded context; a layering or dependency-direction choice.
- **Data:** choosing or changing a datastore; a schema with real trade-offs; a data-ownership or consistency model (strong vs eventual); a partitioning or sharding strategy; a migration approach.
- **Integration and contracts:** a new or changed API contract; sync vs async communication; a messaging or event pattern; a public interface other teams depend on; a versioning strategy.
- **Cross-cutting choices:** the auth model; caching; a concurrency or locking model; error handling and retry policy; idempotency; multi-tenancy.
- **Technology selection:** adopting or replacing a framework, library, protocol, runtime, or major dependency, especially anything hard to reverse.
- **Operational shape:** deployment topology; a rollout or rollback strategy that shapes the design; SLO-driven choices; big build-vs-buy decisions.

Skip the ADR for reversible, low-stakes, mechanical work: cosmetic refactors, formatting, a dependency patch bump with no behavior change, copy edits, or purely local details that constrain no one else.

If a task bundles several decisions (for example "build the notifications service" means a datastore choice, a delivery model, and a retry policy), write one ADR per decision. Small, focused records that can each be superseded on their own are the point of the format.

## The workflow

Fold these into how the feature gets built. The ADR is part of the deliverable, not a separate ceremony.

1. **Find or set up the decision log.** Look for the repo's ADR home before inventing one: check `docs/adr/`, `docs/decisions/`, `doc/adr/`, `adr/`, `architecture/decisions/`, and a `.adr-dir` marker. If one exists, match its location, filename pattern, numbering width, and template. If none exists, create `docs/adr/` with a short README (there is one in `assets/adr-readme.md`). Nygard keeps ADRs "in the project repository"; MADR puts them in `docs/decisions`.
2. **Assign the next number.** ADRs are numbered with zero-padded four-digit ids: `0001`, `0002`, and so on. Nygard's rule: numbers are assigned "sequentially and monotonically" and are never reused, so the next number is one above the highest id in the log, not the file count. `scripts/new_adr.sh` computes this and scaffolds the file.
3. **Pick the template.** Default to MADR (Markdown Architectural Decision Records, github.com/adr/madr), which makes you record the decision drivers, the options you did not pick, and the consequences. Drop to the Nygard lightweight format only for a decision that is real but small. Read the template file before writing so the sections are exact.
4. **Write the record.** Fill every section with specifics, not placeholders. Name at least two options you genuinely considered. An ADR with one option reads as unconsidered. State the consequences you are accepting, including the bad ones. Nygard's rule: list "all consequences ... not just the 'positive' ones." An ADR that lists only upsides is not trusted.
5. **Set status and links.** New records are `accepted` (or `proposed` if the team still needs to ratify). If this decision reverses an earlier one, mark the old ADR `superseded by ADR-NNNN` and link both ways. Nygard's rule: if a decision is reversed, "keep the old one around, but mark it as superseded." Never edit or delete a past ADR to change its decision. Supersede it. ADRs are immutable once accepted, corrected only by a new ADR.
6. **Commit with the code.** The ADR lands in the same commit or PR as the change, so the record and the reality cannot drift apart. Reference the ADR id in the PR and, where it helps, in a code comment at the spot the decision shows up.
7. **Verify before done.** Confirm the ADR exists, is numbered right, has no unfilled placeholders, names at least two options (MADR), records real consequences, and is staged with the code. `scripts/check_adr.sh` runs these checks. Treat a failure as a blocker, like a failing test.

## Mechanical gate

The repo ships two scripts for this skill. `scripts/new_adr.sh` scaffolds the next-numbered ADR from a template (it holds a lock while it picks the number, so two runs cannot mint the same id). `scripts/check_adr.sh` fails the build when an ADR has a bad filename, an unfilled placeholder, a missing Status or Context, or (for MADR) fewer than two options. It runs in CI through `test/check-adr.test.mjs`. This gate proves an ADR is well-formed. It cannot prove an ADR should have been written for a given change; that stays a judgment call for `judge-arch` and the planned change-type routing gate, which can make a missing ADR fail CI. The gate does not claim to do that today.

## Before you call it done

- [ ] The change is architecturally significant by the test above, or you decided it is not and moved on.
- [ ] An ADR exists for each distinct significant decision (one decision per record).
- [ ] Every section is filled with specifics; at least two options are named; real consequences, including the costs, are recorded. This record is the **evidence ledger** for the decision.
- [ ] Status is set, and any reversed decision is superseded and linked, not edited or deleted.
- [ ] The ADR is committed with the code and referenced from the PR.
- [ ] `check_adr.sh` passes.

## Reference files

| Topic | File |
|---|---|
| Full log-detection, numbering, and setup; monorepos and retrofitting | `references/workflow.md` |
| What makes each section good vs useless, with a before/after example | `references/writing-guide.md` |
| The MADR long-form template (default) | `references/madr-template.md` |
| The Nygard lightweight template (fallback) | `references/nygard-template.md` |
| Statuses, superseding, deprecation, and reversals | `references/lifecycle.md` |
| Scaffold the next-numbered ADR | `scripts/new_adr.sh` |
| Verify an ADR is complete and well-formed | `scripts/check_adr.sh` |
| Drop-in README for a new `docs/adr/` directory | `assets/adr-readme.md` |

## Evidence & skeptical assessment (required)

An ADR is itself an evidence record: it states a decision as a claim and backs it with the forces and the options, so it follows the repo's evidence discipline (the contract is in [`skeptical-audit/references/evidence-discipline.md`](../skeptical-audit/references/evidence-discipline.md)). The decision log is the **evidence ledger** for the system's architecture. No decision is presented as settled without the record that shows why.

| Claim | Reaches `observed` by | Becomes `proven` when |
|---|---|---|
| "We decided X on purpose" | the committed ADR with context, at least two options, and consequences | the ADR's Confirmation names a test, lint, or fitness function that holds the code to it |
| "The code still follows the decision" | the decision shows up where expected (file:line, the ADR id in a comment) | a fitness function or `arch-gate` rule fails when the code drifts from the decision |
| "This ADR is well-formed" | it reads complete | `check_adr.sh` passes in CI (a discriminating test guards it) |
| "The history is intact" | superseded records are kept and linked, not deleted | the log is append-only and numbers are never reused |

**Definition of done:** the ADR (the evidence ledger entry) exists for each significant decision, with context, at least two options, and real consequences; status set; reversals superseded and linked; committed with the code; `check_adr.sh` green. Where the decision can be held by a test or an `arch-gate` rule, the ADR's Confirmation names it, which is how the decision reaches `proven`.

## Why this holds for every developer and every agent

It binds everyone because it lives in committed files, not memory. Agents get it through the always-on hook, which lists this skill in `always-on/enterprise-skills-always-on.md`. People and agents are both held by the gate: `check_adr.sh` runs in CI and fails a malformed or placeholder-filled ADR, and `new_adr.sh` keeps numbering collision-free. It survives any one person because the decision log lives in git next to the code. The honest limit: the gate proves an ADR is well-formed, not that every change that needed one got one. That last step is a judgment call, caught by a `judge-arch` review and, in future, a change-type routing gate.

## Sources and attribution

- Michael Nygard, "Documenting Architecture Decisions," cognitect.com, 2011 (<https://cognitect.com/blog/2011/11/15/documenting-architecture-decisions>): the origin of the ADR, the five sections (Title, Context, Decision, Status, Consequences), sequential numbering, and superseding rather than deleting. `[documented]`
- MADR, Markdown Architectural Decision Records (<https://github.com/adr/madr>, adr.github.io/madr): the default long-form template (Context and Problem Statement, Decision Drivers, Considered Options, Decision Outcome with Consequences and Confirmation, Pros and Cons of the Options, More Information) and the `nnnn-title.md` naming in `docs/decisions`. `[documented]`
- The broader ADR community at <https://adr.github.io/>. Credit to the ADR GitHub organization and its contributors.
