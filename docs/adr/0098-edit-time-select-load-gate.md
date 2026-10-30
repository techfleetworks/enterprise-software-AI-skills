---
status: "accepted"
date: 2026-10-30
decision-makers: mdenner
---

# An edit-time gate that holds a source edit until the task's skills are selected and loaded

## Context and Problem Statement

Issue #175 (one of ten from an agent-session audit) found that a skill is read only if the agent decides to,
and that after a compaction the app re-attaches only skills used earlier, so a skill never invoked never comes
back. In the audited session the main thread invoked the Skill tool 5 times in about 2.7 days; a compliance
ledger marked 5 skills "APPLIED" that the thread never invoked or read; and it marked `bdd-comprehensive-testing`
not-applicable on its own. Nothing checks, before an edit, that the task's skills were selected (every skill
given a verdict) and loaded (their text actually read this session). This is issue #175, split into two serial
PRs; this ADR covers PR-A: the select and load steps (steps 1 and 2 of the formula). The plan step (step 3) is
ADR-0099 / PR-B.

## Considered Options

- **A finish-only check (issue #174) and nothing at edit time.** Simpler, but it catches the gap only at the end
  of a turn, after the edits are made; it does not put the skill text in context before the edit, and it does not
  stop an agent from editing without ever selecting.
- **An edit-time `PreToolUse` gate plus a per-session load-state.** Hold a source edit until a selection record
  exists and every required/applies skill was loaded this session; record genuine loads; re-deliver the selected
  skills after a compaction. Catches the gap at the moment it matters and keeps the text in context.
- **Auto-inject the skill text on an edit and allow it.** Smooth, but it makes "loaded" meaningless (a skill
  counts as applied without the agent ever reading or planning with it), which is exactly the audit's failure.

## Decision

Ship the edit-time select/load gate as enforcement-runtime scripts under `always-on/`, driven by a versioned
router:

1. **A versioned personal-install router**, `always-on/routing-rules.config.json` + `routing-lib.mjs`, mapping a
   changed/edited file path to the skills it makes required (each rule has its own test). This is the shipped
   skills map for the edit-gate, distinct from the artifact routing map under `judge-arch/assets/example`.
2. **`check-task-plan.mjs`** with a `selection` mode (every directive skill has a verdict and, for
   applies/not-applicable, a reason; a router-required skill cannot be marked not-applicable without an operator
   waiver; a missing skill is an empty cell) and a `loaded` mode (every required/applies skill's CURRENT text was
   delivered this session, keyed by the skill file's sha256; a stale hash does not count). Exit 2 = HOLD.
3. **`edit-gate.mjs`**, a PreToolUse hook on `Write|Edit|MultiEdit|NotebookEdit|Bash`, that requires the selection
   record to exist, runs the selection and load checks, and denies the edit (exit 2) with what to do if either
   holds. It exempts edits to the record files and is a no-op where it is not wired, so it never breaks unrelated
   work.
4. **The load-state lifecycle**: `record-load.mjs` (PostToolUse on the Skill tool) records a GENUINE load, so
   "loaded" means the text was actually read; `reload-skills.mjs` (SessionStart, matcher `compact`) re-delivers
   and records the selected skills after a compaction, closing the audit's "never comes back" gap. The schemas
   are documented in `always-on/edit-gate-records.md`.
5. **Proof**: `test/routing-lib.test.mjs` (a test per rule), `test/check-task-plan.test.mjs`,
   `test/edit-gate.test.mjs`, and `test/load-state.test.mjs` are the discriminating tests (a no-op gate or
   validator flips every HOLD), and eleven `@audience:agent` scenarios drive the real scripts on the harness.

The auto-inject option is rejected because it would let a skill count as applied without being read, the exact
failure the audit found; the finish-only option is rejected because it does not put the skill text in context
before the edit or stop an edit made with no selection at all.

## Consequences

* Before a source edit, the task must have a selection (every skill given a verdict, router-required skills not
  self-waived) and every required/applies skill's current text must have been loaded this session, or the edit is
  held with what to do. After a compaction, the selected skills are re-delivered, so one never silently goes
  missing. "Loaded" is a genuine read (recorded on the Skill tool), not a recall or an auto-injection.
* The real guarantee lives in the gate scripts and their discriminating tests, plus the versioned router. The
  grounding of "loaded" is the file hash, so a changed skill is re-read.
* Honest limits. The edit-gate holds EDITS; the Stop finish-check (issue #174) is the backstop that holds the
  turn, and both must themselves exit non-zero because Claude Code hooks fail open by default (a crashed hook
  lets the action through unless it blocks). Bash coverage is best-effort (the hook cannot parse every shell
  redirection that writes a file). Where the gate is not wired (its env is unset) it is a no-op by design, so a
  machine that has not installed it is not protected; that install is the bootstrap step. The plan step (step 3)
  and its planning-record validators are PR-B (ADR-0099).
* The eleven scenarios are `@audience:agent`; `operator` audience coverage stays satisfied globally, so no
  `bdd-config.json` change was needed.
