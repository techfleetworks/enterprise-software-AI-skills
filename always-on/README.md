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

## How this repo stays always-on, and why a pull keeps everyone current

This repo turns itself on for anyone who works in it, with two committed layers that a
`git pull` updates. **Never copy the directive into `~/.claude`.** A copy is the staleness
trap: a pull updates the repo, not your copy, so the copy freezes at an old version (this
is exactly the drift the version marker and `esk-init --check` exist to catch). Both layers
below instead point at the repo's own files, so a pull is the update.

**Layer 1, zero setup, no approval: the committed [`CLAUDE.md`](../CLAUDE.md).** Claude Code
loads a project `CLAUDE.md` into every session as context, and a relative import loads with
no prompt. The committed `CLAUDE.md` imports `@always-on/enterprise-skills-always-on.md`, so
anyone who works in the repo gets the current directive automatically, on every pull, with
no install step and no approval. It reaches the main agent and most subagents (the built-in
Explore and Plan agents skip project instructions, which is what Layer 2 covers).

**Layer 2, stronger, one approval: the committed [`.claude/settings.json`](../.claude/settings.json)
hook.** It runs `emit-directive.mjs` in exec form via `${CLAUDE_PROJECT_DIR}` and injects the
same directive into every subagent, including Explore and Plan. Claude Code asks each person
once to trust the project's hooks (a security prompt, not staleness); after that, content
updates apply automatically on pull, and only a change to the hook *command* re-prompts.

The two overlap on the main agent (it sees the directive from both). That is intentional
defense in depth: if one path is unavailable in a given session, the other still carries it.

## Use the skills in another project or machine

Run the installer, which references this repo (never copies), so pulling this repo updates
the directive for that project too:

```bash
node bootstrap/scripts/esk-init.mjs            # plan only
node bootstrap/scripts/esk-init.mjs --yes      # install or reconcile (backs up first)
```

For the zero-approval Layer 1 in another project, add one line to that project's own
`CLAUDE.md` importing the directive by a relative path to your clone, for example
`@../enterprise-software-AI-skills/always-on/enterprise-skills-always-on.md`. See
[`bootstrap/SKILL.md`](../bootstrap/SKILL.md).

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

## The CLAUDE.md layer in another project (no hook)

If you would rather not run a hook, import the directive from your project's `CLAUDE.md`.
Claude Code loads a project `CLAUDE.md` every session and expands a relative `@path` import
at launch, so the directive loads into the main agent and most subagents (all except the
built-in `Explore` and `Plan`, which the hook covers). This is **advisory** context, so it
depends on the model honoring it; the hook is the stronger, non-discretionary lever.

Add one line, on its own and not inside backticks or a code fence, to your project's
`CLAUDE.md`, pointing at your clone of this repo (shown here inline):
`@../enterprise-software-AI-skills/always-on/enterprise-skills-always-on.md`

Do **not** `cat` the directive into your `CLAUDE.md`: a copy freezes, and a pull of this
repo will not update it (the staleness trap). The relative import stays current because it
reads the repo's own file. If your clone sits outside the project folder, Claude Code asks
once to approve that external import; after that a pull keeps it current.

## Scope, turn it off or narrow it

The directive lists every skill. To make fewer skills always-on, delete their lines from
your copy of `enterprise-skills-always-on.md`. To turn always-on off entirely, remove the
`SessionStart` / `SubagentStart` blocks from `settings.json` (or the appended text from
`CLAUDE.md`).
