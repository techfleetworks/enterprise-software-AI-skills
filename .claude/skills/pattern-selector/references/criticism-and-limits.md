# Criticism & Limits, so the skill never cargo-cults

Design patterns are a vocabulary and a set of trade-offs, not a quality guarantee. This reference is the
honest counterweight the skill is required to carry: when a pattern is a *smell*, when a language feature
replaces it, when it *widens the attack surface*, what the evidence actually shows, and why patterns do not
make code "impossible to fail." All sources are primary or peer-reviewed; **Wikipedia is not used.**

## 1. A pattern can be a smell

Paul Graham, *Revenge of the Nerds*: *"When I see patterns in my programs, I consider it a sign of
trouble… a sign that I'm using abstractions that aren't powerful enough."* A recurring pattern in your code
is sometimes a missing abstraction (a function, a type) the language could express directly.
Source: <https://www.paulgraham.com/icad.html>. `[documented]`

## 2. Language features replace many patterns

Peter Norvig, *Design Patterns in Dynamic Languages*: **16 of the 23** GoF patterns are "invisible or
simpler" given first-class functions and types. So in a functional/modern language, prefer the feature:

| GoF pattern | Modern feature that often replaces it |
|---|---|
| Strategy, Command, Template Method | first-class / higher-order functions |
| Visitor, State | sum types + pattern-matching (`match`) |
| Singleton | a DI container / module scope |
| Iterator | language iterators / generators |
| Observer | reactive streams / an event bus |
| Factory | a `map`/function of constructors |

Source: <https://norvig.com/design-patterns/>. `[documented]`

## 3. The authors themselves revised it (2009)

In *Design Patterns 15 Years Later* the GoF authors said they'd recategorize, **add** Dependency
Injection, Null Object, Type Object, and Extension Object, and **reconsider removing Singleton**. Treat the
1994 set as a floor, not scripture. Source: <https://www.informit.com/articles/article.aspx?p=1404056>. `[documented]`

## 4. Patterns that WIDEN the attack surface (threat-model before you apply)

Several catalogued patterns introduce a security liability by their very structure. Recommend them only
with the mitigation, and route the real control to `owasp-secure-coding-bdd`:

- **Singleton / global mutable state** → shared state across requests/tenants (data bleed, race
  conditions). Mitigation: DI-scoped instance; no mutable global. (→ `references/cheatsheets/Session_Management.md`,
  concurrency.)
- **Prototype / clone + Serialization** → deserializing untrusted data is an RCE/DoS class; deep-clone of
  attacker-influenced graphs. Mitigation: never deserialize untrusted input into live objects; allow-list
  types. (→ `references/cheatsheets/Deserialization.md`.)
- **Proxy / Gateway / Adapter to a remote** → a new **trust boundary** and an **SSRF** surface (the app now
  makes outbound requests, possibly to attacker-influenced URLs). Mitigation: egress allow-list / network
  isolation, validate the target, verify webhook signatures. (→ `references/cheatsheets/Server_Side_Request_Forgery_Prevention.md`,
  `references/cheatsheets/Webhook_Security.md`.)
- **Interpreter** → an expression/DSL evaluator is an **injection** surface. Mitigation: a real parser with
  a strict grammar; never `eval`; sandbox. (→ `references/cheatsheets/Injection_Prevention.md`.)
- **Flyweight / shared cache** → cross-tenant state leakage if intrinsic/extrinsic split is wrong.
  Mitigation: key by tenant; never share mutable per-user state.
- **Observer / event bus** → an unsubscribed listener is a memory leak and an unexpected side-effect path;
  event order can be abused. Mitigation: bounded, authenticated handlers; explicit unsubscribe.

The catalog's per-entry **Security trade-off** line carries this per pattern; this is the index.

## 5. Over-abstraction is itself rot

The empirical record is not uniformly positive. Peer-reviewed studies find pattern usage carries *measured*
trade-offs, not just folklore benefits:

- Hussain, Keung, Khan, *The Effect of GoF Design Patterns Usage on Design Quality Attributes*, IEEE QRS
  2017, doi:10.1109/QRS.2017.37, pattern use affects quality attributes in both directions. `[documented]`
- Almadi, Hooshyar, Ahmad, *Bad Smells of GoF Design Patterns: A Decade Systematic Literature Review*,
  Sustainability 13(18):10256, 2021, doi:10.3390/su131810256, patterns are associated with specific bad
  smells when misapplied. `[documented]`

So the YAGNI gate is not a style preference, it's supported by the evidence. A pattern applied without its
problem adds indirection, classes, and cognitive load: the opposite of robustness. No pattern is a valid and
common outcome when the forces are small and will stay small.

## 6. Patterns ≠ guarantees (the load-bearing limit)

A pattern makes code *shaped right*; it does not make it *provably correct*. The "structurally impossible to
fail" guarantees this library cares about come from:

- **Types**, a discriminated `Result`/sum type makes an unhandled case a *compile error*; a `Money` value
  object makes an invalid amount unrepresentable.
- **Database constraints**, `NOT NULL`, `FK`, `UNIQUE`, `CHECK` enforce invariants no amount of patterning
  can.
- **Tests**, a contract/property/exhaustive-transition test proves the behavior holds.
- **Gates**, `arch-gate`/`check-*` make the rule un-skippable on every PR.

So every pattern-decision record names the pattern **and** the real guarantee, and routes the hard one to a
type/constraint/test/gate. Claiming a pattern alone makes code "impossible to fail" would violate this
repo's own `skeptical-audit` discipline. State what the pattern removes; state where the guarantee lives.
