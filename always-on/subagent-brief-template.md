# Subagent brief template

Use this when you start a subagent or a workflow agent. The audit behind issue #176 found that the wording of
the brief tracked whether subagents actually read the skills: on the day briefs pointed to a shared file that
said "Load and apply with the Skill tool," 34 of 34 subagents loaded or read a skill; on the days each brief
said only "Apply skills: X, Y, Z," 8 of 68 did (the cause is inferred from the timing, not proven). So the
brief tells the subagent to **load and apply**, not just names the skills, and names the hand-back bar.

Copy the block below into the subagent's brief, fill the brackets, and keep the two headed sections verbatim.

```
Task: <what to do, scoped to one unit of work>
Target files: <paths or globs the subagent will change, if known>

## Skills (load and apply with the Skill tool)
Load each of these with the Skill tool and apply it; reading the skill is required, naming it is not. Quote
the heading you applied in your hand-back.
- <skill-name>: <why it applies to this task>
- <skill-name>: <why it applies to this task>
(If you are unsure whether a skill applies, load it and say why in one line. The router may add more from the
files you touch.)

## Before you hand back, run
- Write a per-task receipt covering every file you changed and the skills you applied.
- Run the checker each applied skill names, through `node always-on/run-check.mjs run <skill> <script>` (never
  by a bare path, never piped into tail/head).
- Lead your final report with an evidence ledger and make it pass `claim-lint --strict`. State anything you
  did not re-run as `reported`, not `verified`.
```

A shipped agent definition (`.claude/agents/esk-implementer.md`, `esk-reviewer.md`, `esk-auditor.md`) already
preloads the right skills by role, so prefer one of those agents when it fits; the brief block above still
applies on top of it. The `SubagentStop` hand-back check enforces the two headed sections: it refuses a
hand-back when a changed file has no receipt, or when the brief named a skill the subagent never read.
