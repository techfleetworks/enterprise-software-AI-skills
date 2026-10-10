# Test-pyramid gap analysis — our skills vs. Fowler's *Practical Test Pyramid*

**Source audited:** Martin Fowler / Ham Vocke, *The Practical Test Pyramid*
(<https://martinfowler.com/articles/practical-test-pyramid.html>), retrieved **2026-10-10**. `[documented]`
**Our scope audited:** the `comprehensive-test-strategy` and `bdd-comprehensive-testing` skills, read in
full. Every "what we have" claim is `[observed]` with a re-runnable source (a `file:line` or a grep that
returns zero hits). Grep baseline (re-runnable):

```bash
grep -rniE "solitary|sociable|narrow integration|broad integration|subcutaneous|push .{0,20}down|sunk cost|exploratory|hallway|rule of three|DAMP" comprehensive-test-strategy bdd-comprehensive-testing
# → 0 hits for every one of these terms (2026-10-10)
```

## What we already cover (verified, no gap)

- Pyramid shape + proportions + the ice-cream-cone anti-pattern — `test-pyramid-and-types.md:3-12` `[observed]`.
- Behavior-not-implementation for unit tests — `test-pyramid-and-types.md:17` `[observed]`.
- Real DB for integration via Testcontainers — `test-pyramid-and-types.md:25-26` `[observed]`.
- Test doubles (stub / mock / fake / spy) + "mock external, never the unit" — `test-pyramid-and-types.md:36-41` `[observed]`.
- Consumer-driven contracts: Pact, provider verification, broker, `can-i-deploy`, message pacts — `contract-testing.md:9-51` `[observed]`.
- Coverage "necessary not sufficient" + **don't chase 100%** — `quality-gates-and-flaky-tests.md:5-11` `[observed]`.
- Mutation + property-based testing; flaky-test quarantine + determinism; fast-feedback metric — `quality-gates-and-flaky-tests.md:13-52` `[observed]`.

## Gaps (each with observable proof)

| # | Gap | Fowler says | What we have (observable) | Sev |
|---|-----|-------------|---------------------------|-----|
| G1 | **Solitary vs. sociable unit tests** | Names both; use real collaborators when they build confidence, stub when they make the test awkward. | `grep solitary\|sociable` → **0 hits**. Our unit section doesn't distinguish the two styles. | M |
| G2 | **Narrow vs. broad integration** | "Test one integration point at a time by replacing separate services and databases with test doubles" (narrow); broad is slower, avoid as default. | `grep "narrow integration\|broad integration"` → **0 hits**. We treat "integration" as one undifferentiated layer (`test-pyramid-and-types.md:22-27`). | M |
| G3 | **Push tests DOWN + the dedup/delete rules** | "Push your tests as far down the test pyramid as you can"; "if a higher-level test spots an error and there's no lower-level test failing, write a lower-level test"; higher-level tests cover only what lower can't; delete redundant high-level tests — "beware of the sunk cost fallacy and hit the delete key." | `grep "push .*down\|sunk cost"` → **0 hits**. We state proportions but give **none** of the operational rules for keeping the shape. | **H** |
| G4 | **Exploratory / manual testing** | A whole practice: scheduled exploration with a "destructive mindset" for usability, slow responses, poor error messages; turn each finding into an automated test. | `grep exploratory\|hallway` → **0 hits**. Absent from both skills. | **H** |
| G5 | **Acceptance tests can live LOW in the pyramid** | "Acceptance tests… don't have to be written at the highest level"; "having a low-level test is better than having a high-level test." | `test-pyramid-and-types.md:29-34` frames BDD/acceptance as the **top** only. Reconciling this is exactly our "run BDD down the pyramid" point — but we never say it. | **H** |
| G6 | **Subcutaneous tests** | A test just below the GUI (e.g. the REST layer) gives broad coverage with far less flakiness than full UI E2E. | `grep subcutaneous` → **0 hits**. This is the concrete *mechanism* for G5 and the BDD "down the pyramid" rule. | M |
| G7 | **Fake drift → pair with a contract test** | A fake of a third party (e.g. WireMock) can drift from the real service; pair it with a contract test to keep it faithful. | `contract-testing.md` covers service↔service CDC only; the **integration-test-fake faithfulness** linkage is absent. | M |
| G8 | **In-memory DB is "risky business"** | Running against an in-memory DB means testing a *different* DB than production — explicitly discouraged. | `test-pyramid-and-types.md:38` lists in-memory DB as a "fake" with **no caveat**. (We do recommend Testcontainers — aligned in spirit, missing the warning.) | L |
| G9 | **Test code quality: DAMP vs DRY, Rule of Three** | "Test code is as important as production code"; "duplication is okay, if it improves readability" (DAMP over DRY); Rule of Three before extracting. | `grep "rule of three\|DAMP"` → **0 hits**. No test-maintainability guidance. | M |
| G10 | **Private methods = implementation detail** | Don't test private methods; if you must, the class violates SRP — extract a new class and test via its public interface. | `grep "private method"` → **0 hits**. We say "behavior not implementation" but not this specific, actionable rule. | L |
| G11 | **Pipeline staged by speed & scope, not test type** | Stage placement is "not driven by the types of tests but rather by their speed and scope"; narrow fast integration tests can share the unit stage. | `SKILL.md:87` says "fast tests first" but frames stages by **type**. Minor refinement. | L |

## The sharpest finding (ties back to our own BDD mandate)

**G3 + G5 + G6 together are the reconciliation our BDD skill needs.** Our `bdd-comprehensive-testing`
skill mandates "ALL use cases × ALL audiences, every push." Taken naively that risks the ice-cream cone
Fowler warns against. Before this change **neither** skill stated the reconciliation (`grep -rni "lowest
layer" .` → 0 hits): `comprehensive-test-strategy` named no push-down / acceptance-can-be-low /
subcutaneous rules, and `bdd-comprehensive-testing` was silent on layering. The fix makes **both** sides
say the same thing — `comprehensive-test-strategy` gains those rules of thumb, and
`bdd-comprehensive-testing` gains an explicit "run each scenario at the **lowest layer that proves the
behavior** — subcutaneously where possible" note — so completeness and the pyramid are now explicitly
consistent.

## Recommended fix (the PR)

1. `test-pyramid-and-types.md` — add solitary/sociable (G1), narrow/broad integration (G2), subcutaneous
   (G6), the in-memory-DB caveat (G8), private-method/SRP rule (G10), and a **"Rules of thumb"** block
   for push-down + the lower-level-gap rule + delete-redundant-higher-level-tests (G3), plus
   "acceptance tests can live low" (G5).
2. `contract-testing.md` — add the fake-drift → contract-test pairing for third-party fakes (G7).
3. New `references/test-code-quality.md` — DAMP vs DRY, Rule of Three, test-as-production-code, one
   behavior per test / AAA, deleting redundant tests (G9).
4. New `references/exploratory-testing.md` — scheduled exploration, destructive mindset, findings →
   automated regressions (G4).
5. `comprehensive-test-strategy/SKILL.md` — a step for exploratory testing, the push-down rule in the
   core principle, and the staged-by-speed-and-scope note (G11); update the reference table.
6. `bdd-comprehensive-testing/SKILL.md` — add the reconciliation note ("run each scenario at the
   lowest layer that proves the behavior — subcutaneously where possible"), so the alignment with the
   pyramid is mutual, not one-sided.

**Not recommended: a separate "test pyramid" skill.** `comprehensive-test-strategy` already owns the
pyramid and the full test mix; a third skill would duplicate it and drift, violating the repo's
one-owner rule. Deliver *teach / install / implement* instead via: this skill (teach), the bootstrap
installer scaffolding the pyramid's test layout + configs per stack (install), and a future
`check-test-shape` gate measuring real layer ratios/runtimes from test reports (implement/prove).

## Evidence ledger

| Claim | State | Source |
|-------|-------|--------|
| Fowler's prescriptions as listed | `[documented]` | the article, retrieved 2026-10-10 |
| Each "what we have" row | `[observed]` | the cited `file:line`, or the zero-hit grep above |
| G1-G11 are genuine absences | `[observed]` | grep returns 0 hits for each named term (re-run the baseline command) |
| Severities | `[inferred]` | from Fowler's own emphasis (H = a named rule-of-thumb or a whole practice; L = a caveat/refinement) |

**Limitation (`not-assessed`):** this audits *skill guidance coverage*, not whether any adopting repo's
*actual tests* follow the pyramid — that would require measuring a real suite's layer distribution and
runtimes, which no committed gate does yet. A future `check-test-shape` gate (measuring the ratio of
unit:integration:e2e from test reports) would move "the suite is pyramid-shaped" from `[documented]`
advice to `[proven]`.
