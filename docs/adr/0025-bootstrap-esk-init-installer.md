---
status: "accepted"
date: 2026-10-12
decision-makers: mdenner
---

# A bootstrap installer that turns the skills on and keeps them current

## Context and Problem Statement

Skills in a repo do nothing until the always-on hook is installed and actually firing, and that state has
to survive a fresh clone, a new teammate, and a `git pull` that ships new skills. Three people already use
this repo; when they update it, their machines need to pick up the latest skills without a fragile manual
ritual, and a naive "install once" step is wrong for that: an installer that is a no-op whenever a marker
exists would silently leave people on an old version after a pull. The repo also has strong rules the
installer must honor: no silent writes (always-on README and plan §13), never baseline security debt
(owasp skill), reference engines rather than copy them so they do not drift (judge-arch adoption), and
prove a check actually works rather than assume it (verifiable-quality-gates).

A skeptical review of the first design found real gaps: the first-run prompt is itself a hook, so it
cannot announce a truly fresh install; the update path wrote `settings.json` with no consent; the "canary"
claimed to prove a fresh session fires the hook, which a script cannot observe; a failed verify left
partial writes; and the per-session version check risked adding latency.

## Decision Drivers

* Turn the hook on, prove it, and reconcile it after an update, never a silent no-op on a pulled update.
* Safe by default: no write without consent, a backup before any write, and a restore on any failure.
* Honest verification: confirm what a script can (the hook command emits the rule, the settings are
  well-formed) and keep the end-to-end proof (a fresh session receives the rule) as a human step.
* Keep updates automatic for the three users: a `git pull` should make the latest rule live.

## Considered Options

* A deterministic `esk-init.mjs` installer plus a `bootstrap` skill that handles consent and the human
  checks.
* A pure docs procedure (the manual `cp` + merge steps).
* An auto-running first-session scaffolder that writes without asking.

## Decision Outcome

Chosen option: "a deterministic installer plus a skill." `esk-init.mjs` owns the always-on hook lifecycle
and is **safe by default**: with no flag it prints the plan and writes nothing; only `--yes` writes. It
points the hook at the repo's own `always-on/emit-directive.mjs` (reference, not copy) so a `git pull`
updates the rule automatically; it merges into `settings.json` additively (never clobbering other hooks or
keys), backs up first, validates the JSON it wrote, runs a canary, and **restores from the backup and
refuses to write the marker if the validation or canary fails**. The marker records a version, so
`--check` is a CI drift gate that fails when a teammate is missing the hook or behind the repo version,
and the per-session hook stays cheap (it emits the rule and reads two small version files, no canary).
The canary is scoped honestly: it runs the hook command as configured and confirms it emits the rule, and
checks the settings shape; it does not claim the harness fires the hook, which only the fresh-session
check proves. The `bootstrap` skill supplies the worktree pre-flight, the plan-then-consent step, the
must-not-guess questions (for the later broader scaffolding), and the required fresh-session check. First
contact is a deliberate command, since no hook exists yet to announce it.

This version scopes the installer to the always-on hook. The broader artifact scaffolding (arch-gate
config, BDD, SRE, and so on, with the ask-questions and baseline phases) is a later phase that plugs into
the same plan, consent, backup, write, validate, restore, record framework.

### Consequences

* Good, because an update is reconciled, not ignored: the three users pick up the latest rule on a pull,
  and `--check` catches anyone who drifts or falls behind.
* Good, because the installer never writes without consent, backs up, and restores on failure, so a failed
  or half-applied install cannot leave a broken repo.
* Good, because the verification is honest: the canary proves what it can, and the fresh-session check
  (the only true proof) stays a stated human step, not an overclaim.
* Bad (honest limit), because the very first install cannot be automatic (no hook exists yet), and the
  script cannot prove the harness fires the hook; the README one-liner and the fresh-session check cover
  those, and both are stated.
* Neutral, because this installs the always-on hook only for now; the wider scaffolding is deferred, and
  the README diagram marks which steps are implemented versus planned.

### Confirmation

`test/esk-init.test.mjs` (13 tests): default mode writes nothing; `--yes` installs both hooks and the
marker in exec form; a second run is a no-op and `--check` passes; `--check` fails before install and when
the marker is behind the repo version; the merge is additive (other hooks and keys preserved) with a
backup; two of our hooks reads as drift and `--yes` collapses them to one; a malformed non-array
`hooks.SessionStart` fails closed instead of being silently dropped; `--shell powershell` writes and
verifies the shell form; it fails closed on invalid target JSON and on a `--repo` with no always-on files;
and a failed canary (driven by a fake repo whose emitter omits the rule) restores `settings.json` to its
original content for an existing file and removes a newly-created one, and never writes the marker. The
discrimination gate confirms the tests fail when the installer is stubbed. All run in CI via `npm test`.

## More Information

Builds on ADR-0024 (the hardened emitter the installer wires up). The design and its skeptical answers are
in the install and first-run plan the maintainer provided, and the Claude Code hook facts are from the
hooks reference (<https://code.claude.com/docs/en/hooks>). See `bootstrap/SKILL.md` and
`always-on/README.md`.
