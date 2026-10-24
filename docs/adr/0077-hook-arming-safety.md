---
status: "accepted"
date: 2026-10-23
decision-makers: mdenner
---

# Hook arming never disables a consumer's existing hooks, and the pre-push hook fails closed

## Context and Problem Statement

The bootstrap installers arm a local pre-push pre-flight by pointing `core.hooksPath` at `.githooks`. Four
consumer-filed issues showed that arming, and the hook itself, can act outside their safe envelope.

- **#143:** `install-hooks.mjs` checked only `git rev-parse --is-inside-work-tree` before running
  `git config core.hooksPath .githooks`. That check is true anywhere inside an enclosing repository, so when
  the helper ran from a package nested inside ANOTHER repo (no `.git` of its own), it wrote `core.hooksPath`
  into the enclosing repo's config and reported success. One real incident: a developer's home-directory git
  repo was found holding `core.hooksPath = .githooks`.
- **#131:** both `install-hooks.mjs` and `esk-genesis` set `core.hooksPath` whenever it was unset. Their stated
  intent is "never clobber", but the guard covered only an existing `core.hooksPath` VALUE, not hooks already
  installed in `.git/hooks` (where the pre-commit framework installs by default) or a `.pre-commit-config.yaml`.
  So arming silently turned off a consumer's pre-commit hooks, repo-wide and in every worktree.
- **#139:** the hook auto-arms only through a `package.json` `prepare` script. A non-npm consumer (Python, etc.)
  got only a generic "run `git config core.hooksPath .githooks`" note, which is the wrong advice for a
  pre-commit repo (it would disable their hooks) and said nothing about the setting being repo-wide.
- **#122:** the pre-push hook exited 0 with no output when `gate-manifest.json` was present but unparseable or
  had no `gates` array, so it ran no gate. A push that also corrupted the manifest got past a violation the
  hook otherwise blocks. The CI runner already fails closed on the same inputs.

## Decision

1. **Arm only at the repository root (#143).** `install-hooks.mjs` compares `git rev-parse --show-toplevel`
   with its own package root (the folder holding `.githooks/`, from the script's path), both realpath-normalized.
   If they differ it changes nothing and prints a one-line note. `esk-genesis` already guarded its direct set
   with `existsSync(join(TARGET, ".git"))`, so only the helper needed this.

2. **Never disable hooks the consumer already uses (#131).** Before setting `core.hooksPath`, both the helper
   and `esk-genesis` now check for a `.pre-commit-config.yaml` and for a non-sample hook in the effective
   `$GIT_DIR/hooks`. If either is present they leave `core.hooksPath` unset and print how to arm the pre-push
   hook without clobbering (a pre-commit `repo: local` entry with `stages: [pre-push]`, or chaining the existing
   hook). `core.hooksPath` is only ever set in a repo that has neither.

3. **Tailor non-npm arming guidance, and name the repo-wide consequence (#139).** For a non-npm consumer,
   `esk-genesis` now prints the pre-commit route when a `.pre-commit-config.yaml` is present (which does not
   touch `core.hooksPath`), and otherwise the `git config` command, stating that it is repo-wide and makes git
   use `.githooks` instead of `.git/hooks`.

4. **The pre-push hook fails closed on a broken manifest (#122).** An ABSENT manifest stays exit 0 (the
   documented convenience case). A manifest that is present but unparseable, has no `gates` array, or lists zero
   gates now prints a message and exits 1, mirroring the CI runner, so a push cannot slip a violation past the
   hook by also corrupting the manifest.

Each behavior is pinned by a discrimination test that fails when the fix is reverted. None of these files is a
manifest-tracked gate or machinery entry, so there is no sha/provenance change; this ships in the 1.3.1 line.

## Consequences

* Arming is now scoped to exactly the repository that owns the `.githooks` directory, and only when it would
  not turn off hooks the consumer already relies on. In every other case the installer does nothing to git
  config and says what to do by hand.
* A pre-commit-framework consumer keeps its commit-time checks; it gets a documented, non-clobbering way to run
  the enterprise pre-push gates as well.
* A local push can no longer pass the pre-push hook while the manifest is broken; the hook now matches the CI
  runner's fail-closed behavior on the same inputs.
* Honest limits: the helper still "never fails the install" (any error is swallowed and it exits 0), so arming
  is best-effort by design; CI remains the enforcing authority, as the pre-push header states. The
  `hasActiveGitHook` check treats any non-`*.sample`, non-dotfile in the hooks dir as an active hook, which
  could over-decline in the rare case of a leftover file there, erring toward NOT clobbering (the safe side).
* The repo's own byte-identical `.githooks/install-hooks.mjs` is updated alongside the template so they stay in
  sync.
