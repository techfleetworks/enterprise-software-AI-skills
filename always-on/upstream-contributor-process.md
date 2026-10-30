# Contributor process for the enterprise-software-AI-skills repository

This section applies **only when working in the repository that authors these skills**
(`techfleetworks/enterprise-software-AI-skills`). It names files, npm scripts, and CI checks that exist in
that repo. It is loaded by that repo's own `CLAUDE.md` import, NOT by the always-on hook, so a consumer
repository (which has none of these artifacts) is never pointed at them. A consumer gets only the universal
directive in `enterprise-skills-always-on.md`.

## Before you open or update a pull request
Run `judge-arch` in fresh context on the change (it dispatches the review to a subagent), resolve or
explicitly waive every finding, and record the review in `docs/arch-reviews/log.jsonl`. The committed PR
template and `CONTRIBUTING.md` carry the full checklist. The mechanical gates are required CI checks that
block merge on their own: the gate-script tests and `check:architecture` (the `test` job). The `routing`
check (change-type to required-artifact) blocks merge once the committed ruleset is applied with
`scripts/apply-ruleset.sh`. A change that skips a routed artifact cannot merge. These checks prove the
routed artifact is present and the repo passes its gates; they do NOT verify that a fresh-context review
happened (no required check reads the review log) or that the judgment was sound. The review is required by
this directive and the PR checklist, not by a gate, so run it anyway: loaded is not the same as reviewed.

Also append a skill-application receipt for the change to `docs/skill-receipts/log.jsonl`: one entry per PR
covering EVERY skill (applied or not-applicable), each `applied` entry citing a real skill heading, quoting at
least eight exact words from under that heading, and pointing at files really in the change. `npm run
check:receipt` checks it is complete and that every quote is a verbatim run from the cited section; add
`--changed-list <the diff>` to also check that the cited files are in the change and that a coupled surface
is marked applied (the merge-blocking CI job that passes the diff and base is deferred to the techfleetnetwork
release). None of it proves the work is true or good, so a human must still review it. A silent skip becomes a
failing empty cell: you cannot claim a skill without showing what you pulled and where. There is NO triviality
exemption: a one-line or copy-only change still ships a receipt. Most skills are legitimately `not-applicable`
for a small change, but the entry still has to exist and say so; "it is too small to bother" is exactly the
shortcut this receipt exists to stop.

## Run every checker a skill names through the checker runner
A skill names its checker by a path relative to the skill folder (for example `scripts/check_adr.sh`). Run it
through `always-on/run-check.mjs` (ADR-0096), never by that relative path and never through a pipe:

```
node always-on/run-check.mjs run <skill> <script> [-- <checker args>]
node always-on/run-check.mjs which <skill> <script>   # print the installed path only
```

The runner resolves the checker's absolute installed path (so the current folder does not matter), reads its
exit code directly, and **fails closed**: a checker that is missing, cannot start, or runs past its time limit
is a BLOCK (exit 2) that names the install path and command, never a silent skip and never a pass. It exits 0
only when the checker passed, and 1 when the checker itself reported a failure. Do not run a checker by a
folder-relative path (it breaks from any other folder), and do not pipe a checker into `tail` or `head` when
its exit code matters: a pipe reports the last command's exit code, so `checker | tail` reads a real failure as
a pass. When a pipe is unavoidable, set `set -o pipefail` or read the exit code before the pipe. A missing or
unreadable checker never licenses judging in its place.

## How the directive reaches a session in this repo
How this directive reaches a session depends on where the session runs, and no single path covers all of
them: a session working inside this repo gets it from the committed `CLAUDE.md` import (main agent and most
subagents, no approval) and from the committed `.claude/settings.json` hook (every subagent, including the
built-in Explore and Plan, after a one-time trust step); a local session rooted outside the repo gets it only
from the per-machine user-level hook, if one is installed, and cloud sessions follow their own rules again.
See `always-on/README.md` for the full coverage map and its limits.
