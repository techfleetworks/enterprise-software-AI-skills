Feature: Version updates stay in sync
  A version bump moves the pin and the gate scripts together, in one reviewed PR.
  Half-applied, orphaned, or branch-protection-touching bumps are caught.

  Background:
    Given repo B is bootstrapped and pinned to "1.2.0"

  @update @bump
  Scenario: A complete bump passes parity
    When a bump pull request updates "gate-manifest.json" to "1.3.0" and every gate script to its "1.3.0" content
    Then check-skill-gate-parity exits zero

  @update @half-applied @negative
  Scenario: A half-applied bump is caught
    Given a bump pull request sets "gate-manifest.json" to "1.3.0"
    But leaves "scripts/ci/check-untagged-pii.mjs" at its "1.2.0" content
    When check-skill-gate-parity runs
    Then it exits with a non-zero code

  @update @removed-gate
  Scenario: A gate removed upstream leaves no orphan
    Given "1.3.0" no longer lists the gate "check-foo"
    When repo B is bumped to "1.3.0"
    Then "scripts/ci/check-foo.mjs" is absent from the repo
    And check-skill-gate-parity exits zero

  @update @orphan @negative
  Scenario: An orphaned gate script is caught
    Given repo B is pinned to "1.3.0" whose manifest does not list "check-foo"
    And "scripts/ci/check-foo.mjs" still exists in the repo
    When check-skill-gate-parity runs
    Then it exits with a non-zero code

  @update @no-admin-needed
  Scenario: A bump does not change the required-check set
    Given the required-check set is exactly ["enterprise-gates"]
    When repo B is bumped from "1.2.0" to "1.3.0" adding two new gates
    Then the required-check set is still exactly ["enterprise-gates"]

  @update @surfaces-debt @negative
  Scenario: A stricter new gate surfaces existing debt
    Given "1.3.0" tightens check-untagged-pii to flag the column name "ip"
    And repo B has an existing migration adding an unclassified "ip" column
    When the bump pull request runs CI
    Then check-untagged-pii exits with a non-zero code
    And the bump pull request is blocked until the column is classified
