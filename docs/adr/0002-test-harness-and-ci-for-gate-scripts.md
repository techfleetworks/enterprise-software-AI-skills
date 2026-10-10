---
status: "accepted"
date: 2026-10-10
decision-makers: mdenner
---

# Dependency-free Node test harness and CI to gate the enforcement scripts

## Context and Problem Statement

The repo's mechanical gate scripts (`judge-arch/scripts/arch-gate.mjs`,
`skeptical-audit/scripts/claim-lint.mjs`, `verifiable-quality-gates/scripts/*.mjs`) are the
enforcement engines every skill's guarantees lean on, yet they shipped with no tests and no CI.
Real defects reached `main` undetected as a result — a `--strict` flag that did nothing, a ReDoS in
the `emptyCatch` scanner, and a NUL byte in a source file. How should the repo prove these scripts
work and keep them working, without contradicting its own dependency-free, vendor-neutral posture?

## Decision Drivers

* The scripts are advertised as dependency-free and runnable anywhere Node 18+ is — the test setup must not undermine that.
* The repo's own `verifiable-quality-gates` skill requires discriminating tests: a test must fail when its check is neutralized.
* Tests must run identically in CI and locally, on the lower Node bound and the current release, on any shell.
* Minimize new surface: no test framework, no transpile step, no dependency tree to maintain.

## Considered Options

* Node's built-in test runner (`node:test` / `node:assert`) with an explicit test-file list, run in GitHub Actions.
* A third-party runner (Vitest or Jest) with its config and dependencies.
* No automated tests; rely on manual verification and code review.

## Decision Outcome

Chosen option: "Node's built-in test runner with an explicit test-file list", because it adds zero
runtime dependencies (honoring the dependency-free posture), produces the discriminating tests the
`verifiable-quality-gates` skill demands, and runs the same on every Node 20+ and shell. A root
`package.json` is added at version `0.1.0` — the repo's first version marker — exposing `npm test`;
a `tests` workflow runs it on Node 20 and 24.

### Consequences

* Good, because the enforcement engines now have discriminating tests that fail if a fix is reverted, and those tests block merges via CI.
* Good, because no third-party dependency or build step is introduced; the repo stays clone-and-run.
* Bad, because the test command must list test files explicitly — bare `node --test` auto-discovery also matches `*-test.mjs` and would run `check-has-test.mjs` (a CLI script) as a failing test, and a positional glob needs Node 21+ which breaks the Node 20 leg. A new test file has to be added to the list by hand.
* Neutral, because `package.json` at `0.1.0` establishes versioning; the major-overhaul release (`1.0.0`) is recorded as its own decision.

### Confirmation

The `tests` CI workflow (`.github/workflows/test.yml`) runs `npm test` on every PR and push to
`main`. `test/arch-gate.test.mjs` and `test/claim-lint.test.mjs` exercise the real scripts and
assert the specific defects stay fixed — the ReDoS probe must complete well under a second, and
`--strict` must change the exit code.

## More Information

A later gate (planned) will assert that every `test/*.test.mjs` file is wired into the `npm test`
list, closing the "forgot to register a new test" gap the explicit list leaves open.
