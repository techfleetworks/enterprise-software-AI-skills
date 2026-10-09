# Always-on enterprise skills

By default an agent loads a skill only when the task happens to match the skill's
`description`. That leaves coverage to discretion — and skips the review and
verification skills exactly when a change is rushed. This folder makes **every skill
in this repo always-on**: considered on every task, for the main agent *and* every
spawned subagent, injected by the harness rather than left to the model to remember.

## What's here

| File | What it is |
|---|---|
| [`enterprise-skills-always-on.md`](enterprise-skills-always-on.md) | The directive that gets injected: it names all 14 skills and makes applying the relevant ones mandatory before any work is called done. |
| [`settings.snippet.json`](settings.snippet.json) | The `hooks` block to merge into a `settings.json`. |

It injects a **directive that names the skills**, not the full skill bodies — the
skill *descriptions* are already always in context, so the directive only needs to
remove the discretion. Injecting 14 full skills on every turn would bloat context
for no gain.

## How it works (and why a hook)

Claude Code has no frontmatter or settings flag that forces a skill to load; a
skill's `description` is always in context, but its body loads only when invoked
([skills docs](https://code.claude.com/docs/en/skills)). The mechanisms that *are*
always-on are CLAUDE.md / rules (advisory context) and **hooks** (run by the
harness, not the model). To cover **every agent** without depending on discretion:

- **`SessionStart`** injects the directive into the main agent (its stdout is added
  to context).
- **`SubagentStart`** injects it into every spawned subagent (via
  `hookSpecificOutput.additionalContext`) — subagents do not otherwise inherit
  skills you've invoked.

See the [hooks docs](https://code.claude.com/docs/en/hooks) and
[sub-agents docs](https://code.claude.com/docs/en/sub-agents).

**Requires:** Node.js on `PATH` (the hook commands are a dependency-free `node`
one-liner, chosen over `jq`/`cat` so they run the same on Windows, macOS, and Linux).

## Install — personal (all your projects)

1. Copy the directive to your user config:
   ```bash
   cp always-on/enterprise-skills-always-on.md ~/.claude/enterprise-skills-always-on.md
   ```
2. Merge the `hooks` block from [`settings.snippet.json`](settings.snippet.json)
   into `~/.claude/settings.json`. **Merge — do not overwrite** an existing file; if
   you already have a `hooks` key, add `SessionStart` / `SubagentStart` alongside it.
3. Start a new session. Hooks load at session start, so they take effect on the
   **next** session, not the one you edited settings in.

## Install — project (shared with everyone on the repo)

1. Commit the directive in the repo, e.g. at `.claude/enterprise-skills-always-on.md`.
2. In both hook commands in `.claude/settings.json`, replace
   `"$HOME/.claude/enterprise-skills-always-on.md"` with
   `"$CLAUDE_PROJECT_DIR/.claude/enterprise-skills-always-on.md"`.
3. Commit `.claude/settings.json`. Teammates get it on their next session.

> Project `settings.json` hooks run commands from the repo on every teammate's
> machine — keep the command to the reviewed `node` one-liner above, and review any
> change to it in PR.

## Lighter alternative — CLAUDE.md / rules (no hook)

If you'd rather not run a hook, append the directive to your `CLAUDE.md` (or drop it
in `.claude/rules/`). It loads at launch into the main agent and into most subagents
(all except the built-in `Explore` and `Plan`). This is **advisory** context, so it
depends on the model honoring it — the hook is the stronger, non-discretionary lever
and also covers `Explore`/`Plan`.

```bash
cat always-on/enterprise-skills-always-on.md >> CLAUDE.md
```

## Scope — turn it off, or narrow it

The directive lists every skill. To make fewer skills always-on, delete their lines
from your copy of `enterprise-skills-always-on.md`. To turn always-on off entirely,
remove the `SessionStart` / `SubagentStart` blocks from `settings.json` (or the
appended text from `CLAUDE.md`).
