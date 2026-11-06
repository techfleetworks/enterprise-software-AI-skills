Feature: Gate coverage is a finish-check precondition in an adopted repo
  finish-check already holds a file-changing task until its skills-formula proof exists. ADR-0116 adds one more
  precondition: in a repo that adopted the skills (a repo-level .claude/.esk-installed marker, or an
  enterprise-gates workflow), a file-changing Claude task cannot end while the repo is un-gated or drifted. The
  verdict is delegated to esk-genesis --check (the one owner of "covered"); finish-check only decides whether to
  ask. It fails closed, it never nags a repo that did not opt in, and an operator can waive it (with a lapsing
  TTL) but the agent cannot waive it for itself. Source: ADR-0116, ADR-0115, issue #203 gap 2.

  @audience:agent @usecase:coverage-nonadopted-ends @category:negative @quality:functional @severity:high
  Scenario: A repo that never adopted the skills is never coverage-blocked
    Given a repo that never adopted the enterprise skills
    When a Claude task that changed a source file tries to end
    Then the task ends with no coverage block

  @audience:agent @usecase:coverage-covered-ends @category:happy @quality:functional @severity:high
  Scenario: A covered repo lets a file-changing task end
    Given a repo that is covered by the current gates
    When a Claude task that changed a source file tries to end
    Then the task ends with no coverage block

  @audience:agent @usecase:coverage-ungated-blocks @category:negative @quality:reliability @severity:critical
  Scenario: An adopted repo with no gates holds the turn
    Given a repo that adopted the enterprise skills but has no gates installed
    When a Claude task that changed a source file tries to end
    Then the turn is held and the coverage gap is named

  @audience:agent @usecase:coverage-drift-blocks @category:negative @quality:reliability @severity:critical
  Scenario: Drifted gates hold the turn
    Given a repo whose installed gates have drifted
    When a Claude task that changed a source file tries to end
    Then the turn is held and the coverage gap is named

  @audience:operator @usecase:coverage-cannot-assess-failclosed @category:error @quality:reliability @severity:critical
  Scenario: When coverage cannot be assessed, the turn is held (fail closed)
    Given an adopted repo whose gate coverage cannot be assessed
    When a Claude task that changed a source file tries to end
    Then the turn is held and the coverage gap is named

  @audience:operator @usecase:coverage-operator-waiver-ends @category:happy @quality:functional @severity:high
  Scenario: A fresh operator waiver lets an ungated repo end
    Given a repo that adopted the enterprise skills but has no gates installed
    And an operator has recorded a fresh coverage waiver
    When a Claude task that changed a source file tries to end
    Then the task ends with no coverage block

  @audience:operator @usecase:coverage-waiver-lapses @category:boundary @quality:reliability @severity:high
  Scenario: A lapsed operator waiver no longer counts
    Given a repo that adopted the enterprise skills but has no gates installed
    And an operator coverage waiver lapsed long ago
    When a Claude task that changed a source file tries to end
    Then the turn is held and the coverage gap is named

  @audience:agent @usecase:coverage-agent-cannot-self-waive @category:negative @quality:security @severity:critical
  Scenario: The agent cannot waive coverage for itself
    Given a repo that adopted the enterprise skills but has no gates installed
    And the agent writes a coverage waiver for itself
    When a Claude task that changed a source file tries to end
    Then the turn is held and the coverage gap is named

  @audience:agent @usecase:coverage-readonly-exempt @category:boundary @quality:functional @severity:medium
  Scenario: A read-only task is never coverage-blocked
    Given a repo that adopted the enterprise skills but has no gates installed
    When the agent only reads files and ends the task
    Then the task ends with no coverage block

  @audience:subagent @usecase:coverage-subagent-blocks @category:negative @quality:reliability @severity:high
  Scenario: A subagent that changed files is held the same way
    Given a repo that adopted the enterprise skills but has no gates installed
    When a subagent that changed a source file tries to end
    Then the turn is held and the coverage gap is named

  @audience:agent @usecase:coverage-upstream-exempt @category:boundary @quality:functional @severity:medium
  Scenario: The skills source repo is never coverage-blocked
    Given the skills source repo whose installer would report drift
    When a Claude task that changed a source file tries to end
    Then the task ends with no coverage block
