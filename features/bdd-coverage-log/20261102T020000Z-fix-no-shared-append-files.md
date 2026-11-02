## 2026-11-02 - each change records itself in its own new file (ADR-0108)
- event: added
- change: fix/no-shared-append-files
- scenarios: parallel-records-merge-clean, shared-file-control, edited-review-entry-caught, new-entry-passes, bad-entry-name-fails-closed, missing-base-ref-fails-closed, release-folds-changelog, release-refuses-existing-version
- audiences: operator, agent
- categories: happy, negative, error, edge
- quality: reliability, functional
- severity: critical, high, medium
- gate: check-gherkin-valid OK, check-bdd-tags OK, check-bdd-coverage OK (BDD_LOG_BASE_REF=origin/main), bdd-run OK (153 runs), check-bdd-executed OK (128 scenarios)
