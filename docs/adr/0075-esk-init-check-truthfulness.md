---
status: "accepted"
date: 2026-10-23
decision-makers: mdenner
---

# esk-init --check and its canary tell the truth about the real installed state

## Context and Problem Statement

`esk-init --check` is the drift gate: it is supposed to exit non-zero when the always-on hook is not installed,
current, and actually working. Four issues showed it reporting OK (or printing a wrong fix) when the real state
was not OK:

- **#138:** the canary ran the emitter with the installer's OWN Node (`process.execPath`) against the raw
  emitter path, NOT the hook entry as configured. So `--check` stayed green even when the written entry's
  command could not start (a bad binary, a dead portable path) - exactly what the canary exists to catch.
- **#136:** `--check` recognized "our hook" by any `emit-directive.mjs` reference, never comparing which clone
  it points at, so `--personal --check` from a clone the hook no longer points at exited 0.
- **#135:** `--check` never inspected the clone's git state, so a clone with uncommitted `always-on/` edits (the
  hook serves that unreleased directive text to every session) still reported OK.
- **#137:** the drift message printed a fix command with a nonexistent path (`bootstrap/scripts/esk-init.mjs`;
  the real path is under `.claude/skills/`), dropped the user's scope flags, and did not say which scope it had
  checked, so a user with a personal install who ran plain `--check` saw "not installed" with no hint to add
  `--personal`.

## Decision

1. **The canary runs the hook's effective command (#138):** it runs `node` from PATH (as Claude Code does, not
   the installer's own `process.execPath`) against the expanded `${CLAUDE_PROJECT_DIR}` emitterRef - the
   invocation both hook forms ultimately make - so a command that cannot start, a dead portable path, or output
   without the directive fails `--check`. It deliberately does not shell out to powershell, which may be absent
   on the host running `--check`.
2. **`--check` detects a clone the hook does not point at (#136):** if the marker's `repo` differs from the
   clone `--check` runs in, it reports drift naming both paths.
3. **`--check` detects uncommitted directive edits (#135):** when the clone is a git repo and `always-on/` has
   uncommitted changes, it reports drift (unreleased text would reach every session). Checked only on a git
   repo, so a non-git install is unaffected.
4. **The drift message is actionable (#137):** it prints the real `esk-init.mjs` path (derived from the
   script's own location), repeats the user's scope flags, and names the scope it checked plus a hint to pass
   `--personal`.

Each is pinned by a discrimination test. esk-init is the bootstrap installer, not a manifest gate, so there is
no manifest/sha change; this ships in the 1.3.1 line.

## Consequences

* `--check` now fails for the real reasons a hook is not trustworthy: a configured command that cannot start, a
  hook pointing at a different clone, or a clone serving uncommitted directive text. A green `--check` means
  more than before.
* Honest scope: the git-state check covers uncommitted `always-on/` edits, the dangerous "unreleased text
  reaches sessions" case. Detecting an off-release-tag clone was considered but left out as a hard failure,
  because development clones are normally off-tag and the upstream repo runs `--check` off-tag itself; a future
  release-channel policy can add it deliberately. The canary proves the configured command runs and emits the
  directive; it still cannot prove the harness fires the hook in a real session (the existing manual
  fresh-session step), which the report continues to state.
* Honest test limit (#138): the discrimination test proves the canary runs the configured target and fails on a
  broken emitter, but it cannot fully isolate "the hook's `node`+emitterRef" from "the installer's
  `process.execPath`+raw emitter", because for a standard portable or absolute install both resolve to the same
  node and the same file. The behavioral change (PATH `node`, the expanded portable emitterRef, no shell
  dependency) lives in the code and is reviewed; the test guards that the canary is live and catches a broken
  target.
* Known coupling (review note N1): the `--check` tests that pass `--repo <this repo>` now run
  `git status --porcelain always-on` against it, so they couple to this repo's `always-on/` working-tree
  cleanliness. It is clean in CI and normal operation; a developer mid-edit on the directive would see those
  tests drift, which is arguably correct (uncommitted directive text is exactly what #135 flags).
