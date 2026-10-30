---
status: "accepted"
date: 2026-10-30
decision-makers: mdenner
---

# 0100 - The finish-check: a fail-closed Stop hook that holds a turn until the formula is proven

Issue: #174 (PR-A, the engine).

## Context

The always-on directive says to run the skills and, before calling work done, to prove each one was
applied. Up to now nothing held a turn to that. A session could edit files and end, and the only thing
standing between "edited" and "done" was the agent's own discipline. The audit that opened issues #174 to
#183 showed what that is worth in practice: on a real private session the Skill tool fired five times in
about 2.7 days, and fifteen operator messages across about forty hours were spent reminding the agent of a
step it had skipped.

The edit-time gate (ADR-0098, #175 PR-A) holds the first edit until select and load are done, and the plan
gate (ADR-0099, #175 PR-B) holds a source edit until the planning records exist. Neither one looks at the
END of a task. A task can pass the edit gate, then skip the review, skip the receipt, and stop. The missing
piece is a check at the turn boundary: before the turn ends, every later step of the formula (build, prove,
review, encode, receipt) must have left its proof.

Claude Code exposes exactly that boundary as the `Stop` and `SubagentStop` hook events. A `Stop` hook that
returns `{decision:"block"}` and exits 2 holds the turn and feeds the reason back to the agent; any other
exit lets the turn end. That asymmetry is the whole design constraint: a crash, a timeout, or an unhandled
path must land on exit 2, or the enforcement silently disappears exactly when it is needed.

## Decision

Add `always-on/finish-check.mjs`, the engine of the finish-check, wired (in PR-B) for `Stop` and
`SubagentStop`. Before a turn can end it:

1. Reads the Stop payload from stdin (`transcript_path`/`agent_transcript_path`, `stop_hook_active`,
   `session_id`).
2. Derives the files the task changed from the transcript: it walks the JSONL for `tool_use` calls of the
   edit tools (`Write`, `Edit`, `MultiEdit`, `NotebookEdit`) and collects their `file_path`. It snapshots
   the transcript size first and reads only that far, because the file keeps growing while the hook runs.
3. If nothing changed, the task is read-only: it ends at once, with no receipt and no operator-visible
   delay.
4. For a file-changing task it reads the task record named by `ESK_TASK_RECORD` and evaluates six groups:
   - **order** - the steps ran select, load, plan, build, prove, review, encode, receipt, in that order;
   - **build** - a changed source file moved a test with it; every new check ships a test that fails when
     the check is replaced by a no-op; a covered-target number with an uncovered changed branch is not a
     pass;
   - **prove** - the final report leads with an evidence ledger, `claim-lint --strict` exited 0, and each
     selected checker's command, exit code, and output hash are recorded;
   - **review** - a fresh-context review covered every changed file against each of the four questions, was
     logged, did not time out, and left no open HIGH/MEDIUM/critical finding that is not fixed or
     operator-waived;
   - **encode** - every caught-and-fixed mistake became a rule or carries a recorded reason for not writing
     one;
   - **receipt** - delegated to the per-task receipt checker (`task-receipt.mjs check`, ADR-0097) over the
     task's changed files.
5. If any group has an unmet item, it BLOCKS (exit 2) and names each item and its fix. If all pass, the turn
   ends.

It **fails closed**. `block()` is the sink for every error path: a malformed payload, an unreadable or
non-JSON task record, a transcript named in the payload that cannot be read (missing, not a file, or an
open/stat error), an uncaught exception, and a stdin read error all route to exit 2, because a Stop hook
that exits any other way lets the turn end. A transcript read failure is deliberately distinguished from an
empty-but-readable transcript: the former blocks, only the latter reads as read-only, so a read failure can
never be silently reclassified as "no files changed."

Two escapes keep it from trapping a session:

- **Not wired.** When `ESK_TASK_RECORD` is unset the engine is not installed on this machine: it emits a
  NOTICE and lets the turn end. The install (PR-B, esk-init) is what turns it on; an un-bootstrapped
  machine is never broken by the file being present.
- **Loop cap.** It counts blocks in a row in `ESK_BLOCKS`. At `ESK_BLOCK_CAP` (default 3; Claude Code
  itself caps stop-hook blocks at 8), instead of blocking again it escalates: it ends the turn with one
  plain-language message naming what is still missing, for the operator to review. A clean finish resets
  the counter.

The record format and every field are documented in `always-on/finish-check-records.md`.

### Scope of PR-A vs PR-B

This ADR and PR-A are the **engine and its contract**, proven by `test/finish-check.test.mjs` (17
discriminating tests) and 21 BDD scenarios that drive the real engine. The **installer wiring** - esk-init
registering the Stop/SubagentStop hooks for a personal install, hook-file tamper protection, the
SessionStart self-test, the install `--check` canary, operator-only waivers, and the one-line operator
summary - is **issue #174 PR-B**, and the eight scenarios that cover it (formula-summary, waiver-format,
agent-cannot-self-waive, enforcement-cannot-be-removed-by-agent, no-reminder-needed,
broken-install-warned-at-start, operator-waiver-recorded, enforcement-tamper-visible) land there.

## Consequences

- A file-changing task cannot end until the whole formula has left its proof; the operator stops being the
  enforcement.
- The check reads a task record rather than re-deriving each proof itself. That keeps the engine small and
  testable, but it means the record is a claim the agent writes: the finish-check proves the claim is
  present, complete, and internally consistent (and, for the receipt, grounded and hash-tied via #177), not
  that the underlying work is true or good. A human review is still required; this is the floor, not the
  ceiling. (Same honest limit as the receipt gate in ADR-0097 and the planning validators in ADR-0099.)
- Fail-closed means a bug in the finish-check blocks turns rather than letting them through. That is the
  correct failure direction for a guard, and the loop cap and the not-wired escape bound the blast radius:
  a persistent false block escalates to the operator after three tries instead of trapping the session.
- Deriving changed files from the transcript ties the check to the transcript schema. The walk is defensive
  (handles `tool_use` and `toolUse`, nested `message.content`, and both `file_path`/`filePath`/
  `notebook_path`). A transcript that is named in the payload but cannot be read now fails closed (blocks),
  so a read failure is never mistaken for "no files changed." One fail-open corner remains and is accepted
  here: a readable transcript in a schema the walker does not recognize yields an empty changed-set, which
  reads as read-only and ends the turn. That corner is what PR-B's install-time self-test and canary are
  meant to catch; named here as the known limit.

## Alternatives considered

- **A PostToolUse hook on every edit instead of a Stop hook.** Rejected: that is the edit-gate's job
  (ADR-0098), and it cannot see end-of-task steps (review, receipt) that only exist once the work is done.
- **Re-deriving each proof inside the finish-check** (re-run the review, recompute coverage). Rejected for
  PR-A: it would make the engine enormous and slow at the turn boundary, and most proofs (a fresh-context
  review, a human-visible ledger) are not reproducible from inside a Stop hook. The record-plus-gate split
  matches the rest of the system (#177 receipt, #175 plan).
- **Fail open on error** (let the turn end if the check crashes). Rejected outright: it would make the
  guarantee vanish exactly when the code is in a bad state, which is the failure the audit documented.
