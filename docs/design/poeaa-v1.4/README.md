# PoEAA v1.4: behavioral spec for the pattern-skill upgrade

The behavioral specification for the v1.4 release's PoEAA work: making the pattern skills agree with
Fowler's *Patterns of Enterprise Application Architecture*, cover its catalog, and prove their citations
and their patterns. It answers the findings in
[`docs/audit/poeaa-2026-11/`](../../audit/poeaa-2026-11/poeaa-adversarial-audit.md). The decision to make
this the v1.4 scope is ADR-0103.

## Status: specified, not built

Nothing here is built yet. The scenarios describe the result each fix must produce. They live under
`docs/design/` rather than the top-level gated `features/` directory, because the repo's BDD gates require
every scenario in `features/` to run and pass, and these describe code that does not exist yet. This
follows the same rule as `docs/design/bootstrap-v2/`: a scenario graduates into `features/`, with real
step definitions, in the pull request that builds it.

## Two kinds of scenario, on purpose

- **`features/*.feature`: system scenarios.** Each is written to bind to a real pass or fail: a gate's
  exit code, a field in a catalog entry, a row in the chooser, arch-gate's output on a fixture. These
  become gated tests. Where a Then still states intent rather than an exact string (some WP4 to WP8
  scenarios, written before the entries exist), spec section 4 requires it to name an exact anchor string
  before it graduates; `existing-entries.feature` and `citation-gate.feature` already do.
- **`evals/agent-choice.feature`: agent-behavior evals.** Whether an agent picks the right pattern is
  probabilistic, so these are scored by running each prompt in a fresh agent session and grading the
  decision record it writes. They are tagged `@eval` and never move into `features/`.

Both folders pass `check-gherkin-valid.mjs` and `check-bdd-tags.mjs` today (each has its own
`bdd-config.json` with the same audiences as the top-level `features/`, so a graduated file keeps valid
tags).

## The files

| File | Work package | Findings | Cases |
|---|---|---|---|
| `spec.md` | all | all | the requirements, outcomes, order, and risks |
| `features/citation-gate.feature` | WP2 | F1, F2 | 11 scenarios, 5 outlines (25 rows) |
| `features/existing-entries.feature` | WP3 | F2, F3, F5, F9, F10, F11, F17, F18, F19, F20 | 13 scenarios |
| `features/domain-logic-and-data-source.feature` | WP4 | F4, F13 | 4 scenarios, 1 outline (6 rows) |
| `features/concurrency-and-session.feature` | WP5 | F5, F12 | 5 scenarios, 1 outline (7 rows) |
| `features/distribution-and-base.feature` | WP6 | F6, F15, F20 | 7 scenarios, 1 outline (9 rows) |
| `features/object-relational-mapping.feature` | WP7 | F14 | 2 scenarios, 2 outlines (14 rows) |
| `features/web-presentation.feature` | WP8 | F16 | 2 scenarios, 1 outline (6 rows) |
| `features/prove-it-kit.feature` | WP9 | F7 | 6 scenarios, 3 outlines (17 rows) |
| `features/chooser-routing.feature` | WP3 to WP7, row by row | F8 | 2 scenarios, 1 outline (12 rows) |
| `features/pattern-decision-record.feature` | WP2, WP3 (most), WP9 | I1, I2, I3, D1 | 11 scenarios, 4 outlines (19 rows) |
| `evals/agent-choice.feature` | measured after each WP | F1 to F6, F9, F11, F12, F15, F20 | 11 evals |

Totals: 63 scenarios plus 115 outline rows, so 178 system test cases, and 11 agent-behavior evals.

## How to read a scenario

Each one is written so a person can check it without the code:

- **Given** sets up the condition (which entry, which file, which input).
- **When** is the event (the gate runs, the agent reads a field).
- **Then** is the expected result, stated so it is plainly true or false.

The line under each scenario's title names the audit finding and quotes the book where the scenario
rests on a book fact, with the PDF page it was read on.
