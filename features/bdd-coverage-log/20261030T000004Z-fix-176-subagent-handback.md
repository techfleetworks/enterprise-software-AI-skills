## 2026-10-30 - add the subagent hand-back + parent backstop scenarios (#176)
- event: added
- change: fix/176-subagent-handback
- scenarios: subagent-runs-formula, subagent-skips-plan, subagent-gets-skill-text, named-skill-must-be-read, subagent-edits-need-receipt, brief-names-no-skill, workflow-agent-covered, smaller-model-same-rules, reviewer-findings-carry-evidence, uncovered-subagent-caught-by-parent, parallel-copies-merge-receipts, interrupted-subagent-flagged, subagent-claims-not-taken-on-trust
- audiences: subagent, operator
- categories: happy, negative, edge, error, concurrency, timeout, adverse
- quality: functional, security, reliability
- severity: critical, high, medium
- gate: check-gherkin-valid OK, check-bdd-tags OK, check-bdd-coverage OK, bdd-run OK, check-bdd-executed OK
