# PoEAA v1.4 upgrade: requirements spec

Status: accepted as the v1.4 scope (ADR-0103). Not built. Plain language, no em or en dashes (house
style). This spec turns every finding in the
[adversarial audit](../../audit/poeaa-2026-11/poeaa-adversarial-audit.md) into a requirement, an outcome,
the scenarios that define "done," and the proof that keeps it done.

## 1. What v1.4 must change, in outcomes

The audit measured the pattern skills against Fowler's *Patterns of Enterprise Application Architecture*
and found 4 of 51 patterns covered well, 7 covered poorly, 1 miscited, and 39 missing. It also proved
that the gate guarding the catalog cannot tell a right page from a wrong one.

The release meets this spec when these six outcomes hold, and each one is held true by a check, not by care:

| # | Outcome | How it is held true |
|---|---|---|
| O1 | A wrong, missing, or invented PoEAA page cannot merge. | The catalog gate checks every PoEAA citation against a committed page registry (WP2). |
| O2 | No PoEAA pattern is silently absent. Each of the 51 is covered or declined with a written reason. | The same gate checks the registry's coverage column against the catalog (WP2). |
| O3 | No catalog entry contradicts the book on when to use its pattern. | One scenario per contradiction, graduated into `features/` with steps that read the entry (WP3). |
| O4 | An agent can pick the right pattern for each of the book's main problems from the chooser. | Chooser rows plus a scenario that every routed pattern has an entry (WP3 to WP7, chooser feature). |
| O5 | Each PoEAA pattern comes with a ready way to prove it is applied. | A "prove it" kit: arch-gate rules proven to fire on planted violations, and named test shapes (WP9). |
| O6 | No example in the skills teaches a money bug. | A scenario that no catalog example stores money as a floating-point number (WP3, WP6). |

## 2. Work packages (one PR each, in this order)

Each package is one pull request off updated `main`. The next opens only after the last merges, because
the shared datastores (`features/bdd-index.json`, the two `log.jsonl` files, `package.json`,
`CHANGELOG.md`) conflict when two are open. Every PR passes the full gate: `npm run check:architecture`,
`npm test`, the BDD chain, `check:routing`, a receipt, and a recorded fresh-context judge-arch review.

| WP | Title | Findings | Scenario file | Size |
|---|---|---|---|---|
| WP1 | This audit and this spec | all | (none; read-only) | done on this branch |
| WP2 | Citation-verifying gate and page registry | F1, F2, I1 | `features/citation-gate.feature`, part of `features/pattern-decision-record.feature` | gate + data + tests + ADR |
| WP3 | Make the existing entries true to the book, and require the pattern decision | F2, F3, F5 (Unit of Work), F9, F10, F11, F17, F18, F19, F20, I1, I2, I3, D1 | `features/existing-entries.feature`, `features/pattern-decision-record.feature` | edits, 3 chooser rows, 1 routing rule |
| WP4 | Domain logic and data source patterns | F4, F13 | `features/domain-logic-and-data-source.feature` | 6 entries, 2 chooser rows |
| WP5 | Offline concurrency and session state | F5, F12 | `features/concurrency-and-session.feature` | 7 entries, 3 chooser rows |
| WP6 | Distribution and base patterns | F6, F15, F20 | `features/distribution-and-base.feature` | 9 entries, 3 chooser rows |
| WP7 | Object-relational structural and metadata | F14 | `features/object-relational-mapping.feature` | 11 entries, 1 chooser row |
| WP8 | Web presentation | F16 | `features/web-presentation.feature` | 6 entries |
| WP9 | The "prove it" kit | F7, I1 | `features/prove-it-kit.feature`, one scenario of `features/pattern-decision-record.feature` | kit + fixtures + tests |
| (each) | Chooser rows land with their target entries | F8 | `features/chooser-routing.feature` | rows per WP |
| (release) | Version 1.4.0 and the mirror refresh | I4 | section 7, R10.1 | version bump + notes |

WP2, WP3, and WP9 also carry the integration requirements in section 7.3 (R2.12, R3.12, R3.13, R9.7, R9.8),
so the record an agent writes is held to the new catalog, not only the catalog itself. WP3 also makes that
record required for repository, service, domain, mapper, and gateway changes (operator decision D1, section
7.4.1, R3.14 to R3.19). Their scenarios are in `features/pattern-decision-record.feature`.

WP2 goes first on purpose. Every later package adds PoEAA citations, and the real gate must cover each one
as it lands, instead of a person by hand.

## 3. Requirements

"MUST" is required for the package to merge. "SHOULD" is expected unless the PR says why not.

### WP2. Citation-verifying gate and page registry (F1, F2)

- **R2.1** The pattern-selector skill MUST ship a page registry: one row per catalog pattern, with the
  pattern name, its chapter (9 to 18), its printed page, the book's cross-reference hit count for that
  page, a `heading` (the catalog heading text before its ", <cluster>" suffix, for example
  "Model-View-Controller (MVC)" for "Model View Controller"), a `status` of `covered` or `declined`, and a
  `reason` when declined. It lives with the skill (for example
  `.claude/skills/pattern-selector/references/poeaa-registry.json`) so consumers get it.
- **R2.2** The registry MUST hold exactly 51 rows with unique names, and printed pages MUST rise in catalog
  order. Its own test MUST fail on 50 rows, 52 rows, 0 rows, a duplicate, or a page out of order. Because
  an in-order typo (Repository 322 changed to 320) passes an order check, the test MUST also pin the 15
  pages the audit matched to the book (the list under "What did hold up" in the audit report).
- **R2.3** The catalog gate MUST fail (exit 1) when any `<registry name> (<3 digits>)` token in the catalog
  or the chooser has a page that does not match the registry. This covers both the prefixed form
  `Fowler, *PoEAA*, <Name> (<page>)` and Fowler's bare cross-reference form (for example "Active Record
  (160)" inside an Avoid when field). A prefixed citation whose name is not in the registry MUST also fail.
  The message MUST name the pattern, the cited page, and the registry page. Matching MUST take the longest
  registry name that ends at the "(", so "Table Data Gateway (144)" MUST resolve to Table Data Gateway, not
  to Gateway (466), and "Data Mapper (165)" to Data Mapper, not to Mapper (473).
- **R2.4** The catalog gate MUST fail when an entry's Source names PoEAA but carries neither a pattern page
  nor a chapter citation. The ISBN alone MUST NOT satisfy it.
- **R2.5** A chapter citation `Fowler, *PoEAA*, ch. <n>` MUST be accepted for n from 1 to 18 and rejected
  otherwise. This is the form for claims that live in the narrative chapters (F2).
- **R2.6** The gate MUST fail when a registry row is `covered` and no catalog heading starts with that row's
  `heading` (matching the heading text before its ", <cluster>" suffix), and when a row is `declined` with
  an empty reason.
- **R2.7** The gate MUST fail closed (exit 2, naming the path) when the registry is missing or unreadable.
- **R2.8** The gate MUST ship a discriminating test (verifiable-quality-gates) that plants a wrong page, a
  missing page, an ISBN-only source, and an unknown name, and that fails if the page comparison is
  replaced by a no-op. The test file MUST be wired into `package.json` `test`.
- **R2.9** The catalog header MUST describe the citation forms the gate enforces, and its example citation
  MUST pass the gate.
- **R2.10** On first landing, the 12 patterns with entries are `covered` and the other 39 are `covered`
  only as WP4 to WP8 land. Until then they are `declined` with a reason that names the planned work package
  (for example "planned for v1.4, WP5"), so the gate is green on every commit of the chain and the gap is
  written down, not silent.
- **R2.11** An ADR MUST record the registry as the single owner of PoEAA page facts and how it was built
  (the book's own cross-references, as in the audit's method section), including each row's hit count
  and the one stray value found (Metadata Mapping 329). The audit report's appendix lists them.

### WP3. Make the existing entries true to the book

- **R3.1 (F2)** The Service Layer clause about security MUST cite `ch. 2`.
- **R3.2 (F3)** Service Layer MUST name the domain facade and operation script variants, MUST NOT call a
  delegating service a misuse, and MUST give both of Fowler's triggers (more than one kind of client; more
  than one transactional resource).
- **R3.3 (F5)** Unit of Work MUST describe a business transaction whose commit runs in one short system
  transaction, MUST NOT offer a database transaction block as a replacement, and MUST link to Optimistic
  Offline Lock.
- **R3.4 (F9)** Gateway MUST NOT give a stable resource as a reason to skip it, and MUST name Service Stub.
- **R3.5 (F10)** MVC MUST say the presentation and model separation matters most and the view and
  controller split is optional.
- **R3.6 (F11)** Special Case MUST use Fowler's when-to-use rule and allow one special case per meaning of
  absent. The Intent MUST NOT limit behavior to "neutral."
- **R3.7 (F17)** Lazy Load MUST give the same-row rule and name the four variants.
- **R3.8 (F18)** Every sentence in quotation marks attributed to the book MUST be verbatim.
- **R3.9 (F19)** Identity Map MUST allow a read-only process-wide map and link to Optimistic Offline Lock.
  Value Object MUST warn of the "value object" name clash with DTO. The ADR skill SHOULD name a
  cross-cutting pattern choice as an ADR trigger.
- **R3.10 (F20)** Code examples in the pattern-selector catalog and chooser MUST NOT store money in a
  floating-point type. The Value Object example MUST use integer minor units.
- **R3.11 (F8)** The chooser MUST gain the three rows whose target entries already exist: "the same record
  gets loaded twice in one request" (Identity Map), "a loop runs one query per row" (Lazy Load), and "an
  outside system has an awkward interface" (Gateway).

### WP4 to WP8. New entries

- **R4.1** Each new entry MUST use the existing catalog template (all 15 labels with content). The
  template MUST NOT change.
- **R4.2** Each entry's Intent MUST agree with the book's one-line intent for that pattern, and its Best
  situation and Avoid when MUST agree with the book's "When to Use It" section, read from the book for
  that PR and quoted with a page.
- **R4.3** Each entry MUST cite `Fowler, *PoEAA*, <Name> (<page>)` with the registry page, and flip its
  registry row to `covered` in the same PR.
- **R4.4** Each entry's Verify correct application field MUST name a kit rule or a kit test shape (see
  WP9). Until WP9 lands it MUST name the test shape in words that WP9 will turn into a kit item.
- **R4.5** Each entry's Security trade-off MUST be real for that pattern (for example Client Session State
  tampering, Serialized LOB hiding personal data), with the owning skill linked.
- **R4.6** The specific facts in each package's feature file MUST hold (for example Transaction Script is
  never called a smell; Remote Facade is avoided inside one process; Money's verify test splits 5 cents
  70 to 30 and the parts add up).
- **R4.7** The chooser MUST gain the rows in `features/chooser-routing.feature` for that package's
  patterns, each with a cheaper option to check first.
- **R4.8** `performance-scalability.md` MUST name the three session state options and link to the catalog
  (WP5).

### WP9. The "prove it" kit (F7)

- **R9.1** The kit rules MUST live in one place: a judge-arch preset,
  `judge-arch/assets/presets/poeaa-patterns/arch-gate.config.json`, next to the existing presets, with rules
  for Repository, Data Mapper, Service Layer, Gateway, and Separated Interface, using only the engine's
  fields (`name`, `include`, `exclude`, `forbid`, `message`). The catalog MUST link to the preset by rule
  name and MUST NOT copy the rule text.
- **R9.2** Each kit rule MUST ship a planted fixture and a clean fixture. The proof MUST extend the existing
  `check-arch-rules-discriminate.mjs` (which today only requires planted violations to be flagged) so it
  also requires clean fixtures to produce no violation, with its discriminating test updated. No second
  planted-violation runner is added. The repository rule's clean fixture MUST include `Array.from(`.
- **R9.3** The kit MUST list a named test shape for Unit of Work, Identity Map, Optimistic Offline Lock,
  Lazy Load, Data Transfer Object, Money, and Special Case.
- **R9.4** Every PoEAA entry's Verify field MUST name a kit rule or test shape by its exact name, and a
  test MUST check that.
- **R9.5** `comprehensive-test-strategy` MUST link to the kit.
- **R9.6** The chooser MUST say what an arch-gate rule proves (the rule's invariant) and what it does not
  (that the pattern was the right choice, which judge-arch reviews).

## 4. How the scenarios become tests

The scenarios in `features/` here are written to graduate. In each package's PR, that package's feature
file moves into the top-level `features/` directory with step definitions in `features/steps/`, the BDD
datastore is regenerated with `bdd-index-generate.mjs`, and the full chain (gherkin-valid, bdd-tags,
bdd-coverage, bdd-run, check-bdd-executed) must be green. A scenario that cannot be given a real step
does not graduate. It is rewritten until it can be, or moved to `evals/`.

Before a scenario graduates, every Then that checks the content of an entry MUST name an exact anchor
string (for example `Then the Avoid when field contains "same row"`), so its step is a string match and
not a judgment. `existing-entries.feature` already does this; the WP4 to WP8 files state intent in places
and MUST be tightened the same way in the PR that builds them, with the entry's real wording.

`chooser-routing.feature` spans several packages, so it graduates row by row: each package's PR carries
its own rows (and WP3 the "no dangling route" scenario) into a top-level feature file. No row is ever
pending in `features/`.

`pattern-decision-record.feature` also spans packages, so it graduates scenario by scenario: WP2 carries
the two registry scenarios and the "older mirror" scenario (R2.12); WP3 carries the rest except the last;
WP9 carries the kit-verify scenario (R9.7).

The scenarios in `evals/` measure agent choices. They are scored by running each prompt in a fresh agent
session and grading the decision record. They never move into `features/`.

## 5. Out of scope for v1.4

- Changing the catalog template (fields stay as they are).
- The GoF catalog's own citation check (`design-patterns-catalog.md`). The audit did not assess it; it may
  share F1's weakness and should get its own audit.
- The study guide, and how each current ORM implements each pattern.
- The other two items on the operator's post-v1.3.1 work list: a new COA skill and a deep-dive literature
  review. This audit was the third item on that list, done first at the operator's request.

## 6. Risks and how the plan handles them

| Risk | Handling |
|---|---|
| The registry itself has a wrong page. | Built from the book's own cross-references (51 of 51 resolved, one stray value noted, hit counts recorded). Pages must rise in catalog order, and the 15 pages the audit matched are pinned, so an in-order typo on those fails too. |
| Nine serial PRs take a long time. | WP3 and WP9 do not depend on WP4 to WP8. If the user wants, WP9 can follow WP2 directly. Order stays serial because of the shared datastores. |
| New entries paraphrase the book wrongly, as some existing ones do. | R4.2 requires the book's When to Use It text to be read and quoted with a page in the same PR, and judge-arch reviews each PR. |
| Kit rules give false positives in a consumer repo. | Rules are samples with example globs. The kit says to fit the globs. Each ships a clean fixture that must pass. |
| Quoting the book too much. | Quotes stay short, attributed, and used for checking claims. |

## 7. How v1.4 meets the enforcement system (integration audit)

Sections 1 to 6 fix the catalog. This section checks whether a better catalog changes what an agent
actually does, by tracing the three mechanisms that touch a pattern choice: the edit-time hooks, the two
receipts, and the gates that ship to consumer repos. Audited 2026-10-31 against the code at `14d4bf5`.

### 7.1 How pattern selection is enforced today

| Mechanism | What it requires about a pattern choice | Where it runs | Evidence |
|---|---|---|---|
| Directive hooks (SessionStart, SubagentStart) | Nothing; they deliver the directive text | Every session in this repo, and machines with the user-level hook | `.claude/settings.json`; `emit-directive.mjs` |
| Edit-gate step 1, the selection record | A verdict for `pattern-selector`, which may be `not-applicable` with any reason: no routing rule names it | Only where enforcement is installed (`esk-init --enforce`) | `always-on/routing-rules.config.json` (7 rules, none names pattern-selector) |
| Edit-gate step 3, the `pattern-decision` record | 14 fields, each a non-empty string. Nothing checks that `decision` names a real pattern, that a citation is right, or that `verify` names a real check | Same as above | `always-on/check-task-plan.mjs` lines 187 to 190 |
| Per-task receipt (finish-check at Stop) | A receipt for the task's changed files; no pattern-specific content | Same as above | `always-on/finish-check.mjs` line 263 calls `task-receipt.mjs` |
| Per-PR receipt (`docs/skill-receipts/log.jsonl`) | An entry for `pattern-selector`; `not-applicable` is always allowed because no coupling rule names it | CI runs the checker only through `npm test` (`test/skill-receipt.test.mjs` lines 258 to 264) on the latest log entry, with no diff and no base, so diff binding, coupling, and append-only are local checks only, and a PR that adds no entry passes if the previous entry is valid | `judge-arch/assets/skill-receipt.config.json` (4 rules); `check-skill-receipt.mjs` line 114 |
| Catalog gate | Every catalog entry has its fields and a citation token | CI, through `test/pattern-catalog.test.mjs` line 134 | `npm test` in `test.yml` |
| Consumer gate manifest | Nothing about patterns; `check-catalog-completeness` does not ship to consumers | Consumer CI | `gate-manifest.json` (11 gates) |

### 7.2 Findings

- **I1 (high, proven).** `[observed]` A `pattern-decision` record with "x" in every field and the decision
  "Repositry (17), the Florble pattern" passes the plan check (`check-task-plan.mjs plan`, exit 0, "present
  and complete"). The committed test fixture itself uses `decision: "d"` (`test/check-task-plan.test.mjs`
  line 160). So the v1.4 catalog work, as specified in sections 2 to 4, never reaches the record the agent
  writes. A correct registry and kit change nothing an agent is held to.
- **I2 (high, proven).** `[observed]` With `src/domain/orders/repository.ts`, `src/services/order-service.ts`,
  or `src/domain/orders/order-mapper.ts` as the changed file, a selection that marks `pattern-selector`
  `not-applicable` (reason "probe") passes the selection check (exit 0). No mechanism anywhere requires a
  pattern decision for a change to a repository, service, or mapper.
- **I3 (medium, observed).** The record has two owners that already disagree. `pattern-selector/SKILL.md`
  lines 84 to 99 define 16 fields; the validator's 14 keys cover 13 of them (it splits "Pros / cons" in two)
  and do not require "Candidates considered", "ADR", or "Real guarantee", though the skill's done-checklist
  (line 157) leans on "Real guarantee".
- **I4 (high, observed).** The global skill mirror that sessions outside this repo use is stale, and nothing
  reports it automatically. `[observed]` 14 of 335 tracked skill files differ and 10 are missing in
  `~/.claude/skills` (including `task-receipt.mjs`, `check-open-high-findings.mjs`, `readability.mjs`,
  `bdd-run.mjs`). The install marker and `package.json` both say 1.3.1, and the session nudge
  (`emit-directive.mjs` lines 65 to 92) compares version strings only, so it stays silent.
  `esk-init.mjs --check --personal --skills` does detect the drift through the marker's per-skill signatures
  (exit 1, 8 skills named), but no hook or CI job runs it. v1.4 changes will not reach those sessions unless
  the mirror is refreshed.
- **I5 (medium, observed).** On this machine no edit-gate, finish-check, or subagent-check hook is
  registered: only the directive hooks (user-level and project), plus an unrelated leftover PreToolUse probe
  on Bash in the git-ignored `.claude/settings.local.json`. `ESK_*` is unset. Every edit-time requirement
  below is inert here until `esk-init --enforce` is run.
- **I6 (medium, observed).** CI does not run the review-coverage gate or the open-HIGH gate against the real
  logs, and runs the receipt check only on the latest entry with no diff or base (see the table). For every
  v1.4 PR the full checks hold only if the author runs them, as `upstream-contributor-process.md` says.
- **I7 (low, observed).** The receipt's security-surface rule matches file names, so any WP file whose name
  contains "session" (this spec's `concurrency-and-session.feature`) forces `owasp-secure-coding-bdd` to
  `applied`. Seen on this branch; WP5 will meet it again.
- **I8 (low, observed).** The routing gate's `new-gate-needs-test` rule fires only on ADDED scripts. WP9
  modifies the existing `check-arch-rules-discriminate.mjs`, so no routing rule requires its test change;
  R9.2 and review are the only guard.
- **I9 (low, observed).** A selection or plan file written by Windows PowerShell 5 `Set-Content -Encoding
  utf8` carries a byte-order mark, and `check-task-plan.mjs` holds it as invalid JSON (fails closed, so it is
  safe, but it blocks a Windows agent that writes the record that way).
- **I10 (high, observed, found by the fresh-context verifier and re-run).** The edit-time router never fires
  its anchored rules. `edit-gate.mjs` line 89 passes the edited file's path as given, and Claude Code edit
  paths are absolute, while the routing globs are anchored to the repo root (`routing-lib.mjs` lines 17 to
  29). `[observed]` `check-task-plan.mjs selection` with `src/domain/orders/repository.ts` requires 2
  skills; with the same file as an absolute path it requires 0. A new ADR file under `docs/adr/` is held for a missing
  ADR verdict; the absolute form passes. So at edit time every rule starting `src/`, `lib/`, `app/`, `test/`,
  `tests/`, `docs/adr/`, `docs/decisions/`, `prisma/`, or `db/migrations/` is dead; only `**/` rules fire.
  This is a defect in today's enforcement, independent of v1.4, and it shaped how D1 is built (R3.14).
- **I11 (medium, observed).** The per-task receipt ignores the selection: `finish-check.mjs` line 263 does
  not pass `--selection` to `task-receipt.mjs`, so a skill selected as "applies" (such as `pattern-selector`)
  need not appear in the task's receipt.
- **I12 (medium, reported by the verifier from the code, not run).** The hooks default `ESK_SKILLS_DIR` to
  the relative `.claude/skills`, so the skill set and SKILL.md hashes come from the folder a session runs in,
  not from the global mirror. Whether the v1.4 registry and validator reach a consumer session depends on
  that folder.
- **I13 (low, observed).** Three routing maps do different jobs: `always-on/routing-rules.config.json`
  (file to skill, edit time), `judge-arch/assets/routing-rules.config.json` (file to artifact, PR CI), and
  `judge-arch/assets/skill-receipt.config.json` (receipt coupling). The glob matcher is written twice
  (`routing-lib.mjs` and `check-skill-receipt.mjs` line 230) and agrees today, with no single owner.

### 7.3 New requirements

- **R2.12 (WP2, I1).** The `pattern-decision` validator in `check-task-plan.mjs` MUST check every
  `<Name> (<page>)` token in the record against the PoEAA registry, with the same longest-name rule as R2.3,
  and hold on a mismatch or an unknown name. When the installed skills have no registry (an older mirror),
  it MUST pass with the notice "not-assessed: PoEAA registry not installed" rather than block, matching the
  edit-gate's existing "not wired" convention; the notice names the fix (refresh the skills).
- **R3.12 (WP3, I3).** The validator's field list and the record block in `pattern-selector/SKILL.md` MUST
  have one owner: the validator gains `candidatesConsidered` and `realGuarantee` (and accepts `adr` as an id
  or "none"), and a test MUST parse the SKILL.md block and fail when the two lists differ. The test fixtures
  that use one-letter values stay valid for the structural check but MUST NOT be the only fixtures.
- **R3.13 (WP3, I1).** The validator MUST hold when `decision` is neither "no pattern" (with a reason) nor
  names at least one pattern heading from the catalogs (GoF, enterprise, or a registry heading). A decision of
  "x" or "the Florble pattern" holds.
- **R9.7 (WP9, I1).** When `decision` names a pattern that has a kit rule or kit test shape, the validator
  MUST hold unless `verify` names that kit item by its exact name.
- **R9.8 (WP9, I8).** The WP9 PR MUST show the extended `check-arch-rules-discriminate.mjs` test failing
  when the clean-fixture check is removed, because routing will not require it.
- **R10.1 (release, I4).** The release that completes v1.4 MUST bump `package.json` to 1.4.0 so the session
  nudge fires, and its notes MUST tell operators to run `esk-init --skills` to refresh the mirror. Each
  intermediate PR SHOULD say in its description that the mirror stays on the old catalog until then.
- **R10.2 (WP5, I7).** The WP5 PR MUST mark `owasp-secure-coding-bdd` applied with a threat model for the
  Client Session State entry (tampering, elevation of privilege), not try to avoid the coupling.

### 7.4 Decision for the operator

**D1. Should a pattern decision be required, not optional, for design-shaped changes?** (Decided below.) Today nothing makes
`pattern-selector` required (I2). Two options:

- **Leave it optional (today's behavior).** `[observed]` (I2) The record is held to the validator only when
  the agent chooses to select the skill. R2.12, R3.12, R3.13, and R9.7 then raise the quality of records that exist, but an agent can still
  skip the decision on a repository change.
- **Make it router-required for design paths.** Add a rule to `always-on/routing-rules.config.json` (edit
  time) and to `skill-receipt.config.json` (receipt coupling) so changes under paths such as
  `**/repositories/**`, `**/services/**`, `**/domain/**`, `**/mappers/**`, and `**/gateways/**` require
  `pattern-selector` (a waiver still needs the operator). The globs MUST start with `**/` while the edit-gate
  still passes absolute paths (I10), or they will never fire at edit time. Cost: more records on routine edits in those folders, and the globs
  are generic, so a consumer repo with other folder names gets nothing until it tunes them.

**Decided 2026-10-31 by the operator: make it required.** `[reported]` The operator's answer, in their
words: "Make it required". R3.14 to R3.19 below carry it out in WP3. I10 (the edit-gate's absolute paths)
is still a defect in today's enforcement with its own fix outside v1.4; R3.14 is written to fire with or
without that fix (R3.19 requires a test of both path forms).

### 7.4.1 Requirements for D1 (WP3)

They land in WP3, not WP2, so the record becomes required in the same PR that makes the validator check its
content (R3.13). Requiring a record before the validator checks it would only multiply "x" records.

- **R3.14 (WP3, D1).** `always-on/routing-rules.config.json` MUST gain a rule with id `design-layer` that
  requires `pattern-selector` when a changed file matches any of: `**/repositories/**`, `**/repository/**`,
  `**/services/**`, `**/domain/**`, `**/mappers/**`, `**/gateways/**`, `**/*.repository.*`,
  `**/*.service.*`, `**/*.mapper.*`, `**/*.gateway.*`. Every glob MUST start with `**/` so it fires whether
  the edit-gate hands it a relative or an absolute path (I10). The file-name globs follow the existing
  `**/*.controller.*` form.
- **R3.15 (WP3, D1).** `judge-arch/assets/skill-receipt.config.json` MUST gain a coupling rule with the same
  id and the same globs, so a PR that touches those paths cannot mark `pattern-selector` not-applicable in
  its receipt. Where this is enforced, stated plainly: at edit time only in an enforced install with a plans
  file set (`edit-gate.mjs` runs plan mode only then, and files written through Bash skip the edit-gate);
  in the PR receipt only when the checker gets `--changed-list`, which CI does not pass yet (I6). The
  per-task receipt does not see it until I11 has its own change. The rule is real where it runs, and those gaps are
  not closed by v1.4.
- **R3.16 (WP3, D1, I13).** The two `design-layer` glob lists are one fact in two files. A test MUST fail when
  they differ, so they cannot drift apart. (Moving both maps to one owner is I13's fix, out of scope here.)
- **R3.17 (WP3, D1).** Required means a decision is recorded, not that a pattern is used. A record whose
  `decision` is "no pattern" with a reason MUST satisfy the rule (as R3.13 already allows).
- **R3.18 (WP3, D1).** Only an operator waiver frees a `design-layer` change from the record, using the
  existing `--waivers` path in `check-task-plan.mjs selection`. A test MUST show the agent cannot mark
  `pattern-selector` not-applicable on a matching path, and that the operator waiver frees it. The receipt
  checker has no waiver path today, so the two gates would disagree. WP3 MUST give the receipt coupling the
  same escape: a receipt may mark a coupled skill not-applicable only when it carries an operator waiver
  for that skill, naming who waived it and why, and a test MUST show the receipt fails without one.
- **R3.19 (WP3, D1).** Tests MUST show the rule fires for a relative path and for an absolute path, and MUST
  fail when the rule is removed from the config (a discriminating test, per `verifiable-quality-gates`). The
  WP3 PR description and the v1.4 release notes MUST name this as a behavior change for every enforced
  install: edits under those folders now need a pattern decision, and a repo with other folder names should
  tune the globs in both of its maps (edit-time routing and receipt coupling) together, since R3.16's
  equality test runs only in this repo.

Cost, stated plainly: routine edits in those folders now need a short record, and the globs are generic. A
glob such as `**/domain/**` also matches a docs folder of that name. `[observed]` In this repo the globs
match two tracked files, both planted-violation fixtures:
`.claude/skills/judge-arch/assets/discriminate-fixtures/domain/mirror.ts` and
`.claude/skills/judge-arch/assets/discriminate-fixtures/services/leak.ts` (source: `git ls-files` through
the `routing-lib.mjs` matcher). An edit to either would need a record or a waiver; WP9 edits that folder, so
its PR expects to carry one.

### 7.5 Not assessed

A live enforced session (edit-gate, finish-check, and subagent-check actually firing) was not run; the
findings above come from reading the code and running the checkers directly with test inputs. That Claude
Code hands the edit-gate an absolute `file_path` is from the tool contract and this session's own tool
calls, not a captured hook payload. How consumer repos tune their own routing maps was not checked. A
fresh-context verifier re-ran every claim in this section; its corrections (the receipt check's partial CI
run, `esk-init --check`, the leftover local hook) and its new facts (I10 to I13) are folded in.

## 8. Evidence for this spec

| Claim | State | Source | Limitation |
|---|---|---|---|
| The findings this spec answers | observed | the audit report, each finding with a book page and a repo line | one edition of the book (e-book, no printed pages) |
| The scenarios are valid Gherkin with full tags | observed | `check-gherkin-valid.mjs` and `check-bdd-tags.mjs` over `features/` and `evals/` here, exit 0; a planted bad tag made the tag gate exit 1 | not run by CI (these folders are not CI targets) |
| The arch-gate engine can express the kit rules | observed | `arch-gate.mjs` reads `include`, `exclude`, `forbid` (lines 177 to 179, 240) | the sample rules are not yet run against fixtures; WP9 proves them |
| The work packages fix the findings | inferred | each finding maps to a requirement and a scenario in section 2 | proven only when each package's scenarios run green |
