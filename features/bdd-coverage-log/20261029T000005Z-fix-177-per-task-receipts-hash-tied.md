## 2026-10-29 - add the per-task receipt scenarios (#177)
- event: added
- change: fix/177-per-task-receipts-hash-tied
- scenarios: receipt-files-in-change, receipt-matches-selection, receipt-quote-must-be-verbatim, stale-receipt-refused, parallel-sessions-separate-receipts, empty-receipt-refused, large-change-fully-checked
- audiences: agent
- categories: negative, concurrency, empty-overflow
- quality: reliability, functional
- severity: critical, high, medium
- gate: check-gherkin-valid OK, check-bdd-tags OK, check-bdd-coverage OK, bdd-run OK, check-bdd-executed OK
