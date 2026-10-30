---
status: "accepted"
date: 2026-10-29
decision-makers: mdenner
---

# A missing checker blocks the work and runs from any folder (fail-closed checker runner)

## Context and Problem Statement

Issue #183 (one of ten from an agent-session audit) traced a concrete failure. The
`architectural-decision-records` skill told the agent to run `check_adr.sh` by a path relative to the skill
folder. From a work folder somewhere else, the agent ran `bash check_adr.sh 2>&1 | tail -4 || ls check_adr.sh`;
the checker was not there, but the `| tail` exited 0, so the `|| ls` never ran, the real failure was hidden,
and the agent then judged the ADRs itself with a stand-in count (`grep -c '^[0-9]\.'`) that never came from the
checker. Three defects in one line: a checker addressed by a folder-relative path, a pipe that masked the exit
code, and a missing checker treated as "skip and judge myself" instead of a block.

Two substrate facts shape the fix. First, a hook that would run a checker at finish time cannot be assumed to
block by default: Claude Code hooks **fail open** unless the hook itself exits 2 (or sets `onFailure: "block"`)
[documented, official hooks docs]. Second, this repo's installed hooks are delivery-only (`SessionStart` /
`SubagentStart` emit the directive and always exit 0) [observed, `always-on/emit-directive.mjs`, `.claude/settings.json`],
so nothing blocks today. The mechanism a finish check (#174) will call therefore has to carry the fail-closed
behavior itself, in one tested place, not leave it to each caller or each hook.

## Considered Options

- **Fix the ADR skill's wording only**: give `check_adr.sh` an absolute invocation and add "do not pipe into
  tail". Smallest change, but it fixes one skill by hand, leaves the other checkers addressed by relative paths,
  and relies on every future caller repeating the shell hygiene correctly.
- **Ship a fail-closed checker runner (the front door) plus the doc fixes**: one dependency-free script that
  resolves any named checker from any folder, runs it with a timeout and no shell/no pipe, and translates
  missing / unstartable / timed-out / skill-not-installed into a block (exit 2) that names the install path and
  command. Then point the skills at it and state the convention once.
- **Build a full `esk` CLI** (`esk which`, `esk run`, subcommand plugins): the issue floats `esk which check_adr`.
  A general CLI is more than one use needs now (there is no second subcommand surface), so it is speculative
  structure (YAGNI) for this change.

## Decision

Ship the runner and the convention (pattern-selector: a small command module / Gateway over path resolution and
a timed subprocess, no GoF object pattern, matching `scripts/compare-gate-runs.mjs`):

1. **`always-on/run-check.mjs`** (dependency-free, Node built-ins, no shell) with two subcommands:
   `which <skill> <script>` prints the checker's absolute installed path, and `run <skill> <script> [-- args]`
   runs it. It resolves the path from the real skill-discovery locations (an explicit `--skills-dir` /
   `$ESK_SKILLS_DIR` override pins one location, otherwise the nearest project `.claude/skills` walking up from
   the current folder, then `~/.claude/skills`, then the repo it ships in), so the current folder does not
   matter. It validates the skill and script names first (only `[A-Za-z0-9._-]`, no `..`, no path separators), so
   resolution can never traverse out of a skills root. It runs the checker with `spawnSync` (no shell, args
   array) and a timeout, and reads the exit code **directly**, so a pipe can never mask it.
2. **A single exit-code contract**, which the #174 finish check reads: `0` the checker passed; `1` the checker
   ran and reported a failure (its output is shown); `2` **fail closed / block** for bad args, an unsafe name, a
   skill that is not installed, a checker that is missing or cannot start, or a checker that runs past its time
   limit (reported as a timeout, never a pass). The block message names the full install path and the install
   command, and states that no stand-in judgment counts.
3. **The skills point at it.** `architectural-decision-records/SKILL.md` (the skill the audit hit) now runs its
   checker through the runner in Step 7, the mechanical-gate note, and the done-checklist, and says never to use a
   folder-relative path or a `tail`/`head` pipe. `always-on/upstream-contributor-process.md` states the
   convention once for every checker a skill names, with the `set -o pipefail` fallback when a pipe is
   unavoidable.
4. **Proof.** `test/run-check.test.mjs` is the discriminating test (a no-op or a naive, pipe-and-tail rewrite of
   the runner flips the missing -> 2, timeout -> 2, and checker-failed -> 1 cases). The three assigned scenarios
   (`skill-cannot-load`, `checker-missing-fails-closed`, `checker-timeout-fails-closed`) drive the real runner on
   the executable BDD harness (ADR-0091).

The wording-only option is rejected for the reason the audit shows across these issues: the discipline was not
applied without concrete machinery, and relative paths plus hand-repeated shell hygiene are exactly what failed.

## Consequences

* A checker a skill names is now run location-free and fail-closed through one tested front door: a missing,
  unstartable, or timed-out checker is a block that names where the checker should be and how to install it,
  never a silent skip and never a false pass, and an exit code can no longer be hidden by a pipe.
* The runner **reports** a block with exit 2; it does not by itself stop a turn. Turning exit 2 into "the task
  cannot end" is #174's finish-check `Stop` hook, which must itself exit 2 because hooks fail open by default,
  and which lives under Claude Code's 8-continuation stop cap (a documented ceiling, not a flaw to hide). This
  ADR delivers the mechanism the finish check calls.
* Honest limits. #183 fixes the `architectural-decision-records` skill as the worked example and states the
  run-through-the-runner convention once for all checkers; it does not rewrite every other `SKILL.md`'s checker
  line individually (the convention centralizes that, and a per-skill sweep can follow if wanted). A `.sh`
  checker still needs bash to run; on Windows without Git Bash the runner fails closed (a block naming the fix),
  which is the correct, safe outcome rather than a false pass. The name-safety and no-shell controls are covered
  by the runner's unit tests, not by a separate `@security` scenario, because the issue's scenario set for #183
  is fixed at the three above.
* The three scenarios are `@audience:agent`; `operator` audience coverage stays satisfied globally by the
  evidence feature, so no `bdd-config.json` change was needed.
