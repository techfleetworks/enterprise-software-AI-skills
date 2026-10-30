Feature: Skills apply themselves on every task, with no reminder
  The operator never has to ask an agent to use the skills, and never has to ask it to prove it did.
  The system loads the skill text a task needs, and the agent cannot finish a task that changed files
  until a real, current receipt for that task exists. Source: audit of one private agent session,
  2026-10-26. Findings: main thread used the Skill tool 5 times in about 2.7 days;
  after each Oct 25-26 user demand, the next skill step came 10 s to 2 min later; the installed hooks can never block.

  Background:
    Given the enterprise skills enforcement is installed for this machine
    And the skill router maps changed files to the skills that must apply to them

  @audience:agent @usecase:checker-missing-fails-closed @category:error @quality:reliability @severity:high
  Scenario: A missing checker blocks the finish instead of being skipped
    Finding 4: the agent looked for check_adr.sh in the wrong folder, said it was missing, and judged the ADRs itself.
    Given a skill's checker script cannot be found from the current folder
    When the agent tries to end a task that needs that checker
    Then the turn does not end
    And the agent is told the full path where the checker is installed

  @audience:agent @usecase:checker-timeout-fails-closed @category:timeout @quality:reliability @severity:medium
  Scenario: A checker that runs past its time limit counts as a failure
    Given a receipt checker that does not finish within its time limit
    When the agent tries to end its turn
    Then the turn does not end
    And the agent is told the checker timed out, not that the receipt passed

  @audience:agent @usecase:receipt-quote-must-be-verbatim @category:negative @quality:functional @severity:critical
  Scenario: A receipt that marks a skill applied without quoting its real text is refused
    Finding 3: subagents applied skills from memory without reading them.
    Given the agent's receipt marks "verifiable-quality-gates" as applied
    And the quoted text does not appear word for word under the cited heading of that skill
    When the agent tries to end its turn
    Then the turn does not end
    And the agent is shown the heading it cited and told the quote does not match

  @audience:agent @usecase:stale-receipt-refused @category:negative @quality:reliability @severity:critical
  Scenario: A receipt copied from an earlier build is refused
    Finding 2: one receipt file dated Oct 23 was copied unchanged into all 3 builds checked, through Oct 26.
    Given a receipt whose recorded file hashes match an earlier build
    And the files changed in this task have different hashes
    When the agent tries to end its turn
    Then the turn does not end
    And the agent is told the receipt does not describe the files it changed

  @audience:agent @usecase:parallel-sessions-separate-receipts @category:concurrency @quality:reliability @severity:medium
  Scenario: Two sessions working in the same folder keep separate receipts
    Given two agent sessions change different files in the same folder at the same time
    When each one ends its turn
    Then each receipt covers only the files that session changed
    And neither receipt is overwritten by the other

  @audience:agent @usecase:empty-receipt-refused @category:empty-overflow @quality:reliability @severity:high
  Scenario: An empty receipt file does not count as a receipt
    Given the agent changed 1 file
    And the receipt file for this task exists but is empty
    When the agent tries to end its turn
    Then the turn does not end
    And the agent is told the receipt has no entries

  @audience:agent @usecase:large-change-fully-checked @category:empty-overflow @quality:reliability @severity:medium
  Scenario: A task that changed 400 files is checked in full, not sampled
    Given the agent changed 400 files in one task
    And the receipt covers 399 of them
    When the agent tries to end its turn
    Then the turn does not end
    And the 1 uncovered file is named
