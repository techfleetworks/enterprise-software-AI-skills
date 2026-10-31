# Experiment: does the brief's wording change whether a subagent reads a skill?

Status: **designed, not yet run** (not-assessed). Issue #176, deliverable 8.

## Why

The #176 audit observed a sharp drop in subagents reading skills (34 of 34 on one day, 8 of 68 on the next
two), and the drop lined up in time with a change in how briefs named skills: from a shared file that said
"Load and apply with the Skill tool" to a fresh per-brief line "Apply skills: X, Y, Z." The timing match is
**observed**; that the wording **caused** the drop is **inferred**, not tested. This experiment tests it.

## Hypothesis

A brief that says "Load and apply with the Skill tool" (the imperative-to-load wording) produces more subagent
skill loads than a brief that only says "Apply skills: X, Y, Z" (the name-only wording), holding the task
constant.

## Design

- **One fixed task** that plainly needs a skill (for example: add an ADR for a small schema change, which the
  router maps to `architectural-decision-records`). Hold the task, the target files, and the model constant.
- **Two brief variants**, identical except the skills line:
  - Variant A (load): the `## Skills (load and apply with the Skill tool)` block from
    `always-on/subagent-brief-template.md`.
  - Variant B (name-only): a single line `Apply skills: architectural-decision-records.`
- **Runs:** 10 subagents per variant (20 total), each a fresh subagent, enforcement OFF for the measurement so
  the hand-back check does not itself force a load (we are measuring the brief's effect, not the gate's).
- **Measure:** for each run, "loaded or read a skill" = a Skill tool call, or a tool input naming a file under
  `skills/<name>/`, in that subagent's transcript (the same definition the audit used;
  `always-on/transcript-files.mjs` `skillsReadInTranscript` computes it). Record a 2x2 count.
- **Readout:** the load rate for A vs B, with the raw counts. A difference of the size the audit saw (near 100%
  vs near 12%) would confirm the hypothesis; a small or zero difference would refute it and point the fix at the
  gate (which enforces loading regardless of wording) rather than the wording.

## Honest limits

- This measures *loading*, not whether the skill was *applied well*; the audit's finding 6 ("work was done, but
  not well enough") is out of scope here.
- A single task and one model; a real result would repeat across a few tasks and models.
- With enforcement ON, the `SubagentStop` check refuses a hand-back that names a skill it never read, so in
  production the wording matters less than it did in the audited session; this experiment is about the size of
  the wording effect on its own, to justify keeping the imperative wording in the template.
