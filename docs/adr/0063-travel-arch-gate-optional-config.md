---
status: "accepted"
date: 2026-10-18
decision-makers: mdenner
---

# arch-gate travels to consumers with an optional config and a safe default

## Context and Problem Statement

The deterministic architecture gate (`arch-gate.mjs`) is the highest-value tier-2 gate to make travel: every
code repo benefits from its built-in error-handling checks (empty catch, swallowed return, keep-in-sync). But
it did not fit the travelling model as written:

- It **required** a config file: `readJson(CONFIG_PATH)` had no fallback, so a consumer with no
  `arch-gate.config.json` got exit 2 (a confusing fail-closed, not a useful result).
- It scans the whole working directory, and a genesis'd consumer's tree contains the **vendored gate
  machinery** that does not belong to the consumer's application: `scripts/ci/*` (the copied gates, which use
  deliberate best-effort catches), `.githooks/install-hooks.mjs` (another intentional best-effort catch), and
  the copied **test files** (which carry intentionally-bad fixtures, including `arch-gate.test.mjs`'s own
  empty-catch test data). With the built-in checks on, arch-gate flagged all of these.

This repo's own `arch-gate.config.json` sidesteps the problem by turning the built-ins **off** (its comment
says they "belong in an adopter's application config"). That is right for this repo, but a consumer needs the
built-ins **on** against its application code while not tripping over the vendored machinery.

The chosen config model for tier-2 gates (per this program's decision) is **optional config with a safe
default**: a clean consumer is green on day one, and the gate only reds when there is something real to fix or
configure, rather than scaffolding a stub and failing closed until it is filled.

## Decision

Make `arch-gate.mjs` travel, with a safe default and a scan scope that excludes the vendored machinery.

1. **Config is optional.** `readJson(CONFIG_PATH, {})` falls back to `{}` when no `arch-gate.config.json` is
   present. With `{}` the built-in checks default on, so a config-less consumer gets real tree-wide
   enforcement of empty-catch / swallowed-return / keep-in-sync rather than exit 2. A repo that wants custom
   forbidden-pattern rules commits the config file, exactly as this repo does.
2. **Skip the vendored machinery.** A new repeatable `--ignore <relpath>` flag skips a directory by its path
   relative to the scan root (cwd-anchored prefix, so a decoy `src/scripts/ci` elsewhere is still scanned).
   The manifest `invoke` is `["--ignore", "scripts/ci", "--ignore", ".githooks"]`. The `invoke` is frozen for
   consumers by the provenance binding (ADR-0061), so a consumer cannot widen it to hide its own code.
3. **Skip test directories by default.** `test`, `tests`, `__tests__` and `spec` are added to
   `DEFAULT_IGNORE`, matching the five already-travelling gates. Test files carry intentionally-bad fixtures
   (an empty catch as test data) that would false-red the built-ins, and the copied `arch-gate.test.mjs` is
   itself such a file in a consumer's `test/`.
4. The script is marked `// bootstrap-v2-gate: arch-gate` and listed in the manifest with its skill
   (judge-arch), normalized sha256 (ADR-0058), test, `lane: required`, and the `invoke` above. Its test
   resolves the gate dual-path (upstream or `scripts/ci`) and is in the CONSUMER-TESTS meta-test.

## Consequences

* arch-gate is the sixth travelling gate and the first tier-2 (config-shaped) one. Verified end to end:
  genesis a fresh consumer with clean application code and all nine manifest gates pass; add an empty catch to
  `src/` and arch-gate goes red and the aggregator fails. The vendored `scripts/ci`, `.githooks`, and test
  directories are not scanned.
* Behavior change for this repo and for adopter presets: `DEFAULT_IGNORE` now skips test directories, so
  arch-gate no longer lints test code anywhere. This repo's own gate still passes (its rules target
  `.claude/skills/**` and `**/scripts/*.mjs`, not `test/`; the scan dropped from 472 to 432 files with no
  change in result). This skip is **unconditional and not overridable**: `config.ignore` can only add to the
  ignore set, so a repo cannot re-enable scanning its test code. That is a deliberate blanket exemption, for
  the same fixture reason the other five travelling gates skip tests, and the honest cost is that an adopter
  with real logic under a `test`/`spec` directory does not get built-in enforcement there. It is global rather
  than travel-scoped on purpose: a travel-only `--ignore` prefix would skip only a top-level `test/`, not the
  nested test directories (`src/**/__tests__`) where fixtures also live.
* Honest limitation: the optional-config default means a config-less consumer runs only the three built-in
  checks, not any custom forbidden-pattern rules (those require a committed config). That is the intended safe
  floor: real enforcement with zero setup, more when the consumer opts in.
* Honest limitation: skipping `scripts/ci`, `.githooks` and test directories means a consumer could in
  principle relocate code there to dodge the gate. This is the same bounded tradeoff as the other travelling
  gates (the ignore set is provenance-frozen and the gate is a portable floor the repo owner opts into, not an
  adversarial sandbox against that owner).
