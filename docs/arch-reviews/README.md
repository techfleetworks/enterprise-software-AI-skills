# Architecture reviews

This folder is the permanent, append-only record of every `judge-arch` review run against this repo. It
is the receipt half of the architecture gate: proof that a change was actually examined, what was found,
and what evidence backed each verdict.

## What is here

- `log.jsonl`: the canonical log. One JSON object per review, appended in order, never edited or deleted.
  Each entry records the date, the change ref (commit or PR), the scope (the changed file list), the review
  matrix (every changed file crossed with the four questions, each cell a verdict plus evidence or reason),
  every finding with its `@question`, `@severity`, and `@file` tags, the grep-battery commands run, the
  mechanical gate result, and the final verdict.

## The rules

- **Append-only.** A new review is a clean append to the end of `log.jsonl`. A past entry is never changed
  or removed. Git history is the backing record, so the log is tamper-evident: anyone can read back what
  was reviewed, found, and proved, and when. This mirrors the audit-log discipline in the
  `compliance-data-lifecycle` skill.
- **Evidence on every cell.** A `cleared` verdict carries a re-runnable source (the grep that came back
  empty, the `file:line` that shows the logic lives in the right layer), exactly like a finding does. A
  cell cleared with no evidence is a defect, not a pass.
- **One source of truth.** Any human-readable `<date>-<scope>.md` companion is generated from the `.jsonl`
  log, not kept in parallel by hand, so the two cannot drift.

## The mechanical gate result field

Every entry has a field for the mechanical `arch-gate` result. Before the gate was wired to this repo,
entries recorded that there was no root gate config to run, so the field read as not applicable. As of
ADR-0015 that is no longer true. The gate now runs against this repo on every change through
`npm run check:architecture`, which executes `.claude/skills/judge-arch/scripts/arch-gate.mjs` against the root
`arch-gate.config.json`, and it is a required, blocking CI step. From ADR-0015 forward, record the real
result (pass, or the violations found), not a not-applicable note. Older entries are left as they were
written, because the log is append-only.

## Evidence discipline

Every verdict in this log is a factual claim, so it follows the repo's evidence discipline (canonical
contract: [`.claude/skills/skeptical-audit/references/evidence-discipline.md`](../../.claude/skills/skeptical-audit/references/evidence-discipline.md)).
Two rules matter most here:

- **A `cleared` cell must be `observed`, never `inferred`.** The source is something you ran and saw this
  session (the grep that came back empty, the `file:line` that shows the logic lives in the right layer),
  not a deduction that it is "probably fine." An `inferred` clear is the lazy-clear the coverage gate
  rejects.
- **A greppable finding is only `proven` once it is an `arch-gate` rule.** Until then it is `observed`
  (you saw it) and relies on a reviewer noticing it next time. Moving it into `arch-gate` (via
  `arch-encode`) is what makes it hold on every future change.

The mechanical result each entry records is itself evidence-stated: the live gate is `proven`
non-vacuous by `test/arch-gate-wired.test.mjs`, and a given run's clean result is `observed` from
`npm run check:architecture` (exit 0).

## How a review gets here

`judge-arch` appends the entry as the last step of a review (see `.claude/skills/judge-arch/SKILL.md`, "Storing reviews
permanently"). The `check-arch-review-coverage` gate reads this log to confirm a change was reviewed
across every changed file and every question before it can be called done.
