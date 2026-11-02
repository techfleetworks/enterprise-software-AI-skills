## 2026-10-30 - add the finish-check (step 4-9) scenarios (#174 PR-A)
- event: added
- change: fix/174a-finish-check-core
- scenarios: formula-runs-without-prompt, done-before-review-refused, two-tasks-kept-apart, source-change-needs-test, new-check-discriminates, coverage-not-the-target, ledger-and-claim-lint, untagged-claim-blocks, checker-results-recorded, review-in-fresh-context, self-review-not-counted, matrix-missing-file, fix-until-clean, review-timeout, caught-mistake-encoded, caught-mistake-not-encoded, finish-blocked-without-receipt, off-tree-folder-enforced, read-only-task-not-blocked, repeated-block-escalates-once, proof-already-attached
- audiences: agent, subagent, operator
- categories: happy, negative, concurrency, edge, timeout, adverse
- quality: functional, reliability
- severity: critical, high, medium
- gate: check-gherkin-valid OK, check-bdd-tags OK, check-bdd-coverage OK, bdd-run OK, check-bdd-executed OK
