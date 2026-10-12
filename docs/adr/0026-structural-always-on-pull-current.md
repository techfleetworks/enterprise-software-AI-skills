---
status: "accepted"
date: 2026-10-12
decision-makers: mdenner
---

# Make every machine pick up the latest directive on pull, structurally

## Context and Problem Statement

A dogfood of the bootstrap found that a maintainer's running session was serving a directive that named
only 14 skills, used em dashes, and had no evidence paragraph, while a fresh clone named the current 16.
The root cause: the install had **copied** `enterprise-skills-always-on.md` into `~/.claude/`, and the
hook read that copy. A `git pull` updates the repo, not the copy, so the copy froze at an old version.
Three people use the repo; all were exposed to the same drift. Catching drift (a version marker plus
`esk-init --check`) is good, but the ask was to make it **structurally impossible to miss the update on
pull**, not merely catchable. The honest obstacle: Claude Code reads hooks from `settings.json`, which is
per-machine and gated by a one-time trust prompt, so the repo cannot force a hook onto a machine.

## Decision Drivers

* A pull must deliver the latest directive to anyone working in the repo, with no per-machine step.
* Prefer mechanisms the repo controls and a pull updates (committed, repo-relative) over per-machine copies.
* Be honest about the residual: what the platform cannot make automatic, and what "loaded" does and does
  not guarantee (loaded is not the same as obeyed; obeying is the gates' job).

## Considered Options

* **Two committed, repo-relative layers**: a `CLAUDE.md` that imports the directive, plus a committed
  `.claude/settings.json` hook, with the installer referencing the repo for other projects.
* Keep copying into `~/.claude` and rely on the marker + `--check` to catch drift.
* Enterprise/managed settings pushed by IT to every machine.

## Decision Outcome

Chosen option: "two committed, repo-relative layers," because they make the common case (working in the
repo) current on every pull with no install, and the one truly automatic layer needs no approval at all.

* **Layer 1, zero setup, no approval: a committed `CLAUDE.md`** that imports
  `@always-on/enterprise-skills-always-on.md`. Claude Code loads a project `CLAUDE.md` into every session
  as context, and a **relative** import loads with no prompt (the approval dialog is only for imports that
  resolve outside the working directory). So a pull updates the file the session loads, and anyone working
  in the repo is current automatically. It reaches the main agent and most subagents.
* **Layer 2, stronger, one approval: a committed `.claude/settings.json`** hook that runs
  `emit-directive.mjs` in exec form via `${CLAUDE_PROJECT_DIR}` and injects the same directive into every
  subagent, including the built-in Explore and Plan agents that skip `CLAUDE.md`. Claude Code asks each
  person once to trust the project hooks; after that, content updates apply on pull, and only a change to
  the hook *command* re-prompts.

Both are repo-relative, so a pull is the update and nothing is copied. The two overlap on the main agent
on purpose (defense in depth). For other projects or machines, `esk-init` installs the hook **referencing**
this repo (never copying) and now also recognizes and upgrades a **legacy** copy-based hook in place
instead of adding a duplicate; `esk-init --check` remains the CI drift gate. The copy-based install
instructions are removed from the README so the footgun cannot be used again. Per-machine install
artifacts (the marker, the settings backup, the install log) are gitignored; the committed
`.claude/settings.json` and `CLAUDE.md` are tracked.

### Consequences

* Good, because anyone working in the repo gets the current directive on every pull with no setup and no
  approval (Layer 1), and full subagent coverage after one approval (Layer 2). The dogfood drift class is
  eliminated for in-repo work.
* Good, because the installer upgrades legacy copy-based installs in place, so the three existing users are
  brought current by a reconcile rather than left with duplicates.
* Bad (honest limit), because the platform still cannot force a hook onto a machine that never opened the
  project and approved it; Layer 1 (CLAUDE.md) needs no approval but does not reach Explore and Plan
  subagents, and Layer 2 reaches them but needs the one-time trust. The `--check` CI gate catches a machine
  that is still missing or behind.
* Bad (honest limit), because both layers make the directive **loaded**, not **obeyed**. That a skill was
  actually applied is proven by the outcome gates (migration-safety, untagged-PII, a11y-checklist, the
  evidence contract, and the rest), not by the directive being present. That is a separate guarantee.

### Confirmation

`test/committed-project-hook.test.mjs`: the committed `.claude/settings.json` has both events in exec form
referencing the repo emitter via `${CLAUDE_PROJECT_DIR}` and never a `$HOME`/copy path; the committed
`CLAUDE.md` imports the directive with a bare relative un-backticked `@path`, and the imported file exists.
`test/esk-init.test.mjs` adds a case proving a legacy inline copy-based hook is upgraded in place (no
duplicate) and that `--check` reads a marker-less legacy install as drift. All run in CI via `npm test`.
Dogfood: after a reconcile, a fresh subagent probe reported the current 16-skill directive (comma title,
0 em dashes, names `pattern-selector` and `bdd-comprehensive-testing`), up from 14.

## More Information

Builds on ADR-0024 (hardened emitter) and ADR-0025 (installer). CLAUDE.md import behavior per the Claude
Code memory docs (<https://code.claude.com/docs/en/memory>): project `CLAUDE.md` loads every session, and
relative `@path` imports expand at launch with no approval. See `always-on/README.md` and `CLAUDE.md`.
