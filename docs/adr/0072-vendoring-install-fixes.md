---
status: "accepted"
date: 2026-10-23
decision-makers: mdenner
---

# Make a skills-vendoring consumer install green: arch-gate and reference-links skip the vendored tree, and the fixtures and manifest travel honestly

## Context and Problem Statement

A real consumer that adopts the skills with `esk-genesis` AND vendors them under `.claude/skills/` filed a batch
of issues showing the install does not pass out of the box (issues #117, #118, #126, #128, #142). The common
cause is the same one every prior consumer-install bug shared: the gates were never exercised end to end on the
documented vendoring layout, so several of them scan, resolve, or describe the vendored copy of the machinery as
if it were the consumer's product code.

- **#142 (HIGH, breaks every vendoring install):** `arch-gate`'s published `invoke` skipped only `scripts/ci`
  and `.githooks`, not `.claude/skills`, so it reported violations inside the vendored skill scripts (24 of
  them). Worse, a consumer could not fix it in config, because `config.ignore` matched bare directory NAMES
  (`ignoreDirs.has(e.name)`), so an anchored path like `.claude/skills` was a silent no-op, and the `invoke` is
  provenance-locked so a consumer cannot widen it.
- **#118 (HIGH, breaks every vendoring install):** `reference-links` had the same gap, flagging dangling links
  inside the vendored skill docs; its upstream ignore list lived in a config file that does not travel, and the
  `invoke` is provenance-locked.
- **#117 (HIGH):** `reference-links`'s discrimination test never got the three-way `GATE_DIR -> scripts/ci ->
  skill` resolution the other ten gate tests got in 1.2.1, so it ran 0 of 15 in a non-vendoring consumer and
  tested the wrong copy in a vendoring one.
- **#128:** the consumer manifest named machinery `test` files (`run-manifest-gates.test.mjs`,
  `gate-matrix.test.mjs`) that `esk-genesis` never installs.
- **#126:** the judge-arch discrimination fixture lived under `data/`, a directory many consumers gitignore, so
  it was silently dropped and the discriminate script then blamed `arch-gate` for a "missed violation."

## Decision

Fix each at the layer that owns it, each pinned by a discriminating test.

1. **arch-gate skips `.claude/skills`, and config ignore accepts anchored paths (#142).** The published
   `invoke` gains `--ignore .claude/skills` (anchored via `isIgnoredRel`, so a decoy `src/.claude/skills` is
   still scanned). `config.ignore` entries that contain `/` now join the anchored ignore-path list; bare names
   still match a directory at any depth. A violation in product code is still caught.
2. **reference-links gains `--ignore <dir>` (#118).** An ignored directory's docs are not scanned as citers,
   but every `.md` in the tree is still indexed as a link target, so a consumer doc may point into the vendored
   tree. The published `invoke` gains `--ignore .claude/skills`. Anchored, provenance-locked.
3. **reference-links's test gets the three-way resolution (#117),** mirroring `skill-gate-parity.test.mjs`, so
   it exercises the `scripts/ci` copy CI runs and no-ops cleanly upstream.
4. **esk-genesis omits the `test` field from machinery entries in the consumer manifest (#128).** Machinery is
   not in the gate matrix and never runs in a consumer; provenance compares machinery by id + sha256 only, so
   omitting the uninstalled test name is provenance-safe and honest.
5. **The discrimination fixture moves off `data/` to `domain/` (#126),** and the discriminate script now asserts
   each planted file exists, reporting a distinct "fixture missing (a .gitignore may have dropped it)" error
   instead of blaming arch-gate.

These are travelling changes (gate scripts + the manifest `invoke`/`sha256`), so they ship in the **1.3.1**
release. The matching 1.3.1 manifest asset is attached when the release is cut (provenance is release-bound).

## Consequences

* A consumer that vendors the skills and runs `esk-genesis` gets a green `enterprise-gates` board for its own
  product code; the two install-breakers (#142, #118) are closed for both documented topologies.
* Each fix has a discriminating test (arch-gate skips the anchored path but still catches product code;
  reference-links skips citers yet keeps targets and still flags an outside dangling link; the discriminate
  script distinguishes a missing fixture from an arch-gate miss; the consumer manifest names no uninstalled
  machinery test). Reverting any fix turns its test red.
* Trust boundary (recorded for the security review): the provenance-locked `invoke` is the tamper-proof lock a
  consumer cannot widen; `config.ignore` is deliberately consumer-trusted (a consumer could already hide a
  bare-named directory, and may now hide an anchored sub-path), because a consumer owns and can see its own
  config. The "cannot be weakened" guarantee lives on the released `invoke`, not on consumer config. The
  ignores are anchored, so a decoy `src/.claude/skills` is still scanned (pinned by a decoy test).
* Honest limit: these fixes make a vendoring consumer pass; the standing CI harness that builds such a consumer
  and runs the scaffolded gates on every upstream change (issue #133, the parent that keeps this class from
  recurring) lands as the next change in this release line, and is where the end-to-end proof lives.
