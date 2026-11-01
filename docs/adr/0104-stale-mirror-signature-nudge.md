---
status: "accepted"
date: 2026-10-31
decision-makers: mdenner
---

# 0104 - The session sync nudge also fires on a stale skill mirror at an unchanged version

Found while auditing how the v1.4 PoEAA upgrade would reach agents (the v1.4 design spec, section 7, finding
I4, staged on the unmerged branch `audit/poeaa-2026-11`). It is a defect in today's delivery path,
independent of v1.4.

## Context and Problem Statement

The SessionStart sync nudge (ADR-0054) compares only two version strings: the one in the install marker
(`~/.claude/.esk-installed`) and the repo `package.json`. Commits that change a skill without a version bump
leave both strings equal, so the nudge stays silent while the global mirror in `~/.claude/skills` runs old
skill text and old checkers. Observed on the maintainer's machine on 2026-10-31: both versions read 1.3.1, but
`esk-init --check --personal --skills` exits 1 and names 8 skills whose content changed since the mirror
(re-runnable: `node .claude/skills/bootstrap/scripts/esk-init.mjs --check --personal --skills`). A session
rooted inside the repo loads the committed skills and is not affected; a session rooted anywhere else uses the
stale mirror with no warning, because no hook runs `--check`.

The installer already records a per-skill content signature in the marker (ADR-0039, #130) and already uses it
in `--check`. The fingerprint and the "what drifted" rule lived inside `esk-init.mjs`, so the emitter could not
reuse them without copying them.

## Decision Drivers

* One owner for "what counts as a changed skill", so the nudge and `--check` can never disagree.
* The SessionStart hook has a 10 second timeout and must never break the directive.
* The nudge must name the drifted skills and the fix, not just say "out of date".
* The operator decides when to re-mirror; the hook only reports.

## Considered Options

* Option 1: run `esk-init --check` from the hook as a child process.
* Option 2: copy the fingerprint code into `always-on/`.
* Option 3: extract the fingerprint and the drift rule into one shared module that both the installer and the
  emitter import.
* Option 4: require a version bump on every commit that touches a skill.

## Decision Outcome

Chosen option 3.

* `.claude/skills/bootstrap/scripts/skill-signature.mjs` now owns `signatureOf` (the content fingerprint),
  `SKILL_MIRROR_SKIP`, `skillNamesIn` (the source skill list), and `mirrorDrift` (missing at the target, or the
  source signature differs from the one recorded at mirror time). It throws on a read error and never exits;
  each caller decides what a failure means. `esk-init.mjs` imports it as a sibling (so every copy of the
  bootstrap skill carries it) and keeps its fail-closed behavior by wrapping the calls. Both its `--check`
  (`assess`) and its `--yes` reconcile plan (`planSkills`) use `mirrorDrift`, so a reconcile clears exactly
  what the check and the nudge report.
* `always-on/emit-directive.mjs` loads the module by a dynamic import, only for a marker that names THIS repo
  and has a skills record, and passes the drifted names to `decideNudge`. Any failure (module missing because a
  repo vendors `always-on/` without the bootstrap skill, unreadable folder, bad marker) yields no drift verdict
  and one stderr line, never a broken directive. The scan has a time budget (`ESK_DRIFT_BUDGET_MS`, default
  2000 ms): a hook killed at 10 seconds loses the whole directive, so a slow disk stops the scan and the session
  falls back to the version-only nudge. A skipped or failed scan is passed as "not assessed" (null), never as
  "nothing drifted", so it keeps the nudge counter instead of resetting it.
* `always-on/sync-nudge.mjs` `decideNudge` takes `driftedSkills`. Same version with drift is "behind on
  content": the same loud nudge, counter, and cap as a version gap, keyed on the version plus the drifted names
  so a later unversioned commit restarts the count. The text names the skills (capped at 20, then "and N more")
  and the fix `esk-init.mjs --personal --yes --skills` (plus `--skills-target` when the mirror is not the
  default folder). For content-only drift it does NOT offer the hook-only `esk-init.mjs --yes`: that run
  rewrites the marker without its skills record, which would silence the nudge while the mirror stays stale.

Option 1 was rejected: a child `node` process plus the hook canary and git calls that `--check` makes would cost
seconds under the 10 second limit, and its exit code mixes unrelated drift (hook wiring, enforcement). Option 2
creates a second copy that drifts. Option 4 adds release friction for every skill edit and still misses a clone
that pulled between releases.

### Consequences

* Good: a stale global mirror is now visible in every session the user-level hook reaches, naming the skills.
* Good: `esk-init --check` and the nudge share one drift rule, proven by both suites passing against it.
* Cost: each session start hashes the repo's skill folders. Observed: 196 ms for the whole skill set on the
  maintainer's machine (one run; a second reviewer run measured 148 ms warm). Cold OneDrive reads were not
  measured, which is why the scan is capped at 2 seconds.
* Limit: the nudge checks the source against the marker's recorded signatures. A local edit made inside the
  mirror itself is not nudged (`esk-init --check` still reports it through its target classification).
* Limit: a marker written before signatures were tracked reads every skill as changed, so the first session
  after this change nudges until one reconcile records the baseline. That matches `--check`.

### Confirmation

* `test/sync-nudge.test.mjs`: same-version drift nudges and names the skills and the fix; no drift stays in
  sync; a new drift set restarts the count; the cap falls back to a one-liner that still names them.
* `test/emit-directive-nudge.test.mjs`: through the real emitter, a stale signature and a missing mirrored
  skill each nudge and name only that skill; matching signatures do not nudge; a missing module still emits the
  directive.
* Seven mutants were run by hand and each failed these tests: `mirrorDrift` never reporting a changed skill,
  the emitter not passing `driftedSkills`, `decideNudge` ignoring drift, the time budget never firing, the
  hook-only command offered for content drift, the custom target not passed, and a skipped scan read as in sync.
* `features/always-on/stale-mirror-nudge.feature`: five executable scenarios (operator and agent audiences)
  drive the real emitter: a changed skill and a missing skill are each named with the fix, a current mirror
  is not nudged, a broken drift check keeps the directive, and a marker for another clone is ignored.
* `test/esk-init.test.mjs` passes unchanged against the extracted module.
