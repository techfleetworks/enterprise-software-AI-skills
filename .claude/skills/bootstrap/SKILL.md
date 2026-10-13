---
name: bootstrap
description: 'Use to install the enterprise skills into a repo or a machine for the first time, and to keep them current after an update. Turns the always-on hook on so every session and subagent gets the skills, verifies it actually works, and reconciles it after a git pull so the latest version is live. Trigger on "bootstrap," "install the skills," "set up enterprise skills," "onboard this repo," "esk-init," "first-run setup," "the skills are not turned on," "update the skills," or a session notice that the skills are present but not initialized. Pairs with the always-on hook and judge-arch.'
---

# Bootstrap (enterprise skills install)

## Why this exists

A skill that is in the repo but not turned on does nothing. The enterprise skills only bind an agent when
the always-on hook is installed and actually firing, and that state has to survive a fresh clone, a new
teammate, and a `git pull` that ships new skills. This skill makes turning them on, proving they are on,
and keeping them current a deliberate, repeatable action instead of a thing someone forgets. It is the
human-in-the-loop half of the installer; the deterministic half is `scripts/esk-init.mjs`.

## The main idea

**Install it, prove it is really on, and reconcile it after every update, with consent and a backup
before any write.** The installer never writes without a yes and never leaves a half-applied change: it
plans first, backs up, writes, validates, and restores on any failure. The one thing a script cannot
prove is that a real new session receives the directive, so that end-to-end check stays a human step.

Two honest limits sit under this: the very first install cannot be automatic (there is no hook yet to
announce it), so first contact is a deliberate command; and the installer can confirm the hook command
emits the directive, but only you opening a fresh session proves the harness fires it.

### Two things it can install

By default the installer wires only the **always-on hook** (the directive). Pass `--skills` and it also
**mirrors the repo's `.claude/skills/` into `~/.claude/skills/`**, so the skills load from any folder on the
machine, not only from a session rooted in this repo. That is the global, any-folder install, and a
`git pull` alone cannot do it because git cannot write another machine's `~/.claude`. The mirror is a clean
per-skill copy (written to a temp, then swapped in by moving the existing copy aside so a failed swap rolls
back to it; only a hard process kill mid-swap needs a re-run to heal) that records what it installed, so a
later reconcile removes a skill you dropped from the repo but never touches a skill you installed yourself.
If the repo's skills cannot be read (a dehydrated OneDrive folder, a locked ACL), it fails closed rather than
mistaking that for an empty repo. `--check` then also flags a mirrored skill that is missing or behind.

## The workflow

### Step 1: Isolate before a full install

A first install writes several files, so do not run it on top of unsaved work. If the working tree is
dirty or you are on `main` or a shared branch, create a separate work folder and branch first:

```bash
git worktree add ../esk-install -b chore/enterprise-skills-install
```

A later reconcile after a `git pull` only touches the hook settings, not the repo tree, so it does not
need a worktree.

### Step 2: Plan first, with no writes

Run the installer in its default (dry-run) mode and read the plan: what repo and version it found, which
`settings.json` it will change, and whether this is a first install or a reconcile.

```bash
node .claude/skills/bootstrap/scripts/esk-init.mjs            # plan only, writes nothing
node .claude/skills/bootstrap/scripts/esk-init.mjs --personal # plan for an all-projects (~/.claude) install
```

### Step 3: Ask only what must never be guessed

For the always-on hook there is nothing to guess. When this installer grows to scaffold the broader skill
artifacts, this is where it asks the questions code cannot answer (who the users are, uptime and speed
targets, the kind of data stored, which browsers and devices), and leaves a clear "you decide this" note
rather than guessing. Never guess these.

### Step 4: Apply, with consent and a backup

Show the plan to the person, get a yes, then apply. The installer backs up `settings.json`, merges the
hook additively (it never overwrites other hooks or keys), validates the JSON it wrote, and points the
hook at this repo so a future `git pull` updates the directive automatically.

```bash
node .claude/skills/bootstrap/scripts/esk-init.mjs --yes                      # the hook, for this repo
node .claude/skills/bootstrap/scripts/esk-init.mjs --personal --yes --skills  # global: hook + skills in ~/.claude (any folder)
```

If the post-write validation or the canary fails, the installer restores `settings.json` from the backup
and does not write the marker, so a failed install never leaves the repo half-configured.

### Step 5: Verify, honestly

The installer runs a canary: it runs the hook command exactly as configured and confirms it emits the
directive, and it checks the settings entry is well-formed. That proves the emitter and the wiring, not
that the harness fires the hook. So finish with the real end-to-end check:

- Open a fresh session and ask it to quote the first line of the directive.
- Have it spawn a subagent and do the same, to confirm `SubagentStart` reaches subagents.

On Windows, if the exec-form hook does not run, switch to the PowerShell form
(`--shell powershell`) and repeat the check.

### Step 6: Keep it current after an update

When someone pulls a new version of the skills, the installed hook keeps working (it references this
repo), and on the next session it adds a one-line "an update is available, run the bootstrap" note. Run
the reconcile; it re-points the hook and bumps the version marker, through the same plan, consent, backup,
and verify steps.

```bash
node .claude/skills/bootstrap/scripts/esk-init.mjs --check                     # drift gate: not installed or behind
node .claude/skills/bootstrap/scripts/esk-init.mjs --yes                       # reconcile the hook
node .claude/skills/bootstrap/scripts/esk-init.mjs --personal --yes --skills   # reconcile the global hook + skills
```

## Mechanical gate

`scripts/esk-init.mjs --check` is the drift gate. It exits non-zero when the always-on hook is missing,
the `settings.json` is invalid, the marker is absent, or the installed version
is behind the repo version (and, when skills were mirrored with `--skills`, a mirrored skill is missing or
behind), and it exits 0 only when the hook is installed, current, and emitting. Wire it
into CI so a teammate who has drifted or fallen behind is caught, not assumed current. The installer is
safe by default (it never writes without `--yes`), backs up before writing, and restores on failure. Its
discriminating test is `test/esk-init.test.mjs`.

Honest limit: `--check` and the install canary prove the hook command emits the directive and the settings
are well-formed; they do not prove the harness invokes the hook in a real session. Only the Step 5
fresh-session check proves that, which is why this skill keeps it as a required human step.

## Before you call it done

- A first install was run from an isolated branch or worktree, not over unsaved work.
- The plan was shown and consented to; `settings.json` was backed up and is still valid JSON; other hooks
  and keys are intact.
- `esk-init --check` exits 0: the hook is installed, points at this repo, and the marker matches the repo
  version.
- The fresh-session end-to-end check was done: a new session and a subagent both quote the directive.
- The evidence ledger below is filled in, and the central claim ("the always-on hook actually fires for a
  new session") is at `observed` from the fresh-session check, not `inferred` from the install exit code.

## Reference files

| Topic | File |
|---|---|
| The deterministic installer: plan, apply, verify, reconcile, and the `--check` drift gate | `scripts/esk-init.mjs` |
| The always-on hook it installs, and the confirm-it-works steps | `../always-on/README.md` |

## Evidence & skeptical assessment (required)

Every "the skills are installed / turned on / current" statement is a factual claim, so it follows the
repo's evidence discipline (canonical contract:
[`skeptical-audit/references/evidence-discipline.md`](../skeptical-audit/references/evidence-discipline.md)).
An install is an **evidence ledger**: each claim has a state and a re-runnable source, and "it is on" is
the one claim you may not take from an exit code alone.

| Claim | Reaches `observed` by | Becomes `proven` when |
|---|---|---|
| "The hook is installed and points at this repo" | `esk-init --check` exits 0 | `--check` is a blocking CI gate on every PR |
| "The install did not clobber other settings" | the backup exists and the other hooks and keys are still present | a diff of settings against the backup is reviewed |
| "The directive content is emitted correctly" | the install canary runs the hook command and gets the directive | the canary runs in CI as part of `--check` |
| "A new session actually receives the directive" | a fresh session quotes the first line of the directive | the same is confirmed for a subagent and after an auto-compaction |
| "We are on the current version" | the marker version equals the repo version | `--check` fails the build when a teammate falls behind |

**Definition of done:** the ledger covers install, non-clobber, emit, end-to-end, and version with a
verdict and a re-runnable source; the central "a new session actually receives the directive" claim is at
`observed` from the fresh-session check, never `inferred` from the install succeeding; and the install is
never called done on the exit code alone. A green `--check` is necessary, not sufficient.

## Why this holds for every developer and every agent

It binds everyone because the installed hook, the version marker, and the `--check` drift gate live in CI
and git, not in memory. Agents get the directive through the hook the installer sets up (listed in
`always-on/enterprise-skills-always-on.md`). People and agents alike are held by `esk-init --check` (a
blocking gate that fails a missing or behind install) and by the install canary. It survives any one
person because the installer, the marker, and the gate are committed. The honest limit: the installer
cannot make the very first install automatic (no hook exists yet), and it cannot prove the harness fires
the hook in a real session; the README one-liner covers the first case and the fresh-session check covers
the second, and both are stated, not hidden.

## Sources and attribution

- Claude Code hooks reference (<https://code.claude.com/docs/en/hooks>) and hooks guide
  (<https://code.claude.com/docs/en/hooks-guide.md>), retrieved 2026-10-12: that `SessionStart` and
  `SubagentStart` hooks inject context, that exec form (`"command"` plus `"args"`) runs with no shell,
  that `${CLAUDE_PROJECT_DIR}` is substituted by Claude Code, and that a failed hook is non-blocking and
  can pass unnoticed (the reason this installer verifies rather than assumes). `[documented]`
- This repo's `always-on/README.md` and `always-on/emit-directive.mjs`: the hook the installer sets up and
  the confirm-it-works procedure. `[documented]`
- The install and first-run plan (the bootstrap design doc the maintainer provided): the phases, the
  no-inferred rule, the consent-and-transparency requirement, and the skeptical risks this skill answers.
  `[reported]`
