## 2026-11-04 - arch-review coverage gate keyed on a stable ref, never a commit SHA (ADR-0114, #213)
- event: added
- change: fix/arch-review-change-not-sha
- scenarios: sha-change-rejected, branch-change-passes, no-sha-keyed-entry-in-repo
- audiences: agent, operator
- categories: error, happy, negative
- quality: reliability, functional
- severity: critical, high
- gate: check-gherkin-valid OK, check-bdd-tags OK, check-bdd-coverage OK (BDD_LOG_BASE_REF=origin/main), bdd-run OK, check-bdd-executed OK
