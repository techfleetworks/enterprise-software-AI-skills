# BDD coverage index

Generated from the feature files by `bdd-index-generate.mjs` - do not edit by hand.

| Feature | Scenario | Domain | Audience | Use case | Category | Quality | Severity | Status |
|---|---|---|---|---|---|---|---|---|
| always-on/skills-apply-every-task.feature | A checker that runs past its time limit counts as a failure | always-on | agent | checker-timeout-fails-closed | timeout | reliability | medium | covered |
| always-on/skills-apply-every-task.feature | A missing checker blocks the finish instead of being skipped | always-on | agent | checker-missing-fails-closed | error | reliability | high | covered |
| always-on/skills-formula-every-task.feature | A selected skill that cannot be loaded blocks the task | always-on | agent | skill-cannot-load | error | reliability | high | covered |
| evidence/claims-match-evidence.feature | A before-and-after comparison that reads a missing field cannot report "0 new failures" | evidence | agent | regression-diff-must-be-able-to-fail | negative | reliability | critical | covered |
| evidence/claims-match-evidence.feature | A claim that one approach is better than another needs a measurement | evidence | agent | comparison-claim-needs-source | negative | reliability | medium | covered |
| evidence/claims-match-evidence.feature | A defect caused by two inputs together is tested with a covering array | evidence | agent | interaction-defects-use-covering-array | edge | security | medium | covered |
| evidence/claims-match-evidence.feature | A defect is not marked fixed until undoing the fix turns a committed test red | evidence | agent | fixed-needs-red-on-revert | negative | reliability | critical | covered |
| evidence/claims-match-evidence.feature | A HIGH review finding is fixed or waived before the work is called done | evidence | operator | review-findings-acted-on | adverse | reliability | high | covered |
| evidence/claims-match-evidence.feature | A new problem inside a gate that was already failing is reported as new | evidence | agent | new-failure-inside-red-gate | edge | reliability | critical | covered |
| evidence/claims-match-evidence.feature | A passing test suite does not prove a behavior the suite never tests | evidence | agent | green-suite-must-cover-the-claim | edge | reliability | high | covered |
| evidence/claims-match-evidence.feature | A plain-language report meets the reading grade the operator asked for | evidence | operator | plain-language-meets-grade | happy | accessibility | medium | covered |
| evidence/claims-match-evidence.feature | A test that turns green without a targeted change is explained before it counts | evidence | agent | unexplained-pass-attributed | negative | reliability | high | covered |
| evidence/claims-match-evidence.feature | A work item with mostly inferred evidence cannot be marked done | evidence | operator | done-needs-observed-majority | negative | reliability | high | covered |
| evidence/claims-match-evidence.feature | Lowering a claim's evidence state comes with the next step to raise it | evidence | agent | downgrade-names-next-step | negative | functional | medium | covered |
| evidence/claims-match-evidence.feature | Making a report simple does not change what the evidence says | evidence | operator | plain-language-keeps-evidence | boundary | reliability | medium | covered |
| evidence/claims-match-evidence.feature | The agent observes which part owns a behavior before building on it | evidence | agent | ownership-observed-before-build | negative | reliability | high | covered |
| evidence/claims-match-evidence.feature | The check that decides "leaked or not" is itself tested before "0 leaks" is claimed | evidence | agent | oracle-unit-tested | error | security | high | covered |
| evidence/claims-match-evidence.feature | The headline number is the one chosen before the results, with every other cut shown | evidence | operator | headline-is-predeclared | negative | reliability | high | covered |
