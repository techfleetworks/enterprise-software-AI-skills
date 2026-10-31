---
status: "accepted"
date: 2026-10-30
decision-makers: mdenner
---

# 0102 - Subagents are held to the formula: a hand-back check, a parent backstop, and preloaded skills

Issue: #176 (the last of the ten audit issues).

## Context

The always-on directive reached every subagent, but using it did not follow. In the audited session, on one
day 34 of 34 subagents loaded or read a skill; on the next two days only 8 of 68 did, and no subagent wrote a
receipt though subagents made 584 edits. Nothing checked a subagent at hand-back: `esk-init` registered
`SessionStart` and `SubagentStart` (delivery) but never `SubagentStop`. Naming a skill in a brief did not make
a subagent read it (the drop tracked a wording change from "Load and apply with the Skill tool" to "Apply
skills: X, Y, Z"; the cause is inferred, not proven).

The finish-check (#174) and the edit-gate (#175) hold the MAIN session. Subagents need the same, plus two
things a main-session check cannot give: a check at the subagent's own hand-back, and a way for the parent to
catch a subagent that was cut off (a usage limit, a crash) before its hand-back ran. Claude Code exposes the
subagent boundary as `SubagentStop`, with the subagent's own transcript at `agent_transcript_path`;
`skills:` frontmatter on an agent definition preloads skill text. These are documented and, on this machine,
not-assessed (no live subagent run), so the mechanism is built to the documented contract and tested with
synthetic payloads, like the rest of the enforcement.

## Decision

1. **A `SubagentStop` hand-back check (`always-on/subagent-check.mjs`).** It reads the subagent's own transcript
   and refuses the hand-back when: the subagent changed files with no receipt covering them; the brief named a
   skill the subagent never loaded or read (a Skill tool call, or a tool input naming a file under
   `skills/<name>/`); or a read-only reviewer's final report does not carry evidence (`claim-lint --strict`).
   It fails closed (a SubagentStop hook that exits any way but 2 lets the hand-back through) and is a no-op when
   enforcement is not wired. `esk-init --enforce` now registers it on `SubagentStop` (replacing the
   finish-check there), and the self-test and canary cover it.

2. **A subagent ledger, and a parent backstop.** Each hand-back appends its result (agent, changed files,
   `receipt_ok`) to a per-session ledger (`<base>/subagents/<session_id>.jsonl`), and the edit-gate appends an
   unreceipted entry per subagent edit at edit time. The parent's `Stop` finish-check reads the ledger and, per
   agent, takes the union of files it touched and the `receipt_ok` of its last entry; any agent whose files are
   not covered holds the parent's turn, named. So a subagent cut off before its own check ran, or one whose
   check refused and could not recover, still leaves its uncovered files flagged on the parent. This runs even
   when the parent itself changed nothing.

3. **Preloaded skills by role.** Shipped agent definitions (`.claude/agents/esk-implementer.md`,
   `esk-reviewer.md`, `esk-auditor.md`) carry `skills:` frontmatter so the skill text is in the subagent's
   context before it starts. The edit-gate's `PreToolUse` check already fires inside subagents, so the edit-time
   select/load/plan gate applies to them too.

4. **The parent does not launder a subagent's claim (`always-on/subagent-claim.mjs`).** Unless the parent
   re-ran it, a subagent's "verified / gate green / fixed" is relabelled "reported by a subagent, not re-run by
   the parent" before it reaches the operator.

5. **Brief guidance.** A shared brief template (`always-on/subagent-brief-template.md`) with the imperative
   "Load and apply with the Skill tool" wording and the hand-back bar, plus a designed (not-yet-run) experiment
   (`docs/research/subagent-brief-wording-experiment.md`) to test whether that wording changes the load rate.

Transcript parsing (changed files, skills read, the brief, the final report) is extracted to one shared module
(`always-on/transcript-files.mjs`) so the finish-check and the subagent-check have a single owner, not two
copies.

## Consequences

- A subagent runs the same formula for its part and cannot hand back unproven work; the parent catches what a
  subagent's own check missed, including a cut-off subagent.
- Like the rest of the enforcement, these checks verify that the proof is present, complete, and grounded, not
  that the work is true or good; a human review is still required.
- Honest limits (documented, not-assessed on this machine): `SubagentStop` firing, `agent_transcript_path`, and
  `skills:` frontmatter are from the Claude Code docs, not observed here. The parent backstop depends on the
  subagent agent id appearing in the hook payloads; where it does not, a subagent edit is recorded against the
  main session instead and the edit-gate's edit-time entry is the only catch. The named-skill check scopes its
  match to the brief's "## Skills" block when the template header is present (so a directive that lists every skill,
  if it lands in the first turn, is not read as "the brief named them all" and over-blocks), and matches folder
  names and shorthands on word boundaries; a brief WITHOUT that header is matched whole, and an unusual phrasing can
  still be missed, which fails toward not-flagging (the receipt check still applies to any changed file). A hand-back
  payload that omits the transcript path is allowed (the check cannot assess what it cannot read; the install canary
  relies on this too); a real subagent hand-back carries its transcript. Parent coverage is tracked per file, so a
  file an edit-gate entry recorded but the hand-back's receipt never covered stays flagged, not cleared by a later,
  narrower receipt.
- `subagent-check` replaces `finish-check` on `SubagentStop`; `finish-check` stays the main-session `Stop`
  handler. The two share the transcript module and the receipt and path machinery.

## Alternatives considered

- **Reuse `finish-check` unchanged on `SubagentStop`.** Rejected: it has no concept of the brief's named
  skills, no read-only-reviewer evidence path, and does not write the ledger the parent backstop needs.
- **Record subagent edits only at hand-back.** Rejected: a subagent cut off before `SubagentStop` would leave
  no record, so the parent could not catch it. The edit-time ledger entry closes that, at the cost of an extra
  append per subagent edit.
- **Block a subagent's "verified" with `claim-lint` alone.** Rejected: claim-lint flags an assertive,
  ungrounded "I verified," but not every phrasing a parent might pass on; the parent-side downgrade relabels the
  claim regardless of phrasing when the parent did not re-run it.
