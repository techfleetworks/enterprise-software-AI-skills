Feature: Subagents load and apply the skills their work needs, without being told
  Every agent the main session starts gets the text of the skills its work needs, and cannot hand back
  changed files without a real receipt. Naming a skill in the brief is not enough; reading the skill is.
  Source: audit of one private agent session, 2026-10-26. Findings: on Oct 24, 34 of 34 subagents
  loaded or read a skill; on Oct 25-26, 8 of 68 did. 14 of the 16 Oct 25-26 subagents whose brief named a
  skill never loaded or read one. All 102 got the always-on directive text.

  Background:
    Given the enterprise skills enforcement is installed for this machine
    And the skill router maps changed files to the skills that must apply to them

  @audience:subagent @usecase:subagent-gets-skill-text @category:happy @quality:functional @severity:critical
  Scenario: A subagent that will change code has the needed skill text before its first edit
    Given the main session starts a subagent to fix a bug in a Python module
    When the subagent makes its first edit to that module
    Then the text of every skill the router requires for that module is in the subagent's context
    And the subagent did not have to choose to load it

  @audience:subagent @usecase:named-skill-must-be-read @category:negative @quality:functional @severity:critical
  Scenario: A subagent told to apply a skill cannot hand back work without having read it
    Finding 3: 14 of the 16 agents whose brief had wording like "Apply skills: pattern-selector, ADR, verifiable-quality-gates, skeptical-audit" never loaded or read a skill.
    Given the subagent's brief says "apply verifiable-quality-gates"
    And the subagent never loaded or read that skill's text
    When the subagent tries to hand its result back
    Then the hand-back is refused
    And the subagent is told to load the skill and quote the heading it applied

  @audience:subagent @usecase:subagent-edits-need-receipt @category:negative @quality:functional @severity:critical
  Scenario: A subagent that changed files cannot hand back without a receipt
    Finding 2: no Oct 25-26 subagent wrote a receipt, though subagents made 584 Python edits on those days (UTC).
    Given the subagent changed 2 files
    And it has no receipt that covers those 2 files
    When the subagent tries to hand its result back
    Then the hand-back is refused
    And the subagent is told which files and skills the receipt must cover

  @audience:subagent @usecase:brief-names-no-skill @category:edge @quality:functional @severity:critical
  Scenario: A brief that names no skill still gets the skills the work needs
    Finding 3: 40 of the 46 Oct 25-26 subagents whose brief named no skill loaded none.
    Given the subagent's brief does not mention any skill
    When the subagent edits an ADR file
    Then the text of "architectural-decision-records" is in its context before that edit
    And its hand-back needs a receipt for that skill

  @audience:subagent @usecase:workflow-agent-covered @category:edge @quality:functional @severity:high
  Scenario: Agents started by a workflow get the same enforcement as other subagents
    Finding 3: 6 workflow agents got the directive, and none loaded a skill.
    Given a workflow starts an agent that changes files
    When that agent tries to finish
    Then the same receipt check runs as for any other subagent

  @audience:subagent @usecase:smaller-model-same-rules @category:edge @quality:functional @severity:medium
  Scenario: A subagent on a smaller model is held to the same rules
    Given the main session starts a subagent on a smaller model than its own
    When that subagent changes a file and tries to hand back without a receipt
    Then the hand-back is refused exactly as it would be for any other subagent

  @audience:subagent @usecase:reviewer-findings-carry-evidence @category:edge @quality:reliability @severity:medium
  Scenario: A read-only reviewer hands back findings that each carry evidence
    Given a subagent that only reviews code and changes no files
    When it hands back its findings
    Then each finding has an evidence state, a source that can be re-run, and a named limit
    And no code receipt is required from it

  @audience:subagent @usecase:uncovered-subagent-caught-by-parent @category:error @quality:reliability @severity:high
  Scenario: If a subagent's own check did not run, the main session's finish check still catches its edits
    Given a subagent changed a file and its own hand-back check did not run
    When the main session tries to end its turn
    Then the main session's turn does not end
    And it is told which file was changed with no receipt and which agent changed it

  @audience:subagent @usecase:parallel-copies-merge-receipts @category:concurrency @quality:reliability @severity:medium
  Scenario: Subagents working on separate copies of a package each bring a receipt to the merge
    Given two subagents each change their own copy of a package at the same time
    When their changes are merged into one build
    Then the merged build has a receipt for every changed file from both copies
    And a file with no receipt from either copy blocks the merge

  @audience:subagent @usecase:interrupted-subagent-flagged @category:timeout @quality:reliability @severity:medium
  Scenario: A subagent cut off mid-task leaves its unreceipted edits flagged
    Finding: the operator hit a usage limit 3 times during the thread.
    Given a subagent changed 2 files and was stopped before it wrote a receipt
    When the main session next tries to end its turn
    Then the 2 files are listed as changed with no receipt
    And the main session must receipt them or revert them before it ends

  @audience:operator @usecase:subagent-claims-not-taken-on-trust @category:adverse @quality:reliability @severity:high
  Scenario: A subagent's "verified" claim is not passed to the operator as verified unless it can be re-run
    Finding 5: the main session said it sees only each agent's final report.
    Given a subagent reports "fix verified, gate green"
    And its report has no command, exit code or output the main session re-ran
    When the main session reports to the operator
    Then the claim is shown as "reported by a subagent", not "verified"
