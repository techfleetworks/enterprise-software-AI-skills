---
name: pattern-selector
description: Use when you design, add, or change any feature, class, module, service, or data flow. Work out the forces in the problem, then pick the design pattern that fits, or pick none on purpose. State the pros, the cons, the failure it prevents, its security and operational cost, the simpler option you skipped, how to add it safely to running code, and how to check it. Covers the 23 Gang of Four patterns, the enterprise layer (Fowler PoEAA, DDD, dependency injection, cloud patterns), functional patterns, an anti-pattern list, a step-by-step chooser, and the honest limits (a pattern removes one kind of rot, and the wrong pattern adds rot). Triggers on build, add, implement, design, refactor, change, "which pattern," "best way to structure," factory, repository, strategy, observer, state machine, adapter, even when nobody says "pattern."
---

# Pattern Selector

## Why this exists

Two mistakes cost you, and they pull in opposite directions. One is naming a pattern before naming the
problem, reaching for a Factory far too often; a pattern used without its problem is pure cost, extra
indirection that makes code rot. The other, the one teams pay for over years, is under-building: shipping the
simplest thing that fits only this sprint, then paying far more to retrofit structure into a system that has
already grown, spread across more consumers, and gained a team and an audit trail.

Enterprise systems are built for where they are going, not only where they are today. The forces that justify
structure include the ones the system will face for certain: scale, more consumers, team and ownership
boundaries, change frequency, compliance, and the cost of changing a running system later. So this skill
weighs the system's lifetime, not just the current diff. Under-building a system whose growth you can already
see is as real a failure as over-abstracting one that will stay small.

This skill makes pattern choice a real decision on every feature. Name the forces, the present ones and the
ones that are certain and imminent. Check whether a pattern is needed, and whether NOT building it now will
cost more later. Pick the one that fits, combine a few, or pick none. Then write down why, including the
failure it prevents, its security and run cost, the simpler option you passed up, the cost of adding it
later, and how you will check it.

## The main idea (read this first)

A pattern removes one specific kind of failure or rot. The wrong pattern adds rot, and so does the missing
one: the structure a growing system should have had but did not. A pattern does not make code "impossible to
fail."

The strong guarantees in this library come from types, database constraints, tests, and gates. A pattern
makes the code the right shape for the forces it will face over its lifetime. Those other things make it
provably correct. So this skill always does two things at once. It recommends a pattern (or says to use
none), and it names the real guarantee and where it lives.

The default is not "the simplest thing that fits right now," and it is not "reach for a pattern." It is the
structure that fits the forces this system will actually face, chosen on purpose. "No pattern, a plain
function is correct here" is a valid and common answer when the forces are genuinely small and will stay
small. It is the wrong answer when you can already see the scale, the second consumer, the team boundary, or
the compliance duty coming. The record has to say which case you are in.

## How to choose (run these steps every time)

Read `references/choosing-a-pattern.md`. The steps are:

1. Name the problem as forces, not as a pattern, and include the forces of the system's lifetime, not only
   this change. What changes now, and what is certain to change (scale, new consumers, new rules)? What has
   to stay the same? What is copied? What is tied together that should not be? Who else will own or call
   this, and what do compliance, audit, and operability require of it? A force you can already see coming
   counts; a force you are inventing to feel thorough does not.
2. Run the gate in two parts, in order.
   a. Is the current code using an anti-pattern (God Object, anemic domain model, big ball of mud,
      premature abstraction, Singleton as global state)? If no, go to part b. If yes, scope the work to
      remove it, and still do part b. See `references/anti-patterns-and-smells.md`.
   b. Does this code need a pattern? A pattern earns its place when a named force calls for it, present or
      certain and imminent given the system's scale, roadmap, team, or compliance reality, and no plain
      function, class, or language feature already solves it. YAGNI blocks SPECULATIVE structure (a factory
      for one use, an interface with one implementation and no second consumer in sight), not deliberate
      design for growth you can already see; so weigh the cost of adding it now against the cost of
      retrofitting it into a running system later. If a pattern is earned, pick it and scope it. If not, and
      part a found an anti-pattern, remove the anti-pattern and make the result scalable and performant. If
      not, and there was no anti-pattern, write "no pattern, because the forces are small and will stay
      small" and stop.
3. Match the symptoms to candidate patterns using the table in the catalog and the chooser.
4. Score each candidate on five things, not just how clean it looks: does it fit the forces; what does it
   cost in classes and reading; does it open a security hole (global state, unsafe deserialize, a new trust
   boundary, an injection point); what does it cost to run (harder to trace, new failure modes, latency,
   tuning); and is there a plain language feature that does the same job with less.
5. Pick one, combine a few on purpose, or decline.
6. Say how you will check it, and how to add it safely. Name the check that proves the pattern is applied
   right (a contract test, an exhaustive state test, a type, or an arch-gate rule), not just "the feature's
   tests pass." If you are changing running code, add the pattern behind the current interface, expand and
   contract any schema, and keep it reversible. See `release-deployment-safety`.

## What to write down (the pattern-decision record)

Every run writes a short record. Evidence states are the six from `skeptical-audit`: proven, observed,
inferred, documented, reported, not-assessed.

```
Problem / forces:           what changes, what must stay the same, what is copied or tied together
Forces evidence:            [state] about the current code, e.g. [observed: two pricing rules at pricing.ts:40-88]
Lifetime forces:            the certain-and-imminent forces weighed (scale, consumers, team, compliance), with timing
Cost of deferring:          what retrofitting this structure into a running system later would cost, vs now
Candidates considered:      the patterns the forces point to, plus the no-pattern option
Decision:                   the pattern(s) you chose, or "no pattern, because ..."
Pros / cons accepted:       the real benefit, and the cost you are taking on
Failure/rot prevented:      the exact decay this removes, not "cleaner code"
Security trade-off:         what attack surface it opens or closes (threat-model with owasp-secure-coding-bdd)
Operational cost:           tracing, new failure modes, tuning (see sre-operational-readiness)
Simpler alternative:        what you rejected, and why
Adopt safely:               if changing running code, the safe path (Strangler, expand/contract, reversible)
Verify correct application: the pattern-specific check (name the test type or the arch-gate rule)
Verification status:        [state] about that check, e.g. [not-assessed, becomes observed when the test is green]
ADR:                        if the choice is cross-cutting or large, the ADR id (architectural-decision-records)
Real guarantee:             the type, DB constraint, test, or gate that actually holds the invariant
```

## What the catalog covers

- The 23 Gang of Four patterns are in `references/design-patterns-catalog.md`. Each one uses the same
  template: intent, forces, best situation, pros, cons, avoid when, failure prevented, misuse, security
  trade-off, operational cost, adopt safely, modern alternative, how to verify it, a bad-then-good example,
  and sources. Intents come from the Gang of Four book (1994). Pros and cons come from Refactoring.Guru.
  Measured risks come from the research papers. Security notes link to `owasp-secure-coding-bdd`.
- The enterprise layer that the Gang of Four book leaves out is in `references/enterprise-patterns.md`.
  It covers dependency injection; persistence patterns like Repository, Unit of Work, and Data Mapper; DDD
  tactical patterns like Value Object, Aggregate, Null Object, and Result; functional patterns like
  higher-order-function composition and immutability; security patterns like trust boundary and
  validate-at-the-edge; application and messaging patterns like Service Layer, Gateway, Anti-Corruption
  Layer, and Transactional Outbox; presentation patterns like MVC and Flux/Redux; and concurrency patterns.
  Sources are Fowler's Patterns of Enterprise Application Architecture (with page numbers) and the Microsoft
  Azure Cloud Design Patterns catalog.
  - Two caveats live in that file. Any pattern that copies or serializes records (Repository, Data Mapper,
    DTO, Identity Map) takes on the data-map, retention, and deletion duties from `compliance-data-lifecycle`.
    Any presentation pattern still has to meet `universal-accessibility-wcag`,
    `universal-browser-device-support`, and `usability-ux-universal-design`. The pattern shapes the code, not
    the conformance.
- Anti-patterns to find and remove are in `references/anti-patterns-and-smells.md` (God Object, anemic
  domain model, big ball of mud, premature abstraction, Singleton used as global state). The best answer is
  often to take structure out, not add it.
- Do not copy patterns this library already owns (Hexagonal/Clean, Layered, CQRS, Event Sourcing, Saga,
  Strangler Fig, Circuit Breaker, Retry, Bulkhead, Cache-Aside). The catalog links to
  `enterprise-architecture-standards`, `release-deployment-safety`, `sre-operational-readiness`, and the
  requirements skills instead.

## What this skill enforces on its own

Picking the right pattern is a judgment call, so it cannot be fully automated. But the catalog this skill
chooses from can be kept honest, and it must be, because every other skill here ships a gate.
`scripts/check-catalog-completeness.mjs` fails when any catalog entry is missing a template field or a
primary-source citation. So a half-filled or uncited entry cannot ship. It comes with a test that strips a
field from a sample entry and confirms the gate then fails.

The decision-record habit (every choice names its forces, its simpler option, and the failure it prevents)
is held by the Definition of done below and by a fresh-context `judge-arch` review. A later change-type to
required-artifact routing gate can make a missing record fail CI. This gate does not do that today, and it
does not claim to.

What stays judgment ("is this abstraction premature?", "do the forces really call for Strategy?") goes to
`judge-arch`, which reviews it against all four questions, not just over-engineering. Where a choice is
greppable ("data access only through a Repository in `domain/`"), turn it into an arch-gate rule with
`arch-encode` and a real bad-then-good example.

## Before you call it done

- [ ] You stated the problem as forces. You did not open by naming a pattern.
- [ ] You weighed the forces over the system's lifetime (scale, consumers, team, compliance), not only this
      change, and the record names the cost of deferring the structure.
- [ ] You checked whether a pattern was needed. "No pattern" means the forces are small and will stay small,
      not just small today; "remove this anti-pattern" was also a real option.
- [ ] You wrote a pattern-decision record (the evidence ledger) with every field, including the security
      trade-off, the operational cost, the adopt-safely path, and the six-state evidence markers.
- [ ] You named the failure the pattern prevents, and you named the real guarantee (a type, DB constraint,
      test, or gate) wherever "impossible to fail" is actually required.
- [ ] "Verify correct application" names a pattern-specific check, written under `bdd-comprehensive-testing`
      or `comprehensive-test-strategy` so it actually runs.
- [ ] If the choice is cross-cutting or large, you wrote an ADR with `architectural-decision-records`.
- [ ] A greppable choice is an arch-gate rule via `arch-encode`. A judgment call goes to `judge-arch`.
- [ ] `check-catalog-completeness.mjs` passes.

## Reference files

| Topic | File |
|---|---|
| The 23 Gang of Four patterns, one strict template each (plus security, operational, adopt-safely) | `references/design-patterns-catalog.md` |
| Enterprise, persistence, domain, messaging, presentation, concurrency, DI, functional, and security patterns | `references/enterprise-patterns.md` |
| The chooser: symptom-to-candidate table, scoring, the YAGNI gate, which choices are automatable, a worked example | `references/choosing-a-pattern.md` |
| The honest limits: patterns as a smell, language features that replace them, patterns that widen the attack surface, measured risks | `references/criticism-and-limits.md` |
| Anti-patterns and smells to find and remove | `references/anti-patterns-and-smells.md` |
| The gate: catalog-completeness and citation linter (fails closed, has a discriminating test) | `scripts/check-catalog-completeness.mjs` |

## Evidence & skeptical assessment (required)

A pattern recommendation is a claim about a problem's forces, so it follows the library's evidence rules
(the contract is in
[`skeptical-audit/references/evidence-discipline.md`](../skeptical-audit/references/evidence-discipline.md)),
using all six states. The pattern-decision record is the evidence ledger. It keeps the forces evidence (a
claim about code that already exists, which can be observed or proven) separate from the verification status
(the check, which starts at not-assessed and goes up when it runs). No pattern is applied, and no "this is
the right pattern" is stated, as a bare claim.

| Claim | Reaches `observed` by | Becomes `proven` when |
|---|---|---|
| "This feature needs pattern X" | the forces are visible in the code (file:line, the copied block, the two call sites) | the "verify correct application" check exists and passes, or an arch-gate rule enforces it |
| "No pattern is needed here" | the plain solution is written and has a test | the diff shows no indirection was added |
| "Pattern X prevents failure F" | F is a concrete, named decay (data sprawl, null-deref, shared state, SSRF) | a type, test, or gate makes F impossible or catches it on every PR |
| "The catalog entry is sound" | every template field is present | `check-catalog-completeness.mjs` passes with its citation (a required CI check, with a discriminating test) |

**Definition of done:** a pattern-decision record (the evidence ledger) exists with forces (present and
certain-and-imminent) and forces evidence, the lifetime forces and the cost of deferring the structure, the
decision, pros and cons, the failure prevented, the security and operational trade-offs, the simpler
alternative, the adopt-safely path, the verify step, and the verification status. The real
guarantee is routed to a type, constraint, test, or gate, not claimed of the pattern. An ADR exists if the
choice is large. Every catalog fact is cited to a primary source, and `check-catalog-completeness.mjs` is
green. A greppable choice is not fully resolved until its rule lives in arch-gate, where it becomes proven.

## Why this works for every developer and every agent

It binds everyone because it lives in committed files, not in memory. Agents get it through the always-on
hook. This skill is listed in `always-on/enterprise-skills-always-on.md`, which is injected into every
session and subagent, and it is referenced from `enterprise-architecture-standards` as part of the
architecture decision. People and agents are both held by the gates. `check-catalog-completeness.mjs` keeps
the catalog honest on every PR. A greppable choice becomes an arch-gate rule through `arch-encode`.
`judge-arch` reviews the judgment calls in fresh context against all four questions. It survives any one
person because the catalog, the decision records, the gate rules, and `decisions.md` are all in git.

Here is the honest limit. Greppable choices reach proven. The real judgment calls ("is this abstraction
premature?") stay at observed, backed by a `judge-arch` second look. This makes choosing on purpose and
writing down why unavoidable. It does not make the choice always right. The catalog's measured trade-offs
and the fresh-context review are how that gap shrinks.

## Sources and attribution

Sources are primary wherever one exists, and Wikipedia is never used (the gate rejects it). Pattern
intents come from the Gang of Four book or Fowler's Patterns of Enterprise Application Architecture, not
from encyclopedia summaries. A few newer patterns have no canonical book. Those cite the originating
author's own write-up or the reference implementation instead (for example, Result/Either cites Wlaschin's
Railway Oriented Programming, and Lens/Optics cites the reference library docs). Measured claims cite the
peer-reviewed studies below.

- Gang of Four: Gamma, Helm, Johnson, Vlissides, *Design Patterns: Elements of Reusable Object-Oriented
  Software*, Addison-Wesley 1994 (ISBN 0-201-63361-2). The 23 patterns, their intents, and the OO
  principles. `[documented]`
- Fowler, Rice, Foemmel, Hieatt, Mee & Stafford, *Patterns of Enterprise Application Architecture*,
  Addison-Wesley 2002 (ISBN 0-321-12742-0). The enterprise layer, cited by page. Public index:
  <https://martinfowler.com/eaaCatalog/>. `[documented]`
- Eric Evans, *Domain-Driven Design: Tackling Complexity in the Heart of Software*, Addison-Wesley 2003
  (ISBN 0-321-12521-5). The tactical patterns (Entity, Value Object, Aggregate, Repository, Anti-Corruption
  Layer) cited per entry in `references/enterprise-patterns.md`. `[documented]`
- Brian Goetz et al., *Java Concurrency in Practice*, Addison-Wesley 2006 (ISBN 978-0-321-34960-6). The
  concurrency-pattern cluster cited per entry in `references/enterprise-patterns.md`. `[documented]`
- Martin Fowler, *Inversion of Control Containers and the Dependency Injection pattern*,
  <https://martinfowler.com/articles/injection.html>. `[documented]`
- Microsoft Azure Architecture Center, *Cloud Design Patterns*,
  <https://learn.microsoft.com/azure/architecture/patterns/>. `[documented]`
- Refactoring.Guru, *The Catalog of Design Patterns*,
  <https://refactoring.guru/design-patterns/catalog> (retrieved 2026-10-10). Applicability and pros/cons. `[documented]`
- Peter Norvig, *Design Patterns in Dynamic Languages*, <https://norvig.com/design-patterns/>. 16 of 23
  Gang of Four patterns are simpler or invisible with first-class functions and types. `[documented]`
- Paul Graham, *Revenge of the Nerds*, <https://www.paulgraham.com/icad.html>. A pattern can be a sign that
  an abstraction is not strong enough. `[documented]`
- Gamma, Helm, Johnson, *Design Patterns 15 Years Later* (InformIT, 2009),
  <https://www.informit.com/articles/article.aspx?p=1404056>. The authors would add dependency injection,
  null object, type object, and extension object, and reconsider Singleton. `[documented]`
- Hussain, Keung, Khan, *The Effect of GoF Design Patterns Usage on Design Quality Attributes*, IEEE QRS
  2017, doi:10.1109/QRS.2017.37. Measured trade-offs. `[documented]`
- Almadi, Hooshyar, Ahmad, *Bad Smells of Gang of Four Design Patterns: A Decade Systematic Literature
  Review*, Sustainability 13(18):10256, 2021, doi:10.3390/su131810256. Measured risks. `[documented]`
