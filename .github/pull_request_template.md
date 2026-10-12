<!-- The review workflow this repo requires of every change. See CONTRIBUTING.md and docs/adr/0032. -->

## What and why

<!-- What this change does, and the reason for it. Link the ADR if it is an architectural or schema decision. -->

## Review checklist (required before merge)

- [ ] **Mechanical gates green.** `npm test` passes and `npm run check:architecture` exits 0 locally; the required CI checks (`test (20)`, `test (24)`, `routing`) are green.
- [ ] **Fresh-context judge-arch run.** The change was reviewed by `judge-arch` in fresh context (it dispatches the review to a subagent), every finding is resolved or explicitly waived, and the review is recorded in `docs/arch-reviews/log.jsonl`.
- [ ] **Discriminating tests.** Every new or changed gate has a test that fails if the gate stops detecting (verifiable-quality-gates); new behavior has a test that would fail without the change.
- [ ] **Evidence ledger.** Factual claims in this PR and in any ADR carry an evidence state, a re-runnable source, and a named limitation (skeptical-audit); nothing is called done, secure, or passing without it.
- [ ] **ADR for decisions.** Any architectural or schema decision has an ADR under `docs/adr/` in this same change (architectural-decision-records).
- [ ] **Routed artifacts present.** The kind of change carries its discipline's artifact: a new skill needs an ADR, a new gate script needs a test, and so on. The `routing` check confirms it.

## Honest limit

<!-- What this change does NOT do, plus any known risk or follow-up. Candor over false completeness. -->
