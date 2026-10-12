---
status: "accepted"
date: 2026-10-12
decision-makers: mdenner
---

# Harden the always-on hook against silent enforcement failure

## Context and Problem Statement

The always-on mechanism injects the enterprise-skills directive into every session and subagent through
a `SessionStart` / `SubagentStart` hook. The original hook ran an inline `node -e '...'` through
`"shell": "bash"` and read the directive from `$HOME/.claude/enterprise-skills-always-on.md`. That shape
has a dangerous failure mode: on a machine where bash is missing or broken (for example a Windows box
with a damaged msys install, which is a real condition on a maintainer's machine), the hook fails, and
because a failed `SessionStart` hook produces no output and does not block, the directive is silently not
injected and enforcement turns off with no sign. The worst failure for an enforcement mechanism is one
that disables itself invisibly. It also hard-codes `$HOME` expansion (shell-dependent) and inlines a
`node -e` string (quoting-fragile), and the directive and README were out of date (the README said "14
skills" and the directive's install note described the old `$HOME` mechanism).

## Decision Drivers

* A missing directive must never silently turn off enforcement. Residual silent paths (no Node on
  PATH, a misinstalled hook) must be caught by a confirm step, not assumed away.
* The hook must not depend on bash being present or healthy, and must work cross-platform.
* Keep the context cost flat: inject the directive (names of all 16 skills), not the skill bodies.
* Keep the directive and docs accurate and in the repo's plain, no-dash house style.

## Considered Options

* Keep the shell + `$HOME` + inline `node -e` hook (status quo).
* A committed `emit-directive.mjs` run in exec form (`"command": "node"` + `"args"`), no shell, resolving
  the directive as its own sibling.
* Drop only the `"shell"` field from the inline form.

## Decision Outcome

Chosen option: "a committed `emit-directive.mjs` in exec form." Dropping `"shell"` alone does not help,
because a shell-form hook still runs through Git Bash on Windows; only exec form (`"args"` present) runs
with no shell. The script fixes the silent-failure three ways: it runs with bare `node` (no bash
dependency); it resolves the directive as its own sibling via `import.meta.url` (no `$HOME`, no shell
variable to expand); and when the directive file is missing it writes a loud WARNING to stderr and still
injects a short "enforcement is OFF, re-install" notice, so the breakage is visible in the agent's
context instead of being a silent no-op. It always exits 0 so it can never block a session. Both events
emit the same JSON shape (`hookSpecificOutput.additionalContext`), because `SubagentStart` ignores plain
stdout and one JSON code path also avoids the "stdout must not start with `{`" trap. The script strips
ANSI and control characters and respects the 10,000-character hook cap. The directive and README are
rewritten clean (no em or en dashes, "16 skills", the new mechanism) and added to the house-style gate.

This closes the main silent-failure paths but not every one: it makes the *directive-missing* case loud
and removes the bash and `$HOME` dependencies, yet if Node is not on PATH or the hook path is wrong the
command still produces no output and enforcement is off with no in-context sign. The README's
confirm-it-works step and the forthcoming `bootstrap` canary are what catch that; the hook alone cannot.
Per the Claude Code docs exec form runs without a shell on all platforms, but if it does not run on a
given machine the snippet documents a PowerShell shell-form fallback and the confirm-it-works check, and
the installer will automate picking the working form.

### Consequences

* Good, because a *missing directive* is now loud (a warning plus an in-context notice) instead of a
  silent loss of enforcement, and the hook no longer depends on bash, `$HOME`, or inline-quote correctness.
* Good, because the directive and docs are accurate (16 skills, current mechanism) and house-style clean.
* Bad (honest limit), because this does not eliminate every silent failure: if Node is not on PATH or the
  hook is misinstalled, the command produces no output and enforcement is off with no in-context sign. The
  confirm-it-works step and the `bootstrap` canary are required to catch that case; the hook alone cannot.
* Bad (honest limit), because exec form may not run on every setup (Windows especially). The confirm step
  and the PowerShell fallback cover that, and the installer will automate the choice.
* Neutral, because the injected content is unchanged in substance (the same directive naming all 16
  skills); only the delivery mechanism and punctuation changed.

### Confirmation

`test/always-on-emit.test.mjs` (10 tests): `SessionStart` and `SubagentStart` both emit JSON with the
correct `hookEventName` and the directive in `additionalContext`; the directive resolves as a sibling
with no path argument; an explicit path and the `ESK_DIRECTIVE` env var override it; ANSI and control
characters are stripped; a missing directive warns on stderr, injects a visible fallback, and still exits
0; and a coverage check asserts the directive names all 16 skills so coverage cannot silently regress. The
discrimination gate confirms the tests fail when the emitter is stubbed. All run in CI via `npm test`.

## More Information

This is the first piece of the `bootstrap` workstream (the install and first-run plan). The `bootstrap`
installer will install and harden this hook as one of its scaffolds and canary-test the exec-vs-PowerShell
form per machine. See `always-on/README.md` for install and confirmation steps.
