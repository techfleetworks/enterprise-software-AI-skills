---
name: pattern-selector
description: Use whenever designing, adding, or refactoring any feature, class, module, service, or data flow — analyze the problem's forces and select the design pattern(s) that fit, or deliberately none, stating the pros, cons, the failure/rot each prevents, its security and operational trade-offs, the simpler alternative rejected, how to adopt it safely in running code, and how the choice is verified. Covers the 23 Gang-of-Four patterns, the enterprise/persistence/domain/messaging/presentation/concurrency layer (Fowler PoEAA, DDD tactical, DI/IoC, cloud patterns), functional/immutable patterns, an anti-pattern catalog, a symptom→pattern decision engine, and the honest limits (patterns remove specific rot modes; misapplied they add rot). Trigger proactively on build, add, implement, design, refactor, change, "which pattern," "best way to structure," factory, repository, strategy, observer, state machine, adapter — even when "pattern" is never said.
---

# Pattern Selector

## Why this exists

Agents (and people) reach for a design pattern by name — "let's use a Factory here" — before naming the
problem, and they reach for one far too often. Both failure modes are expensive. A pattern applied
*without its problem* is pure cost: indirection, extra classes, and cognitive load with no benefit — and
over-abstraction is itself one of the top causes of the rot this library fights. A pattern *missed* where
its problem is real leaves duplication, tangled coupling, and change-amplifying code. This skill makes
pattern selection a **deliberate, evidence-backed decision on every feature**: name the forces, check
whether a pattern is even warranted, pick the one that fits (or none), and record *why* — including the
failure it prevents, its security and operational cost, the cheaper alternative, and how the choice is checked.

## The core principle (read this first — it is the honest frame)

**A pattern removes a *specific* failure/rot mode. Misapplied, it *adds* rot. Patterns do not make code
"impossible to fail."** The hard guarantees in this library come from **types, database constraints,
tests, and gates** — the pattern makes the code *shaped right*; those make it *provably correct*. So this
skill always does two things together: it recommends a pattern (or declines one) **and** names the real
guarantee and where it lives. The default answer to "which pattern?" is often **"none — a plain
function/class is correct here."**

## The selection engine (every run follows this)

Read `references/choosing-a-pattern.md`. The flow is deterministic:

1. **Name the problem as forces, not a pattern.** What varies? What must stay stable? What is duplicated?
   What is coupled that shouldn't be? (The GoF lens: *encapsulate what varies; program to an interface,
   not an implementation; favor composition over inheritance* — GoF 1994, ch. 1.)
2. **The YAGNI gate — do you even need a pattern?** Most problems don't. If a plain function, class, or
   language feature solves it, **stop here** and record "no pattern, because …". A pattern without its
   problem is rejected by default. (If the code instead shows an **anti-pattern** — God Object, Anemic
   Domain Model, Big Ball of Mud — the job is to *remove* structure; see `references/anti-patterns-and-smells.md`.)
3. **Map symptoms → candidate patterns** using the decision matrix (catalog + `choosing-a-pattern.md`).
4. **Score the candidates** on all five axes, not just elegance: (a) does it match the forces? (b) cost —
   indirection, classes, learning; (c) **security** — does it widen the attack surface (global mutable
   state, deserialization, a new trust boundary, injection)? (d) **operational cost** — observability
   burden, new failure modes, debuggability, tuning; (e) the cheaper alternative / the modern language
   feature that supersedes it (first-class functions, sum types + pattern-matching, a DI container).
5. **Pick one, combine deliberately, or decline.** Record the decision (output contract below) with the
   pros/cons accepted and the failure/rot it prevents.
6. **Say how it is verified, and how to adopt it safely.** Name the *pattern-specific* check (a contract
   test, an exhaustive-transition test, a type, or an `arch-gate` rule — not just "a functional test
   passes"); and if refactoring running code, the safe transition (Strangler / expand-contract /
   reversibility — `release-deployment-safety`).

## Output contract — the pattern-decision record (no pattern is applied without it)

Every run emits a short record. Evidence states are the canonical six from
`skeptical-audit` (`proven` > `observed` > `inferred` > `documented` > `reported` > `not-assessed`):

```
Problem / forces:           what varies, what must stay stable, what's duplicated/coupled
Forces evidence:            [state] about the EXISTING code — e.g. [observed: 2 runtime-selected pricing rules, pricing.ts:40-88]
Candidates considered:      the patterns the forces pointed to (and the no-pattern option)
Decision:                   the chosen pattern(s) — or "no pattern, because …"
Pros / cons accepted:       the real benefit, and the cost you are taking on
Failure/rot prevented:      the specific decay this removes (not "cleaner code")
Security trade-off:         attack surface it opens or closes — threat-model via owasp-secure-coding-bdd
Operational cost:           observability burden, new failure modes, tuning/debuggability — sre-operational-readiness
Simpler alternative:        what you rejected and why (the YAGNI line)
Adopt safely:               if changing running code — Strangler / expand-contract / reversibility (release-deployment-safety)
Verify correct application: the pattern-specific test TYPE / type / arch-gate rule (e.g. Repository→contract test;
                            State→exhaustive-transition) — proves the PATTERN holds, not just that the code runs
Verification status:        [state] about that check — e.g. [not-assessed → observed once the contract test is green]
ADR:                        if the choice is cross-cutting/significant, the ADR id (architectural-decision-records)
Real guarantee:             the type / DB constraint / test / gate that actually makes the invariant hold
```

## The catalog and the layers it covers

- **The 23 Gang-of-Four patterns** live in `references/design-patterns-catalog.md`, each on one strict
  template: intent · forces · best-situation · pros · cons · avoid-when · failure-rot-prevented ·
  **misuse-anti-pattern** · **security-trade-off** · **operational-cost** · **adopt-safely** ·
  modern-alternative · **verify-correct-application (named test type)** · ❌/✅ example · sources. Intents
  from GoF 1994; applicability/pros/cons from Refactoring.Guru; measured trade-offs from the peer-reviewed
  studies; security framing cross-linked to `owasp-secure-coding-bdd`.
- **The enterprise/tactical layer GoF omits** lives in `references/enterprise-patterns.md`: DI/IoC;
  persistence (Repository, Unit of Work, Data Mapper, Identity Map, Lazy Load, Query Object,
  Specification); DDD tactical (Value Object, Entity, Aggregate, Domain Event, Null Object, Result/Either);
  **functional & immutable** (higher-order-function composition, pipelines, immutability-as-default,
  lenses — first-class, not just "modern alternatives"); application/integration (Service Layer, DTO,
  Gateway, Anti-Corruption Layer, Transactional Outbox, Idempotent Receiver, Competing Consumers,
  Claim-Check); **security patterns as first-class** (trust boundary, validate-at-the-edge,
  defense-in-depth — cross-linked to owasp); presentation (MVC/MVVM/MVP, Flux/Redux); concurrency
  (Producer-Consumer, Thread Pool, Actor, Immutable Object, Future/Promise). Sourced from Fowler *PoEAA*
  (page citations) and the Microsoft Azure *Cloud Design Patterns* catalog.
  - **Cross-cutting caveats baked into that reference:** any pattern that copies/serializes records
    (Repository, Data Mapper, DTO, Identity Map, Serialized LOB) inherits the data-map, retention, and
    deletion-propagation duties of `compliance-data-lifecycle`; any presentation pattern must still
    satisfy `universal-accessibility-wcag`, `universal-browser-device-support`, and
    `usability-ux-universal-design` (the pattern shapes code, not conformance).
- **Anti-patterns to detect and remove** live in `references/anti-patterns-and-smells.md` (God Object,
  Anemic Domain Model, Big Ball of Mud, premature abstraction, Singleton-as-global-state). A selector's
  most valuable output is often "undo this structure," not "add one."
- **Do not duplicate** the architectural/distributed/resilience patterns this library already owns
  (Hexagonal/Clean, Layered, CQRS, Event Sourcing, Saga, Strangler Fig, Circuit Breaker, Retry, Bulkhead,
  Cache-Aside) — the catalog **cross-links** to `enterprise-architecture-standards`,
  `release-deployment-safety`, `sre-operational-readiness`, and the requirements skills instead.

## Mechanical gate (what this skill enforces itself)

Honest scope: *selecting* the right pattern is judgment and can't be fully mechanized — but the **quality
and integrity of the catalog this skill decides from** can be, and must be (every other skill here ships a
gate). `scripts/check-catalog-completeness.mjs` fails closed when any catalog/enterprise entry is missing
a required template field **or** a primary-source citation — so an uncited pro/con or a half-filled entry
can't ship. It carries a discriminating test (a stripped entry → the gate fails). The *decision-record*
discipline (every choice names its forces, simpler-alternative, and failure-prevented) is held by the
Definition of done below and a fresh-context `judge-arch` review — and a future change-type→required-artifact
routing gate can make a missing record fail CI; this gate does not claim to do that today. What stays judgment — "is this abstraction premature?", "do the
forces really call for Strategy?" — is routed to `judge-arch` (reviewed against **all four** questions,
not just over-engineering) and, where a choice is greppable ("data access only via a Repository in
`domain/`"), encoded as an `arch-gate` rule via `arch-encode` with a real ❌/✅ example.

## Confirm before calling it done

- [ ] The problem was stated as **forces**, not named as a pattern up front.
- [ ] The **YAGNI gate** was applied — "no pattern" (or "remove this anti-pattern") was a live option.
- [ ] A **pattern-decision record** (the evidence ledger) exists with all fields, including **security
      trade-off**, **operational cost**, **adopt-safely**, and the six-state evidence markers.
- [ ] The failure/rot prevented is named concretely — and the **real guarantee** (type / DB constraint /
      test / gate) is identified where "impossible to fail" is actually required.
- [ ] **Verify correct application** names a *pattern-specific* check (test type / type / arch-gate rule),
      authored under `bdd-comprehensive-testing` / `comprehensive-test-strategy` so it actually runs.
- [ ] If the choice is cross-cutting/significant (per the ADR significance test), an **ADR** is written via
      `architectural-decision-records`; the decision record becomes its Decision Drivers + Considered Options.
- [ ] A greppable choice is encoded as an `arch-gate` rule via `arch-encode`; judgment calls go to `judge-arch`.
- [ ] `check-catalog-completeness.mjs` passes (every entry fully templated + cited).

## Reference files

| Topic | File |
|---|---|
| The 23 GoF patterns, one strict decision-oriented template each (+ security/operational/adopt-safely) | `references/design-patterns-catalog.md` |
| Enterprise/persistence/domain/messaging/presentation/concurrency + DI/IoC + functional + security patterns (Fowler PoEAA + Azure) | `references/enterprise-patterns.md` |
| The decision engine: symptom→candidate matrix, scoring, YAGNI gate, which choices are mechanizable (❌/✅ arch-gate rules), worked example | `references/choosing-a-pattern.md` |
| The honest limits: patterns as a smell, language features that supersede them, patterns that widen the attack surface, measured risks, patterns≠guarantees | `references/criticism-and-limits.md` |
| Anti-patterns & smells to detect and remove (God Object, Anemic Domain Model, premature abstraction) | `references/anti-patterns-and-smells.md` |
| Mechanical gate: catalog-completeness + citation linter (fail-closed, discriminating-tested) | `scripts/check-catalog-completeness.mjs` |

## Evidence & skeptical assessment (required)

A pattern recommendation is a factual claim about a problem's forces, so it carries the repo's evidence
discipline (canonical contract:
[`skeptical-audit/references/evidence-discipline.md`](../skeptical-audit/references/evidence-discipline.md)),
using the full six states. The **pattern-decision record is the evidence ledger** — it separates the
**forces evidence** (a claim about *existing* code, which can be `observed`/`proven`) from the
**verification status** (the holds-test/gate, which starts `not-assessed` and is upgraded when it runs).
No pattern is applied, and no "this is the right pattern" asserted, as a bare claim.

| Claim | Reaches `observed` by | Becomes `proven` when |
|---|---|---|
| "This feature needs pattern X" | the named forces are visible in the code/spec (`file:line`, the duplicated block, the two call sites) | the "verify correct application" test/type exists and passes, or an `arch-gate` rule enforces it |
| "No pattern is needed here" | the plain solution is written and covered by a test | — (the absence of indirection is self-evident in the diff) |
| "Pattern X prevents failure F" | F is a concrete, nameable decay (data sprawl, null-deref, shared-mutable-state, SSRF) | a test/type/gate makes F unrepresentable or caught on every PR |
| "The catalog entry is sound" | every template field present | `check-catalog-completeness.mjs` passes with its citation (required CI check, discriminating-tested) |

**Definition of done:** a pattern-decision record (the **evidence ledger**) exists with forces + forces
evidence, decision, pros/cons, failure-prevented, security + operational trade-offs, simpler-alternative,
adopt-safely, verify-correct-application, and verification status; the real "impossible to fail" guarantee
is routed to a type/constraint/test/gate (not claimed of the pattern); an ADR exists if the choice is
significant; every catalog fact cited to a primary source and `check-catalog-completeness.mjs` green. A
greppable choice isn't fully resolved until its rule lives in `arch-gate` (then `proven`).

## Why this holds for every developer and every agent

It binds universally because it lives in committed artifacts, not memory. **Agents** get it via the
always-on hook (this skill is listed in `always-on/enterprise-skills-always-on.md`, injected every
session/subagent) and it is referenced from `enterprise-architecture-standards` as part of the
architecture decision. **Humans and agents alike** are held by the gates: `check-catalog-completeness.mjs`
keeps the catalog honest on every PR; where a pattern choice is greppable it becomes an `arch-gate` rule
(via `arch-encode`) that blocks the opposite; and `judge-arch` reviews the judgment calls against all four
questions in fresh context. **It survives any individual** because the catalog, the decision records, the
gate rules, and `decisions.md` are in git. **Honest limit (stated, not hidden):** greppable choices reach
`proven`; the genuinely judgment-bound ones ("is this abstraction premature?") stay at `observed` + a
`judge-arch` second look — this makes *choosing deliberately and recording why* unavoidable, not the
choice always optimal. The catalog's measured trade-offs and the fresh-context review are how the residual
shrinks.

## Sources and attribution

Primary and peer-reviewed only — **Wikipedia is not an acceptable citation in this skill** (pattern
intents come from GoF 1994 / Fowler *PoEAA*, not encyclopedia summaries).

- **Gang of Four** — Gamma, Helm, Johnson, Vlissides, *Design Patterns: Elements of Reusable
  Object-Oriented Software*, Addison-Wesley 1994 (ISBN 0-201-63361-2) — the 23 patterns, their intents,
  and the OO principles. `[documented]`
- **Fowler, Rice, Foemmel, Hieatt, Mee & Stafford** — *Patterns of Enterprise Application Architecture*,
  Addison-Wesley 2002 (ISBN 0-321-12742-0) — the enterprise/persistence/presentation/concurrency layer,
  cited by page (e.g. *Repository (322)*, *Unit of Work (184)*). Public index:
  <https://martinfowler.com/eaaCatalog/>. `[documented]`
- **Martin Fowler** — *Inversion of Control Containers and the Dependency Injection pattern*,
  <https://martinfowler.com/articles/injection.html> (DI/IoC). `[documented]`
- **Microsoft Azure Architecture Center** — *Cloud Design Patterns*,
  <https://learn.microsoft.com/azure/architecture/patterns/> (cloud/messaging patterns). `[documented]`
- **Refactoring.Guru** — *The Catalog of Design Patterns*,
  <https://refactoring.guru/design-patterns/catalog> (applicability + pros/cons, retrieved 2026-10-10). `[documented]`
- **Peter Norvig** — *Design Patterns in Dynamic Languages*, <https://norvig.com/design-patterns/> — 16 of
  23 GoF patterns are simplified or invisible given first-class functions/types. `[documented]`
- **Paul Graham** — *Revenge of the Nerds*, <https://www.paulgraham.com/icad.html> — patterns as a sign
  of abstractions that aren't powerful enough. `[documented]`
- **Gamma, Helm, Johnson** — *Design Patterns 15 Years Later* (InformIT, 2009),
  <https://www.informit.com/articles/article.aspx?p=1404056> — the authors would add dependency injection,
  null object, type object, and extension object, and reconsider Singleton. `[documented]`
- **Hussain, Keung, Khan** — *The Effect of GoF Design Patterns Usage on Design Quality Attributes*, IEEE
  QRS 2017, doi:10.1109/QRS.2017.37 — measured trade-offs. `[documented]`
- **Almadi, Hooshyar, Ahmad** — *Bad Smells of Gang of Four Design Patterns: A Decade Systematic
  Literature Review*, Sustainability 13(18):10256, 2021, doi:10.3390/su131810256 — measured risks. `[documented]`
