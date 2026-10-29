---
status: "accepted"
date: 2026-10-28
decision-makers: mdenner
---

# Executable BDD harness, and a build-comparison that can actually fail

## Context and Problem Statement

Issue #178 (one of ten from an agent-session audit) has two needs. First, every one of the ten issues requires
"step definitions that make the attached scenarios runnable, wired into `check-bdd-executed`." The repo had the BDD
validation gates (`check-gherkin-valid`, `check-bdd-tags`, `check-bdd-coverage`) and the reconciler
(`check-bdd-executed`, which reads a Cucumber JSON report), but nothing that actually EXECUTES the scenarios to
produce that report: there was no `features/` directory and no runner, only the `@cucumber/gherkin` parser as a
devDependency. So the scenarios could be validated and parsed but never run, which is exactly the "a test exists but
does not run" gap `verifiable-quality-gates` targets.

Second, #178 itself is about build comparisons. In the audited session an agent reported "0 new failures, CLEAN"
from a comparison that read an `ok`/`passed` status field no gate record had, so a new failure could never be found;
and a gate failing in both builds got worse (420 to 430 problems) under a pass-or-fail comparison that could not
see it. The skills had no text on comparing a change against a base build.

The executable runner is shared machinery for all ten issues, so the choice of runner is an architectural decision
worth recording, and #178 is the first issue that needs it.

## Considered Options

- **Add `@cucumber/cucumber` (the full runner) as a devDependency.** The standard tool; it executes step
  definitions and emits Cucumber JSON directly.
- **Write a small, dependency-free step runner over the already-present `@cucumber/gherkin` parser**, emitting the
  same Cucumber JSON interchange format `check-bdd-executed` already consumes.
- **Do not run the scenarios; ship them as validated `.feature` files only** and prove the behaviors with ordinary
  `node:test` files instead.

## Decision

1. **Executable BDD harness, built dependency-free (`bdd-run.mjs`).** Add
   `.claude/skills/bdd-comprehensive-testing/scripts/bdd-run.mjs`: it reuses the repo's existing Gherkin parser to
   get the AST, runs the step definitions, and writes the standard Cucumber JSON that `check-bdd-executed`
   reconciles. This matches the repo's pervasive, deliberate stance (every gate is a dependency-free Node script;
   the BDD gates use the parser as the oracle rather than pulling the full runner and its dependency tree, which the
   repo actively keeps lean for its dependency-advisory posture). Because the output is the standard interchange
   format, the choice is swappable later for `@cucumber/cucumber` behind that one contract with no change to the
   reconciler. A real `features/` tree is added (`features/bdd-config.json`, the first feature under
   `features/evidence/`, the generated `bdd-index.json` and `INDEX.md`, the append-only `bdd-coverage-log.md`, and
   step definitions under `features/steps/`). A new CI `bdd` job runs the validation gates and then runs the
   scenarios and reconciles them, and it is added to the branch-protection ruleset as a required check.

   The third option (do not run them) is rejected: the audit's whole finding is that work was claimed runnable but
   was not, so shipping scenarios that never execute would repeat the sin. The first option (add the full runner) is
   rejected as the heavier, less in-idiom path for a repo that is deliberately dependency-light; the honest limit of
   building our own is that `bdd-run.mjs` supports only the Gherkin subset these features use (Feature, Rule,
   Background, Scenario, Given/When/Then/And/But, tags) and fails closed, naming the file, on a Scenario Outline,
   data table, or doc string. If the suite ever needs those, swap in `@cucumber/cucumber` behind the same contract.

2. **Build-comparison rigor in `verifiable-quality-gates`.** Add the reference script
   `scripts/compare-gate-runs.mjs` and a new skill section with two rules: compare only on fields proven present (a
   missing field is an error that names the field and prints no count, never an empty status read as "no change");
   and for gates red in both builds, compare per-case results or problem counts, where any increase is a new failure
   until explained or fixed, which requires gate records that keep more than the last output line. A both-red gate
   with no comparable count is reported UNVERIFIABLE and blocks a clean verdict. The claim rule: a "0 new failures"
   or "clean" claim may only cite a run that was able to find a failure, with its command, exit code, and output
   hash.

Both new scripts ship with discriminating tests (`test/compare-gate-runs.test.mjs`, `test/bdd-run.test.mjs`): a
no-op that always exits 0 flips their "must be non-zero" cases from pass to fail.

## Consequences

* The ten issues now have a real place to land executable scenarios: each later PR adds its feature file and step
  definitions onto this harness, and the CI `bdd` job proves they ran and passed. `features/bdd-config.json`
  declares audiences incrementally (just `agent` now), growing as issues that introduce `operator` and `subagent`
  scenarios land, so every merge stays coverage-green.
* A "no new failures" claim can no longer come from a comparison that could not find one: a missing field is a hard
  error, and worsening inside a gate that is red in both builds is surfaced instead of hiding under a boolean.
* Honest limits: `bdd-run.mjs` is a Gherkin subset runner (named above), not a full Cucumber; it fails closed on an
  unsupported construct rather than passing it silently. `compare-gate-runs.mjs` proves a gate did not newly fail or
  get worse on the records it was given; it cannot prove the base run was complete or that a count counts the right
  things. The CI `bdd` job is added to the committed ruleset; it becomes merge-blocking live only when the ruleset
  is next applied (`scripts/apply-ruleset.sh`), which stays an admin action.
* The dependency posture is unchanged: no new runtime or dev dependency is added; `bdd-run.mjs` uses Node built-ins
  plus the Gherkin parser the repo already had.
