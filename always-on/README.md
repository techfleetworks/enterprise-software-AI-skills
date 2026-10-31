# Always-on enterprise skills

By default an agent loads a skill only when the task happens to match the skill's
`description`. That leaves coverage to discretion, and it skips the review and
verification skills exactly when a change is rushed. This folder makes **every skill
in this repo always-on**: considered on every task, for the main agent *and* every
spawned subagent, injected by the harness rather than left to the model to remember.

## What's here

| File | What it is |
|---|---|
| [`enterprise-skills-always-on.md`](enterprise-skills-always-on.md) | The **universal** directive that gets injected everywhere: it names all 16 skills, makes applying the relevant ones mandatory before any work is called done, and states the evidence rule. It names no repo-specific file or CI check, so it is safe to deliver to any consumer project. |
| [`upstream-contributor-process.md`](upstream-contributor-process.md) | This repo's **own** contributor process (the fresh-context review log, the skill receipt, the named CI checks). Loaded only by this repo's `CLAUDE.md` import, never by the hook, so a consumer repo is never pointed at artifacts it does not have. |
| [`emit-directive.mjs`](emit-directive.mjs) | A tiny Node script the hook runs to print the universal directive. It is what makes the hook robust (see "Why a script" below). |
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

## The enforcement nudge (consumers)

The same emitter carries a second, separate nudge (`enforcement-nudge.mjs`, ADR-0066), for a repo that
**adopted the travelling gates** with `esk-genesis`. The gates run on every pull request once the workflow is
scaffolded, but they only **block a merge** once an admin requires the `enterprise-gates` check in branch
protection. Nothing in a repo can turn branch protection on (GitHub makes it admin-only, on purpose), so the
emitter does the next best thing: on every session, if the repo is in that advisory state, it prepends a loud
nudge telling the agent to tell the human to turn enforcement on (run `scripts/apply-ruleset.sh`), and keeps
at it until it is wired. It is the enforcement sibling of the sync nudge: loud for a capped number of
sessions, then a persistent quiet one-liner, cleared when enforcement is in place.

It fires only in a consumer (the `enterprise-gates` workflow is present), never in this upstream repo, and it
clears on a local **intent + confirm** signal: a committed ruleset under `.github/rulesets/` that requires the
check **and** the `.github/.esk-enforcement-applied` marker that `apply-ruleset.sh` writes on success. Honest
limit, the same one `test/required-checks.test.mjs` states: that proves the ruleset was committed and applied,
not that GitHub is live-enforcing it this second (live verification needs an admin API call and is out of
scope). The nudge drives the human hard; it cannot force an admin-only setting, so it makes skipping it a
loud, repeated choice instead of a silent one.

## How this repo stays always-on, and why a pull keeps everyone current

This repo turns itself on for anyone who works in it, with two committed layers that a
`git pull` updates. **Never copy the directive into `~/.claude`.** A copy is the staleness
trap: a pull updates the repo, not your copy, so the copy freezes at an old version (this
is exactly the drift the version marker and `esk-init --check` exist to catch). Both layers
below instead point at the repo's own files, so a pull is the update.

**Layer 1, zero setup, no approval: the committed [`CLAUDE.md`](../CLAUDE.md).** Claude Code
loads a project `CLAUDE.md` from the working directory and its parents, and a relative import
loads with no prompt. The committed `CLAUDE.md` imports `@always-on/enterprise-skills-always-on.md`, so
anyone who works in the repo gets the current directive automatically, on every pull, with
no install step and no approval. It reaches the main agent and most subagents (the built-in
Explore and Plan agents skip project instructions, which is what Layer 2 covers).

**Layer 2, stronger, one approval: the committed [`.claude/settings.json`](../.claude/settings.json)
hook.** It runs `emit-directive.mjs` in exec form via `${CLAUDE_PROJECT_DIR}` and injects the
same directive into every subagent, including Explore and Plan. Claude Code asks each person
once to trust the project's hooks (a security prompt, not staleness); after that, content
updates apply automatically on pull. Claude Code keys the trust to the repo root and stores it
once; the docs do not document a re-prompt when the hook command or script later changes, so
treat the trust as a single per-repo step.

The two overlap on the main agent (it sees the directive from both). That is intentional
defense in depth: if one path is unavailable in a given session, the other still carries it.

### What each path actually covers

No single path covers every session. The map below is **documented** from the Claude Code docs (sources
listed under the table), not verified by launching each session type; the cloud rows in particular are from
the docs, not from a live cloud probe:

| Session | CLAUDE.md import | Committed hook | User-level hook | Net |
|---|---|---|---|---|
| Local, rooted in the repo | yes, no approval | yes, after one trust step | yes, if installed | fully covered |
| Local, rooted above or outside the repo | no (loads only when a repo file is opened) | no | yes, if installed | user-level hook only |
| Cloud, single repo | yes (in the clone) | yes (in the clone) | no (cloud ignores `~/.claude`) | committed layers only |
| Cloud, multiple repos or no repo | no | no | no | rely on skills enabled on claude.ai / server-managed settings |

Two honest limits follow. First, a machine that never opened the project and approved its hook, and a cloud
multi-repo session, are reached by nothing the repo commits. Second, both layers make the directive
**loaded**, not **obeyed**: that a skill was actually applied is proven by the outcome gates
(migration-safety, untagged-PII, the a11y checklist, the evidence contract, and the rest), not by the
directive being present.

**Source and evidence state.** The in-repo and outside-repo rows are documented at the Claude Code memory
and hooks docs; the cloud rows at the cloud-environments doc, which states that a single-repo cloud session
loads the repo's `.claude/settings.json` hooks and its `CLAUDE.md` but not your local `~/.claude`, and that a
multi-repo cloud session loads no repo hooks. These are **documented** (some via a summarizing fetch), not
verified by launching a cloud session.

- <https://code.claude.com/docs/en/memory>
- <https://code.claude.com/docs/en/hooks>
- <https://code.claude.com/docs/en/settings>
- <https://code.claude.com/docs/en/cloud-environments>
- <https://code.claude.com/docs/en/permissions>

### The directive is not the skills

These layers deliver the **directive text**, the reminder that names the skills. They do **not** make the
skill files discoverable; a separate committed location does that. Claude Code discovers skills from
`~/.claude/skills`, a project's `.claude/skills` (walking up to the repo root), an `--add-dir` directory,
enterprise settings, or a plugin, never from an arbitrary repo-root folder. This repo commits its skills
under `.claude/skills/<name>/` (ADR-0028), which is one of those discovery locations, so a session working in
the repo loads them automatically, with no install, and a cloud single-repo session (which loads the repo's
committed files) gets them the same way.

One honest limit stays. The committed `.claude/skills/` only reaches a session that runs inside this repo,
because Claude Code finds a project's skills by walking up from the start directory to the repo root. A
session rooted above or outside the repo, in another project, or on another machine does not find these
files (and a `git pull` cannot place anything in another machine's `~/.claude`). For those cases the skills
need to be in a discovery location the session does reach, such as `~/.claude/skills`. The `bootstrap`
installer mirrors them there when you pass `--skills`, or you can copy a skill folder out yourself.

## Turn the directive on in another project or machine

Run the installer, which references this repo for the directive (never copies it), so pulling this repo
updates the always-on directive hook for that project too. The hook delivers only the **universal** directive
(`enterprise-skills-always-on.md`): the skills and the evidence rule, which apply anywhere. It does NOT deliver
this repo's own contributor process (`upstream-contributor-process.md`), so a session in another project is
never told to use a review log, a receipt, or CI checks that project does not have. By default it wires the
directive hook only, not the skill files. For a session that runs outside this repo, the skills also need to be in a per-machine
discovery location such as `~/.claude/skills`; pass `--skills` and the installer mirrors them there too (it
records what it copied, so re-running it with `--skills` later keeps the mirror current):

```bash
node .claude/skills/bootstrap/scripts/esk-init.mjs                  # plan only
node .claude/skills/bootstrap/scripts/esk-init.mjs --yes            # install or reconcile the hook (backs up first)
node .claude/skills/bootstrap/scripts/esk-init.mjs --yes --skills   # also mirror the skills into ~/.claude/skills
```

For the zero-approval Layer 1 in another project, add one line to that project's own
`CLAUDE.md` importing the directive by a relative path to your clone, for example
`@../enterprise-software-AI-skills/always-on/enterprise-skills-always-on.md`. See
[`.claude/skills/bootstrap/SKILL.md`](../.claude/skills/bootstrap/SKILL.md).

## Turn the ENFORCEMENT on (hold the formula, do not just deliver it)

The directive install above delivers the skills and the evidence rule. It does not hold a task to them. To
actually hold the formula, add `--enforce`:

```bash
node .claude/skills/bootstrap/scripts/esk-init.mjs --yes --enforce   # register the enforcement hooks + ESK_ENFORCE=1
```

This registers the edit-gate (`PreToolUse`, holds an edit until select/load/plan exist), the finish-check
(`Stop`/`SubagentStop`, holds the turn until build/prove/review/encode/receipt are proven), `record-load`
(`PostToolUse`), and `session-setup` (`SessionStart`, the self-test). The hooks derive their per-session state
from `ESK_ENFORCE=1` plus the session id (`always-on/esk-paths.mjs`); `session-setup` tells the agent the paths
at the start of each session. `--check --enforce` reports a removed hook as drift, and re-running the installer
restores it.

### What this can and cannot promise (ADR-0101)

`.claude/settings.json` is writable by the agent, so this install makes removing or altering an enforcement
hook **visible**, not **prevented**: every session that starts after a hook is removed opens with a warning
naming it, and `--check` reports the drift. Operator waivers live in an operator file, not the agent's record,
so the agent cannot waive a step for itself; a forged waiver is detectable, not physically blocked.

**For actual prevention**, place the enforcement hooks in OS-level **managed settings** that the agent's user
cannot write (on macOS, `/Library/Application Support/ClaudeCode/managed-settings.json`; on Linux,
`/etc/claude-code/managed-settings.json`; on Windows, `C:\ProgramData\ClaudeCode\managed-settings.json`), which
Claude Code merges with and takes precedence over project and user settings. That requires administrator rights
and per-machine setup, so it is the stronger optional tier, not the default `esk-init` install. Copy the
enforcement `hooks` and the `env.ESK_ENFORCE` from a `--enforce` install's `settings.json` into the managed file.

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
