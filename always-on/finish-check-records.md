# The finish-check task record

`always-on/finish-check.mjs` (issue #174, ADR-0100) holds a turn until the skills formula has left its proof
for a file-changing task. It reads that proof from a **task record**: a single JSON file, named by the
`ESK_TASK_RECORD` environment variable, that the agent writes and updates as it works. This file documents
the record's shape so an agent writing one, and a reader checking one, agree on every field.

The finish-check proves the record is **present, complete, and internally consistent** (and, for the
receipt, grounded and hash-tied to the changed files via issue #177). It does **not** prove the underlying
work is true or good. A human review is still required. This is the floor, not the ceiling.

## How it is read

- **Input to the hook (stdin):** the Claude Code Stop payload - `transcript_path` or `agent_transcript_path`,
  `stop_hook_active`, `session_id`.
- **Config (set per session by the installer, issue #174 PR-B):**
  - `ESK_TASK_RECORD` - the path to the task record described here. **When it is unset the engine is not
    wired:** it emits a notice and lets the turn end, so an un-bootstrapped machine is never broken.
  - `ESK_RECEIPT` - the per-task receipt (JSONL) checked by `task-receipt.mjs` (issue #177). Falls back to
    the record's own `receiptPath`.
  - `ESK_SKILLS_DIR` - the skills directory (default `.claude/skills`).
  - `ESK_BLOCKS` - a small JSON counter file for loop safety (per task).
  - `ESK_BLOCK_CAP` - blocks in a row before escalating instead of blocking again (default 3; Claude Code
    caps stop-hook blocks at 8).
- **Changed files** are derived from the transcript, not from the record: the hook walks the transcript for
  edit-tool (`Write`/`Edit`/`MultiEdit`/`NotebookEdit`) `file_path`s. A task that changed nothing is
  read-only and ends at once.

## The record

```jsonc
{
  "task_id": "t1",                 // string, this task
  "session_id": "s1",              // string, the session

  // --- order: the formula steps that have run, in order ---
  "steps": ["select", "load", "plan", "build", "prove", "review", "encode", "receipt"],

  // --- build ---
  "build": {
    "testsChanged": true,          // true when a test moved with a source change
    "newChecks": [                 // each new gate/check this task adds
      { "script": "g.mjs", "hasDiscriminatingTest": true }
    ],
    "coverage": {                  // optional
      "targetMet": true,
      "uncoveredChangedBranch": null  // a non-empty string here is a BLOCK (coverage is not the target)
    }
  },

  // --- prove ---
  "prove": {
    "ledger": true,                // the final report leads with an evidence ledger
    "claimLintExit": 0,            // claim-lint --strict exit code (non-zero BLOCKS)
    "checkers": [                  // each selected checker's recorded result
      { "command": "node ...", "exit": 0, "output_sha256": "abc..." }
    ]
  },

  // --- review (a fresh-context review) ---
  "review": {
    "freshContext": true,          // false (self-review) BLOCKS
    "timedOut": false,             // true BLOCKS (start a new review)
    "logged": true,                // appended to the review log
    "matrix": {                    // one row per CHANGED file, each with all four questions
      "src/feature.ts": {
        "boundary":       { "verdict": "ok", "source": "src/feature.ts:1" },
        "ownership":      { "verdict": "ok", "source": "src/feature.ts:1" },
        "dependency":     { "verdict": "ok", "source": "src/feature.ts:1" },
        "error-handling": { "verdict": "ok", "source": "src/feature.ts:1" }
      }
    },
    "findings": [                  // any open HIGH/MEDIUM/critical not fixed or waived BLOCKS
      { "severity": "high", "file": "src/feature.ts", "status": "fixed" }
    ]
  },

  // --- encode ---
  "encode": {
    "findings": [                  // a fixed mistake with neither rule nor reason BLOCKS
      { "description": "wrong owner", "fixed": true, "rule": "negative example: ...", "reason": null }
    ]
  },

  // --- receipt (issue #177) ---
  "receiptPath": "/abs/path/receipt.jsonl",  // used when ESK_RECEIPT is unset

  // --- operator waivers (issue #174 PR-B) ---
  "waivers": [ { "step": "review", "by": "operator", "reason": "..." } ]
}
```

## What each group checks

| Group   | Holds the turn when                                                                                               |
|---------|------------------------------------------------------------------------------------------------------------------|
| order   | a step in `select, load, plan, build, prove, review, encode, receipt` is missing, or the done steps are out of order |
| build   | a source file changed but no test moved with it; a `newChecks` entry has `hasDiscriminatingTest !== true`; `coverage.uncoveredChangedBranch` is a non-empty string |
| prove   | `ledger !== true`; `claimLintExit !== 0`; a `checkers` entry lacks `command`, numeric `exit`, or `output_sha256` |
| review  | `freshContext !== true`; `timedOut === true`; a changed file has no matrix row, or a row missing a `verdict`+`source` for any question; `logged !== true`; an open high/medium/critical finding that is not `fixed`/`waived` |
| encode  | a finding with `fixed === true` has neither a non-empty `rule` nor a non-empty `reason`                           |
| receipt | `task-receipt.mjs check` exits non-zero over the task's changed files (missing, empty, stale, ungrounded, uncovered, or hash-mismatched receipt) |

Any single unmet item is a BLOCK (exit 2) whose message names the item and its fix. A step may be skipped
only with an operator waiver recorded in `waivers` (the agent cannot write its own; that is enforced at
install time in PR-B).

## Failure behavior

- **Fails closed.** A malformed payload, an unreadable or non-JSON record, a transcript that is named in the
  payload but cannot be read (missing, not a file, or an open/stat error), an uncaught exception, or a stdin
  error all route to BLOCK (exit 2), because a Stop hook that exits any other way lets the turn end. Only an
  empty-but-readable transcript reads as read-only. (One disclosed fail-open corner remains: a readable
  transcript in a schema the walker does not recognize yields an empty change set, which reads as read-only;
  the install-time self-test and canary in PR-B are what catch that.)
- **Loop safety.** After `ESK_BLOCK_CAP` blocks in a row it escalates: it ends the turn with one
  plain-language message naming what is still missing, for the operator to review, rather than blocking
  forever. A clean finish resets the counter.
- **Not wired.** With `ESK_TASK_RECORD` unset it is a no-op notice; installing it (PR-B) turns it on.
