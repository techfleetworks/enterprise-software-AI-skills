---
status: "accepted"
date: 2026-10-16
decision-makers: mdenner
---

# The pre-push hook arms itself on npm install, so a clone needs zero manual setup

## Context and Problem Statement

The pre-push hook (ADR-0048) is a local pre-flight that runs the offline gates before a push. Git
deliberately will not auto-enable a committed hook on clone (a cloned repo running code on your machine is
a security risk), so enabling it normally takes one `git config core.hooksPath .githooks` per clone.
`esk-genesis` sets it once on the machine that runs genesis, but every other clone still needs that one
command, which is exactly the kind of "remember to run this" step the owner asked to drive to zero.

## Decision Drivers

* Zero manual steps for a developer: a fresh clone should arm the hook on its own, through a command
  developers already run.
* Never clobber an existing hooks setup (husky or another `.githooks`), and never break `npm install`.
* Non-destructive to the consumer's `package.json`: add nothing that overwrites what is already there.

## Decision

Ship a helper, `install-hooks.mjs`, that points `core.hooksPath` at `.githooks`, and wire it to a
`package.json` `prepare` script. npm runs `prepare` automatically on `npm install`, the command developers
already run to set up a repo, so a fresh clone arms the hook with no extra step. This is the same pattern
husky uses.

`esk-genesis` installs the helper into the consumer's `.githooks/install-hooks.mjs` and wires the prepare
script, with three non-destructive rules:

* If the consumer's `package.json` has no `prepare` script, add `prepare: "node .githooks/install-hooks.mjs"`,
  leaving every other field and script untouched (captured for rollback).
* If a `prepare` script already exists, do not touch it; print a note to add
  `node .githooks/install-hooks.mjs` to it.
* If there is no `package.json` (a non-npm repo), print a note to set `core.hooksPath` once per clone.

The helper is safe by construction: it acts only inside a git work tree, it never overwrites an existing
`core.hooksPath` (it leaves husky and the like alone and prints a note), and it never throws, so it can
never fail an `npm install`.

It is pinned by tests: `test/pre-push-hook.test.mjs` runs the real helper and asserts it arms a fresh git
repo, preserves an existing `core.hooksPath`, and exits 0 outside a git repo; `test/esk-genesis.test.mjs`
asserts genesis adds the prepare script to a `package.json` without one and preserves an existing prepare.
Confirmed end to end: a genesis'd npm repo gets the prepare script, and a simulated fresh clone re-arms the
hook by running the helper.

## Consequences

* For an npm repo, the local hook is genuinely zero-step: clone, `npm install` (which devs run anyway), and
  the hook is armed. Combined with server-side CI, standards hold at both the first and last step of work
  with nothing to remember.
* An existing hooks setup is never silently broken; the worst case is a one-line note telling the developer
  how to also run the enterprise hook.
* Known limitation: the auto-arm relies on npm's `prepare` lifecycle, so it covers npm repos. A non-npm
  repo still sets `core.hooksPath` once per clone (or adds the equivalent step to its own toolchain); the
  helper itself is toolchain-agnostic, only the automatic trigger is npm-specific.
* Known limitation: the hook remains a convenience. Even fully armed, it is bypassable with `--no-verify`,
  and CI under the required check is the authority. This change removes setup friction, not the backstop.
