---
name: comprehensive-test-strategy
description: Use for EVERY feature, service, or system to decide and implement the FULL testing strategy beyond behavioral BDD: the test pyramid (unit, integration, end to end), consumer-driven contract testing between services, load and performance and stress testing, chaos and resilience testing, coverage and mutation-testing quality gates, property-based testing, and flaky-test management. Complements bdd-comprehensive-testing (which owns Gherkin behavioral scenarios) by covering the rest of a real test strategy: the unit, integration, contract, load, and chaos layers behavioral BDD does not. Trigger proactively on "tests," "testing," "coverage," "load test," "performance test," "contract test," "integration test," "e2e," "chaos," "flaky," "test strategy," or any code that other code or services depend on, even without those words.
---

# Comprehensive test strategy

## Why this exists

BDD scenarios prove a feature behaves correctly, but that is only part of what strong teams test. They also
verify the units in isolation, check that services do not break each other's contracts, confirm the system
holds up under load, confirm it degrades gracefully when infrastructure fails, and confirm the test suite
itself is trustworthy (fast, deterministic, and actually able to detect faults). This skill owns that broader
strategy, so "we have tests" means "we have the right tests at the right levels," not just a pile of end-to-end
checks.

This skill is the companion to `bdd-comprehensive-testing`. That skill owns the Gherkin behavioral layer and
wires the suite into CI; this skill decides the full mix of test types and adds the ones BDD does not cover.
Use them together. Do not duplicate the behavioral scenarios here.

## The core principle

**Test at the lowest level that can catch the bug, and match the test type to the risk.** Fast, isolated
tests for logic; a smaller number of integration tests for the seams; fewer, high-value end-to-end and BDD
tests for critical journeys; plus specialized tests (contract, load, chaos) for the risks that unit tests
cannot see. This is the test pyramid. Ham Vocke's guidance on Fowler's site is to "write tests with different
granularity" and that "the more high-level you get the fewer tests you should have." Fowler credits Mike Cohn
(*Succeeding with Agile*, 2009) with popularizing the pyramid, and its core point: "you should have many more
low-level UnitTests than high level BroadStackTests." A suite that is all end to end is slow, flaky, and
expensive; a suite that is all unit misses integration and scale failures.

**Push every test as far DOWN the pyramid as it can go, and delete a higher-level test once a lower level
covers it.** Vocke states both halves: "push your tests as far down the test pyramid as you can," and if a
higher-level test finds a bug that no lower-level test caught, add the missing lower-level test; then remove
higher-level tests that only repeat lower-level coverage. That push-down habit is what keeps the shape over
time, not a one-off ratio. Software Engineering at Google reports Google aims for roughly 80 percent
narrow unit tests, 15 percent integration tests, and 5 percent end-to-end tests, and names the unhealthy
inverted shape the "ice cream cone." The full operational rules are in `references/test-pyramid-and-types.md`.

## The workflow

### Step 1: Design the test mix for the change (the pyramid)

Read `references/test-pyramid-and-types.md`. Decide the right proportion:

- **Unit tests** (most numerous): pure logic, fast, no I/O, one behavior each. A "unit" has no single agreed
  definition; Fowler notes the team decides what a unit is, and distinguishes solitary unit tests (collaborators
  replaced by test doubles) from sociable ones (real collaborators). Google's equivalent is the "small" test:
  it "runs in a single process" and is not "allowed to sleep, perform I/O operations, or make any other
  blocking calls."
- **Integration tests** (fewer): real seams such as the database, cache, queue, and the actual framework
  wiring. Google's "medium" test may span processes but is "not allowed to make network calls to any system
  other than localhost." Use real dependencies where you can: Testcontainers provides "throwaway, lightweight
  instances of databases" or "just about anything that can run in a Docker container," so an integration test
  runs against the real thing and cleans up after itself.
- **End-to-end and BDD tests** (fewest): critical user journeys through the whole system. These are the Gherkin
  scenarios from `bdd-comprehensive-testing`; do not rewrite them here.

Add the specialized layers below based on what the change touches. Not every change needs every layer, but
actively decide, do not default to "a couple of unit tests."

### Step 2: If the change crosses a service boundary, add contract testing

Read `references/contract-testing.md`. When a service calls another service (or a frontend calls an API), add
consumer-driven contract tests. Ian Robinson's pattern is that "provider contracts emerge to meet consumer
expectations and demands," so the consumers' expectations drive what the provider must keep honoring. Fowler's
contract tests "check that all the calls against your test doubles return the same results as a call to the
external service would," which catches a provider change before it breaks a consumer, and keeps your test
doubles faithful. Pact is a "code-first consumer-driven contract testing tool" where "the contract is generated
during the execution of the automated consumer tests" (contract by example). This is how large orgs let
independent teams deploy without a full integrated environment. Ties to `release-deployment-safety`
backward-compatibility.

### Step 3: If the change is on a hot path or has scale requirements, add performance testing

Read `references/load-and-performance-testing.md`. Add:
- **Load test:** expected traffic; confirm the SLO latency and throughput hold.
- **Stress test:** beyond expected, to find the breaking point and confirm it fails gracefully.
- **Soak test:** sustained load over hours to catch leaks and slow degradation.
- **Spike test:** a sudden surge, to validate autoscaling and backpressure.

k6 is "an open-source, developer-friendly, and extensible performance testing tool" that "integrates
seamlessly with CI/CD" and is built for high-load tests such as spike, stress, and soak. Establish a baseline
and run performance tests in CI (or nightly) to catch regressions. Feed results into capacity planning
(`sre-operational-readiness` if present).

### Step 4: If the system has real availability requirements, add chaos and resilience testing

Read `references/chaos-engineering.md`. Chaos engineering is, in the Principles of Chaos Engineering,
"the discipline of experimenting on a system in order to build confidence in the system's capability to
withstand turbulent conditions in production." Deliberately inject failure (kill an instance, add latency,
sever a dependency, exhaust a resource) and verify the system degrades gracefully and recovers, which
validates the resilience patterns (timeouts, retries, circuit breakers, fallbacks) from
`enterprise-architecture-standards`. Follow the five principles: build a hypothesis around steady-state
behavior, vary real-world events, run experiments in production, automate experiments to run continuously, and
minimize the blast radius. Start small, in staging, with a hypothesis and a blast-radius limit.

### Step 5: Enforce quality gates so the suite stays trustworthy

Read `references/quality-gates-and-flaky-tests.md`. Configure CI to:
- Enforce a **coverage threshold** on changed code, but do not treat coverage as the quality bar. Coverage is
  necessary, not sufficient: it finds untested code, but it is not a good measure of whether the tests detect
  faults (see the evidence and `verifiable-quality-gates`). Do not make a coverage percentage the target.
- Consider **mutation testing** on critical modules to check that tests actually assert, not just execute. A
  mutation tool seeds small faults and measures how many the tests kill; `verifiable-quality-gates` applies the
  same idea to the gates themselves.
- Use **property-based testing** for logic with large input spaces (parsers, serializers, math, invariants). In
  the QuickCheck model, you state a property as a function and the tool tests it "on random input," finding edge
  cases you would not hand-pick.
- **Quarantine and fix flaky tests.** Fowler warns that "left uncontrolled, non-deterministic tests can
  completely destroy the value of an automated regression suite," and the fix is to "place any non-deterministic
  test in a quarantined area" and then fix it quickly. A flaky suite that people re-run until green is worse than
  no suite, because it trains the team to ignore failures.
- **Enforce the pyramid shape mechanically:** run `scripts/check-test-shape.mjs --report <junit.xml> --config
  <test-shape.json>` in CI. It classifies each test into a layer and fails when the suite drifts off the pyramid
  (unit base below its floor, e2e share above its cap, the unit >= integration >= e2e order inverted, or a
  layer's runtime over budget), so the ice cream cone cannot creep in unnoticed.

### Step 6: Schedule exploratory testing (the human layer)

Read `references/exploratory-testing.md`. Automated tests only check what you thought to specify; schedule
regular, time-boxed exploratory sessions with a destructive mindset to find what automation misses: usability
snags, confusing errors, slow responses, design issues. Turn every reproducible finding into an automated test
at the lowest layer that proves it (push it down), and treat an escaped defect as a missing lower-level test,
not just a bug to patch. This complements the pyramid; it never replaces it.

### Step 7: Wire everything into CI/CD (shared with bdd-comprehensive-testing)

The pipeline runs the pyramid on every PR (fast tests first, fail fast), contract tests on change, and heavier
load and chaos suites on a schedule or pre-release gate. Order stages by speed and scope, not by test type:
fast narrow integration tests can share the unit stage; what matters is that feedback arrives in minutes. Reuse
the CI setup from `bdd-comprehensive-testing`'s `ci-cd-wiring` rather than building a parallel one. Every test
type publishes a readable report; the build fails on real failures and blocks merge.

### Step 8: Confirm the strategy before calling it done

- [ ] Logic covered by unit tests at the lowest useful level.
- [ ] Seams (DB, queue, external) covered by integration tests against real dependencies where practical.
- [ ] Critical journeys covered by BDD or e2e (from the BDD skill).
- [ ] Cross-service boundaries covered by contract tests (if applicable).
- [ ] Performance validated against SLOs (if hot path or scale requirement).
- [ ] Resilience validated by fault injection (if availability matters).
- [ ] Each behavior tested at the lowest layer that proves it; redundant higher-level tests deleted.
- [ ] Exploratory session run on a cadence; findings turned into lower-level automated tests.
- [ ] Coverage gate passes; no known flaky tests left unquarantined.
- [ ] All of it runs in CI and blocks merge on failure.

## Mechanical gate

This skill ships `scripts/check-test-shape.mjs`: a dependency-free gate that reads a JUnit test report,
classifies each test into a layer by configured globs or class-name substrings, and fails when the suite
drifts off the pyramid (a layer below its floor or above its cap, the unit >= integration >= e2e order
inverted, too many unclassified tests, or a layer over its time budget). It fails closed and ships with a
discriminating test (`test/test-shape.test.mjs`) per `verifiable-quality-gates`. The honest limit: it enforces
the shape of the suite you have; it cannot tell you the tests assert the right things. That stays a matter of
mutation testing and review.

## Before you call it done

Report the strategy as the change's **evidence ledger**: for each layer, the claim (covered or not), its
evidence state, the re-runnable source (the test run, the report, the gate result), and the stated gap. No
layer is marked covered on assumption, and no suite is called trustworthy without the coverage and
shape gates green and the flaky list empty.

## Reference files

| Topic | File |
|---|---|
| Test pyramid, solitary and sociable units, narrow and broad integration, subcutaneous, test doubles, the push-down rules | `references/test-pyramid-and-types.md` |
| Consumer-driven contract testing (Pact), provider verification, keeping third-party fakes faithful | `references/contract-testing.md` |
| Load, stress, soak, spike testing, baselines, tooling, CI performance gates | `references/load-and-performance-testing.md` |
| Chaos engineering, fault injection, game days, resilience validation | `references/chaos-engineering.md` |
| Coverage, mutation, and property-based testing, flaky-test management, CI gates | `references/quality-gates-and-flaky-tests.md` |
| Test code quality: DAMP vs DRY, Rule of Three, one behavior per test, deleting redundant tests | `references/test-code-quality.md` |
| Exploratory and manual testing, destructive mindset, findings to automated regressions | `references/exploratory-testing.md` |
| Mechanical gate: test-pyramid-shape enforcement from a JUnit report | `scripts/check-test-shape.mjs` |

## Evidence & skeptical assessment (required)

Every "this is covered / the suite is trustworthy" statement is a factual claim, so it follows the repo's
evidence discipline (canonical contract:
[`skeptical-audit/references/evidence-discipline.md`](../skeptical-audit/references/evidence-discipline.md)).
The test strategy for a change is its **evidence ledger**: each layer is a claim with a state and a re-runnable
source, never a bare assertion.

| Claim | Reaches `observed` by | Becomes `proven` when |
|---|---|---|
| "The logic is tested at the lowest level" | the unit tests run and pass, shown in the report | `check-test-shape` holds the unit base at or above its floor on every PR |
| "The suite keeps its pyramid shape" | the shape report shows the current layer proportions | `check-test-shape` is a blocking CI gate with a discriminating test |
| "A provider cannot break this consumer silently" | the contract test runs and fails on a mismatch in a fixture | the contract test runs in both the consumer and provider pipelines |
| "The tests actually assert, not just execute" | a mutation run shows surviving mutants being killed | a mutation gate blocks merge on critical modules (see `verifiable-quality-gates`) |
| "There are no flaky tests being ignored" | the quarantine list is empty and the suite is green on reruns | re-run stability is tracked and a flaky test is quarantined automatically |

**Definition of done:** the ledger covers every layer the change needs with a verdict and a re-runnable source;
coverage is treated as necessary-not-sufficient, never as the target; the shape gate is green; the flaky list is
empty; and specialized layers (contract, load, chaos) are present where the change calls for them. Coverage
reaching a number is never by itself a pass.

## Why this holds for every developer and every agent

It binds everyone because the gates and reports live in CI and git, not memory. Agents get the discipline
through the always-on hook, which lists this skill in `always-on/enterprise-skills-always-on.md`. People and
agents alike are held by `check-test-shape` (a blocking gate that fails an inverted suite) and by the coverage
and mutation gates. It survives any one person because the config, the reports, and the gate all live in the
repo. The honest limit: the shape gate proves the suite's shape, not that each test asserts the right thing;
that is why mutation testing (`verifiable-quality-gates`) and exploratory testing sit alongside it, and why an
escaped defect is treated as a missing lower-level test.

## Sources and attribution

- Ham Vocke, "The Practical Test Pyramid," martinfowler.com, 26 February 2018
  (<https://martinfowler.com/articles/practical-test-pyramid.html>): test granularity, "the more high-level you
  get the fewer tests you should have," the push-down rule, and deleting higher-level tests that only repeat
  lower-level coverage. `[documented]`
- Martin Fowler, "TestPyramid," martinfowler.com, 1 May 2012 (<https://martinfowler.com/bliki/TestPyramid.html>):
  the pyramid's origin, credited to Mike Cohn, *Succeeding with Agile* (2009), and "many more low-level
  UnitTests than high level BroadStackTests." `[documented]`
- Adam Bender et al., "Testing Overview" (Chapter 11), *Software Engineering at Google*, O'Reilly, 2020
  (<https://abseil.io/resources/swe-book/html/ch11.html>): test sizes (small, medium, large), the roughly
  80/15/5 unit/integration/end-to-end mix, and the "ice cream cone" anti-pattern. `[documented]`
- Martin Fowler, "Mocks Aren't Stubs," martinfowler.com, 2 January 2007
  (<https://martinfowler.com/articles/mocksArentStubs.html>): the test-double taxonomy (dummy, fake, stub, spy,
  mock), the credit to Gerard Meszaros for the generic term "Test Double," and classical vs mockist testing.
  `[documented]`
- Martin Fowler, "UnitTest," martinfowler.com, 2014 (<https://martinfowler.com/bliki/UnitTest.html>): "unit" has
  no single definition, and the solitary vs sociable distinction. `[documented]`
- Ian Robinson, "Consumer-Driven Contracts: A Service Evolution Pattern," martinfowler.com, 12 June 2006
  (<https://martinfowler.com/articles/consumerDrivenContracts.html>): provider contracts derived from consumer
  expectations. `[documented]`
- Martin Fowler, "ContractTest," martinfowler.com, 12 January 2011 (<https://martinfowler.com/bliki/ContractTest.html>):
  contract tests confirm calls against test doubles return what the real service would. `[documented]`
- Pact documentation (<https://docs.pact.io/>): a code-first consumer-driven contract testing tool where the
  contract is generated during the consumer tests (contract by example). `[documented]`
- Testcontainers (<https://testcontainers.com/>): throwaway, lightweight instances of real databases and
  services in Docker for integration tests. `[documented]`
- Grafana k6 documentation (<https://grafana.com/docs/k6/latest/>): an open-source performance-testing tool that
  integrates with CI/CD, for high-load tests such as spike, stress, and soak. `[documented]`
- Principles of Chaos Engineering, revised March 2019 (<https://principlesofchaos.org/>): the definition of
  chaos engineering and the five advanced principles. `[documented]`
- Qingzhou Luo, Farah Hariri, Lamyaa Eloussi, Darko Marinov, "An Empirical Analysis of Flaky Tests," FSE 2014
  (<https://mir.cs.illinois.edu/lamyaa/publications/fse14.pdf>): an empirical study of 201 flaky-test-fixing
  commits across 51 open-source projects and a taxonomy of the common root causes. `[documented]`
- Martin Fowler, "Eradicating Non-Determinism in Tests," martinfowler.com, 14 April 2011
  (<https://martinfowler.com/articles/nonDeterminism.html>): non-deterministic tests destroy the value of the
  suite; quarantine then fix; the common causes. `[documented]`
- Koen Claessen and John Hughes, "QuickCheck: A Lightweight Tool for Random Testing of Haskell Programs," ICFP
  2000 (<https://www.cs.tufts.edu/~nr/cs257/archive/john-hughes/quick.pdf>): property-based testing, where a
  property is stated as a function and checked on random input. `[documented]`
