# Changelog

All notable changes to this repository are recorded here. Dates are ISO (YYYY-MM-DD). This project follows
semantic versioning for the skills library and its gates.

## 1.3.1 - 2026-10-23

A consumer-install correctness release: a batch of issues (#117–#153) from a real consumer that adopts the
skills with `esk-genesis` and vendors them under `.claude/skills/` showed the gates were never exercised
end to end on that layout. This release makes a vendoring consumer install green, hardens the gates to fail
closed and match on anchored paths, and adds the CI harness that keeps the whole class from recurring.

### Fixed (a vacuous gate pass is now visible, ADR-0089)

- **The aggregate board and the required check distinguish a vacuous pass from a real one (#150).**
  `run-manifest-gates` now detects a gate that exits 0 having found nothing in its scope (the `--allow-empty`
  marker) and renders it `○ <id> vacuous (nothing in scope)` instead of `✓`, ends with a note listing the vacuous
  gates, and in GitHub Actions emits a `::warning::` plus a job-summary line. A vacuous pass is still a pass (it
  does not fail the aggregator); it is only reported apart, so a green board is not mistaken for full coverage.
- **The JS scan gates (`no-ua-sniffing`, `owasp-lints`) ignore `.githooks`**, so a genesis-only consumer is not
  told "1 source file scanned" for the installer's own hook; it correctly reads as vacuous.
- The aggregator is machinery (its sha256 is recomputed; parity/provenance/upstream-integrity re-verified); the
  two invoke changes are not a sha change and no gate script is edited. Pinned by a discrimination test (a vacuous
  pass renders `○`, a real pass `✓`, a failure that prints the marker is still `✗`).

### Fixed (the changelog joins the logs under the union merge driver, ADR-0087)

- **`CHANGELOG.md` now uses git's `union` merge driver, like the two append-only logs already did.** Every PR
  edits three shared files (the receipt log, the arch-review log, and the changelog); the logs were already
  `merge=union` (via the bare `log.jsonl` rule), but the changelog was not, so it was the one that still conflicted
  on every merge after the first. Adding `CHANGELOG.md merge=union` makes a merge keep both PRs' new entries
  instead of raising a conflict (GitHub honors the base branch's `.gitattributes`). `union` stays scoped to these
  accumulating text files, never source code.
- Repository configuration, not a manifest gate, so no sha/provenance change. Proven by a discrimination test
  (two branches appending to a `union` log merge cleanly, conflict without it, and `git check-attr` confirms all
  three real paths resolve to `merge=union`).

### Fixed (vendoring install, ADR-0072)

- **arch-gate no longer fails a vendoring consumer (#142).** Its published `invoke` now skips `.claude/skills`
  (anchored), and `config.ignore` accepts anchored relative paths, not only bare directory names, so a consumer
  can ignore a path and a path entry is no longer a silent no-op. Product-code violations are still caught.
- **reference-links no longer fails a vendoring consumer (#118).** It gains an anchored `--ignore <dir>` that
  skips a directory's docs as citers while still indexing them as link targets; the published `invoke` skips
  `.claude/skills`.
- **reference-links's discrimination test gets the three-way `GATE_DIR` resolution (#117)** the other ten gate
  tests already had, so it runs in a consumer and tests the `scripts/ci` copy CI runs.
- **The consumer manifest no longer names machinery test files that `esk-genesis` never installs (#128).**
- **The judge-arch discrimination fixture moved off `data/` (a commonly gitignored dir) to `domain/`, and the
  discriminate script now reports a missing fixture distinctly instead of blaming arch-gate (#126).**

### Added (vendored-consumer CI harness, ADR-0073)

- **A standing harness that runs the gates on the documented vendoring layout, upstream, before release
  (#133).** It builds a repo that vendors the skills under `.claude/skills/` (a Python + npm consumer), runs
  `esk-genesis`, then runs every scaffolded gate green and a representative discrimination test in that layout.
  A change that breaks a vendoring consumer now turns the upstream suite red. Proven to discriminate (reverting
  the arch-gate fix makes it fail). This is the structural guard that keeps the whole consumer-install bug class
  from recurring.
- **The harness strips `NODE_TEST_CONTEXT` from child `node --test` runs (#119),** so a neutered copied gate
  test can no longer false-pass; a vacuity guard fails if the stripping regresses.

### Hardened (arch-gate detection + reporting, ADR-0074)

- **arch-gate now fails closed on an unreadable path (#149)** instead of reporting PASS on a tree it could not
  fully read, **reports `evaluated X of Y` files (#127)** rather than the walked total, **covers Python**
  (`except: pass`) and **warns when zero code files were evaluated (#146)**, and **`emptyCatch` now flags an
  empty `.catch(() => {})` arrow handler (#124)**, not only a `catch {}` block. Each pinned by a discrimination
  test.

### Hardened (esk-init --check truthfulness, ADR-0075)

- **`esk-init --check` and its canary now tell the truth about the real installed state.** The canary runs the
  hook entry **as configured** (not the installer's own Node against the raw emitter), so a hook command that
  cannot start fails `--check` (#138); `--check` reports drift when the hook points at a **different clone**
  than the one it runs in (#136) and when this clone has **uncommitted `always-on/` edits** that would serve
  unreleased directive text (#135); and the drift message prints the **real** `esk-init.mjs` path with the
  user's scope flags and names the scope it checked (#137). Each pinned by a discrimination test.

### Hardened (scan gates fail closed and match precisely, ADR-0076)

- **retention-basis no longer prints OK for a scan it did not do (#145).** `--map` is required; no `--map`, or
  an explicit `--map` to a missing file, fails closed (exit 2). The published `invoke` adds `--map-optional`,
  which turns a genuinely-absent map into a DISTINCT vacuous pass (`OK [vacuous] - no data map at …`), so a
  consumer without a declared inventory stays green while a mistyped path can no longer read as a completed
  check.
- **no-ua-sniffing tracks multi-line block-comment state (#153),** so `navigator.userAgent` named in JSDoc
  prose is no longer flagged (the root cause of the earlier #112 item 2), while a real sniff in code is still
  caught; the ignore directive now also accepts the JSDoc ` * ua-sniff:ignore …` continuation form.
- **reference-links resolves a Markdown link target relative to the citing file, case-sensitively (#147),** so
  a dangling link to `docs/missing/README.md` is caught even when another `README.md` exists elsewhere; prose
  mentions keep the basename rule. Four broken upstream cross-reference links are repointed in the same change.
- **reference-links honours `GATE_REPO_ROOT` and fails closed on an unreadable path (#121),** instead of
  scanning above the repo on an arg-less run or counting an unreadable `.md` as scanned and clean.
- Three gate scripts changed content, so their manifest `sha256` is recomputed; `retention-basis` also changed
  its `invoke`. Each fix is pinned by a discrimination test.

### Hardened (hook arming never disables existing hooks; pre-push fails closed, ADR-0077)

- **`install-hooks.mjs` arms only at the repository root (#143).** Run from a package nested inside another
  repository, it no longer writes that enclosing repo's `core.hooksPath`; it compares the repo top-level with
  its own package root and changes nothing if they differ.
- **Arming never disables a consumer's existing hooks (#131).** Both `install-hooks.mjs` and `esk-genesis` now
  leave `core.hooksPath` unset when a `.pre-commit-config.yaml` or a real `.git/hooks` hook is present (setting
  it is repo-wide and would stop those hooks running), and print how to arm the pre-push hook without clobbering.
- **Non-npm consumers get correct arming guidance (#139).** `esk-genesis` prints the pre-commit route for a
  pre-commit repo and the `git config` command otherwise, and names that the setting is repo-wide.
- **The pre-push hook fails closed on a broken manifest (#122).** An absent manifest still passes (the
  documented case), but a present-but-unparseable, gates-less, or zero-gates manifest now exits 1, mirroring the
  CI runner, so a push cannot slip a violation past the hook by also corrupting the manifest.
- Each fix is pinned by a discrimination test; none of these files is a manifest-tracked gate, so no
  sha/provenance change.

### Hardened (esk-init skills mirror never deletes local content, ADR-0078)

- **A reconcile no longer silently deletes local content under a mirrored skill (#130).** `esk-init --skills`
  now re-mirrors only the skills whose source actually changed (not all of them), and before replacing a skill
  whose installed copy has local changes on disk it backs the copy up to a timestamped `<skill>.esk-local-*`
  folder and lists it in the plan, instead of discarding it; if the backup cannot be written it stops rather than
  replace-and-lose.
- **`--check --skills` now fingerprints the installed TARGET,** so a mirrored skill whose on-disk copy drifted
  from what was installed (a stale or hand-edited copy) is reported as drift instead of passing — and that drift
  is self-healing: `--yes --skills` (the remedy `--check` prints) re-mirrors the drifted skill, backing up any
  local change, so the next `--check` is green.
- **The guarantee holds across the upgrade transition** (a fresh-context review caught this as a silent-data-loss
  hole): the backup decision is baseline-agnostic, so the first reconcile after upgrading from a marker that
  recorded no signatures still backs up a diverged target rather than deleting it. A present-but-unreadable target
  stops the run rather than being replaced blindly.
- esk-init is the bootstrap installer, not a manifest gate, so no sha/provenance change. Each fix is pinned by a
  discrimination test.

### Hardened (generated CI workflow can't be hollowed; one fetch error can't red it, ADR-0079)

- **The parity and provenance gates run DIRECTLY in the generated workflow, not through the runner they verify
  (#120).** `skill-gate-parity` and `manifest-provenance` now run their own `check-<gate>.mjs` instead of
  `run-manifest-gates.mjs --only`, so a no-op or weakened runner can no longer make the parity job pass vacuously
  and defeat the drift/tamper detection it advertises; every other gate still runs via the aggregator.
- **Only the manifest-provenance job fetches the upstream manifest (#125),** so a transient github.com error can
  red at most that one job instead of the whole required check, and a run makes one download instead of one per
  gate; the fetch now retries a transient error.
- Workflow-template only (no gate/machinery/manifest change, so no sha/provenance change). Pinned by
  generated-workflow assertions plus a behavioral harness check that a no-op runner is caught by the direct parity
  invocation.

### Hardened (a gate pins its discrimination test's content, ADR-0080)

- **Replacing a copied discrimination test with a hollow always-pass one is now caught (#123).** Each gate carries
  a `testSha256` (LF-normalized hash of its test), so the test's *content* is pinned, not just its path:
  `check-upstream-manifest-integrity` requires it and verifies it against the real test at the source,
  `check-manifest-provenance` holds a consumer's value to the published release, and `check-skill-gate-parity`
  fails on a committed test that drifts from it. Before this, the discrimination-test CI step proved nothing once
  its test was swapped out.
- The two gate scripts that gained the check (parity, provenance) have their manifest `sha256` recomputed; the
  manifest gains `testSha256` on every gate. Each fix is pinned by a discrimination test.

### Fixed (command-line tools recognize --help and reject an unknown flag, ADR-0081)

- **`--help` / `-h` now prints usage and exits 0 on `esk-init`, `esk-genesis`, `check-skill-receipt` and
  `claim-lint` (#140),** instead of running an install plan or a check.
- **An unknown `--flag` is now rejected with exit 2** on all four, so a typo (for example `esk-init --persnal`,
  a misspelling of `--personal`) can no longer be silently ignored and fall back to a different scope or mode.
- CLI scripts, not manifest gates, so no sha/provenance change. Each behavior is pinned by a discrimination test.

### Fixed (the local pre-push scans only what CI scans, ADR-0082)

- **The pre-push hook no longer fails on gitignored files (#134).** It collects git's ignore set
  (`git ls-files --others --ignored --exclude-standard`) and passes those paths as extra `--ignore` to each gate
  that accepts `--ignore`, so an uncommitted local directory (a Python `.venv`, a build cache) can't fail the
  local hook on files CI never scans. A developer is no longer pushed toward `--no-verify` for a local-only false
  positive.
- This is a local, hook-only adjustment scoped to exactly what git ignores: it changes nothing in the manifest
  (provenance/parity unaffected, the ADR-0061 invoke-lock intact) and is NOT a path-level waiver. The requested
  consumer-owned waiver for a *committed* path is deliberately deferred to its own decision. Pinned by a
  discrimination test.

## 1.3.0 - 2026-10-21

One source of truth for the repo's own gates, so the local pre-push and CI cannot silently diverge. A new
minor (a new parity capability, not a bugfix); no change to the travelling gate set, so a consumer sees no new
required check.

### Added

- **`self-checks.json` + a parity gate.** The repo's own `check:*` gates are now declared in one committed
  file that classifies each as `local` (runs in the pre-push) or CI-only (with a stated reason). The pre-push
  hook reads it and runs the local gates (failing closed if it is missing or malformed) instead of a hardcoded
  list, and `test/self-check-parity.test.mjs` (part of `npm test`) fails if a `check:*` script is added
  without being classified, if a classification names a script that does not exist, or if the hook stops
  sourcing its list from the file. So the local pre-push and CI can never silently diverge. Discriminating:
  adding an unclassified `check:*` turns the parity test red (ADR-0071).

## 1.2.2 - 2026-10-21

A bugfix release for the v1.2.1 upgrade path. v1.2.1 told existing consumers to re-run `esk-genesis` to pick
up its fixes, but two of the three fixes never reached an existing consumer, because `esk-genesis` wrote the
two files that carry them only when they were absent. No gate behavior changes; the gate set is identical to
1.2.1. Existing consumers should re-run `esk-genesis` (now it actually refreshes those files).

### Fixed

- **`esk-genesis` now refreshes the files it owns on upgrade, not only on first install.** The pre-push hook
  and `enterprise-gates.yml` were no-clobber (written only when absent), so v1.2.1's hook fix (forwarding each
  gate's `invoke`) and workflow fix (the `GATE_DIR` discrimination-test step) never reached a repo that already
  had those files. They now install when absent OR when the on-disk copy differs from the current source, the
  same refresh the gate scripts and `apply-ruleset.sh` already use. The `install-hooks.mjs` helper refreshes the
  same way. Files a consumer is expected to customize (the ruleset JSON, `CODEOWNERS`) stay no-clobber on
  purpose (ADR-0069).

### Added

- **A consumer-lifecycle test** (`test/consumer-lifecycle.test.mjs`) stands up a real consumer, makes its hook
  and workflow stale, re-runs `esk-genesis`, and asserts both are refreshed. It is a discrimination test: it
  fails if `esk-genesis` reverts to no-clobber on those files. This is the first step toward the standing
  consumer-lifecycle harness ADR-0068 flagged as missing, since every consumer-install bug so far has lived in
  the existing-consumer path that the origin self-dogfood never exercises (ADR-0069).

## 1.2.1 - 2026-10-20

A bugfix release for three problems found installing 1.2.0 into a consumer repo that also vendors the skills
under `.claude/skills/` (issue #112). All three are consumer-install correctness fixes; 1.2.0 consumers should
re-run `esk-genesis` to pick them up. No gate behavior changes for a repo that does not vendor the skills.

### Fixed

- **The pre-push hook now passes each gate's `invoke` arguments.** The hook ran every offline gate with no
  arguments, so the gates that scan by CLI path (`reference-links`, `no-ua-sniffing`, `owasp-lints`,
  `migration-safety`, `alert-hygiene`, `untagged-pii`) failed locally with a wrong root or "no paths given",
  while CI (which runs them through the aggregator) passed. The hook now validates and forwards `gate.invoke`
  the same way the aggregator does, and fails closed on a malformed `invoke`. A new hook test proves a gate
  that needs its arguments gets them, and blocks when they are dropped (ADR-0068).
- **The code-scan gates no longer flag a vendored copy of themselves.** A consumer that vendors the skills
  carries the gate scripts a second time under `.claude/skills/`, whose own docstrings contain the very
  patterns the gates look for (a `navigator.userAgent` read, an `alg:none` example). The published `invoke`
  for the five content-scan gates now also skips `.claude/skills`, the same exemption the copied gate
  infrastructure at `scripts/ci` already gets (ADR-0061). Vendored skills are not product code (ADR-0068).
- **Each gate's discrimination test now exercises the `scripts/ci` copy CI actually runs.** When the skills
  are vendored, both a `.claude/skills` copy and the `scripts/ci` copy exist; the test resolved the
  `.claude/skills` copy first, so the consumer's "discrimination test" step tested the wrong file. The tests
  now prefer the `scripts/ci` copy (via `GATE_DIR`, which the workflow now sets on that step) and assert which
  copy they ran (ADR-0068).

## 1.2.0 - 2026-10-18

The engineering gates travel. 1.1.0 made turning the always-on directive on, and staying current, close to
automatic. 1.2.0 makes the **checks themselves travel into a repo that adopts them and enforce in that repo's
CI**, so adopting the skills enforces them on the project's own code instead of only reminding an agent to
follow them. No action is needed to keep using 1.1.0; adopt a consumer repo with `esk-genesis` to pick up the
travelling gates.

### The gates travel to consumers

- Eight engineering gates now install into an adopting repo and run in its CI, up from zero:
  `reference-links`, `no-ua-sniffing`, `owasp-lints`, `migration-safety`, `alert-hygiene`, `arch-gate`,
  `untagged-pii`, and `retention-basis`. `esk-genesis` copies the gate scripts and the manifest into the
  consumer and scaffolds one GitHub workflow; `gate-manifest.json` is the single source of truth for what runs
  (ADR-0059, 0060, 0061, 0062, 0063, 0064).
- Gates declare how they scan through a manifest `invoke` field, so a gate that needs arguments (a scan scope,
  a data map) travels with them (ADR-0059). The code-scan gates skip the vendored gate infrastructure and test
  fixtures without opening an evasion hole (ADR-0061).
- `arch-gate` travels with an optional config and a safe default: a config-less consumer still gets the
  built-in checks (ADR-0063). The PII and retention gates travel with an optional data map whose empty default
  is strict for undeclared PII and a no-op for retention, so you cannot delete the map to silence both
  (ADR-0064).

### Visible, and drift-proof

- One CI check line per gate, generated from the manifest, with a single required summary check behind them
  (`enterprise-gates`) that is green only if every gate passed. Adding or removing a gate never needs a
  branch-protection change (ADR-0065).
- The same gate scripts run in a local pre-push hook (a fast, skippable early catch) and in CI (the
  authority). Only the provenance gate, which needs the network to fetch the published release, is CI-only.
- The consumer's own CI runs each gate's discrimination test, so a gate hollowed out to always pass is caught
  in the adopting repo, not only upstream (ADR-0065).

### Cannot be quietly weakened

- The provenance gate now compares each gate's scan scope (`invoke`), not just its content hash and lane,
  against the published release, so a consumer cannot narrow what a gate scans and still pass (ADR-0061).

### Turning enforcement on (not just running)

- The gates run on every pull request, but they only BLOCK a merge once an admin requires the `enterprise-gates`
  check in branch protection. Nothing in a repo can turn that admin-only setting on, so the always-on hook now
  injects a loud, every-session nudge in a consumer whose gates are advisory, telling the agent to tell the
  human to turn enforcement on (`scripts/apply-ruleset.sh`), cleared on intent + confirm (a committed ruleset
  that requires the check, active and on the default branch, plus the applied-marker the script writes).
  `esk-genesis` scaffolds the ruleset and travels the apply script, so turning it on is one admin command
  (ADR-0066).

### Honest coverage, and every test runs

- A coverage map (`docs/coverage-map.md`) records how each of the 16 skills is enforced: six travel as CI
  gates, four have a local gate that needs consumer input, two have repo-self gates, and four are human
  judgment. A test keeps the map from drifting (ADR-0067).
- A guard now fails if any test file is not wired into `npm test`, after three test files (the per-gate matrix,
  the enforcement nudge, and the coverage map) were found not running in the required CI job. They run now, and
  the guard prevents a test from ever again being silently skipped (ADR-0067).

### What does not travel, on purpose

- The accessibility conformance check and the test-shape check stay local: one needs a human-authored
  conformance record, the other a live test report, and neither can be safely defaulted. About half the
  skills are judgment work (design choices, pattern selection, operational readiness) with no mechanical gate;
  those stay with human review. This is documented in the README and the coverage map.

### Fixes found while building

- The installer was dropping each gate's scan arguments, so travelling gates ran on nothing in a consumer;
  fixed and regression-tested (ADR-0061). A Windows pre-push hook passed while running zero gates (ADR-0056),
  and a line-ending bug broke the gate hashes on Linux CI (ADR-0058); both fixed. Consumer gate-test paths now
  resolve in either layout (ADR-0057).

## 1.1.0 - 2026-10-16

Adoption and enforcement hardening. 1.0.0 made the skills required and shown; 1.1.0 makes turning them on, and
staying current, close to automatic, and makes the installer safe to run against a repo that already has its
own enforcement. The skills and gates themselves are unchanged; this release is about getting them switched on
reliably and keeping them from going stale. No action is needed to keep using 1.0.0; upgrade to pick up the
adoption tooling below.

### Getting protected, with fewer steps

- The installer arms the local pre-push gates with zero extra steps on `npm install`, and this repo now
  dogfoods that on itself: clone, `npm install`, and your next push runs the fast offline gates locally
  (ADR-0053). CI stays the authority; the hook is an early-catch convenience.
- A committed repo hook now travels. `esk-init` writes a portable `${CLAUDE_PROJECT_DIR}` emitter path for a
  committed, repo-scoped settings file, and refuses to commit a machine-specific path, so a shared hook is not
  dead on every other clone. The decision is keyed on the resolved user-level target, case-folded on Windows
  (ADR-0051).

### Staying current

- When a session starts on an install that is behind the repo, the always-on hook now injects a loud,
  persistent nudge: it states the version gap, explains the benefit, gives the one-step sync command, and asks
  the agent to relay it and offer to run it. It keeps this up every session (up to a cap, then a quiet
  one-liner), restarts on a new version, and clears the moment you sync (ADR-0054).

### Safe to adopt, including over an existing system

- `esk-genesis` refuses by default to reconcile against a foreign `gate-manifest.json` (one it did not write),
  because reconcile would delete gates it does not own. Take one over deliberately with `--adopt-existing`,
  which backs it up and keeps the existing gates as repo-local, deleting nothing (ADR-0052).
- `esk-genesis --code-owners "<@user ...>"` scaffolds a `.github/CODEOWNERS` over the enforcement paths
  (no-clobber, fail-closed on an invalid handle) and prints the one-time ruleset setting to require code-owner
  review. The `bootstrap` skill now asks the user whether they want it, as an informed choice (ADR-0055).
- The `bootstrap` skill documents the two installers plainly: `esk-init` turns the directive on for sessions;
  `esk-genesis` installs the CI gates that block a merge. A fully protected repo runs both.

### Honest limits (unchanged from the design)

- A `git pull` never arms anything by itself; the realistic zero-friction path is one `npm install`. Git runs
  no code on pull and will not auto-run a cloned repo's hooks, by design.
- A scaffolded `CODEOWNERS` is necessary but not sufficient: a human still enables the require-code-owner-review
  ruleset rule, which the installer cannot do. The local pre-push runs the fast offline gates only; the full
  test suite, routing, and provenance stay CI's job.

## 1.0.0 - 2026-10-13

First stable release: a vendor-neutral library of enterprise engineering skills for AI coding agents, with the
mechanical gates that keep each skill's guarantees honest, plus the always-on layer and the receipt that make a
skill not just available but required and shown.

### The skills

Sixteen always-on skills, each written to the same depth (a cited evidence section, a claim-to-proof map, stated
limitations), each loadable on a `git pull` from `.claude/skills/`:

- Engineering: enterprise-architecture-standards, pattern-selector, architectural-decision-records,
  owasp-secure-coding-bdd (one reference file per OWASP cheat sheet, 137 of them), bdd-comprehensive-testing,
  comprehensive-test-strategy, release-deployment-safety, sre-operational-readiness, compliance-data-lifecycle,
  judge-arch, arch-encode, verifiable-quality-gates, skeptical-audit.
- Universal UI requirements: universal-accessibility-wcag, universal-browser-device-support,
  usability-ux-universal-design.

### Enforcement, not trust

- An always-on directive reaches every in-repo session (committed `CLAUDE.md` import and `.claude/settings.json`
  hook) and, through the installer, any session on a machine, so the relevant skills are required, not optional.
- Mechanical gates, each with a discriminating test proven to detect (and mutation-checked): the architecture
  gate, routing (change-type to required-artifact), reference-link integrity, the OWASP coverage and lint and
  catalog gates, migration-safety, alert-hygiene, PII and retention gates, the a11y checklist and axe verdict,
  UA-sniffing, the BDD gherkin/coverage/tags gates, the test-shape gate, the claim-lint and evidence-contract
  gates, the coverage and mutation meta-gates, and the ADR gates.
- A fresh-context judge-arch review on every change, recorded in an append-only log.
- A skill-application receipt per change (`docs/skill-receipts/log.jsonl`): every skill covered, each applied
  one grounded in a real skill heading, a verbatim quote from it, and files in the change. The gate proves the
  receipt is grounded, not that the work is good, so a human still reviews it.

### Honest limits (stated, not hidden)

The gates prove routed artifacts exist and the repo passes its checks; no required check reads the review log or
the receipt for truth, and a review's quality and a receipt's honesty remain a human-review concern. A couple of
gates are dependency-free text linters with documented blind spots (the evidence contract is presence-based; the
UA-sniffing linter covers the sniffing surface, not an AST). The merge-blocking CI wiring for the receipt and
review-coverage gates is deferred to the techfleetnetwork CI/CD release.

### Before the release

A full post-rewrite re-audit and a final adversarial false-negative / false-positive pass over every gate closed
about twenty holes (see `docs/adr/0033` through `docs/adr/0040`), so 1.0 ships gates that resist the natural
evasions, each pinned by an adversarial test.
