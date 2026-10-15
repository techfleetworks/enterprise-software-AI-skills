Feature: Drift between skills and CI gates is red
  The committed gates must match the pinned manifest. Any drift, deliberate or accidental,
  fails a gate. Every scenario below has a concrete red path.

  Background:
    Given repo B is bootstrapped at "1.2.0"
    And the aggregator "enterprise-gates" is a required check

  @sync @anti-weakening
  Scenario: Lowering the mutation break floor is blocked
    Given "stryker.conf.json" sets thresholds.break to 40
    When a pull request changes thresholds.break to 0
    Then check-mutation-gate-armed exits with a non-zero code

  @sync @parity @hash
  Scenario: A gate script that no longer matches its manifest hash is caught
    Given "gate-manifest.json" records a sha256 for "scripts/ci/check-untagged-pii.mjs"
    When a pull request edits "scripts/ci/check-untagged-pii.mjs" so its sha256 differs
    And the manifest sha256 is not updated to match
    Then check-skill-gate-parity exits with a non-zero code

  @sync @backstop @bypass
  Scenario: Bypassing the local pre-push hook does not escape CI
    Given a dev pushes with "--no-verify" leaving the committed gates drifted from the manifest
    When CI runs on the resulting pull request
    Then check-skill-gate-parity exits with a non-zero code
    And the pull request is blocked from merging
