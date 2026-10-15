Feature: Daily development under the gates
  Once a repo is bootstrapped and the aggregator is required, a PR is judged by the
  committed gates. These scenarios use concrete inputs and assert exit codes / merge state.

  Background:
    Given repo B is bootstrapped at "1.2.0"
    And the aggregator "enterprise-gates" is a required check

  @daily @happy-path
  Scenario: A PR that violates no gate is mergeable
    Given a pull request whose diff violates no gate
    When the "enterprise-gates" aggregator runs
    Then every gate exits zero
    And the pull request is mergeable

  @daily @coupling @negative
  Scenario: New security code with no invariant is blocked
    Given a pull request adds an exported validator to "src/lib/redirect.ts"
    And no entry for that validator exists in "invariants/security.yml"
    When check-invariant-coupling runs
    Then it exits with a non-zero code
    And its output names the function that needs an invariant

  @daily @invariant @negative
  Scenario: Code that violates a human-ratified invariant is caught
    Given "invariants/security.yml" contains the ratified invariant "an allowed redirect resolves to a techfleet.network host"
    And isAllowedRedirect("https://evil.techfleet.network.attacker.com") returns true
    When the generated property test for that invariant runs
    Then it exits with a non-zero code
    And its output reports the input "https://evil.techfleet.network.attacker.com"
