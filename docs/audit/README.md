# Audits

This folder holds one-off audits and gap analyses: a skill or practice in this repo measured against an
authoritative outside source, with every claim carrying an evidence state and a re-runnable source (a
`file:line` or a grep), per the repo's evidence discipline (canonical contract:
[`.claude/skills/skeptical-audit/references/evidence-discipline.md`](../../.claude/skills/skeptical-audit/references/evidence-discipline.md)).

Use the state vocabulary from that contract: `proven` (a committed discriminating gate keeps it true),
`observed` (you ran it and saw the result this session), `inferred` (a named deduction from observed
facts), `documented` (a doc or spec asserts it), `reported` (a person or tool stated it), `not-assessed`
(a stated gap, never a silent pass). You may move down that list for free; moving up needs a new
measurement. An audit claim that could be measured is `observed`, never `inferred`: run it rather than
reason about it.

An audit here is not a gate. It is the research that feeds a decision. A finished audit usually leads to
an ADR in `docs/adr/` and to concrete skill edits. The gates that run on every change live elsewhere:
the mechanical architecture gate is `npm run check:architecture` (see `docs/arch-reviews/README.md` and
ADR-0015), and each skill ships its own checker under its `scripts/` folder.

## Contents

- `test-pyramid-gap-analysis.md`: the `comprehensive-test-strategy` and `bdd-comprehensive-testing` skills
  measured against Fowler and Vocke's *The Practical Test Pyramid*. It separated what the skills already
  covered from the real gaps, and fed ADR-0005 (align the test skills with the practical test pyramid).

## Adding an audit

Name the file for what it audits (`<subject>-gap-analysis.md` or `<subject>-audit.md`). State the source
and the retrieval date up front, mark every "what we have" claim `[observed]` with a re-runnable source,
and end with the gaps and the decision or ADR they lead to.
