---
status: "accepted"
date: 2026-10-21
decision-makers: mdenner
---

# esk-genesis refreshes the files it owns on upgrade, and a consumer-lifecycle test guards it

## Context and Problem Statement

v1.2.1 (ADR-0068) fixed three consumer-install bugs. Two of those fixes live in files that `esk-genesis`
writes NO-CLOBBER, so re-running the installer, the documented upgrade path and exactly what the v1.2.1
release notes told consumers to do, never replaced the stale files and the fixes did not reach an existing
consumer:

* The **pre-push hook** (fix #1, forwarding each gate's `invoke`) was written only when absent:
  `installHook = hookAvailable && !hookExists`.
* The **`enterprise-gates.yml` workflow** (fix #3, the `GATE_DIR` discrimination-test step) was scaffolded
  only when absent: `if (!workflowExists) writeTracked(...)`.

Only fix #2 (the manifest `invoke` change) propagated on a re-run, because the manifest and the gate scripts
already refresh on a hash change (`needCopy = !exists || sha256 differs`), as does `apply-ruleset.sh`
(`installApplyScript = !exists(dst) || sha256 differs`). So the installer already had the right pattern for a
fix to travel; the hook and the workflow just did not use it. A consumer agent upgrading Swerl from v1.2.0 to
v1.2.1 reproduced this: re-running `esk-genesis` left both files at their v1.2.0 content.

The deeper pattern is the real lesson. Every consumer-install defect filed so far, the three in #112 and this
one, lives in the EXISTING-consumer path: a repo that vendors the skills, or one that is upgraded over time.
This repo dogfoods itself only as the ORIGIN, whose topology differs on every axis the bugs use (one real gate
copy, its own npm-script hook, never upgraded over itself). ADR-0068 named this limit directly ("not by a
standing vendored-consumer CI job"). The bugs are structural: the test surface does not match the deployment
surface, so consumer-only and upgrade-only conditions are never exercised.

## Decision

1. **`esk-genesis` refreshes the files it OWNS on upgrade**, using the same "write when absent OR when the
   on-disk copy differs" rule the gate scripts and `apply-ruleset.sh` already use. This covers the pre-push
   hook, `enterprise-gates.yml`, and the `install-hooks.mjs` helper. The workflow is generated content, not a
   copied file, so it is compared by an LF-stable hash of the string we would generate now (`sha256str`),
   matching the line-ending-stable hashing of ADR-0058. The plan output says "update" rather than "scaffold"
   when a file already exists.

2. **Files a consumer is expected to CUSTOMIZE stay no-clobber on purpose**: the ruleset JSON (a consumer may
   tune its enforcement) and `CODEOWNERS`. The refresh is scoped to esk-genesis-owned, regenerated-from-source
   files only, so a consumer's own tuning is never overwritten.

3. **Add a consumer-lifecycle discrimination test** (`test/consumer-lifecycle.test.mjs`): it installs a real
   consumer, makes the hook and workflow stale (a v1.2.0-era consumer), re-runs `esk-genesis`, and asserts both
   are back to current. It was proven to FAIL when the fix is reverted to no-clobber (the stale hook survives
   the re-run), so it detects the exact defect. This is the first course of the standing consumer-lifecycle
   harness ADR-0068 said was missing.

No gate's script, `sha256`, or `invoke` changed, so the gate set is identical to 1.2.1. This ships as **1.2.2**
(installer, test, and version only), a backward-compatible patch; the manifest version and `generatedFrom` are
bumped in lockstep with `package.json`, `package-lock.json`, and `VERSION`, and the 1.2.2 release asset carries
the matching manifest for provenance.

## Consequences

* An existing consumer that re-runs `esk-genesis` after an upgrade now actually receives hook and workflow
  fixes, so the release instruction "re-run `esk-genesis` to pick up the fixes" becomes true for all three
  v1.2.1 fixes, not one. Any future fix to an esk-genesis-owned file now travels to existing consumers by
  construction.
* Consumer tuning is preserved: the ruleset and `CODEOWNERS` are untouched. As with a pre-existing gate script,
  an overwritten owned file is not auto-restored on a mid-apply failure (the installer's rollback only undoes
  files it newly created); a re-run heals it.
* Honest limits. The new test covers the UPGRADE refresh on a non-vendoring consumer, simulating the prior
  release by staling the files rather than installing a real previous-release tag, and it does not yet cover
  the vendored-skills topology end to end. The full harness, "install the previous release, upgrade to HEAD,
  assert every travelling file is current, in both a vendoring and a non-vendoring consumer", is the tracked
  follow-up and is the floor the auto-reconcile direction depends on. CI is Linux; Windows-only behavior (exec
  bit, line endings) stays covered by the existing platform guards.
