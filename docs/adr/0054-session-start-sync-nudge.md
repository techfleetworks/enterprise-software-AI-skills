---
status: "accepted"
date: 2026-10-16
decision-makers: mdenner
---

# The always-on hook nudges, loudly and persistently, when the installed skills are behind

## Context and Problem Statement

A `git pull` advances the skills repo, but it does not reconcile the install: the hook keeps working (it
points at the repo), yet the recorded install version, and any mirrored `~/.claude/skills`, can lag the repo.
A session then runs the stale copy, so a gate that was fixed or a rule that was added upstream is simply not
in force, with nothing to tell the developer. The installer's `--check` catches this, but only if someone
runs it. We want the session itself to surface drift, loudly, and keep surfacing it until the user syncs,
because a silent stale install is exactly the "loaded is not the same as enforced" failure these skills exist
to prevent.

mdenner's ask: when behind, encourage the sync loudly every session, explain the benefit, keep it up for many
sessions (with a cap so it is not infinite noise), and reset the moment the user syncs or a new version lands.

## Decision

Add a SessionStart auto-sync nudge to the always-on emitter.

1. **Pure decision in its own module.** `always-on/sync-nudge.mjs` owns the logic: given the current repo
   version, the installed version, and the persisted nudge state, it decides whether to nudge, what to say,
   and the next counter value. It does no I/O, so it is exhaustively testable and the emitter stays a thin
   boundary.
2. **The emitter does the I/O, on SessionStart only.** `emit-directive.mjs`, for a `SessionStart` (never a
   `SubagentStart`, so subagents are not spammed), reads the repo version from the repo `package.json`, the
   installed version from the install marker (`~/.claude/.esk-installed`, or the repo-local marker), and the
   counter from `~/.claude/.esk-nudge.json`. The marker whose `repo` matches this repo is authoritative; a
   marker naming a *different* repo is ignored, and the only fallback is a legacy marker that names no repo at
   all, so a global install for one repo can never drive a behind/in-sync verdict for an unrelated clone. It
   prepends the nudge to the injected directive (prepended so it survives the length-cap truncation, which cuts
   the end) and persists the counter (creating `~/.claude` if needed so the cap can be reached). The whole step
   is best-effort inside a `try/catch`: any failure means no nudge, never a broken directive, and the emitter
   still exits 0. An `ESK_NUDGE_DISABLE` env var turns the nudge off entirely, so a suite (or a user) that must
   see the bare directive is not coupled to the ambient marker or its version.
3. **Loud, then capped, then reset.** While behind, each session shows a loud nudge that states the version
   gap, explains the benefit (newer gates, security rules, corrected skills; the stale copy may be missing a
   check that would catch a real problem), gives the one-step sync command, and asks the agent to relay it and
   offer to run it. The counter climbs each session; after `NUDGE_CAP` (30) it falls back to a single quiet
   one-liner, so it never nags forever but never goes fully silent. A new target version restarts the count,
   and syncing (installed catches up, or is ahead) clears the state so a later drift starts fresh.
4. **Conservative when unsure.** No marker (not installed via the installer), or a version that will not parse,
   produces no nudge: it never nags someone whose state it cannot actually assess.

It is pinned by `test/sync-nudge.test.mjs` (the pure logic: behind increments and nudges, in-sync and ahead
clear, a new target resets, the cap falls back to a one-liner, no-marker and unparseable say nothing) and
`test/emit-directive-nudge.test.mjs` (a behind marker injects the nudge into SessionStart, a SubagentStart
does not, an in-sync install injects nothing and clears stale state, no marker injects nothing). The existing
`test/always-on-emit.test.mjs` was isolated from the ambient `~/.claude` so the nudge cannot pollute its
directive-emission assertions.

## Consequences

* A stale install is now visible in the session itself, loudly and repeatedly, so drift is far harder to
  ignore; the agent is asked to relay it and offer the one-step sync.
* The emitter's SessionStart output now depends on ambient `~/.claude` install state (the marker and the
  counter). This is intended, and the reason the directive-emission tests were isolated from it; the nudge is
  SessionStart-only and fully guarded, so it cannot break the directive or a subagent.
* The counter is per user, in `~/.claude/.esk-nudge.json`, and best-effort: if it cannot be written, the nudge
  still shows that session, it just may not advance the count. CI and non-installer environments have no
  marker, so they see no nudge and no writes.
* Known limitation: the nudge compares the marker version to the repo version; it does not re-run the full
  `--check` (missing mirrored skills, a malformed settings file). It is an encourage-to-sync prompt, not a
  full drift audit; `esk-init --check` remains the complete gate. Stated so the nudge is not overread as proof
  the install is otherwise healthy.
