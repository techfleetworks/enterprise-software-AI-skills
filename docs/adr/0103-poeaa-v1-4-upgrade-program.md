---
status: "accepted"
date: 2026-10-31
decision-makers: mdenner
---

# 0103 - The pattern skills are made true to PoEAA in v1.4, citation gate first, as nine serial work packages

Source: the adversarial audit in `docs/audit/poeaa-2026-11/poeaa-adversarial-audit.md`, the third of three
follow-ups the operator queued after v1.3.1 (the others are a COA skill and a literature review), done first
at the operator's request.
The operator set the scope: "These fixes will be a part of the enterprise skills repo v 1.4."

## Context

The pattern-selector skill names Fowler's *Patterns of Enterprise Application Architecture* as a primary
source and cites it by page. An adversarial audit against the book (read this session from a PDF of the
e-book edition) found:

- 51 catalog patterns; 4 covered well, 7 covered poorly, 1 miscited, 39 missing.
- `[observed]` Every printed page the skills cite is correct, but the catalog gate exits 0 with every PoEAA
  page rewritten to (999) or deleted (four mutated copies, all exit 0). It looks only for a citation token,
  and the ISBN alone satisfies it.
- Three entries contradict the book on when to use their pattern (Service Layer, Unit of Work, Gateway), and
  the Value Object example stores money as a floating-point number, which the book's Money chapter forbids.
- The skill promises that greppable choices become "proven" arch-gate rules, but no rule for any PoEAA
  pattern ships.

The e-book has no printed page numbers, so printed pages were recovered from Fowler's own in-text
cross-references (for example "Domain Model (116)"); all 51 patterns resolved to one page each.

## Decision

1. **The v1.4 release makes the pattern skills true to the book**, as specified in
   `docs/design/poeaa-v1.4/spec.md`, with outcomes O1 to O6: a wrong page cannot merge, no pattern is
   silently absent, no entry contradicts the book, the chooser routes the book's main problems, every PoEAA
   pattern has a ready proof, and no example teaches a money bug.

2. **Nine serial work packages, one PR each**, in this order: the audit and spec (WP1); the
   citation-verifying gate and page registry (WP2); fixing the twelve existing entries (WP3); then the
   missing groups (WP4 to WP8); then the "prove it" kit (WP9). Serial because the shared datastores conflict
   when two PRs are open.

3. **The gate comes first (WP2).** Every later package adds PoEAA citations; the real gate covers each
   one as it lands, instead of a person by hand. Until a group lands, its registry rows are `declined` with a
   reason that names the planned work package (for example "planned for v1.4, WP5"), so every commit in
   the chain is green and each gap is written down.

4. **One owner for PoEAA page facts.** A page registry shipped with the pattern-selector skill is the single
   source for each pattern's printed page and coverage status. The catalog cites; the registry owns the
   fact; the gate compares.

5. **Specs before code, in the repo's existing design-spec form.** The acceptance scenarios live in
   `docs/design/poeaa-v1.4/features/` (system scenarios that graduate into the top-level `features/`, with
   step definitions, in the PR that builds them) and `docs/design/poeaa-v1.4/evals/` (agent-behavior evals
   that never graduate). This follows `docs/design/bootstrap-v2/`.

6. **The catalog template does not change.** New entries fit the existing 15-field template.

7. **The fix reaches the record the agent writes, not only the catalog.** `[observed]` The edit-time
   `pattern-decision` check accepts a record with "x" in every field, and no routing or coupling rule makes
   `pattern-selector` required. So WP2, WP3, and WP9 also extend `always-on/check-task-plan.mjs` (spec
   section 7.3), and the release bumps the version so the stale skill mirror is refreshed.

8. **A pattern decision is required for design-layer changes.** The operator decided spec D1 on 2026-10-31:
   "Make it required". In WP3, a `design-layer` rule in the edit-time routing map and in the receipt coupling
   map makes `pattern-selector` required for repository, service, domain, mapper, and gateway paths (spec
   R3.14 to R3.19). Its globs all start with `**/`, so it fires even while the edit-gate passes absolute paths.
   "No pattern" with a reason still satisfies it; only an operator waiver skips it, at edit time and in the
   receipt alike. It lands with R3.13 so a required record is also checked for substance. Limit: it holds at
   edit time only in an enforced install with a plans file, and in the PR receipt only when the diff is
   passed, which CI does not do yet (spec I6, I11).

## Consequences

- Positive: the catalog's sources become checkable rather than trusted; an agent gets guidance on the book's
  core decisions (domain logic, offline concurrency, distribution, session state) and a copyable way to
  prove each choice.
- Negative: about 40 new catalog entries make `enterprise-patterns.md` much longer; a later PR may split it
  by cluster (the gate already accepts several catalog files). Nine serial PRs take calendar time.
- Risk: the registry could hold a wrong page. Mitigated by building it from the book's cross-references and
  by a test that pages rise in catalog order.
- The design scenarios are not run by CI until they graduate; until then their syntax and tags are
  validated only when someone runs the gates on those folders (`[observed]` exit 0 on this branch).

## Alternatives considered

- **One large PR.** Rejected: unreviewable, and it collides with the shared datastores.
- **Add the missing entries first, fix the gate last.** Rejected: about 40 new citations would land
  unchecked, which is the defect the audit found.
- **Put the scenarios in the top-level `features/` now.** Rejected: `check-bdd-executed` allows zero
  pending scenarios, so unbuilt behavior would turn CI red; the repo already uses `docs/design/` for this.
- **Cover only the patterns an agent would reach for, and leave the rest out silently.** Rejected: a silent
  gap is the failure. Declining a pattern is allowed, but only with a written reason the gate checks.
- **Verify citations against the book text in CI.** Rejected: the book is copyrighted and cannot be
  committed; page facts and short quotes are.
