---
status: "accepted"
date: 2026-10-11
decision-makers: mdenner
---

# Add a pattern-selector skill with its own completeness gate

## Context and Problem Statement

The library taught 9 of the 23 Gang-of-Four patterns inside `enterprise-architecture-standards`
(`coding-principles.md`) and covered architectural/distributed/resilience patterns elsewhere, but it had
**no way to choose**: nothing mapped a feature's forces to the right pattern, ranked candidates, named the
failure each prevents, or said how to verify one was applied correctly — and it omitted 14 GoF patterns and
the entire enterprise/persistence/domain/messaging/presentation/concurrency layer. The two popular web
articles that prompted this are either a bare catalog-with-analogies or mislabeled, uncited marketing, so
the gap could not be closed by copying them. The hard part is doing this **without turning the skill into a
pattern-pusher** — over-abstraction is itself a top cause of rot, and this repo's standard is that a skill
enforces its discipline mechanically, not in prose.

## Decision Drivers

* Provide a precise selection *engine* (forces → candidates → score → pick/decline → verify), not another
  catalog.
* YAGNI-first: the default answer is often "no pattern"; include an anti-pattern "remove structure" path.
* Primary sources only (GoF 1994, Fowler *PoEAA* with page cites, Refactoring.Guru, Azure, peer-reviewed
  studies); **no Wikipedia**.
* Match the repo's bar: carry the evidence contract, and ship a mechanical gate with a discriminating test.
* Be honest: patterns remove *specific* rot modes; the hard guarantees come from types/constraints/tests/gates.

## Considered Options

* A new top-level `pattern-selector` skill: SKILL.md + a decision engine + a GoF catalog + an enterprise
  layer + an anti-pattern catalog + a criticism/limits reference + a catalog-completeness gate.
* Extend `enterprise-architecture-standards/coding-principles.md` in place.
* Only document the missing patterns (no engine, no gate).

## Decision Outcome

Chosen option: "a new skill with its own gate." The skill fires on every feature/refactor and emits a
**pattern-decision record** (forces → candidates → decision/decline → pros-cons → failure-rot-prevented →
**security + operational trade-offs** → simpler-alternative → **adopt-safely** → **verify-correct-application**
→ ADR-if-significant → the real guarantee), with evidence states from the canonical six. Its references are
the engine (`choosing-a-pattern.md`), the 23 GoF (`design-patterns-catalog.md`), the enterprise/FP/security
layer (`enterprise-patterns.md`), the anti-pattern catalog (`anti-patterns-and-smells.md`), and the limits
(`criticism-and-limits.md`). It ships `check-catalog-completeness.mjs`, which fails closed when any catalog
entry is missing a template field or a primary-source citation. It is wired into the always-on directive and
referenced from `enterprise-architecture-standards`. The design was hardened by a fresh-context audit that
applied all twelve sibling skills as lenses (adding the security/operational/adopt-safely/ADR dimensions and
fixing an over-claimed "already wired in" statement by actually wiring it).

### Consequences

* Good, because pattern choice becomes a deliberate, recorded, sourced decision instead of a reflex, with
  the failure it prevents and the real guarantee both named.
* Good, because the catalog can't rot into uncited folklore — the completeness gate enforces template +
  citation on every PR, with a discriminating test.
* Good, because the YAGNI gate + anti-pattern catalog make "no pattern / remove this structure" a
  first-class outcome, countering the pattern-pushing failure mode.
* Bad (honest limit), because *selecting* the right pattern is judgment and only partly mechanizable:
  greppable choices become `arch-gate` rules (`proven`); the rest rely on a `judge-arch` review (`observed`).
  The gate keeps the catalog honest, not the choice optimal.
* Neutral, because the enterprise/cloud entries are cited reference material an adopting repo reads, not code
  it runs.

### Confirmation

`test/pattern-catalog.test.mjs` exercises the completeness gate: a fully-templated + cited entry passes;
dropping any required field or the citation fails (discriminating); label variants and book-page citations
are accepted; a file with no entries, a missing file, and no-args each fail closed (exit 2). The gate runs
in CI via `npm test`, and is run against both catalog files before merge. The skill carries the evidence
contract (`check-skill-evidence-contract`).

## More Information

Grounded in GoF 1994, Fowler *Patterns of Enterprise Application Architecture* (2002), the Microsoft Azure
*Cloud Design Patterns* catalog, Norvig and the GoF-2009 interview for the limits, and the Hussain (2017) /
Almadi (2021) studies for measured trade-offs. Built before the per-skill Track-B deep rewrites, as a new
capability the library lacked.
