# BDD coverage index

Generated from the feature files by `bdd-index-generate.mjs` - do not edit by hand.

| Feature | Scenario | Domain | Audience | Use case | Category | Quality | Severity | Status |
|---|---|---|---|---|---|---|---|---|
| always-on/skills-apply-every-task.feature | A checker that runs past its time limit counts as a failure | always-on | agent | checker-timeout-fails-closed | timeout | reliability | medium | covered |
| always-on/skills-apply-every-task.feature | A missing checker blocks the finish instead of being skipped | always-on | agent | checker-missing-fails-closed | error | reliability | high | covered |
| always-on/skills-apply-every-task.feature | A receipt copied from an earlier build is refused | always-on | agent | stale-receipt-refused | negative | reliability | critical | covered |
| always-on/skills-apply-every-task.feature | A receipt that marks a skill applied without quoting its real text is refused | always-on | agent | receipt-quote-must-be-verbatim | negative | functional | critical | covered |
| always-on/skills-apply-every-task.feature | A task that changed 400 files is checked in full, not sampled | always-on | agent | large-change-fully-checked | empty-overflow | reliability | medium | covered |
| always-on/skills-apply-every-task.feature | After the context is compacted, every skill the next edit needs is in context, not only the ones used before | always-on | agent | reload-after-compaction | edge | functional | high | covered |
| always-on/skills-apply-every-task.feature | An empty receipt file does not count as a receipt | always-on | agent | empty-receipt-refused | empty-overflow | reliability | high | covered |
| always-on/skills-apply-every-task.feature | The agent cannot mark a required skill not-applicable on its own | always-on | agent | required-skill-cannot-be-self-waived | negative | functional | high | covered |
| always-on/skills-apply-every-task.feature | Two sessions working in the same folder keep separate receipts | always-on | agent | parallel-sessions-separate-receipts | concurrency | reliability | medium | covered |
| always-on/skills-formula-every-task.feature | A behavior change has its use case and audience matrix before code changes | always-on | agent | behavior-matrix-before-code | happy | functional | critical | covered |
| always-on/skills-formula-every-task.feature | A change that matches no routing rule still gets a verdict for every skill | always-on | agent | no-routed-files-still-selected | empty-overflow | functional | medium | covered |
| always-on/skills-formula-every-task.feature | A change that stores or reads personal data proves how that data is kept and deleted | always-on | agent | personal-data-lifecycle | happy | compliance | high | covered |
| always-on/skills-formula-every-task.feature | A change that will be deployed proves it can be reversed | always-on | agent | deploy-reversibility | happy | release-safety | high | covered |
| always-on/skills-formula-every-task.feature | A change touching input, secrets or stored data has a threat model before code changes | always-on | agent | threat-model-before-code | happy | security | critical | covered |
| always-on/skills-formula-every-task.feature | A change with no security surface marks the threat model not-applicable with a reason | always-on | agent | no-security-surface | edge | security | medium | covered |
| always-on/skills-formula-every-task.feature | A feature or refactor has a complete pattern-decision record before code changes | always-on | agent | pattern-decision-before-code | happy | functional | critical | covered |
| always-on/skills-formula-every-task.feature | A named threat with no control fails the task | always-on | agent | threat-without-control | negative | security | critical | covered |
| always-on/skills-formula-every-task.feature | A new service or endpoint proves the team will know when it breaks | always-on | agent | service-readiness | happy | reliability | medium | covered |
| always-on/skills-formula-every-task.feature | A one-line change still gets a full selection and a receipt | always-on | agent | tiny-change-full-selection | boundary | functional | high | covered |
| always-on/skills-formula-every-task.feature | A pattern-decision record with a missing part is refused | always-on | agent | pattern-record-incomplete | negative | functional | high | covered |
| always-on/skills-formula-every-task.feature | A security control with no @security scenario is not counted as done | always-on | agent | control-without-security-scenario | negative | security | critical | covered |
| always-on/skills-formula-every-task.feature | A selected skill that cannot be loaded blocks the task | always-on | agent | skill-cannot-load | error | reliability | high | covered |
| always-on/skills-formula-every-task.feature | A significant decision ships its ADR in the same change | always-on | agent | adr-with-significant-decision | happy | functional | high | covered |
| always-on/skills-formula-every-task.feature | A skill left out of the selection fails the task | always-on | agent | silent-skip-is-empty-cell | negative | functional | critical | covered |
| always-on/skills-formula-every-task.feature | A skill marked "applies" but never loaded fails the task | always-on | agent | applies-but-not-loaded | negative | functional | critical | covered |
| always-on/skills-formula-every-task.feature | A source edit tried before the planning step is held | always-on | agent | edit-before-plan-held | negative | functional | critical | covered |
| always-on/skills-formula-every-task.feature | A user-facing change carries accessibility, browser and usability verdicts | always-on | agent | ui-change-three-verdicts | happy | accessibility | high | covered |
| always-on/skills-formula-every-task.feature | An "applied" entry that points at a file outside the change is refused | always-on | agent | receipt-files-in-change | negative | reliability | high | covered |
| always-on/skills-formula-every-task.feature | An ADR with an unfilled placeholder or a link to a missing file is refused | always-on | agent | adr-placeholder-or-dead-link | negative | reliability | high | covered |
| always-on/skills-formula-every-task.feature | An architecture change applies the standards in code, not only by name | always-on | agent | architecture-standards-applied | edge | reliability | medium | covered |
| always-on/skills-formula-every-task.feature | An edit tried before skill selection is held | always-on | agent | edit-before-selection-held | negative | functional | critical | covered |
| always-on/skills-formula-every-task.feature | Every skill in the directive gets a verdict | always-on | agent | every-skill-gets-verdict | happy | functional | critical | covered |
| always-on/skills-formula-every-task.feature | Every skill marked "required" or "applies" is loaded before planning | always-on | agent | selected-skills-loaded | happy | functional | critical | covered |
| always-on/skills-formula-every-task.feature | The receipt must match the selection | always-on | agent | receipt-matches-selection | negative | functional | high | covered |
| always-on/skills-formula-every-task.feature | The router makes skills required from the files a task changes | always-on | agent | router-adds-required-skills | edge | functional | high | covered |
| always-on/skills-formula-every-task.feature | When the agent is unsure whether a skill applies, it applies it | always-on | agent | unsure-means-apply | edge | functional | high | covered |
| always-on/skills-formula-every-task.feature | When the audiences are not certain, the agent asks the operator and waits | always-on | operator | unsure-audience-asks | permission | functional | high | covered |
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
