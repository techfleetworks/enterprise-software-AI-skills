Feature: esk-genesis --check is a read-only coverage/drift verdict for a consumer's gates
  esk-genesis installs and reconciles a consumer repo's CI gates from the upstream manifest, but it only acts
  when someone runs it, and its dry run exits 0 even when work is pending. --check adds a read-only verdict a
  consumer's CI (and the org reconciliation bot) can branch on: 0 when the repo is covered and current, 1 when
  it is drifted or un-gated, 2 when it cannot be assessed (fail closed). It writes nothing. Source: ADR-0115,
  ADR-0110, issue #203 gap 2.

  @audience:operator @usecase:check-covered-passes @category:happy @quality:functional @severity:high
  Scenario: A covered, current consumer passes the check
    Given a consumer repo that has been genesis'd from the upstream gates
    When esk-genesis --check is run on it
    Then the check exits 0 and reports the repo covered and current

  @audience:agent @usecase:check-drift-fails @category:negative @quality:reliability @severity:critical
  Scenario: A drifted consumer (a gate script deleted) fails the check
    Given a consumer repo that has been genesis'd from the upstream gates
    And one of its installed gate scripts is deleted
    When esk-genesis --check is run on it
    Then the check exits 1 and reports drift

  @audience:agent @usecase:check-ungated-fails-readonly @category:error @quality:reliability @severity:critical
  Scenario: An un-gated repo fails the check and nothing is written
    Given a repo that was never genesis'd
    When esk-genesis --check is run on it
    Then the check exits 1 and reports drift
    And no gate-manifest.json or scripts/ci is created

  @audience:operator @usecase:check-bad-source-fails-closed @category:error @quality:reliability @severity:high
  Scenario: A broken upstream source makes the check fail closed
    Given a consumer repo that has been genesis'd from the upstream gates
    And the upstream source no longer matches its own manifest
    When esk-genesis --check is run on it
    Then the check exits 2 (cannot assess, fail closed)
