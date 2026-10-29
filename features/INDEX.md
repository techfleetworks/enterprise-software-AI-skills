# BDD coverage index

Generated from the feature files by `bdd-index-generate.mjs` - do not edit by hand.

| Feature | Scenario | Domain | Audience | Use case | Category | Quality | Severity | Status |
|---|---|---|---|---|---|---|---|---|
| evidence/claims-match-evidence.feature | A before-and-after comparison that reads a missing field cannot report "0 new failures" | evidence | agent | regression-diff-must-be-able-to-fail | negative | reliability | critical | covered |
| evidence/claims-match-evidence.feature | A defect is not marked fixed until undoing the fix turns a committed test red | evidence | agent | fixed-needs-red-on-revert | negative | reliability | critical | covered |
| evidence/claims-match-evidence.feature | A HIGH review finding is fixed or waived before the work is called done | evidence | operator | review-findings-acted-on | adverse | reliability | high | covered |
| evidence/claims-match-evidence.feature | A new problem inside a gate that was already failing is reported as new | evidence | agent | new-failure-inside-red-gate | edge | reliability | critical | covered |
| evidence/claims-match-evidence.feature | A passing test suite does not prove a behavior the suite never tests | evidence | agent | green-suite-must-cover-the-claim | edge | reliability | high | covered |
| evidence/claims-match-evidence.feature | A test that turns green without a targeted change is explained before it counts | evidence | agent | unexplained-pass-attributed | negative | reliability | high | covered |
