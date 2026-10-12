# BDD coverage log (append-only)

Append-only history of behavioral changes. Never edit or delete a past entry; only append new ones.
Each entry records what changed, the taxonomy of the scenarios touched, and the gate run that proved
them (the receipt).

## 2026-10-10 — add the refund feature (PR #example)
- event: added
- change: example-commit
- scenarios: refund-happy-path, refund-ineligible, refund-permission-denied, refund-double-submit, refund-failure
- audiences: customer, guest, admin
- categories: happy, negative, permission, concurrency, error
- quality: functional, security, reliability
- severity: high, critical
- gate: check-gherkin-valid OK · check-bdd-tags OK · check-bdd-coverage OK
