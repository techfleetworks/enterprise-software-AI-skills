# Skill-application receipts

This directory holds `log.jsonl`, an append-only, tamper-evident record of how the enterprise skills were
applied on each change (one entry per pull request, keyed by branch). It mirrors `docs/arch-reviews/log.jsonl`.

The `check-skill-receipt` gate (`npm run check:receipt`) proves each receipt is GROUNDED: every skill is
covered (applied or not-applicable), every `applied` entry cites a real skill heading, quotes it verbatim
(at least eight exact words), and points at files that are actually in the change. On a surface the routing
coupling fires for (a UI change, a new ADR), the coupled skill must be `applied`, not `not-applicable`.

The full design is in [docs/specs/skill-application-receipt.md](../specs/skill-application-receipt.md) and
ADR-0038.

## The honest limit, which the gate prints and every reader must hold

This receipt is the agent's self-report. A human must review the work against the diff. It does not prove the work was done or done well.

The gate enforces that the receipt EXISTS, is COMPLETE, is WELL-FORMED, and is GROUNDED (its citations point at
real skill text and at files really in the change). It CANNOT verify the receipt is TRUE (that the guidance was
genuinely applied) or that the application was GOOD. That is irreducible, the same limit behind judging
usability or whether the right pattern was chosen. The grounding checks make a hollow or fabricated receipt
mechanically detectable; they do not make a shallow-but-grounded one impossible. That is why the human review
is mandatory, and why every entry carries a `humanReviewed` field for a reviewer to fill.
