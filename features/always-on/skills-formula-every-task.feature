Feature: Every task runs the full enterprise-skills formula, with no reminder
  The agent does not choose whether to follow the skills. Every task runs the same steps in the same order,
  and it cannot end until each step has left its proof: 1 select, 2 load, 3 plan with the skills, 4 build with
  tests that can fail, 5 prove, 6 fresh-context review until clean, 7 encode caught mistakes, 8 receipt, 9 finish.
  Sources (skills repo commit 569cd30): always-on/enterprise-skills-always-on.md lines 3-7 ("Before you act on a
  change, and again before you call any work done"); each skill's "Definition of done"; the receipt rule in
  always-on/upstream-contributor-process.md lines 20-28; the routing map in
  .claude/skills/judge-arch/assets/example/routing-rules.config.json.
  Audit evidence: the main thread used the Skill tool 5 times in about 2.7 days, and 15 operator messages in about
  40 hours had to remind it (audit of one private agent session, 2026-10-26).

  Background:
    Given the enterprise skills enforcement is installed for this machine
    And the skill router maps file patterns to the skills and artifacts they require
    And every task keeps a task record outside the work folder

  Rule: The formula starts by itself and runs in order

    @audience:agent @usecase:edit-before-selection-held @category:negative @quality:functional @severity:critical
    Scenario: An edit tried before skill selection is held
      Given the agent has not written the skill selection for this task
      When the agent tries to edit a source file
      Then the edit does not run
      And the agent is told to write the skill selection first

    @audience:agent @usecase:edit-before-plan-held @category:negative @quality:functional @severity:critical
    Scenario: A source edit tried before the planning step is held
      Given the selection says "pattern-selector" and "owasp-secure-coding-bdd" apply
      And no pattern-decision record and no threat model exist for this task
      When the agent tries to edit a source file
      Then the edit does not run
      And the agent is told which planning records are missing

  Rule: Step 1, select. Every skill gets a stated verdict for the task

    @audience:agent @usecase:every-skill-gets-verdict @category:happy @quality:functional @severity:critical
    Scenario: Every skill in the directive gets a verdict
      Source: the directive says to treat "not relevant" as "a deliberate, stated judgment for that task, never a silent default".
      Given the directive lists the skills that apply to code, user interface and platform changes
      When the agent writes the skill selection
      Then every listed skill is marked "required", "applies" or "not-applicable"
      And every "applies" and "not-applicable" carries a one-line reason tied to this task

    @audience:agent @usecase:silent-skip-is-empty-cell @category:negative @quality:functional @severity:critical
    Scenario: A skill left out of the selection fails the task
      Source: "A silent skip becomes a failing empty cell" (upstream-contributor-process.md).
      Given the selection does not mention "compliance-data-lifecycle"
      When the finish check runs
      Then the turn does not end
      And "compliance-data-lifecycle" is named as an empty cell

    @audience:agent @usecase:router-adds-required-skills @category:edge @quality:functional @severity:high
    Scenario: The router makes skills required from the files a task changes
      Source: routing rule "schema-change-needs-adr-and-safety".
      Given the task changes a file under "migrations/"
      When the router runs
      Then "architectural-decision-records" and "release-deployment-safety" are marked "required"
      And the agent cannot mark either one "not-applicable"

    @audience:agent @usecase:tiny-change-full-selection @category:boundary @quality:functional @severity:high
    Scenario: A one-line change still gets a full selection and a receipt
      Source: "There is NO triviality exemption: a one-line or copy-only change still ships a receipt."
      Given the task changes 1 line of a code comment
      When the agent ends the task
      Then a selection covering every skill exists
      And most skills may be "not-applicable", each with its reason

    @audience:agent @usecase:no-routed-files-still-selected @category:empty-overflow @quality:functional @severity:medium
    Scenario: A change that matches no routing rule still gets a verdict for every skill
      Given the task changes only a file type no routing rule names
      When the agent writes the skill selection
      Then every skill still has a verdict and a reason
      And the empty router result is recorded, not treated as "nothing applies"

    @audience:agent @usecase:unsure-means-apply @category:edge @quality:functional @severity:high
    Scenario: When the agent is unsure whether a skill applies, it applies it
      Given the agent cannot tell from the task whether personal data is touched
      When it writes the verdict for "compliance-data-lifecycle"
      Then the verdict is "applies"
      And the reason says what was unclear

  Rule: Step 2, load. The text of every selected skill is read in this session

    @audience:agent @usecase:skill-cannot-load @category:error @quality:reliability @severity:high
    Scenario: A selected skill that cannot be loaded blocks the task
      Given the folder for a selected skill is missing on this machine
      When the agent tries to load it
      Then the task does not continue
      And the operator is told which skill is missing and the command that installs it

    @audience:agent @usecase:selected-skills-loaded @category:happy @quality:functional @severity:critical
    Scenario: Every skill marked "required" or "applies" is loaded before planning
      Given the selection marks 6 skills "required" or "applies"
      When the agent reaches the planning step
      Then all 6 skill texts were loaded in this session with the Skill tool
      And the task record holds the hash of each loaded skill file

    @audience:agent @usecase:applies-but-not-loaded @category:negative @quality:functional @severity:critical
    Scenario: A skill marked "applies" but never loaded fails the task
      Source: a consumer project's rule "A skill not read in the current session is not applied from recall".
      Given the selection marks "verifiable-quality-gates" as "applies"
      And that skill's text was never loaded in this session
      When the finish check runs
      Then the turn does not end
      And the agent is told to load the skill and redo the steps that depend on it

  Rule: Step 3, plan. Each applicable skill's planning record exists before code changes

    @audience:agent @usecase:pattern-decision-before-code @category:happy @quality:functional @severity:critical
    Scenario: A feature or refactor has a complete pattern-decision record before code changes
      Source: pattern-selector "Definition of done" (SKILL.md line 193).
      Given the task adds a feature
      When the agent writes the pattern-decision record
      Then the record names the forces and their evidence, the lifetime forces and the cost of deferring
      And it names the decision, its pros and cons, and the failure it prevents
      And it names the security and operational trade-offs and the simpler alternative
      And it names the adopt-safely path, the verify step and the verification status

    @audience:agent @usecase:pattern-record-incomplete @category:negative @quality:functional @severity:high
    Scenario: A pattern-decision record with a missing part is refused
      Given the pattern-decision record has no "simpler alternative"
      When the planning check runs
      Then the source edit stays held
      And the agent is told which part is missing

    @audience:agent @usecase:threat-model-before-code @category:happy @quality:security @severity:critical
    Scenario: A change touching input, secrets or stored data has a threat model before code changes
      Source: owasp-secure-coding-bdd "The selection flow: OWASP threat modeling (required, enforced)" (SKILL.md lines 40-54).
      Given the task changes how the app handles a value the user asked to keep secret
      When the agent writes the threat model
      Then it states the surface in scope
      And it names what can go wrong using a category list such as STRIDE
      And it maps each threat to the OWASP cheat sheet and the control that stops it

    @audience:agent @usecase:threat-without-control @category:negative @quality:security @severity:critical
    Scenario: A named threat with no control fails the task
      Given the threat model names "a secret reaches a second output channel"
      And no control is mapped to that threat
      When the finish check runs
      Then the turn does not end
      And the unmapped threat is named

    @audience:agent @usecase:control-without-security-scenario @category:negative @quality:security @severity:critical
    Scenario: A security control with no @security scenario is not counted as done
      Source: "A security control with no scenario in the shared index is not-assessed, never a pass" (owasp SKILL.md lines 367-369).
      Given a control is mapped to a threat
      And no @security scenario in the feature index tests that control
      When the finish check runs
      Then the turn does not end
      And the control is reported as "not-assessed"

    @audience:agent @usecase:no-security-surface @category:edge @quality:security @severity:medium
    Scenario: A change with no security surface marks the threat model not-applicable with a reason
      Given the task changes only the wording of a code comment
      And the router finds no input, auth, secret, data or dependency file in the change
      When the agent writes the verdict for "owasp-secure-coding-bdd"
      Then the verdict is "not-applicable" with that reason

    @audience:agent @usecase:behavior-matrix-before-code @category:happy @quality:functional @severity:critical
    Scenario: A behavior change has its use case and audience matrix before code changes
      Source: bdd-comprehensive-testing "Definition of done" (SKILL.md line 389).
      Given the task changes what the app answers
      When the agent plans the change
      Then the audiences are recorded
      And every use case times audience cell is a written Gherkin scenario or a recorded "N/A" with a reason
      And every scenario carries audience, use case, category, quality and severity tags

    @audience:operator @usecase:unsure-audience-asks @category:permission @quality:functional @severity:high
    Scenario: When the audiences are not certain, the agent asks the operator and waits
      Source: "If the audience set isn't stated or can't be derived with certainty from the request or the repo, STOP and ASK the user".
      Given the task does not say who uses the changed behavior
      When the agent reaches the behavior matrix
      Then the agent asks the operator to confirm the audiences
      And no scenario is written for an audience the agent guessed

    @audience:agent @usecase:adr-with-significant-decision @category:happy @quality:functional @severity:high
    Scenario: A significant decision ships its ADR in the same change
      Source: architectural-decision-records "Definition of done" (SKILL.md line 86).
      Given the task chooses one of two ways to store a value
      When the agent ends the task
      Then an ADR exists with context, at least two options, real consequences and a status
      And the ADR checker passes

    @audience:agent @usecase:adr-placeholder-or-dead-link @category:negative @quality:reliability @severity:high
    Scenario: An ADR with an unfilled placeholder or a link to a missing file is refused
      Finding 5: an ADR cited a measurement file that did not exist and kept a placeholder.
      Given the ADR cites "measure/coverage_v2.json" and that file does not exist
      When the ADR checker runs
      Then it fails
      And the turn does not end

    @audience:agent @usecase:personal-data-lifecycle @category:happy @quality:compliance @severity:high
    Scenario: A change that stores or reads personal data proves how that data is kept and deleted
      Source: compliance-data-lifecycle "Definition of done" (SKILL.md line 258).
      Given the task changes how a user's stated health condition is stored
      When the agent ends the task
      Then the data's class and retention basis are recorded
      And the claim that deletion reaches every store is "observed" or "proven", not "inferred"

    @audience:agent @usecase:deploy-reversibility @category:happy @quality:release-safety @severity:high
    Scenario: A change that will be deployed proves it can be reversed
      Source: release-deployment-safety "Definition of done" (SKILL.md line 231).
      Given the task includes a schema migration
      When the agent ends the task
      Then the reversibility claim is "observed" or "proven"
      And no "safe to ship" claim is made while it is lower than "observed"

    @audience:agent @usecase:service-readiness @category:happy @quality:reliability @severity:medium
    Scenario: A new service or endpoint proves the team will know when it breaks
      Source: sre-operational-readiness "Definition of done" (SKILL.md line 218).
      Given the task adds an endpoint
      When the agent ends the task
      Then its service level indicators, alerts and runbook exist
      And the claim that an alert fires is "observed" or "proven"

    @audience:agent @usecase:ui-change-three-verdicts @category:happy @quality:accessibility @severity:high
    Scenario: A user-facing change carries accessibility, browser and usability verdicts
      Source: routing rule "ui-change-needs-a11y-verdict" and the three universal skills' "Definition of done".
      Given the task changes a screen component
      When the agent ends the task
      Then an accessibility verdict, a browser and device verdict and a usability verdict exist
      And each measurable claim in them is "observed" or "proven"

    @audience:agent @usecase:architecture-standards-applied @category:edge @quality:reliability @severity:medium
    Scenario: An architecture change applies the standards in code, not only by name
      Source: enterprise-architecture-standards "Definition of done" (SKILL.md line 108).
      Given the task adds a new component that other modules call
      When the agent ends the task
      Then the standards it cites are visible in the code
      And claims about load or resilience point to a measurement or a test

  Rule: Step 8, receipt. One grounded entry per task covers every skill

    @audience:agent @usecase:receipt-files-in-change @category:negative @quality:reliability @severity:high
    Scenario: An "applied" entry that points at a file outside the change is refused
      Source: each applied entry must point "at files really in the change" (upstream-contributor-process.md).
      Given the receipt says "pattern-selector" was applied in "docs/old_record.md"
      And that file did not change in this task
      When the receipt check runs with the list of changed files
      Then it fails
      And the turn does not end

    @audience:agent @usecase:receipt-matches-selection @category:negative @quality:functional @severity:high
    Scenario: The receipt must match the selection
      Given the selection marks 6 skills "required" or "applies"
      And the receipt marks only 5 of them "applied"
      When the receipt check runs
      Then it fails
      And the missing skill is named

  Rule: Step 9, finish. The turn cannot end until every step left its proof, in order

    @audience:agent @usecase:formula-runs-without-prompt @category:happy @quality:functional @severity:critical
    Scenario: The formula runs end to end with no operator reminder
      Given the operator asks "fix the date parsing bug in date_utils.py" and says nothing about skills
      When the agent finishes the task
      Then the task record shows these steps in this order: select, load, plan, build, prove, review, encode, receipt
      And each step names the file or command output that proves it
      And the operator never had to remind the agent of a step

    @audience:agent @usecase:done-before-review-refused @category:negative @quality:functional @severity:critical
    Scenario: The task cannot end before the fresh-context review
      Given the select, load, plan, build and prove steps are complete
      And no fresh-context review of this change exists
      When the agent tries to end the task
      Then the turn does not end
      And the agent is told the review step is missing

    @audience:agent @usecase:two-tasks-kept-apart @category:concurrency @quality:functional @severity:high
    Scenario: Two tasks keep their proof separate
      Given the agent is at the build step of task A
      When the operator asks for an unrelated task B
      Then task B gets its own selection, its own steps and its own receipt
      And no proof from task A is counted for task B

  Rule: Step 4, build. A changed behavior moves with a test that can fail

    @audience:agent @usecase:source-change-needs-test @category:negative @quality:functional @severity:critical
    Scenario: A source change with no test is held
      Given the task changes a source file
      And no test file changed in the same task
      When the finish check runs
      Then the turn does not end
      And the agent is told to add or update the test for the changed behavior

    @audience:agent @usecase:new-check-discriminates @category:negative @quality:reliability @severity:critical
    Scenario: A new gate with no discriminating test is held
      Given the task adds a gate script
      And no committed test fails when the gate is replaced by a no-op
      When the finish check runs
      Then the turn does not end

    @audience:agent @usecase:coverage-not-the-target @category:edge @quality:reliability @severity:high
    Scenario: A coverage number does not stand in for an exercised branch
      Given line coverage reached the target
      And no test exercises the changed branch
      When the build step is checked
      Then the step is not complete
      And the uncovered branch is named

  Rule: Step 5, prove. The final report leads with evidence and passes claim-lint

    @audience:agent @usecase:ledger-and-claim-lint @category:happy @quality:functional @severity:high
    Scenario: The final report leads with an evidence ledger and passes claim-lint
      Given the agent drafts its final report for the task
      When the prove step runs
      Then the report leads with an evidence ledger
      And "claim-lint --strict" exits 0 on the report

    @audience:agent @usecase:untagged-claim-blocks @category:negative @quality:functional @severity:critical
    Scenario: An untagged claim holds the turn
      Given the final report says "the merge is clean" with no evidence state and no source
      When "claim-lint --strict" runs
      Then it exits non-zero
      And the turn does not end until the claim is tagged or removed

    @audience:agent @usecase:checker-results-recorded @category:happy @quality:reliability @severity:high
    Scenario: Each checker's command, exit code and output hash are recorded
      Given the selection applies ADR, BDD and quality-gate skills
      When the prove step runs
      Then the task record holds the command, exit code and output hash of the ADR checker, the Gherkin and tag checkers and the discrimination test

  Rule: Step 6, review. A fresh-context review covers every file against every question until clean

    @audience:subagent @usecase:review-in-fresh-context @category:happy @quality:functional @severity:critical
    Scenario: The review runs in fresh context and covers every file against every question
      Given the change touches 4 files
      When the review subagent runs
      Then it did not see the author's reasoning
      And its matrix has a verdict and a source for each of the 4 files against each question
      And its findings are tagged by question, severity and file
      And the review is appended to the review log

    @audience:agent @usecase:self-review-not-counted @category:negative @quality:functional @severity:critical
    Scenario: A self-review is not counted as a fresh-context review
      Given the agent reviewed its own change without starting a fresh-context reviewer
      When the finish check runs
      Then the review step is not complete
      And the turn does not end

    @audience:agent @usecase:matrix-missing-file @category:negative @quality:functional @severity:high
    Scenario: A review matrix that skips a changed file is not a PASS
      Given the change touches 4 files
      And the review matrix covers 3 of them
      When the review result is recorded
      Then it is not a PASS
      And the missing file is named

    @audience:agent @usecase:fix-until-clean @category:happy @quality:functional @severity:high
    Scenario: The review step completes only when no HIGH or MEDIUM finding is open
      Given the first review returned 1 HIGH and 2 MEDIUM findings
      When the agent fixes them
      Then a new fresh-context review runs on the fixed change
      And the review step is complete only when no HIGH or MEDIUM finding is open or each open one has an operator waiver

    @audience:agent @usecase:review-timeout @category:timeout @quality:reliability @severity:high
    Scenario: A review that stops before a verdict is not complete
      Given the review subagent stops before it records a verdict
      When the finish check runs
      Then the review step is not complete
      And the agent starts a new review

  Rule: Step 7, encode. A caught mistake becomes a tested rule

    @audience:agent @usecase:caught-mistake-encoded @category:happy @quality:functional @severity:high
    Scenario: A caught mistake is encoded as a tested negative-example rule
      Given the review caught code that assumed the wrong module owns a behavior
      When the agent closes that finding
      Then a rule exists as a specific negative example at the right level
      And it is wired into the architecture gate if it can be checked by a script
      And it was tested by reverting the fix, clearing context and re-running the task

    @audience:agent @usecase:caught-mistake-not-encoded @category:negative @quality:functional @severity:high
    Scenario: A fixed mistake with no rule and no recorded reason holds the turn
      Given a finding was fixed
      And no rule or recorded reason for not writing one exists
      When the finish check runs
      Then the turn does not end
      And the finding is named

  Rule: Subagents run the same formula for their part of the work

    @audience:subagent @usecase:subagent-runs-formula @category:happy @quality:functional @severity:critical
    Scenario: A subagent that changes code runs select, load, plan, build, prove and receipt for its part
      Given the main session starts a subagent to fix one module
      When the subagent hands back
      Then its own selection, planning records, test results and receipt exist for that module
      And the main session's receipt includes them

    @audience:subagent @usecase:subagent-skips-plan @category:negative @quality:security @severity:critical
    Scenario: A subagent that skipped the threat model cannot hand back
      Given the subagent changed how a secret value is masked
      And it wrote no threat model
      When it tries to hand back
      Then the hand-back is refused
      And it is told the threat model step is missing
