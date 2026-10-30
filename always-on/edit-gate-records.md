# Edit-gate records: the selection record and the load-state (issue #175, ADR-0098)

The edit-gate (`edit-gate.mjs`) holds a source edit until two records exist for the task. Both are plain JSON,
validated by `check-task-plan.mjs`, and live outside the work folder (the installer sets their paths per session
through `ESK_SELECTION` and `ESK_LOADED`). The plan records (step 3) are a separate schema added by PR-B.

## Selection record (`ESK_SELECTION`)

Step 1 of the formula. One verdict for every skill the directive lists (the skills under the skills dir, minus
`bootstrap`). A skill left out is an empty cell and fails. `applies` and `not-applicable` each carry a one-line
reason tied to the task; when unsure, the verdict is `applies`. A skill the router requires (from the file the
task changes) cannot be `not-applicable` without an operator waiver.

```json
{
  "<skill-name>": { "verdict": "required" | "applies" | "not-applicable", "reason": "<one line; required for applies/not-applicable>" }
}
```

Validated by: `node check-task-plan.mjs selection --selection <file> --skills-dir <dir> [--changed-list <csv>] [--waivers <csv>]`.
Exit 0 = complete and reasoned; exit 2 = HOLD (a missing verdict, a missing reason, or a router-required skill
marked not-applicable without a waiver).

## Load-state (`ESK_LOADED`)

Step 2 of the formula. Which skills were genuinely read this session, keyed by the skill file's current sha256.
`record-load.mjs` (PostToolUse on the Skill tool) adds an entry when a skill is actually loaded;
`reload-skills.mjs` (SessionStart, matcher `compact`) clears the selected skills from the load-state and names
them to re-load after a compaction (a real SKILL.md is 20-35 KB, over the 10,000-char additionalContext cap, so
the bodies cannot be re-inlined and must not be marked loaded without being delivered). A stale hash (the skill
text changed since it was delivered) does not count as loaded.

```json
{ "<skill-name>": "<sha256 of the SKILL.md that was delivered>" }
```

Validated by: `node check-task-plan.mjs loaded --selection <file> --loaded <state> --skills-dir <dir>`.
Exit 0 = every required/applies skill's current text was delivered this session; exit 2 = HOLD (a selected skill
was never loaded, or only a stale version was).

## How the gate uses them

`edit-gate.mjs` runs as a PreToolUse hook on `Write|Edit|MultiEdit|NotebookEdit|Bash`. Before an edit it requires
the selection record to exist (else "write the skill selection first"), runs the selection check, then the load
check, and denies the edit (exit 2, the documented PreToolUse block) with what to do if either holds. It exempts
edits to the record files themselves, and is a no-op where `ESK_SELECTION` is unset so it never breaks unrelated
work. The honest limit: this gate holds EDITS; the Stop finish-check (issue #174) is the backstop that holds the
turn, and both must themselves exit non-zero because Claude Code hooks fail open by default.
