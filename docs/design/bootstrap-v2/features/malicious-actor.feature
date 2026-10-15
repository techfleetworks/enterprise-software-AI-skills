Feature: Adversarial attempts to weaken or bypass the gates
  The audience the first draft forgot. Someone deliberately trying to neuter enforcement,
  sneak in an unsanctioned gate, or forge the source of truth. Each attack has a red path,
  and the one attack the system does NOT catch is documented honestly as a known limitation.

  Background:
    Given repo B is bootstrapped at "1.2.0"
    And the aggregator "enterprise-gates" is a required check

  @malicious @allowlist
  Scenario: An unsanctioned gate script not in the manifest is rejected
    Given a pull request adds "scripts/ci/check-evil.mjs"
    And "gate-manifest.json" does not list it
    When check-skill-gate-parity runs
    Then it exits with a non-zero code
    # The manifest is an allowlist: only gates it names may live in scripts/ci.

  @malicious @smuggled-edit
  Scenario: A bump PR cannot smuggle an edit to an unrelated gate
    Given a bump pull request to "1.3.0"
    And it also edits "scripts/ci/check-untagged-pii.mjs" beyond the published "1.3.0" content
    When check-skill-gate-parity runs
    Then it exits with a non-zero code

  @malicious @forged-manifest
  Scenario: A manifest edited away from the pinned upstream release is rejected
    Given repo B pins version "1.3.0"
    And the committed "gate-manifest.json" does not match the published "1.3.0" manifest hash
    When check-manifest-provenance runs
    Then it exits with a non-zero code

  @malicious @disable-step
  Scenario: Disabling the aggregator step is caught
    Given ".github/workflows/enterprise-gates.yml" runs the aggregator step
    When a pull request adds "continue-on-error: true" to that step
    Then check-aggregator-armed exits with a non-zero code

  @malicious @known-limitation @negative
  Scenario: A FALSE equivalence justification is NOT detected by the gate
    Given a mutant is excluded as "equivalent" with an 8-word reason that is actually false
    When the equivalence-ledger gate runs
    Then it exits zero
    # KNOWN LIMITATION, stated on purpose: the gate checks that a justification EXISTS and meets
    # the minimum length, not that it is TRUE (grounding, not truth). A false equivalence is caught
    # only by human review, never by this gate. Documented so no one mistakes green for "proven honest".
