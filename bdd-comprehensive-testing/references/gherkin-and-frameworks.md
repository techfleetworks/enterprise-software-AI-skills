# Converting use cases to Gherkin and wiring the per-stack framework

Each non-N/A cell of the matrix (see `use-case-and-audience-matrix.md`) becomes one tagged Gherkin
scenario, run by the stack's BDD framework in strict mode so an unwired step fails. Gherkin keywords
and structure follow the official reference — <https://cucumber.io/docs/gherkin/reference/>
`[documented]`, retrieved 2026-10-10.

## Gherkin structure

- **`Feature:`** — one per cohesive feature, one file (`features/<domain>/<feature>.feature`).
- **`Rule:`** — groups scenarios that illustrate one business rule (optional but clarifying).
- **`Scenario:` / `Example:`** — one concrete case; `Example` is the synonym.
- **`Background:`** — steps common to every scenario in the feature; keep it short.
- **`Scenario Outline:` + `Examples:`** — one scenario run over a table of `<placeholder>` rows;
  ideal for boundary/negative sets.
- **`Given` / `When` / `Then` / `And` / `But`** — context / action / outcome, continued with
  `And`/`But`.
- **Tags** (`@...`) carry the taxonomy (see `storage-and-ci-wiring.md`).

```gherkin
Feature: Refund a completed order

  Background:
    Given the payments service is available

  Rule: Refunds are only allowed inside the refund window

    @audience:customer @usecase:refund-happy-path @category:happy @quality:functional @severity:high
    Scenario: Customer refunds an eligible order
      Given a signed-in customer with a completed, refund-eligible order
      When they request a full refund
      Then the refund is accepted and the order shows "Refunded"

    @audience:customer @usecase:refund-window @category:boundary @quality:functional @severity:high
    Scenario Outline: Refund eligibility at the window edge
      Given a signed-in customer whose order completed <days> days ago
      When they request a refund
      Then the request is <outcome>

      Examples:
        | days | outcome   |
        | 29   | accepted  |
        | 30   | accepted  |
        | 31   | rejected  |
```

**Keep steps behavioral, not implementation-coupled.** State the user-observable outcome, not the
mechanism.

```gherkin
# ❌ never — couples the scenario to implementation detail
Then the row in the `refunds` table has status_code = 2
And the Redis key "refund:lock:123" is deleted

# ✅ always — user-observable behavior
Then the refund is accepted and the order shows "Refunded"
And a second identical request is rejected as a duplicate
```

## Per-stack framework, where steps live, and how to run

Match the repo's existing runner if one is already present; do not introduce a second BDD runner.

| Stack | Framework | Step definitions live in | Run with |
|---|---|---|---|
| JS/TS | Cucumber.js (`@cucumber/cucumber`) | `features/step_definitions/*.js|ts` | `npx cucumber-js` |
| Python | pytest-bdd | `tests/step_defs/*.py` (`@scenario`) | `pytest` |
| Python | Behave | `features/steps/*.py` | `behave` |
| .NET | SpecFlow / Reqnroll | `*.cs` step classes beside features | `dotnet test` |
| JVM (Java/Kotlin) | Cucumber-JVM | `src/test/java/.../*Steps.java` glue | `mvn test` / `gradle test` |
| Go | godog | `*_test.go` step funcs in the suite | `go test` / `godog` |
| Ruby | Cucumber-Ruby | `features/step_definitions/*.rb` | `cucumber` |

## Strict mode — undefined/pending steps must FAIL, never pass

A scenario that parses but has no matching step definition is **not coverage**. Configure the runner so
undefined/pending steps exit non-zero. Confirm the exact flag for your framework and version:

- **Cucumber.js** — strict by default: undefined/pending steps exit non-zero `[documented]`
  (<https://github.com/cucumber/cucumber-js>). (A `--no-strict` would disable it; never set it.)
- **Behave** — treats `undefined`/`pending` as errors `[documented]`
  (<https://behave.readthedocs.io/en/latest/appendix.status/>).
- **pytest-bdd** — raises `StepDefinitionNotFoundError` for an unmatched step `[documented]`.
- **SpecFlow / Reqnroll** — undefined steps report as errors/inconclusive; configure the run so an
  inconclusive/undefined step fails the build. `[inferred]` from the tools' step-status model — confirm
  for your version.
- **Cucumber-JVM** — has a strict mode (undefined/pending → failure); enable it on the runner.
  `[inferred]` from Cucumber's shared strict semantics — confirm for your version.
- **godog** — `--strict` makes pending/undefined steps fail the run. `[inferred]` — confirm for your
  version.

`[inferred]` entries are from the shared Cucumber strict-mode model, not re-run here; verify the exact
setting at adoption. The strict run is wired as a required CI check (see `bdd-gates.md`).

## Source (retrieved 2026-10-10)

- **Gherkin reference** (keywords; Feature/Rule/Scenario/Background/Scenario Outline; Given-When-Then):
  <https://cucumber.io/docs/gherkin/reference/> `[documented]`.
