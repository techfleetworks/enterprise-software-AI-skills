## 2026-11-02 - every consumer-facing checker declares its scope, enforced against this repo (ADR-0109)
- event: added
- change: fix/genesis-coverage-unskippable
- scenarios: classified-set-passes, unclassified-checker-caught, non-check-gate-cannot-escape, helper-declared-passes, consumer-gate-must-be-manifested, upstream-only-must-not-ship, upstream-only-unlisted-passes, consumer-gate-needs-acceptance
- audiences: operator, agent
- categories: happy, negative, edge
- quality: reliability, functional
- severity: critical, high, medium
- gate: check-gherkin-valid OK, check-bdd-tags OK, check-bdd-coverage OK (BDD_LOG_BASE_REF=origin/main), bdd-run OK (161 runs), check-bdd-executed OK (136 scenarios)
