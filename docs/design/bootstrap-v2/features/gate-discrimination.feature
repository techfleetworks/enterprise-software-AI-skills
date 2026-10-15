Feature: Every gate is proven able to fail (discrimination)
  The thesis of the whole program, applied to its own gates: a gate is only trustworthy once
  it is proven it can go red on a bad input, green on a good one, and that its test flips when
  the gate is neutralized. This is the meta-layer the first BDD draft forgot entirely.

  @discrimination @paired-fixtures
  Scenario Outline: Each gate detects its known-bad and passes its known-good
    Given the gate "<gate>"
    When it runs against its known-bad fixture
    Then it exits with a non-zero code
    When it runs against its known-good fixture
    Then it exits zero

    Examples:
      | gate                        |
      | check-skill-gate-parity     |
      | check-mutation-gate-armed   |
      | check-manifest-provenance   |
      | check-aggregator-armed      |
      | check-invariant-coupling    |

  @discrimination @neutralization
  Scenario Outline: A neutralized gate makes its own test fail
    Given the gate "<gate>" is replaced with a no-op that always exits zero
    When the discrimination test for "<gate>" runs
    Then the test fails

    Examples:
      | gate                        |
      | check-skill-gate-parity     |
      | check-mutation-gate-armed   |
      | check-manifest-provenance   |

  @discrimination @has-test @negative
  Scenario: A gate shipped without a discrimination test is rejected
    Given "scripts/ci/check-new.mjs" exists and is listed in the manifest
    And no discrimination test references "check-new"
    When check-gate-has-test runs
    Then it exits with a non-zero code
