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

## 2026-10-30 - add the step-3 planning-record scenarios (#175 PR-B)
- event: added
- change: fix/175b-planning-validators
- scenarios: edit-before-plan-held, pattern-decision-before-code, pattern-record-incomplete, threat-model-before-code, threat-without-control, control-without-security-scenario, no-security-surface, behavior-matrix-before-code, unsure-audience-asks, adr-with-significant-decision, adr-placeholder-or-dead-link, personal-data-lifecycle, deploy-reversibility, service-readiness, ui-change-three-verdicts, architecture-standards-applied
- audiences: agent, operator
- categories: negative, happy, edge, permission
- quality: functional, security, reliability, compliance, release-safety, accessibility
- severity: critical, high, medium
- gate: check-gherkin-valid OK, check-bdd-tags OK, check-bdd-coverage OK, bdd-run OK, check-bdd-executed OK

## 2026-10-30 - add the finish-check (step 4-9) scenarios (#174 PR-A)
- event: added
- change: fix/174a-finish-check-core
- scenarios: formula-runs-without-prompt, done-before-review-refused, two-tasks-kept-apart, source-change-needs-test, new-check-discriminates, coverage-not-the-target, ledger-and-claim-lint, untagged-claim-blocks, checker-results-recorded, review-in-fresh-context, self-review-not-counted, matrix-missing-file, fix-until-clean, review-timeout, caught-mistake-encoded, caught-mistake-not-encoded, finish-blocked-without-receipt, off-tree-folder-enforced, read-only-task-not-blocked, repeated-block-escalates-once, proof-already-attached
- audiences: agent, subagent, operator
- categories: happy, negative, concurrency, edge, timeout, adverse
- quality: functional, reliability
- severity: critical, high, medium
- gate: check-gherkin-valid OK, check-bdd-tags OK, check-bdd-coverage OK, bdd-run OK, check-bdd-executed OK

## 2026-10-30 - add the enforcement install + self-test + waiver scenarios (#174 PR-B)
- event: added
- change: fix/174b-finish-check-install
- scenarios: no-reminder-needed, formula-summary, broken-install-warned-at-start, enforcement-tamper-visible, enforcement-cannot-be-removed-by-agent, operator-waiver-recorded, agent-cannot-self-waive-a-step, waiver-format, session-id-cannot-escape-store
- audiences: operator, agent
- categories: happy, error, adverse, negative, boundary
- quality: functional, reliability, security
- severity: critical, high, medium
- gate: check-gherkin-valid OK, check-bdd-tags OK, check-bdd-coverage OK, bdd-run OK, check-bdd-executed OK

## 2026-10-30 - add the subagent hand-back + parent backstop scenarios (#176)
- event: added
- change: fix/176-subagent-handback
- scenarios: subagent-runs-formula, subagent-skips-plan, subagent-gets-skill-text, named-skill-must-be-read, subagent-edits-need-receipt, brief-names-no-skill, workflow-agent-covered, smaller-model-same-rules, reviewer-findings-carry-evidence, uncovered-subagent-caught-by-parent, parallel-copies-merge-receipts, interrupted-subagent-flagged, subagent-claims-not-taken-on-trust
- audiences: subagent, operator
- categories: happy, negative, edge, error, concurrency, timeout, adverse
- quality: functional, security, reliability
- severity: critical, high, medium
- gate: check-gherkin-valid OK, check-bdd-tags OK, check-bdd-coverage OK, bdd-run OK, check-bdd-executed OK
