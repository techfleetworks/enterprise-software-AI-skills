# Feature-file layout, the centralized datastore, and CI/CD wiring

Scenarios are the project's single authoritative specification of how the system behaves. "Stored
permanently" means **committed into the project's own version-controlled repo** — the same repo whose
code is being pushed — so a new developer inherits the full behavioral contract by cloning. This is
the Specification by Example / living-documentation model (Gojko Adzic, 2011):
concrete examples become a single, automatically-validated source of truth shared by business, dev,
and test — <https://en.wikipedia.org/wiki/Specification_by_example> `[documented]`, retrieved
2026-10-10.

## The `features/` layout

- All `.feature` files live under one top-level `features/` directory (or the stack's idiomatic
  equivalent, e.g. `tests/features/`), organized by domain: `features/<domain>/<feature>.feature`.
- **One feature file per cohesive feature.** `kebab-case-feature-name.feature`.
- **One home per feature — additive across skills.** Security (`@security`), release-safety
  (`@release-safety`), reliability (`@reliability`), and compliance (`@compliance`) scenarios are
  **added to the same feature file**, not scattered into parallel files. The OWASP,
  release-deployment-safety, SRE, and compliance skills append their tagged scenarios here.
- On change a feature file is **updated, never discarded**, so the contract stays current and its
  history stays in git.

```
features/
  payments/refund.feature
  auth/login.feature
  bdd-index.json        # canonical, machine-readable datastore (generated)
  INDEX.md              # human-readable view (generated)
  bdd-coverage-log.md   # append-only history of receipts
```

## The centralized datastore — `bdd-index.json` (+ `INDEX.md`)

One central, committed registry of every scenario any developer can open to see the whole picture.
`features/bdd-index.json` is canonical and machine-readable; `features/INDEX.md` is the human view.
**Both are GENERATED from the `.feature` files, not hand-maintained** — the feature files stay the
single source of truth for scenario content, and the datastore is the derived registry over them. This
avoids a second, drifting copy (two owners of the same fact always disagree eventually). It is
regenerated on change and committed, and `check-bdd-coverage` fails the build if it is missing, stale,
or out of sync (regenerate → diff → fail on drift).

Fields recorded per scenario:

| Field | Value |
|---|---|
| definition/purpose | one-line description of the behavior |
| feature file + scenario name | locator |
| `audience` | from `@audience:` (∈ the repo's declared audience list) |
| `usecase` | from `@usecase:` (feature-specific slug) |
| `category` | from `@category:` (behavior class vocab) |
| `quality` | from `@quality:` (quality-dimension vocab) |
| `severity` | from `@severity:` (`critical · high · medium · low`) |
| `domain` | **derived from the file path** `features/<domain>/...`, not a tag |
| coverage status | `covered` · `N/A:<reason>` · `pending` |

Live pass/fail for a run is linked from the CI report, not duplicated into the datastore.

## The append-only coverage log — `bdd-coverage-log.md`

The datastore answers "what is covered now"; the log answers "how did we get here, and what proved it
then." `features/bdd-coverage-log.md` is an **append-only** history of receipts. Each entry records:

| Field | Value |
|---|---|
| `date` | ISO date |
| `change` | commit SHA / PR ref |
| `event` | `added · updated · removed · reinstated · waived · verified` |
| `scenario` | scenario name(s) touched + their full taxonomy tags |
| `gate` | the proving run's result (pass + the check names) — the receipt |

**Entries are only ever appended; past entries are never edited or deleted.** The log is
tamper-evident — `check-bdd-coverage` rejects any edit to a prior entry (the committed log must be a
clean append onto the base revision; git history is the backing record).

## The shared semantic taxonomy (self-contained restatement)

Every scenario and every log entry is classified on the same controlled dimensions. Agents draw from
this vocabulary — they do not invent categories — and `check-bdd-tags` rejects anything off it.

| Dimension | Tag | Allowed values |
|---|---|---|
| Audience | `@audience:` | the repo's declared audience list (anonymous, authenticated, admin, api-consumer, internal, partner, assistive-tech, + domain roles) |
| Use case | `@usecase:` | a feature-specific slug, e.g. `refund-failure` |
| Behavior class | `@category:` | `happy · edge · error · boundary · negative · adverse · concurrency · permission · empty-overflow · timeout` |
| Quality dimension | `@quality:` | `functional · security · reliability · release-safety · compliance · performance · accessibility` |
| Severity | `@severity:` | `critical · high · medium · low` |

*Domain* (`auth`, `payments`, `profile`, …) is **derived from the feature file's location**
(`features/<domain>/<feature>.feature`), never a separate tag, so it can never drift from where the
file actually lives.

<a id="ci-cd-wiring"></a>

## CI/CD wiring

This is the single pipeline every behavioral scenario plugs into — `@security`, `@release-safety`,
`@reliability`, `@compliance`, and contract/load tests all run here, not in parallel setups. Other
skills do not build their own pipeline; they add scenarios to the feature files and rely on this
wiring.

- **Runs on every PR and push, blocking.** The BDD suite executes on every pull request and every
  push to a protected branch. A failing scenario fails the build and blocks merge — no override
  without an explicit, recorded waiver.
- **Pre-push gate too.** A pre-push hook runs the suite (or the affected subset) locally so breaks are
  caught before they reach CI; CI remains the authoritative, un-skippable gate.
- **Tagged subsets.** Tags let the pipeline run focused subsets where useful (`@smoke` on every
  commit, `@security` in the security job, the full suite before release) while the complete suite
  gates merges.
- **Readable reports.** Each run publishes a human-readable report (scenario names + pass/fail) so a
  failure names the broken behavior, not just a stack trace.
- **One pipeline, many producers.** The gates (`check-gherkin-valid`, `check-bdd-tags`,
  `check-bdd-coverage`, the strict runner — see `bdd-gates.md`) run here as required checks.

## Source (retrieved 2026-10-10)

- **Specification by Example / living documentation** (scenarios as the committed source of truth):
  Gojko Adzic, 2011 — <https://en.wikipedia.org/wiki/Specification_by_example> `[documented]`.
