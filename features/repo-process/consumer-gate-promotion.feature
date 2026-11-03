Feature: Gate-capable helpers ship as consumer-gates, so four disciplines are enforced, not hand-run
  Four scripts were marked bootstrap-v2-helper only because none was in the manifest: the mutation gate, the
  evidence-claim linter, the readability measurer, and the secret-leak oracle. Each is now promoted to a
  consumer-gate. The single-file tools gained a thin wrapper that walks a defined surface and runs the REAL
  tool per file, so a new document cannot escape review by never being named on a command line, and an
  unscanned surface fails closed instead of passing green. Source: ADR-0113.

  @audience:operator @usecase:grounded-surface-passes @category:happy @quality:reliability @severity:high
  Scenario: A findings surface whose documents are all evidence-tagged passes the claims-grounded gate
    Given a findings surface whose only document is evidence-tagged
    When the claims-grounded gate runs
    Then the promoted gate passes

  @audience:agent @usecase:untagged-claim-caught @category:negative @quality:reliability @severity:high
  Scenario: An untagged claim anywhere in the findings surface fails the gate
    Given a findings surface with a document that carries an untagged claim
    When the claims-grounded gate runs
    Then the promoted gate fails

  @audience:agent @usecase:empty-surface-fails-closed @category:edge @quality:reliability @severity:high
  Scenario: An empty findings surface fails closed, never a silent pass
    Given a findings surface with no matching documents
    When the claims-grounded gate runs
    Then the promoted gate fails closed

  @audience:operator @usecase:over-grade-doc-caught @category:negative @quality:functional @severity:medium
  Scenario: A user-facing document above the grade ceiling fails the readability gate
    Given a user-facing surface with a document above the grade ceiling
    When the readability-grade gate runs
    Then the promoted gate fails

  @audience:operator @usecase:secret-leak-caught @category:negative @quality:security @severity:critical
  Scenario: A secret value in a build artifact fails the secret-leak gate without printing the value
    Given a build artifact that contains a configured secret value
    When the secret-leak gate runs
    Then the promoted gate fails
    And the report names the environment variable but not the secret value

  @audience:agent @usecase:mutation-gate-classified @category:happy @quality:reliability @severity:medium
  Scenario: The mutation gate ships as a consumer-gate in the manifest
    Given the repository gate manifest
    Then verify-check-discrimination is listed as a consumer-gate with a pinned test
