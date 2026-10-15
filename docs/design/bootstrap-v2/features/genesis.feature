Feature: Genesis bootstrap of a consumer repo
  A repo is bootstrapped once. The scenarios below assert observable repo state and
  gate exit codes, not who or what produced the genesis commit. (The agent's role in
  proposing genesis is an eval, see agent-acceptance-evals.md.)

  Background:
    Given an upstream skills release "1.2.0" whose manifest lists the gates it requires

  @genesis @reconcile
  Scenario: Reconcile leaves existing repo-local CI untouched
    Given repo B already contains "scripts/ci/check-legacy-auth-importers.mjs"
    And that guard is not listed in the "1.2.0" manifest
    When genesis for "1.2.0" is applied to repo B
    Then "scripts/ci/check-legacy-auth-importers.mjs" is byte-identical to before
    And "gate-manifest.json" records it as an adopted repo-local gate

  @genesis @machinery
  Scenario: The genesis commit contains the required machinery
    When genesis for "1.2.0" is applied to repo B
    Then the repo contains "gate-manifest.json" pinned to "1.2.0"
    And the repo contains ".github/workflows/enterprise-gates.yml"
    And the repo contains "scripts/ci/check-skill-gate-parity.mjs"

  @genesis @enforcement-off
  Scenario: Enforcement is off until the aggregator is a required check
    Given repo B has the genesis machinery committed
    And the aggregator "enterprise-gates" is NOT in the required-check set
    When a pull request whose "enterprise-gates" check fails is opened
    Then the pull request is mergeable

  @genesis @enforcement-on
  Scenario: Enforcement is on once the aggregator is a required check
    Given repo B has the genesis machinery committed
    And the aggregator "enterprise-gates" IS in the required-check set
    When a pull request whose "enterprise-gates" check fails is opened
    Then the pull request is blocked from merging

  @genesis @presence-check
  Scenario Outline: The bootstrap-presence check fails when any machinery file is missing
    Given repo B is missing "<file>"
    When check-bootstrap-presence runs
    Then it exits with a non-zero code

    Examples:
      | file                                      |
      | gate-manifest.json                        |
      | .github/workflows/enterprise-gates.yml    |
      | scripts/ci/check-skill-gate-parity.mjs    |
