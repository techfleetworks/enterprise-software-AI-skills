# The Test Pyramid & Test Types

## The pyramid (proportions matter)
```
        /\        E2E / BDD        few   — slow, high-value, whole-system journeys
       /  \
      /----\      Integration      some  — real seams: DB, queue, HTTP, framework
     /      \
    /--------\    Unit            many   — fast, isolated logic; the base
```
Bugs are cheapest to catch at the bottom. Invert the pyramid (mostly e2e) and you get a
slow, flaky, expensive suite that nobody trusts — the "ice-cream cone" anti-pattern.

## Unit tests (the base — most numerous)
- Test one behavior of one unit (function/class) in isolation, no real I/O.
- Fast (milliseconds), deterministic, run on every save/PR — aim for thousands in a few minutes.
- **Test behavior, not implementation** — assert outputs/effects, not internal calls, so
  refactors don't break tests that should still pass. Test the **public** interface only.
- **Solitary vs. sociable** — a *solitary* unit test stubs all collaborators; a *sociable* one
  lets real collaborators run. Neither is mandatory: use **real collaborators when they build
  confidence**, and a stub/mock only when the real one makes the test slow, flaky, or awkward.
  Don't reflexively mock everything — over-mocking couples the test to structure.
- **Private methods are an implementation detail** — don't test them directly. If a private
  method feels like it *needs* its own test, the class is doing too much: extract it into its own
  class (the "S" in SOLID) and test it through *that* class's public interface.
- Cover branches, boundaries, and error paths (mirror the non-happy-path categories from
  `bdd-comprehensive-testing`). Skip trivial no-logic code (plain getters/setters).

## Integration tests (the middle — fewer)
- Verify the seams: does the code work with the *real* database, cache, message broker, or
  the actual web framework wiring? Write them for anything that **serializes/deserializes** —
  DB reads/writes, REST calls, queue messages, filesystem I/O, calls to other apps' APIs.
- **Prefer NARROW integration tests** — exercise *one* integration point at a time, doubling the
  other services/DBs. *Broad* integration tests run through many parts at once; they're slower and
  more brittle, so keep them rare. (A narrow integration test is fast enough to share the unit
  stage in CI.)
- Use real dependencies where feasible (e.g. **Testcontainers** to spin up a real DB in a
  container) rather than mocking the thing you're trying to verify. **Avoid in-memory DB
  substitutes** as your integration DB — they're a *different database than production* ("risky
  business"): a query that passes in H2 can fail in real Postgres. Run the real engine locally.
- For a **third-party service**, run a local instance or a fake that mimics it (e.g. WireMock);
  never hit the real production system in automated tests. A fake can **drift** from the real
  service, so pair it with a **contract test** against the real thing (see `contract-testing.md`).
- Slower than unit; run in CI, maybe not on every keystroke.

## Subcutaneous tests (just below the UI)
- A test that drives the system **one layer below the GUI** — e.g. at the REST/service boundary —
  gets broad, near-end-to-end coverage with far less flakiness and cost than a full browser E2E.
- This is the preferred home for most acceptance/behavioral coverage: run the Gherkin scenarios
  from `bdd-comprehensive-testing` **subcutaneously** where you can, reserving true browser E2E for
  the few journeys that genuinely need the UI.

## End-to-end / BDD tests (the top — fewest)
- Exercise a full critical journey through the deployed system.
- These are the Gherkin scenarios owned by `bdd-comprehensive-testing` — don't duplicate
  them; just make sure the critical journeys exist and are stable.
- Keep them few and high-value; they're the slowest and most fragile. Reserve for
  revenue/safety-critical flows.

## Test doubles (use the right one)
- **Stub**: returns canned data. **Mock**: asserts interactions. **Fake**: a working
  lightweight implementation (in-memory DB). **Spy**: records calls.
- **Mock external dependencies, never the unit under test.** Mocking the thing you're
  testing proves nothing. Over-mocking couples tests to implementation and hides real
  integration bugs — prefer fakes/real deps as you go up the pyramid.

## Other useful types (place appropriately)
- **Snapshot tests** — for serialized output/UI; guard against unintended changes, but
  review diffs (blindly updating snapshots defeats them).
- **Smoke tests** — a tiny fast suite run right after deploy to confirm the system is
  basically alive (ties to `release-deployment-safety`).
- **Regression tests** — every fixed bug gets a test so it can't return (often a BDD
  non-happy-path scenario).
- **Golden/characterization tests** — capture existing behavior of legacy code before
  refactoring it.

## What to test where (heuristic)
- Complex business logic / algorithms → unit + property-based.
- Data access, transactions, migrations → integration (real DB).
- Service-to-service APIs → contract tests (see `contract-testing.md`).
- Critical user journeys → BDD/e2e (subcutaneous where possible).
- Performance-sensitive paths → load tests (see `load-and-performance-testing.md`).
- Failure handling → chaos/fault injection (see `chaos-engineering.md`).

## Rules of thumb (how to keep the shape)
These are the operational rules that keep a suite pyramid-shaped instead of drifting into the
ice-cream cone over time:
- **Push every test as far DOWN the pyramid as it can go.** The lowest layer that can prove the
  behavior is where it belongs — fastest, least flaky, cheapest to maintain.
- **Lower-level gap rule:** if a higher-level test catches a bug and *no* lower-level test failed,
  you're missing a lower-level test — write it. (Then the high-level one has usually done its job.)
- **Higher-level tests add only what lower ones can't.** Don't re-test at the e2e/UI layer an edge
  case a unit test already covers — every test is baggage that costs run time and maintenance.
- **Delete redundant high-level tests.** Once a lower-level test covers it, remove the slow
  duplicate: *"beware of the sunk cost fallacy and hit the delete key."*
- **Acceptance tests don't have to sit at the top.** Verifying a feature from the user's
  perspective can live low (subcutaneous / service layer): *"having a low-level test is better than
  having a high-level test."* This is how `bdd-comprehensive-testing`'s total use-case × audience
  coverage stays **off** the ice-cream cone — cover every behavior, but at the lowest layer that
  proves it.

Source for this section: Fowler/Vocke, *The Practical Test Pyramid*
(<https://martinfowler.com/articles/practical-test-pyramid.html>, retrieved 2026-10-10) `[documented]`.
