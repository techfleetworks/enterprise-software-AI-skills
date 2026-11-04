## 2026-11-04 - esk-genesis --check: a read-only coverage/drift verdict (ADR-0115, #203 gap 2)
- event: added
- change: fix/esk-genesis-check
- scenarios: check-covered-passes, check-drift-fails, check-ungated-fails-readonly, check-bad-source-fails-closed
- audiences: operator, agent
- categories: happy, negative, error
- quality: functional, reliability
- severity: critical, high
- gate: check-gherkin-valid OK, check-bdd-tags OK, check-bdd-coverage OK (BDD_LOG_BASE_REF=origin/main), bdd-run OK, check-bdd-executed OK
