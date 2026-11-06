## 2026-11-06 - coverage is a finish-check precondition in an adopted repo (ADR-0116, #203 gap 2)
- event: added
- change: feat/coverage-finish-check-precondition
- scenarios: coverage-nonadopted-ends, coverage-covered-ends, coverage-ungated-blocks, coverage-drift-blocks, coverage-cannot-assess-failclosed, coverage-operator-waiver-ends, coverage-waiver-lapses, coverage-agent-cannot-self-waive, coverage-readonly-exempt, coverage-subagent-blocks, coverage-upstream-exempt
- audiences: agent, operator, subagent
- categories: happy, negative, error, boundary
- quality: functional, reliability, security
- severity: critical, high, medium
- gate: check-gherkin-valid OK, check-bdd-tags OK, check-bdd-coverage OK (BDD_LOG_BASE_REF=origin/main), bdd-run OK, check-bdd-executed OK
