# BDD coverage log (append-only)

Append-only history of behavioral changes. Never edit or delete a past entry; only append new ones.
Each entry records what changed, the taxonomy of the scenarios touched, and the gate run that proved
them (the receipt).

## 2026-10-28 - add the build-comparison scenarios (#178)
- event: added
- change: fix/178-build-comparison-rigor
- scenarios: regression-diff-must-be-able-to-fail, new-failure-inside-red-gate
- audiences: agent
- categories: negative, edge
- quality: reliability
- severity: critical
- gate: check-gherkin-valid OK, check-bdd-tags OK, check-bdd-coverage OK, bdd-run OK, check-bdd-executed OK
