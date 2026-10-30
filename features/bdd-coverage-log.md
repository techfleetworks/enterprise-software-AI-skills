# BDD coverage log (append-only)

Append-only history of behavioral changes. Never edit or delete a past entry; only append new ones.
Each entry records what changed, the taxonomy of the scenarios touched, and the gate run that proved
them (the receipt).

## 2026-10-28 - add the build-comparison scenarios (#178)
- event: added
- change: fix/178-build-comparison-rigor
- scenarios: regression-diff-must-be-able-to-fail, new-failure-inside-red-gate
- audiences: agent
- categories: negative, edge
- quality: reliability
- severity: critical
- gate: check-gherkin-valid OK, check-bdd-tags OK, check-bdd-coverage OK, bdd-run OK, check-bdd-executed OK

## 2026-10-29 - add the fixed/verified scenarios (#179)
- event: added
- change: fix/179-define-fixed-verified
- scenarios: fixed-needs-red-on-revert, green-suite-must-cover-the-claim, unexplained-pass-attributed, review-findings-acted-on
- audiences: agent, operator
- categories: negative, edge, adverse
- quality: reliability
- severity: critical, high
- gate: check-gherkin-valid OK, check-bdd-tags OK, check-bdd-coverage OK, bdd-run OK, check-bdd-executed OK

## 2026-10-29 - add the skeptical-audit addition scenarios (#180)
- event: added
- change: fix/180-skeptical-audit-additions
- scenarios: ownership-observed-before-build, headline-is-predeclared, done-needs-observed-majority, downgrade-names-next-step, comparison-claim-needs-source
- audiences: agent, operator
- categories: negative
- quality: reliability, functional
- severity: high, medium
- gate: check-gherkin-valid OK, check-bdd-tags OK, check-bdd-coverage OK, bdd-run OK, check-bdd-executed OK

## 2026-10-29 - add the reading-grade and evidence-words scenarios (#181)
- event: added
- change: fix/181-reading-grade-evidence-words
- scenarios: plain-language-meets-grade, plain-language-keeps-evidence
- audiences: operator
- categories: happy, boundary
- quality: accessibility, reliability
- severity: medium
- gate: check-gherkin-valid OK, check-bdd-tags OK, check-bdd-coverage OK, bdd-run OK, check-bdd-executed OK

## 2026-10-29 - add the combinatorial-testing and tested-oracle scenarios (#182)
- event: added
- change: fix/182-combinatorial-testing-tested-oracles
- scenarios: interaction-defects-use-covering-array, oracle-unit-tested
- audiences: agent
- categories: edge, error
- quality: security
- severity: medium, high
- gate: check-gherkin-valid OK, check-bdd-tags OK, check-bdd-coverage OK, bdd-run OK, check-bdd-executed OK

## 2026-10-29 - add the fail-closed checker-runner scenarios (#183)
- event: added
- change: fix/183-checker-fail-closed-run-anywhere
- scenarios: skill-cannot-load, checker-missing-fails-closed, checker-timeout-fails-closed
- audiences: agent
- categories: error, timeout
- quality: reliability
- severity: high, medium
- gate: check-gherkin-valid OK, check-bdd-tags OK, check-bdd-coverage OK, bdd-run OK, check-bdd-executed OK

## 2026-10-29 - add the per-task receipt scenarios (#177)
- event: added
- change: fix/177-per-task-receipts-hash-tied
- scenarios: receipt-files-in-change, receipt-matches-selection, receipt-quote-must-be-verbatim, stale-receipt-refused, parallel-sessions-separate-receipts, empty-receipt-refused, large-change-fully-checked
- audiences: agent
- categories: negative, concurrency, empty-overflow
- quality: reliability, functional
- severity: critical, high, medium
- gate: check-gherkin-valid OK, check-bdd-tags OK, check-bdd-coverage OK, bdd-run OK, check-bdd-executed OK

## 2026-10-30 - add the edit-time select/load scenarios (#175 PR-A)
- event: added
- change: fix/175a-edit-gate-select-load
- scenarios: edit-before-selection-held, every-skill-gets-verdict, silent-skip-is-empty-cell, router-adds-required-skills, tiny-change-full-selection, no-routed-files-still-selected, unsure-means-apply, selected-skills-loaded, applies-but-not-loaded, reload-after-compaction, required-skill-cannot-be-self-waived
- audiences: agent
- categories: negative, happy, edge, boundary, empty-overflow
- quality: functional
- severity: critical, high, medium
- gate: check-gherkin-valid OK, check-bdd-tags OK, check-bdd-coverage OK, bdd-run OK, check-bdd-executed OK
