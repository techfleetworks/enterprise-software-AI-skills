Feature: Every consumer-facing checker declares its scope, so a skill cannot ship a gate the manifest never accounts for
  A skill used to be able to ship a check-*.mjs and tell consumers to run it while the gate-manifest never
  listed it, so the gate most likely to catch a real defect never reached a consumer and nothing flagged it.
  Now every check-*.mjs under a skill's scripts/ carries exactly one scope marker (gate, consumer-gate,
  upstream-only, or machinery), and the upstream-integrity gate - run against this repo in CI - fails on any
  unclassified or misclassified checker. Source: ADR-0109.

  Background:
    Given a skills tree with one installable gate that is fully classified and manifested

  @audience:operator @usecase:classified-set-passes @category:happy @quality:reliability @severity:critical
  Scenario: A fully classified, manifested set passes
    When the upstream-integrity gate runs
    Then the gate passes

  @audience:agent @usecase:unclassified-checker-caught @category:negative @quality:reliability @severity:critical
  Scenario: An unclassified check script is caught
    Given a check script with no scope marker
    When the upstream-integrity gate runs
    Then the gate fails

  @audience:agent @usecase:non-check-gate-cannot-escape @category:negative @quality:reliability @severity:critical
  Scenario: A gate shipped under a name other than check-* cannot escape classification
    Given a shipped script not named check-star with no scope marker
    When the upstream-integrity gate runs
    Then the gate fails

  @audience:agent @usecase:helper-declared-passes @category:happy @quality:functional @severity:medium
  Scenario: A non-gate script that declares itself a helper passes
    Given a shipped non-gate script marked as a helper
    When the upstream-integrity gate runs
    Then the gate passes

  @audience:agent @usecase:consumer-gate-must-be-manifested @category:negative @quality:reliability @severity:high
  Scenario: A consumer-gate marked source missing from the manifest is caught
    Given a consumer-gate marked source that the manifest does not list
    When the upstream-integrity gate runs
    Then the gate fails

  @audience:agent @usecase:upstream-only-must-not-ship @category:negative @quality:reliability @severity:high
  Scenario: An upstream-only gate wrongly listed in the manifest is caught
    Given an upstream-only marked source that the manifest lists as a gate
    When the upstream-integrity gate runs
    Then the gate fails

  @audience:agent @usecase:upstream-only-unlisted-passes @category:happy @quality:functional @severity:medium
  Scenario: An upstream-only gate in no manifest section passes
    Given an upstream-only marked check script that the manifest does not list
    When the upstream-integrity gate runs
    Then the gate passes

  @audience:agent @usecase:consumer-gate-needs-acceptance @category:edge @quality:reliability @severity:medium
  Scenario: A consumer-gate without an acceptance contract is caught
    Given a consumer-gate entry with no acceptance contract
    When the upstream-integrity gate runs
    Then the gate fails
