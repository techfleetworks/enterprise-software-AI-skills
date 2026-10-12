# Always-on enterprise skills

By default an agent loads a skill only when the task happens to match the skill's
`description`. That leaves coverage to discretion, and it skips the review and
verification skills exactly when a change is rushed. This folder makes **every skill
in this repo always-on**: considered on every task, for the main agent *and* every
spawned subagent, injected by the harness rather than left to the model to remember.

## What's here

| File | What it is |
|---|---|
| [`enterprise-skills-always-on.md`](enterprise-skills-always-on.md) | The directive that gets injected: it names all 16 skills and makes applying the relevant ones mandatory before any work is called done. |
| [`emit-directive.mjs`](emit-directive.mjs) | A tiny Node script the hook runs to print the directive. It is what makes the hook robust (see "Why a script" below). |
| [`settings.snippet.json`](settings.snippet.json) | The `hooks` block to merge into a `settings.json`. |

## It covers every skill without bloating context

The hook injects a **directive that names the skills**, not the skill bodies. The
directive is about 40 lines: one line per skill (its name and a one-line trigger)
plus the framing and the evidence rule. So the cost is a few hundred tokens, once at
session start and once per subagent, and it does not grow with the number of skills.

That is enough, because a skill's `description` is already in context every session,
and a skill's full body loads only when you invoke it with the Skill tool. The
directive's job is only to remove the discretion ("apply the relevant ones, and treat
'not relevant' as a stated judgment, not a silent skip"). Injecting 16 full skill
bodies on every turn would bloat context for no gain, so it does not.

## Why a script, and why it will not fail silently

Claude Code has no setting that forces a skill to load; a skill's `description` is
always in context, but its body loads only when invoked
([skills docs](https://code.claude.com/docs/en/skills)). The mechanisms that *are*
always-on are CLAUDE.md / rules (advisory context) and **hooks** (run by the harness,
not the model). To cover every agent without depending on discretion:

- **`SessionStart`** injects the directive into the main agent.
- **`SubagentStart`** injects it into every spawned subagent (subagents do not
  otherwise inherit skills you invoked).

The hook runs [`emit-directive.mjs`](emit-directive.mjs) in **exec form**
(`"command": "node"` with an `"args"` array), which uses **no shell**. An earlier
version ran an inline `node -e` through `"shell": "bash"` and read the directive from
`$HOME`; on a machine where bash is missing or broken, that hook failed, and because a
failed `SessionStart` hook produces no output, the directive was silently skipped and
enforcement turned off with no sign. The script removes that failure mode three ways:

- It runs with bare `node`, so it does not depend on bash being present or healthy.
- It resolves the directive as its **own sibling file**, so there is no `$HOME` or
  shell-variable expansion to get wrong.
- If the directive file is missing, it writes a loud **WARNING** to stderr and still
  injects a short "enforcement is OFF, re-install" notice, so a broken install is
  visible in the agent's context rather than a silent no-op.

Both events emit the same JSON shape
(`{"hookSpecificOutput":{"hookEventName":"...","additionalContext":"..."}}`), because
`SubagentStart` ignores plain stdout and JSON keeps one code path.

One failure this does **not** remove: if Node is not on `PATH`, or the hook is
misinstalled (wrong path, file absent), the command produces no output and
enforcement is off with no in-context sign. That is why the "Confirm it works" step
below matters, and why the `bootstrap` installer runs a canary that actually checks a
fresh session receives the directive.

**Requires:** Node.js on `PATH`, and a Claude Code version that supports exec-form hook
`args`. If yours does not, the command will not run; use the "Confirm it works" step
and the PowerShell fallback. Check with `node --version` and `claude --version`.

## Install, personal (all your projects)

1. Copy both files to your user config, side by side:
   ```bash
   cp always-on/enterprise-skills-always-on.md ~/.claude/enterprise-skills-always-on.md
   cp always-on/emit-directive.mjs ~/.claude/emit-directive.mjs
   ```
2. Merge the `hooks` block from [`settings.snippet.json`](settings.snippet.json) into
   `~/.claude/settings.json`. **Merge, do not overwrite.** A personal install has no
   project-dir placeholder, so set `args[0]` to the **absolute path** of the emitter,
   for example `"/home/you/.claude/emit-directive.mjs"` or
   `"C:/Users/you/.claude/emit-directive.mjs"`.
3. Start a new session. Hooks load at session start, so they take effect on the
   **next** session, not the one you edited settings in.

## Install, project (shared with everyone on the repo)

1. Commit both files in the repo, side by side, e.g. `.claude/enterprise-skills-always-on.md`
   and `.claude/emit-directive.mjs`.
2. Keep `args[0]` as `"${CLAUDE_PROJECT_DIR}/.claude/emit-directive.mjs"` (Claude Code
   substitutes `${CLAUDE_PROJECT_DIR}` itself).
3. Commit `.claude/settings.json`. Teammates get it on their next session.

> A project `settings.json` hook runs on every teammate's machine. Keep the command to
> the reviewed `node` + `emit-directive.mjs` form above, and review any change to it in PR.

Do not define the hook in both user and project settings, or the directive is injected
twice.

## Confirm it works (recommended, especially on Windows)

Per the Claude Code docs, exec form runs without a shell on all platforms, but if it does
not run on your machine (Windows setups are the usual culprit), confirm the directive
actually lands, then use the fallback:

1. Start a fresh session and ask the agent to quote the first line of the directive.
   If it is missing, look for a "hook error" notice in the transcript or run with
   `/debug`.
2. Ask it to spawn an `Explore` subagent and quote the directive, to confirm
   `SubagentStart` reaches subagents.
3. If exec form does not work on your Windows build, switch that entry to the
   **PowerShell fallback** shown in `settings.snippet.json` (`"shell": "powershell"`,
   one `command` string, no `args`) and repeat.

The `bootstrap` skill's installer automates this check and picks the working form for you.

## Lighter alternative, CLAUDE.md / rules (no hook)

If you would rather not run a hook, append the directive to your `CLAUDE.md` (or drop it
in `.claude/rules/`). It loads at launch into the main agent and into most subagents
(all except the built-in `Explore` and `Plan`). This is **advisory** context, so it
depends on the model honoring it. The hook is the stronger, non-discretionary lever and
also covers `Explore` and `Plan`.

```bash
cat always-on/enterprise-skills-always-on.md >> CLAUDE.md
```

## Scope, turn it off or narrow it

The directive lists every skill. To make fewer skills always-on, delete their lines from
your copy of `enterprise-skills-always-on.md`. To turn always-on off entirely, remove the
`SessionStart` / `SubagentStart` blocks from `settings.json` (or the appended text from
`CLAUDE.md`).
