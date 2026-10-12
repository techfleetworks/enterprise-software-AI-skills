---
status: "accepted"
date: 2026-10-12
decision-makers: mdenner
---

# Mirror the skills into ~/.claude/skills for any-folder use (installer --skills)

## Context and Problem Statement

ADR-0028 moved the skills under `.claude/skills/` so a session rooted IN the repo auto-discovers them on a
pull, with no install. That covers in-repo (and cloud single-repo) work, but not the common case of working
from any other folder on the machine: a session rooted outside the repo discovers skills only from
`~/.claude/skills`, and a `git pull` cannot write another machine's `~/.claude`. So the global, any-folder
setup still needed a per-machine step, done so far by an ad-hoc `robocopy`.

## Decision Drivers

* One command should give a machine the global, any-folder skills, and keep them current on a re-run.
* It must be structurally safe for anyone, first-time or updating: never leave a skill half-written, never
  clobber a skill the user installed themselves, fail closed with a clear message, and be impossible to
  silently regress (a discriminating test per behavior, run in CI).

## Considered Options

* Extend `esk-init` with an opt-in `--skills` phase that mirrors `.claude/skills/` into `~/.claude/skills/`.
* Keep the ad-hoc `robocopy` or a manual copy.
* Wait for the plugin (post-release) to carry the skills.

## Decision Outcome

Chosen option: extend `esk-init` with `--skills`. It is opt-in, so the existing hook tests (which run
against the real repo) never touch a real `~/.claude/skills`, with a `--skills-target` override for hermetic
tests, and it reuses the installer's safe-by-default framework (plan, consent via `--yes`, validate, marker,
`--check` drift gate). The mirror is a clean per-skill copy written to a temp and then swapped in by moving
the existing copy aside, so a failed swap rolls back to it and only a hard process kill in the brief rename
window needs a re-run to heal. If the repo's skills cannot be read (a dehydrated OneDrive folder, a locked
ACL), it fails closed rather than mistaking that for an empty repo and removing the mirror. It skips the
gitignored OWASP vendor text and `node_modules`. The marker
records the exact skill names installed, so a reconcile removes a skill dropped from the repo but never a
skill the user installed themselves; `--check` reports a mirrored skill that is missing or behind the repo
version. The global install is `esk-init --personal --yes --skills` (the global hook plus the global skills).

### Consequences

* Good, because one command gives any machine the global, any-folder skills and keeps them current on a
  re-run after a pull, replacing the ad-hoc robocopy with a managed, drift-checked mirror.
* Good, because it is structurally safe for first-time and updating users: move-aside temp-swap copy,
  foreign skills untouched, fail closed on an unreadable source and on an incomplete mirror, and a
  discriminating test for every behavior (first-time, update, idempotency, drift,
  reconcile-removal-not-foreign, restore-missing, version-bump, vendor-skip, unreadable-source), all run in
  CI, so a regression cannot merge. Two such defects were in fact caught during development, one by these
  tests and one by the fresh-context judge-arch review.
* Bad (honest limit), because this is still a per-machine command, not a pull: git cannot write
  `~/.claude`, so "global with zero commands" is not reachable; only `.claude/skills` on pull (in-repo) is
  zero-command. The move-aside swap rolls back on a throw, but a hard process kill in the brief rename window
  still needs a re-run to heal, because directory replacement is not crash-atomic on Windows; the post-copy
  SKILL.md validation catches an incomplete mirror and fails closed.

### Confirmation

`test/esk-init.test.mjs` adds eleven discriminating skills cases plus an opt-in guard (a hook-only install
records no skills). The suite is green: `npm test` reports 350 tests, 0 failing; `npm run check:architecture`
exits 0. The real repo mirrors all 17 skills in a hermetic temp target; the clean copy skips
`vendor`/`node_modules`; a dropped skill is removed on reconcile while a foreign skill is kept; a deleted or
behind skill reads as drift and is restored; and an unreadable skills source fails closed without wiping the
mirror (the fail-open defect a fresh-context judge-arch review caught, and this change fixed). The true end-to-end proof (a fresh session rooted elsewhere
loads a mirrored skill) stays a stated human step, like the hook canary.

## More Information

Follows ADR-0028 (skills under `.claude/skills/`) and ADR-0025 (the installer framework). The plugin
distribution (`enterprise-ready-coding:<skill>`) is a separate post-release track. See
`.claude/skills/bootstrap/SKILL.md`.
