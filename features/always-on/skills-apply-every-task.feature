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
