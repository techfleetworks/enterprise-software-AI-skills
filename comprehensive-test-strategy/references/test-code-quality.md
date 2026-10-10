# Test code quality & maintenance

A test suite is only an asset while it stays trustworthy and cheap to change. Test code that rots
gets ignored, disabled, or deleted wholesale — taking the safety net with it. Treat it accordingly.

## Test code is production code
Hold test code to the same bar as the code it guards: reviewed, refactored, kept clean. A sloppy
suite is a liability that slows every future change.

## Readability beats DRY — DAMP, not just DRY
In tests, **clarity wins over deduplication**. A test should read top-to-bottom as a self-contained
story; chasing DRY by hiding setup in layers of shared helpers makes a failure hard to diagnose.

- **DAMP** (Descriptive And Meaningful Phrases) over strict **DRY** here: *"duplication is okay, if it
  improves readability."*
- **Rule of Three** before extracting a helper — *"use before reuse."* Don't abstract shared setup
  until the third occurrence, and only if the abstraction stays readable.
- A reviewer should see the inputs, the action, and the expected outcome **in the test itself**,
  without chasing helpers across files.

## One behavior per test, Arrange-Act-Assert
- **Test one condition per test.** A test that asserts five unrelated things fails ambiguously and
  names nothing precisely. Split them.
- Structure every test as **Arrange-Act-Assert** (a.k.a. **Given-When-Then**): set up state, perform
  one action, assert the observable outcome. (The Gherkin scenarios in `bdd-comprehensive-testing`
  are the same shape at the behavioral layer.)
- **Name the test for the behavior and outcome**, not the method — `rejects_a_refund_past_the_window`,
  not `test_refund_2`. The name is the first thing read on a failure.

## Delete tests that stopped earning their keep
Every test is baggage: it costs run time and maintenance forever. When a lower-level test now covers
what a slow high-level test did, **delete the duplicate** — *"beware of the sunk cost fallacy and hit
the delete key"* (see the Rules of thumb in `test-pyramid-and-types.md`). A smaller, sharper suite is
worth more than a large redundant one.

## Keep them deterministic and independent
Flaky, order-dependent, or shared-state tests erode trust fast — see
`quality-gates-and-flaky-tests.md`. Inject clocks, seed randomness, isolate state, avoid real
network.

Source: Fowler/Vocke, *The Practical Test Pyramid*
(<https://martinfowler.com/articles/practical-test-pyramid.html>, retrieved 2026-10-10) `[documented]`.
