---
status: "accepted"
date: 2026-10-16
decision-makers: mdenner
---

# esk-init writes a portable hook, and refuses to commit a machine-specific one

## Context and Problem Statement

A real adoption test (another agent installing the skills from a clone onto a project repo) surfaced a
latent footgun in `esk-init`: it wrote the hook command with the emitter's **absolute, machine-specific
path** (for example `E:\enterprise-software-AI-skills\always-on\emit-directive.mjs`). If that is installed
into a shared repo's committed `.claude/settings.json`, every other clone gets a hook pointing at a path
that only exists on the installer's machine, so the hook is dead for everyone else (it fails safe with a
notice, but enforcement is off for them). The skills repo's own committed hook avoids this by using
`${CLAUDE_PROJECT_DIR}` (a runtime placeholder for the checkout root), but `esk-init` did not generate that
portable form, and nothing stopped it from committing a machine path.

## Decision Drivers

* A committed hook must travel: it has to work on every clone, not just the machine that ran the installer.
* Do not break the ergonomic local install (into a non-committed or gitignored `.claude/settings.json`),
  where an absolute path is fine because the file never leaves the machine.
* Make the dangerous case structurally impossible, not merely warned: you should not be able to commit a
  machine-specific hook by accident.

## Decision

Two changes to `esk-init`:

1. **Write the portable form when it can.** If the emitter lives inside the target repo (the skills repo
   itself, or a repo that vendors it) **and the target is not a user-level `~/.claude` settings file**, the
   hook references it as `${CLAUDE_PROJECT_DIR}/<relative path>` instead of an absolute path, so a committed
   hook travels to every clone. A user-level settings file is deliberately excluded: a hook written there
   runs in *every* project, so `${CLAUDE_PROJECT_DIR}` resolves to each session's own project dir, not this
   repo, and the hook is dead for every session not rooted exactly at the home directory. The decision is
   keyed on the **resolved target** (`settingsDir === ~/.claude`), not on the `--personal` flag: `--personal`
   is only a shortcut for `--settings ~/.claude/settings.json`, and the identical dead hook results from
   spelling that path out, so both reach the exclusion. This is load-bearing, not cosmetic: when the skills
   clone itself lives under the home directory (the normal layout), the emitter path-tests as "under the
   target" for a `~/.claude` install, so without the guard the installer would silently write a broken
   portable path, and the canary (which runs the emitter directly, not the written hook reference) would not
   catch it. The target comparison case-folds on Windows, because the filesystem is case-insensitive and
   tools (Git Bash in particular) emit the drive letter in either case, so a plain compare could read a
   `~/.claude` target as "not user-level" over nothing but `c:` vs `C:` and re-open the dead path.
2. **Refuse the real footgun, precisely, and only when writing.** If the emitter is external to the target
   repo and the target settings file **would actually be committed** (it is inside a git work tree and not
   gitignored), an `--yes` write refuses (exit 2) and steers the user to a safe choice: a per-machine install
   (`--personal`), a gitignored file (`--settings <repo>/.claude/settings.local.json`), vendoring the emitter
   (which makes the hook portable), or an explicit `--allow-absolute` override. The refusal fires only on an
   actual write (`--yes`); the default dry run still prints its plan and exits 0, carrying the same warning so
   the footgun is surfaced before you commit to it. The refusal is scoped to the committed case only: a
   non-git directory, a gitignored settings file, a `--personal` install, and `--check` are all unaffected,
   so the common local install still works with zero friction. The git detection is best-effort and fails
   open to "local" (if git is missing, nothing is refused).

It is pinned by tests: `test/esk-init.test.mjs` asserts the portable `${CLAUDE_PROJECT_DIR}` form is
written (and no machine path appears) when the emitter is under the target, including the PowerShell
shell form; that a `--personal` install under that same layout does **not** use the placeholder (it uses
the absolute path), and that a user-level target reached without `--personal` (plain
`--settings ~/.claude/settings.json`, home pointed at a fake dir) is excluded the same way (keyed on the
resolved target, not the flag); that an `--yes` write into a git-tracked settings file is refused (exit 2, nothing
written) while the dry run prints a plan plus the warning and exits 0; that a gitignored settings file is
allowed; and that `--allow-absolute` overrides. The pre-existing cases still pass unchanged (temp targets
are not git repos, so they are correctly treated as local).

## Consequences

* A committed repo hook now travels, and you cannot accidentally commit a machine-specific one; the
  installer makes you pick a path that actually works for the team.
* The local/personal install keeps its absolute-path behavior (any user-level `~/.claude` target is excluded
  from the portable form by design, whether reached via `--personal` or a plain `--settings` path), so no
  existing local or per-machine flow breaks. The only behavior change for an existing flow is the new refusal,
  which fires only on an `--yes` write into a git-tracked settings file with an external emitter, the precise
  case that was the footgun.
* This fixes the "one real design wrinkle" both review agents flagged in the adoption test.
* Known limitation: the portable form requires the emitter to be inside the target repo. Installing the
  directive from an external clone into another repo is therefore a per-machine (`--personal`) or
  gitignored-file setup unless that repo vendors the emitter; for a repo with a vendored-skills conformance
  lock (see the adoption notes), vendoring the emitter is a deliberate re-pin, not something `esk-init`
  does on its own.
* Known limitation: the git-tracked detection is best-effort (it shells out to git). If git is unavailable
  it fails open to "local" and does not refuse, trading a rare missed warning for never blocking a
  legitimate install.
* Known limitation: the user-level target check compares resolved paths (case-folded on Windows). It does
  not resolve symlinks, so a `~/.claude` reached through two different symlink spellings could still be
  classified as not-user-level. This is rare, and `realpath` was not used because it throws on a settings
  directory that does not exist yet (a fresh install); the trade is a rare missed case over a new failure mode.
