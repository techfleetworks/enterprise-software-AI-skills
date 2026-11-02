## 2026-10-30 - add the enforcement install + self-test + waiver scenarios (#174 PR-B)
- event: added
- change: fix/174b-finish-check-install
- scenarios: no-reminder-needed, formula-summary, broken-install-warned-at-start, enforcement-tamper-visible, enforcement-cannot-be-removed-by-agent, operator-waiver-recorded, agent-cannot-self-waive-a-step, waiver-format, session-id-cannot-escape-store
- audiences: operator, agent
- categories: happy, error, adverse, negative, boundary
- quality: functional, reliability, security
- severity: critical, high, medium
- gate: check-gherkin-valid OK, check-bdd-tags OK, check-bdd-coverage OK, bdd-run OK, check-bdd-executed OK
