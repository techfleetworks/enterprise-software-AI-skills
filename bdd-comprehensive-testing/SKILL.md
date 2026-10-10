---
name: bdd-comprehensive-testing
description: "Use on EVERY code push in any repo: enumerate ALL use cases (the happy path and every non-happy path — edge, error, boundary, negative, adverse, concurrency, permission-denied, empty, overflow, timeout) for ALL user audiences, write them as Gherkin (Given/When/Then), store them in a permanent feature-file index, and wire them into CI as executable, blocking tests (Cucumber / pytest-bdd / Behave / SpecFlow / Cucumber-JVM / godog, per stack). If the intended audiences for the change are not certain, STOP and ASK the user — never guess. Trigger on build / add / implement / fix / change / push even when 'tests', 'BDD', 'Gherkin', or 'CI' are not mentioned."
---

# BDD Comprehensive Testing

## Why this exists

A feature isn't done when the happy path works for the person who built it. It's done when every
path — the mistakes, the empty states, the denied permissions, the timeouts — behaves correctly for
**every kind of user who will hit it**. Those behaviors are the contract of the feature, and the only
way to keep a contract honest is to write it down as executable scenarios that run on every change.

This skill owns that: turning a change into the **complete** set of behavioral scenarios (happy +
every non-happy path, across every audience), expressed as Gherkin, stored permanently, and run in
CI as a blocking gate. "We wrote some tests" is not the bar. The bar is: the full matrix of
*use case × audience* is covered, or each uncovered cell has a recorded reason.

This skill is the companion to `comprehensive-test-strategy`. **This skill owns the Gherkin /
behavioral layer and wires the suite into CI; that skill owns the full test *mix*** — the pyramid
(unit/integration/e2e), contract, load, chaos, and the coverage/mutation quality gates. Use them
together; don't duplicate the behavioral scenarios there.

## The non-negotiables

These are not optional and not left to judgment. Every time this skill runs:

1. **Total coverage — ALL use cases × ALL audiences, actually written out.** Build the scenario
   matrix: every use case (the happy path *and* every non-happy path — edge, error, boundary,
   negative, adverse, concurrency, permission-denied, empty/overflow, timeout/failure) crossed with
   every distinct user/audience/role — **including the common, "obvious" edge cases; nothing is
   skipped because it seems routine.** Then **write every one out as a committed Gherkin scenario.**
   The deliverable is the scenarios themselves, in the repo — not a list of cases you "would" cover,
   not a plan to add them later, not a description of what you'd test. **Show the receipts: the
   actual Given/When/Then for every cell.** The only cell allowed to have no scenario is one carrying
   an explicit, recorded `N/A: <reason>`. A token sample is a fail; identifying cases without writing
   them is a fail; a plan is a fail. The complete, written-out matrix is the bar.

2. **Severity-ranked — prioritized, never gated.** Rate every use case by **severity: how
   mission-critical it is — how badly its failure would break performance, user experience,
   architectural standards, security, confidentiality, or the integrity of the codebase and the
   product.** This is the **impact** axis of risk-based testing — ISTQB defines a risk's level as its
   *impact × likelihood* and lists "order of testing activities according to risk" among its uses
   (see Sources); severity captures impact, and teams wanting finer ordering may also weigh
   likelihood. Use severity to *prioritize*: write and review the highest-severity scenarios first,
   and make them the loudest signals in CI. But **severity never reduces coverage** — a low-severity
   case is still written out in full, just ranked lower. Tag each scenario with its severity
   (`@severity:critical | high | medium | low`) so the ranking is visible and auditable, and the
   critical paths are unmistakable.

3. **Audiences are established with certainty — never guessed.** Determine the intended audiences
   *before* authoring. **If the audience set isn't stated or can't be derived with certainty from the
   request or the repo, STOP and ASK the user** an explicit clarifying question listing the candidate
   audiences, and wait. Never assume or silently default — getting the audience wrong silently ships
   untested paths for real users. The audience list must be *observed/reported* (stated by the user
   or verified in the repo), never *inferred*; an inferred audience is a hard stop that forces the
   question.

4. **Every scenario is traceable and categorized.** Tag each scenario on the shared taxonomy (see
   "Categorization") — audience, use case, behavior class, quality dimension, and severity:
   `@audience:admin @usecase:refund-failure @category:error @quality:reliability @severity:critical` —
   so coverage is auditable, the records are semantically groupable/queryable, the critical paths are
   obvious, and matrix gaps are mechanically detectable.

5. **It fires on every code push, in any repo.** Any change that adds, alters, or removes behavior
   arrives with its updated, written-out matrix. The suite is wired as a **blocking pre-push + PR CI
   gate**, stack-agnostic. A push whose changed surface has no corresponding happy + non-happy +
   per-audience scenarios fails the gate.

6. **Completeness is proven, not hoped-for.** Ship the `check-bdd-coverage` gate (below) so the
   failure modes — a changed behavior with no scenario, a feature with only happy-path scenarios, a
   declared audience with no scenario, a scenario with no severity tag — fail the build closed.

7. **A centralized BDD datastore, maintained in the repo.** Every repo that pushes code using this
   skill MUST create and keep up to date a **single, central datastore of all BDD scenarios, committed
   in the repo itself** — one source of truth any developer can open to see the whole picture: for
   each scenario, its definition/purpose, its Given/When/Then, its audiences, its use case, its
   severity, and its **coverage status** (`covered | N/A:<reason> | pending`). It lives in one place
   (canonical machine-readable `features/bdd-index.json`, plus a human-readable `features/INDEX.md`
   view) and is **generated from the feature files**, so it is always maintained and can never become
   a second, drifting copy — the `.feature` files stay the source of truth for scenario content, and
   the datastore is the derived, committed registry over them. The `check-bdd-coverage` gate **fails
   the build if the datastore is missing, stale, or out of sync** with the feature files. (Live
   pass/fail for a run is linked from the CI report, not duplicated into the datastore.)

8. **An append-only log of the receipts — the history, not just the snapshot.** Beyond the current
   scenarios (source of truth) and the datastore (current state), maintain a committed, **append-only
   coverage/evidence log** (`features/bdd-coverage-log.md`) that records the *history*: for every
   behavioral change, a dated entry naming the change (commit/PR), the scenarios added / updated /
   removed with their audience · use case · severity, and the gate outcome that proved them — the
   receipt. **Entries are only ever appended; past entries are never edited or deleted**, so the log is
   a tamper-evident history any developer can read to see how the behavioral contract and its coverage
   evolved over time. `check-bdd-coverage` fails closed if a behavioral change ships with no new log
   entry, or if an existing entry was altered (the committed log must be a clean append to the prior
   one; git history is the backing record).

## The workflow

### Step 1 — Establish the audiences (with certainty, or ASK)

List the distinct audiences the change serves. Common ones: anonymous/guest, authenticated end
user, admin/operator, API/service consumer, internal/back-office, third-party/partner,
assistive-technology user, plus any domain-specific roles. Confirm each against the request or the
repo (routes, role checks, auth config). **If you cannot establish the set with certainty, stop and
ask** — list the candidates and let the user confirm. Record the confirmed list; it anchors the
matrix.

### Step 2 — Enumerate every use case (happy + non-happy) and rate its severity

For the changed behavior, list the happy path and every non-happy path: edge, error, boundary,
negative, adverse, concurrency, permission-denied, empty/overflow, timeout/failure — **including the
common ones; list them no matter how routine they seem.** This is the **Example Mapping** technique —
break the behavior into its rules and concrete examples before coding (see Sources). Think like an
adversary and like a confused first-time user, not just the author. For each, assign a **severity** —
how badly its failure would break performance, user experience, architectural standards, security,
confidentiality, or the integrity of the codebase/product (`critical | high | medium | low`).

### Step 3 — Build the coverage matrix

Cross every use case with every audience, carrying each cell's severity. Each cell → a scenario, or a
recorded `N/A: <reason>` (e.g. "guest can't reach the admin refund flow"). Order the work by severity
(critical first) — but every non-N/A cell must still be written. This grid is the deliverable; gaps
must be deliberate and visible.

### Step 4 — Write every cell out as a tagged Gherkin scenario

**Actually write each cell** (not N/A) as a committed Given/When/Then — the written scenarios are the
deliverable, highest-severity first. Tag each with its audience, use case, and severity:

```gherkin
Feature: Refund a completed order

  @audience:customer @usecase:refund-happy-path @category:happy @quality:functional @severity:high
  Scenario: Customer refunds an eligible order
    Given a signed-in customer with a completed, refund-eligible order
    When they request a full refund
    Then the refund is accepted and the order shows "Refunded"

  @audience:customer @usecase:refund-ineligible @category:negative @quality:functional @severity:high
  Scenario: Customer cannot refund an order past the refund window
    Given a signed-in customer whose order is past the refund window
    When they request a refund
    Then the request is rejected with a clear "past refund window" message
    And no refund is issued

  @audience:guest @usecase:refund-permission-denied @category:permission @quality:security @severity:critical
  Scenario: A guest cannot refund any order
    Given an anonymous visitor
    When they call the refund endpoint for any order
    Then the response is 404 and no refund is issued

  @audience:customer @usecase:refund-double-submit @category:concurrency @quality:reliability @severity:critical
  Scenario: A double-submitted refund is only applied once
    Given a signed-in customer refunding an eligible order
    When they submit the same refund request twice concurrently
    Then exactly one refund is issued
    And the second request is rejected or de-duplicated

  @audience:admin @usecase:refund-failure @category:error @quality:reliability @severity:critical
  Scenario: Admin refund surfaces a downstream payment failure
    Given an admin issuing a refund
    And the payment processor is returning errors
    When they submit the refund
    Then they see a clear failure message and the order stays "Completed"
    And the failure is recorded for retry
```

Keep steps behavioral (user-observable outcomes), not implementation detail.

### Step 5 — Map to the stack's BDD framework

Pick the runner for the repo's language and wire step definitions:

| Stack | Framework |
|------|-----------|
| JS/TS | Cucumber.js (`@cucumber/cucumber`) |
| Python | pytest-bdd or Behave |
| .NET | SpecFlow / Reqnroll |
| JVM (Java/Kotlin) | Cucumber-JVM |
| Go | godog |
| Ruby | Cucumber-Ruby |

Match the repo's existing choice if one exists; don't introduce a second BDD runner.

## Storing BDD scenarios permanently

"Permanently" means one specific thing: **committed into the project's own version-controlled
repository** — the same repo whose code is being pushed. Not in an agent's memory, not in a scratch
folder, not on one developer's machine, not in a chat transcript. The scenarios are the project's
**single, authoritative, shared specification of how the system behaves**, and the whole point is that
they outlive any individual: they must survive one developer leaving, and they become the universal
reference that *every* developer who pushes to the repo inherits and is held to.

This is non-negotiable. Whatever behavior these scenarios capture is solidified in the repository so
that:

- it is the **same for everyone** — one shared source of truth, never per-developer or per-branch
  knowledge;
- a **new developer inherits the full behavioral contract automatically** by cloning the repo;
- it is **reviewed in pull requests like any other source** and carried in git history, so the
  current contract *and* how it evolved are both permanent;
- CI **enforces it for every push** (see CI/CD wiring), so it cannot be bypassed, forgotten, or
  quietly dropped when the person who wrote it moves on.

Layout that makes this work:

- **Location.** All `.feature` files live in the project repository under a single top-level
  `features/` directory (or the stack's idiomatic equivalent, e.g. `tests/features/`), organized by
  domain/feature area — `features/<area>/<feature>.feature`. One feature file per cohesive feature.
- **Centralized datastore (source of truth for all devs).** Maintain one central, committed datastore
  of every BDD scenario in the repo: canonical machine-readable `features/bdd-index.json` plus a
  human-readable `features/INDEX.md` view. For each scenario it records the definition/purpose, the
  feature file + scenario name, the full taxonomy (audience, use case, behavior class, quality
  dimension, severity, and the domain derived from its path), and coverage status
  (`covered | N/A:<reason> | pending`) — so any developer can open one place and see the full
  behavioral surface, coverage, categories, and gaps. **It is generated from the `.feature` files, not hand-kept
  in parallel** (the feature files stay the single source of truth for scenario content; the datastore
  is the derived registry over them), regenerated on change and committed, and the
  `check-bdd-coverage` gate fails the build if it is missing or drifts from the feature files.
- **Append-only history (the log of receipts).** Alongside the datastore, keep
  `features/bdd-coverage-log.md` — an **append-only** log of every behavioral change: date, change ref
  (commit/PR), the event type (`added`/`updated`/`removed`/…), the scenarios touched (with their full
  taxonomy tags), and the gate result that proved them. New entries are appended; prior entries are immutable. The datastore answers "what is
  covered now"; the log answers "how did we get here, and what proved it then." It is tamper-evident
  (the gate rejects any edit to a past entry) and backed by git history.
- **One home per feature — additive across skills.** Security (`@security`), release-safety
  (`@release-safety`), reliability (`@reliability`), and compliance (`@compliance`) scenarios are
  **added to the same feature file** for that feature, not scattered into parallel files. The OWASP,
  release-deployment-safety, SRE, and compliance skills append their tagged scenarios here; this is
  the shared index they all write into.
- **Naming.** `kebab-case-feature-name.feature`; scenarios named for the behavior and outcome, each
  carrying its `@audience:` and `@usecase:` tags.
- **Never deleted on change — updated.** When a feature changes, its feature file is updated, not
  discarded, so the behavioral contract stays current while its history remains in version control.

## Categorization — one shared taxonomy for scenarios and log records

So the documentation and the audit log can be made sense of *semantically* — sliced, grouped, and
queried — every scenario and every log entry is classified on the same controlled dimensions. Agents
do not invent categories; they draw from this vocabulary, and `check-bdd-tags` rejects anything off it.

**Scenario dimensions** (tags on each scenario):

| Dimension | Tag | Answers | Allowed values |
|---|---|---|---|
| Audience | `@audience:` | *who* | the repo's declared audience list (anonymous, authenticated, admin, api-consumer, internal, partner, assistive-tech, + domain roles) |
| Use case | `@usecase:` | *which behavior* | a feature-specific slug, e.g. `refund-failure` |
| Behavior class | `@category:` | *what kind of path* | `happy · edge · error · boundary · negative · adverse · concurrency · permission · empty-overflow · timeout` |
| Quality dimension | `@quality:` | *which concern it protects* | `functional · security · reliability · release-safety · compliance · performance · accessibility` (the sibling skills' `@security` / `@compliance` / `@reliability` / `@release-safety` tags are recognized equivalents) |
| Severity | `@severity:` | *how critical* | `critical · high · medium · low` |

*Domain* (the system area — `auth`, `payments`, `profile`, …) is **derived from the feature file's
location** (`features/<domain>/<feature>.feature`), not a separate tag, so it can never drift from where
the file actually lives.

**Log-record categories** (each `features/bdd-coverage-log.md` entry):

| Field | Values |
|---|---|
| `event` | `added · updated · removed · reinstated · waived · verified` |
| `scenario` | scenario name + its full dimension tags (so history is filterable by the same taxonomy) |
| `change` | commit SHA / PR ref |
| `date` | ISO date |
| `gate` | the proving run's result (pass + the check names) — the receipt |

One vocabulary across the scenarios, the datastore, and the log means any developer — or an automated
query — can ask coherent questions and get a meaningful answer: *"all `@quality:security
@severity:critical` scenarios in the `payments` domain,"* or *"every `@quality:compliance` scenario with
an `event:removed` entry this quarter."* `check-bdd-tags` enforces the vocabulary so the categories stay
trustworthy.

<a id="ci-cd-wiring"></a>

## CI/CD wiring

This is the single pipeline every behavioral scenario plugs into — `@security`, `@release-safety`,
`@reliability`, `@compliance`, and contract/load tests all run here rather than in parallel setups.

- **Runs on every PR and push.** The BDD suite executes on every pull request and every push to a
  protected branch. A failing scenario fails the build and blocks merge — no override without an
  explicit, recorded waiver.
- **Pre-push gate too.** A pre-push hook runs the suite (or the affected subset) locally so breaks
  are caught before they reach CI; CI remains the authoritative, un-skippable gate.
- **Tagged subsets.** Tags let the pipeline run focused subsets where useful (`@security` in the
  security job, `@smoke` on every commit, the full suite before release) while the complete suite
  gates merges.
- **Readable reports.** Each run publishes a human-readable report (scenario names + pass/fail) so a
  failure names the broken behavior, not just a stack trace.
- **One pipeline, many producers.** Other skills do not build their own test pipeline; they add
  scenarios to the feature files and rely on this wiring (see each skill's reference to
  `ci-cd-wiring`).

## Prove completeness — `check-bdd-coverage`

Advice regresses the moment someone is busy. Make the matrix mechanically enforced. Ship a
`check-bdd-coverage` gate that, for the changed surface, **fails closed** when:

1. a changed behavior has no corresponding scenario,
2. a feature has only happy-path scenarios (no non-happy path for it),
3. a declared audience for that feature has no scenario tagged for it,
4. a scenario is missing its `@audience:` / `@usecase:` / `@severity:` tags,
5. the centralized datastore (`features/bdd-index.json` + `features/INDEX.md`) is missing or out of
   sync with the `.feature` files (regenerate → diff → fail on drift), so the shared source of truth
   can never silently fall behind,
6. a behavioral change ships with no new entry appended to `features/bdd-coverage-log.md`, or
7. the committed log is not a clean append — a prior entry was edited or removed (history must be
   immutable; the gate compares against the base revision).

Give the check a faithful fixture and a **discriminating test** (no-op the check → its test fails),
per `verifiable-quality-gates`, so the coverage gate itself can't rot. This is what turns "write BDD
for everything" from advice into cannot-merge-without-it.

## Legal Gherkin is not optional — malformed scenarios cannot merge

Agents and people write invalid Gherkin: missing keywords, misnested steps, duplicate scenario names,
tags that look right but aren't. Do not rely on getting the syntax right. Make wrong syntax
**impossible to merge** by letting the authoritative parser decide, fail-closed — never a regex or a
guess:

- **Parse with the official Gherkin parser.** `check-gherkin-valid` runs every `.feature` file through
  the same parser Cucumber uses (`@cucumber/gherkin`, or the stack's binding of it). "Syntactically
  valid Gherkin" is *defined as what that parser accepts*, so there is nothing to be wrong about:
  legal syntax always parses (no false positive), illegal syntax cannot (no false negative). A parse
  error fails the build with the file and line. (The parser settles *syntax*; a wrong-but-valid keyword
  choice or a weak structure is a semantic/style matter the tag vocabulary below — and an optional
  Gherkin style-lint — cover, not the parser. Say so rather than overclaim.)
- **Undefined / pending steps fail, not pass.** Run the suite so a Given/When/Then with no matching
  step definition is a hard failure, never a silent "pending": **cucumber-js runs strict by default**
  (undefined/pending exit non-zero); **behave** counts `undefined`/`pending` as errors; **pytest-bdd**
  raises `StepDefinitionNotFoundError`; SpecFlow/Reqnroll, Cucumber-JVM, and godog have equivalents —
  confirm the exact setting for your framework and version (see Sources). A scenario that parses but
  isn't wired to code is not coverage.
- **Tags are validated against a committed vocabulary.** `check-bdd-tags` asserts every scenario carries
  the full taxonomy and that each value is in-vocabulary: `@audience:` ∈ the repo's declared list;
  `@usecase:` present; `@category:` ∈ {happy, edge, error, boundary, negative, adverse, concurrency,
  permission, empty-overflow, timeout}; `@quality:` ∈ {functional, security, reliability, release-safety,
  compliance, performance, accessibility}; `@severity:` ∈ {critical, high, medium, low}. A missing,
  typo'd, or invented tag fails the build — so the matrix, datastore, and log can't be fooled by a tag
  that merely looks valid.
- **The datastore is generated from the parser's AST**, so it can only ever contain scenarios the
  parser accepted — malformed Gherkin fails `check-gherkin-valid` before it could reach the index.
- **Every one of these gates ships a discriminating test** (feed it malformed Gherkin, a pending step,
  a bad tag → it must go red; feed valid input → green), per `verifiable-quality-gates`, so the
  validators themselves can't rot into false green.

Run all of them in the same CI wiring as **required** checks, plus the pre-push hook — so the only
Gherkin that can reach `main` is Gherkin the official parser, the strict runner, and the tag
vocabulary all accept. The author never decides what's legal; the parser does.

## Definition of done

- [ ] Audiences established with certainty (asked the user if uncertain) and recorded.
- [ ] Every use case × audience cell is **written out as a committed Gherkin scenario**, or carries a recorded `N/A: <reason>` — no cell left as a plan or a mention, no edge case skipped for being common.
- [ ] Non-happy paths written (edge, error, boundary, negative, adverse, concurrency, perms, empty/overflow, timeout) — not just the happy path.
- [ ] Each use case severity-rated; highest-severity scenarios written/reviewed first and tagged so critical paths are unmistakable.
- [ ] Every scenario carries the full taxonomy — `@audience:` + `@usecase:` + `@category:` + `@quality:` + `@severity:` — each value in-vocabulary.
- [ ] Scenarios committed to the project repo's permanent `features/` index; security/release/reliability/compliance scenarios added to the same files.
- [ ] A new entry appended to the `features/bdd-coverage-log.md` history for this change; no prior entry altered (append-only).
- [ ] Suite wired into CI as a blocking gate (and a pre-push hook).
- [ ] `check-bdd-coverage` passes and is itself proven by a discriminating test.
- [ ] Evidence ledger attached: each central claim carries an evidence state + re-runnable source, and any `not-assessed` gap is listed (per the Evidence & skeptical assessment section).

## Why this holds for every developer, every agent, every push

This skill is not advice that lives in one chat. It binds universally because it is enforced from
**committed repo artifacts, not memory**:

- **Agents** get it on every run: the always-on hook (`always-on/`) injects the directive into every
  session and every subagent, in any repo that installs it — so a coding agent cannot "forget" to
  apply it.
- **Humans and agents alike** are bound by the gates above, made **required via branch protection** —
  `check-bdd-coverage`, `check-gherkin-valid`, `check-bdd-tags`, and the strict suite. The gate does
  not care whether you read the skill; a push without the complete, legal, tagged matrix cannot merge.
  That mechanical, fail-closed layer is what turns "should" into "cannot otherwise."
- **It survives any individual** because the scenarios, the datastore, the gates, and the directive are
  all committed and carried in git history — a new developer inherits the whole contract by cloning,
  and removing it is a visible, reviewed, admin-level act, never a silent lapse.

The honest limit, stated plainly: nothing can stop a repo admin from *deliberately* disabling a
required check or uninstalling the hook — but by construction that cannot happen silently, by accident,
or by omission. The only path around the gate is explicit, attributed, and visible in git or the
ruleset. That is what "structurally impossible to fail" means in practice.

## Evidence & skeptical assessment (required)

This skill holds its own output to the repo's evidence discipline (see
`skeptical-audit/references/evidence-discipline.md`): **every factual or standards claim you make while
applying this skill carries an evidence state, a re-runnable source, and a named limitation** —
`proven` (a committed, discriminating gate keeps it true) · `observed` (ran this session; command +
output attached) · `documented` (an authoritative doc says so; URL + date) · `inferred` (from named
facts) · `reported` · `not-assessed` (a stated gap, never a silent pass). Do not report BDD coverage
"done" without the ledger: which scenarios exist, which gate run proves them, and what is still
`not-assessed`. This ledger is not only per-change — it **persists as the append-only coverage/evidence
log** (`features/bdd-coverage-log.md`), so the *history* of receipts, not just the latest snapshot,
lives in version control.

### This skill's central claims and how each is proven

| Claim | Reaches `observed` by | Becomes `proven` when |
|---|---|---|
| "Every use case × audience is covered" | the written feature files + the committed datastore | `check-bdd-coverage` fails closed on any gap (discriminating test) |
| "The scenarios are legal Gherkin" | `check-gherkin-valid` run output | the official-parser gate runs in CI and discriminates on malformed input |
| "Scenarios are wired to real code" | a strict suite run with 0 undefined/pending | the strict run is a required CI check |
| "Tags are valid and in-vocabulary" | `check-bdd-tags` run output | the tag gate runs in CI and discriminates |
| "The datastore matches the feature files" | regenerate → empty diff | `check-bdd-coverage` fails on drift |

### Sources & standards (retrieved 2026-10-10)

The practices here are grounded in published standards, not invented — cited so any developer can check
the primary source:

- **Gherkin syntax** (keywords; Feature/Rule/Scenario/Background/Scenario Outline; Given-When-Then):
  official Cucumber Gherkin reference — <https://cucumber.io/docs/gherkin/reference/> `[documented]`.
  This is why `check-gherkin-valid` uses the official parser as the oracle: the reference *is* the
  grammar that parser implements.
- **Undefined/pending steps fail (strict):** cucumber-js is strict by default —
  <https://github.com/cucumber/cucumber-js>; behave treats `undefined`/`pending` as errors —
  <https://behave.readthedocs.io/en/latest/appendix.status/>; pytest-bdd raises
  `StepDefinitionNotFoundError` `[documented]`.
- **Enumerate the full case set (the matrix):** Example Mapping (Matt Wynne) — breaking a story into
  rules, examples, and open questions before coding — <https://cucumber.io/docs/bdd/example-mapping/>
  `[documented]`.
- **Severity / risk-based prioritization:** ISTQB defines a risk's level as *impact × likelihood* and
  lists ordering test activities by risk among its uses — ISTQB Glossary, "risk level",
  <https://glossary.istqb.org/> `[documented]`. `@severity:` captures the impact axis.
- **Scenarios as the committed source of truth / living documentation:** Specification by Example
  (Gojko Adzic, 2011) — concrete examples become a single, automatically-validated source of truth
  shared by business, dev, and test — <https://en.wikipedia.org/wiki/Specification_by_example>
  `[documented]`.

**Limitations (stated, not hidden):** the per-framework strict settings are `[documented]` from each
tool's docs, not re-run on every stack this session — confirm for your framework/version at adoption.
The parser guarantees *syntactic* legality only; semantic/style quality is the tag-vocabulary gate's
job. "Structurally impossible to fail" means impossible *silently, by accident, or by omission* — a
repo admin can still deliberately and visibly disable a gate.

## Reference files

| Topic | File |
|---|---|
| Authoring the full use-case set + the use-case × audience matrix, with severity | `references/use-case-and-audience-matrix.md` |
| Converting use cases to Gherkin; per-stack framework setup & step definitions | `references/gherkin-and-frameworks.md` |
| Feature-file layout, the centralized datastore, and CI/CD wiring details | `references/storage-and-ci-wiring.md` |
| The gate suite (`check-bdd-coverage`, `check-gherkin-valid`, `check-bdd-tags`): what each enforces, strict-mode config, and how each is proven | `references/bdd-gates.md` |
