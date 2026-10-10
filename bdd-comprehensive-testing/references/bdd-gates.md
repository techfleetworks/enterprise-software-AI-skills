# The BDD gate suite — what each enforces, fail-closed, each proven

These gates turn "write BDD for everything" from advice into cannot-merge-without-it. Each runs in the
same CI wiring as a **required** check (plus the pre-push hook), each **fails closed**, and each ships
a **discriminating test** per `verifiable-quality-gates` (see
`verifiable-quality-gates/references/check-test-patterns.md`): feed it the real violation → it goes
red; feed valid input → green; no-op the check → its test fails.

## `check-gherkin-valid` — the official parser is the oracle

Runs every `.feature` file through the same parser Cucumber uses (`@cucumber/gherkin`, or the stack's
binding of it). "Syntactically valid Gherkin" is **defined as what that parser accepts**, so there is
nothing to be wrong about: legal syntax always parses (no false positive), illegal syntax cannot (no
false negative). A parse error fails the build **with the file and line**. The parser settles
*syntax* only; a wrong-but-valid keyword choice or weak structure is a semantic/style matter the tag
layer (and an optional Gherkin style-lint) cover — not the parser.

```
# ❌ fails check-gherkin-valid — malformed: Then with no step text, misnested
Scenario: refund
  Given a customer
  Then
# ✅ parses — legal keywords, well-formed steps
Scenario: refund
  Given a customer
  Then the refund is accepted
```

Discriminating test: feed malformed Gherkin → non-zero; feed the real project → zero.

## The strict runner — undefined/pending steps FAIL

A scenario that parses but has no matching step definition is not coverage. The suite runs in strict
mode so an undefined/pending step is a hard failure, per framework (see `gherkin-and-frameworks.md`):
cucumber-js is strict by default `[documented]`; Behave treats `undefined`/`pending` as errors
`[documented]`; pytest-bdd raises `StepDefinitionNotFoundError` `[documented]`;
SpecFlow/Reqnroll, Cucumber-JVM, and godog have equivalents — confirm the exact setting for your
version `[inferred]`. The strict run is itself a required CI check.

## `check-bdd-tags` — every scenario fully tagged, every value in-vocabulary

Asserts every scenario carries the full taxonomy and that each value is in-vocabulary. A missing,
typo'd, or invented tag fails the build — so the matrix, datastore, and log can't be fooled by a tag
that merely looks valid.

- `@audience:` ∈ the repo's declared audience list.
- `@usecase:` present (a feature-specific slug).
- `@category:` ∈ {`happy`, `edge`, `error`, `boundary`, `negative`, `adverse`, `concurrency`,
  `permission`, `empty-overflow`, `timeout`}.
- `@quality:` ∈ {`functional`, `security`, `reliability`, `release-safety`, `compliance`,
  `performance`, `accessibility`}.
- `@severity:` ∈ {`critical`, `high`, `medium`, `low`}.

```
# ❌ fails check-bdd-tags — @category:race is off-vocabulary; no @severity
@audience:customer @usecase:refund-double @category:race
Scenario: double-submitted refund
# ✅ passes — full taxonomy, every value in-vocabulary
@audience:customer @usecase:refund-double @category:concurrency @quality:reliability @severity:critical
Scenario: double-submitted refund
```

Discriminating test: feed an off-vocabulary/missing tag → non-zero; feed a fully-tagged scenario → zero.

## `check-bdd-coverage` — the matrix, datastore, and log, fail-closed

Ships the proof of completeness. For the changed surface it **fails closed** when:

1. a changed behavior has **no corresponding scenario**;
2. a feature has **only happy-path scenarios** (no non-happy path for it);
3. a **declared audience** for that feature has **no scenario** tagged for it;
4. a scenario is **missing** its `@audience:` / `@usecase:` / `@severity:` tags;
5. the centralized datastore (`features/bdd-index.json` + `features/INDEX.md`) is **missing or out of
   sync** with the `.feature` files — regenerate → diff → fail on drift, so the shared source of truth
   can never silently fall behind;
6. a behavioral change ships with **no new entry appended** to `features/bdd-coverage-log.md`;
7. the committed log is **not a clean append** — a prior entry was edited or removed (history must be
   immutable; the gate compares against the base revision).

The datastore is **generated from the parser's AST**, so it can only ever contain scenarios the parser
accepted — malformed Gherkin fails `check-gherkin-valid` before it could reach the index. Give the
check a faithful fixture and a discriminating test (no-op the check → its test fails) so the coverage
gate itself can't rot.

## `check-bdd-executed` — the suite actually ran, not just the files

The checks above prove the *specification* is complete, legal, and categorized; they do **not** prove
the scenarios were executed. `check-bdd-executed` closes that gap: the strict BDD runner executes the
scenarios against the real system and emits a machine-readable report (Cucumber JSON), and this gate
reconciles the report against the datastore — it **fails closed unless every scenario in
`features/bdd-index.json` executed and passed, with zero undefined / pending / skipped / failed**.

```bash
# run the suite with a JSON report, then reconcile it against the datastore
cucumber-js --strict --format json:reports/cucumber.json
node scripts/check-bdd-executed.mjs features --results reports/cucumber.json
```

A misconfigured job that runs zero scenarios, or silently skips some, fails the build instead of going
green — the vacuous-green failure mode this repo exists to prevent. `[documented]` Cucumber JSON is
emitted by cucumber-js, behave (`-f json`), Cucumber-JVM and others; confirm your runner's flag. Ships
with a discriminating test (a report with a missing / failed / undefined scenario → it must go red).

## Where these run

All of the above run in the same CI wiring (see `storage-and-ci-wiring.md#ci-cd-wiring`) as
**required** checks made required via branch protection, plus the pre-push hook — so the only Gherkin
that can reach `main` is Gherkin the official parser, the strict runner, and the tag vocabulary all
accept. The author never decides what is legal; the parser does.

## Honest limitations (stated, not hidden)

- **The parser settles syntax only.** `check-gherkin-valid` guarantees *syntactic* legality;
  semantic/style quality (sensible keyword choice, meaningful structure) is the tag-vocabulary gate's
  job plus an optional style-lint — not the parser's. Do not overclaim.
- **Per-framework strict flags are `[documented]`, not re-run everywhere.** cucumber-js / Behave /
  pytest-bdd are documented above; SpecFlow/Reqnroll, Cucumber-JVM, and godog equivalents are
  `[inferred]` from the shared Cucumber strict model — confirm for your framework/version at adoption.
- **"Structurally impossible to fail" means impossible *silently, by accident, or by omission*.** A
  repo admin can still deliberately and visibly disable a required check or uninstall the hook; by
  construction that cannot happen quietly — the only path around the gate is explicit, attributed, and
  visible in git or the ruleset.

## Sources (retrieved 2026-10-10)

- **Gherkin reference** (what the parser oracle implements): <https://cucumber.io/docs/gherkin/reference/>
  `[documented]`.
- **Strict/undefined-step behavior:** cucumber-js — <https://github.com/cucumber/cucumber-js>;
  Behave — <https://behave.readthedocs.io/en/latest/appendix.status/>; pytest-bdd
  `StepDefinitionNotFoundError` `[documented]`.
