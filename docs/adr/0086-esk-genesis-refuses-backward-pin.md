---
status: "accepted"
date: 2026-10-24
decision-makers: mdenner
---

# esk-genesis refuses to move a consumer's pin backward without an explicit opt-in

## Context and Problem Statement

`CONTRIBUTING.md` states the guarantee: "Consumers upgrade forward only. `esk-genesis` reconcile moves a
consumer to a newer pinned version and cannot move it backward." The tool did not enforce it (issue #144).
Run from an older source, or given `--version <lower>`, `esk-genesis` moved a consumer's pin DOWN (for example
1.2.1 to 1.2.0) with exit 0 and no warning. An older pin reintroduces version-specific bugs, for example a
v1.2.0 `invoke` that lacks `--ignore .claude/skills`, so a vendored gate fails on its own copy (#112 item 2).

`check-manifest-provenance` does not catch this, and that is by design: provenance is an offline, stateless
gate that verifies the committed manifest is faithful to the release it pins (same gate ids, sha256, lane,
invoke). A consumer correctly pinned to v1.2.0 matches v1.2.0's release, so provenance passes. Provenance has no
notion of "the latest release," makes no network calls, and keeps no history, so it cannot by itself tell a
freshly-installed v1.2.0 consumer from one that was downgraded. Teaching it recency would mean a network call
and making a required fail-closed gate react to "behind latest," which would break every consumer the moment a
new release lands. The pin only ever changes at genesis, so that is the right layer to enforce forward-only.

## Decision

`esk-genesis` compares the version it is about to pin against the version the target's existing (ours) manifest
already pins. If the new version is strictly lower and the operator did not pass `--allow-downgrade`, it refuses
(exit 2) before writing anything, naming the forward-only guarantee and the `--allow-downgrade` escape. A forward
move and a same-version reconcile are unchanged. The comparison is a numeric three-part semver compare of two
already format-validated `x.y.z` strings (no new dependency).

`check-manifest-provenance` is deliberately left unchanged: it stays offline, stateless, and
faithfulness-only. Enforcing forward-only at the point of change (genesis) is both sufficient for the reported
path and architecturally cleaner than adding recency state or network IO to a required gate.

`esk-genesis.mjs` is the installer, not a manifest gate, so there is no sha/provenance change; this ships in the
1.3.1 line. The behavior is pinned by discrimination tests: a backward reconcile is refused (exit 2) and leaves
the pin unchanged, `--allow-downgrade` permits it, and a forward or same-version reconcile is allowed.

## Consequences

* A consumer that runs an older `esk-genesis`, or passes `--version <lower>`, is stopped with a clear message
  instead of silently losing the newer gates and their fixes. The documented forward-only guarantee is now
  enforced, not just asserted.
* A deliberate downgrade is still possible with `--allow-downgrade`, so a consumer that genuinely needs to pin
  an older version (for example to reproduce a bug) is not blocked, but must say so explicitly.
* Honest limits: the block is at the tool. A consumer who BY HAND edits `version` down in its committed manifest
  and re-vendors the older skills is not caught here, because that is a deliberate manual change, and provenance
  (which validates faithfulness to the pinned release, not recency) passes a self-consistent older manifest. Catching
  that would need a recorded version floor or a network "behind latest" check; both were judged out of scope for
  this fix, which closes the reported tool-driven silent-downgrade path. The compare assumes well-formed `x.y.z`
  versions, which both the source version and the consumer manifest version are already validated to be.
