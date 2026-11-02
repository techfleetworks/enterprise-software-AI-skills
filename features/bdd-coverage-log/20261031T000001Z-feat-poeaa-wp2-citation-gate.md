## 2026-10-31 - add the PoEAA citation gate and record-citation scenarios (v1.4 WP2)
- event: added
- change: feat/poeaa-wp2-citation-gate
- scenarios: poeaa-correct-page-passes, poeaa-wrong-page-fails, poeaa-missing-page-fails, poeaa-isbn-alone-not-enough, poeaa-unknown-pattern-fails, poeaa-chapter-citation, poeaa-registry-pages-rise, poeaa-registry-has-51, poeaa-every-pattern-covered-or-declined, poeaa-heading-matches-registry, poeaa-bare-page-checked, poeaa-registry-pins-observed-pages, poeaa-declined-needs-reason, poeaa-registry-missing-fails-closed, poeaa-gate-test-discriminates, poeaa-header-matches-gate, wrong-page-in-record-held, right-page-in-record-passes, older-mirror-not-blocked
- audiences: operator, agent
- categories: happy, negative, boundary, empty-overflow, edge, error
- quality: reliability, functional
- severity: critical, high, medium, low
- gate: check-gherkin-valid OK, check-bdd-tags OK, check-bdd-coverage OK, bdd-run OK, check-bdd-executed OK
