## 2026-10-30 - add the edit-time select/load scenarios (#175 PR-A)
- event: added
- change: fix/175a-edit-gate-select-load
- scenarios: edit-before-selection-held, every-skill-gets-verdict, silent-skip-is-empty-cell, router-adds-required-skills, tiny-change-full-selection, no-routed-files-still-selected, unsure-means-apply, selected-skills-loaded, applies-but-not-loaded, reload-after-compaction, required-skill-cannot-be-self-waived
- audiences: agent
- categories: negative, happy, edge, boundary, empty-overflow
- quality: functional
- severity: critical, high, medium
- gate: check-gherkin-valid OK, check-bdd-tags OK, check-bdd-coverage OK, bdd-run OK, check-bdd-executed OK
