Feature: OWASP security-process and cross-cutting controls
  Executable @security scenarios drawn from the per-sheet cheat-sheet files in this category.
  In an adopting repo these merge into the single shared feature-file index (see bdd-comprehensive-testing).
  Each mirrors the @security scenario in its references/cheatsheets/<Slug>.md file.

  # from Abuse_Case
  @security @owasp:abuse-case @usecase:price-tamper-business-logic
  Scenario: A checkout rejects a client-tampered item price
    Given an online shop feature with a recorded abuse case ABUSE_CASE_001 for price tampering
    When an attacker lowers an item's price in the request before placing the order
    Then the order is priced only from the server-side catalog value and the tampered amount is ignored
    And the rejection is logged so the countermeasure for ABUSE_CASE_001 can be audited

  # from Attack_Surface_Analysis
  @security @owasp:attack-surface @usecase:deprecated-endpoint-review
  Scenario: A new external upload endpoint is gated behind attack-surface review
    Given a baseline attack-surface map that buckets all external entry points
    When a change adds a file-upload endpoint reachable from the internet
    Then the change is flagged as a new external-facing entry point that fits no existing bucket
    And it is blocked from release until a threat assessment and its guarding controls are recorded for that endpoint

  # from Legacy_Application_Management
  @security @owasp:legacy-app @usecase:network-containment
  Scenario: A legacy application is unreachable except through controlled access
    Given a legacy application past end-of-life that cannot yet be replaced
    And it is hosted in a restricted subnet behind an IP allow-list
    When an unauthenticated host outside the allow-list tries to reach it
    Then the connection is refused at the network layer
    And every allowed request comes from an authenticated user through the VPN

  # from Secure_Code_Review
  @security @owasp:code-review @usecase:manual-review-gate-on-changes
  Scenario: A risky change cannot merge without a secure code review
    Given a pull request that adds an endpoint returning a record by id
    When the change is opened for merge
    Then a security-focused review runs against the authorization and data-flow checklist
    And the review confirms the endpoint checks that the caller owns the requested record
    And the change is blocked from merging until any finding is fixed or formally accepted

  # from Secure_Product_Design
  @security @owasp:product-design @usecase:secure-defaults-and-fail-secure
  Scenario: A new service ships locked down by default and fails into a safe state
    Given a service being designed with a defined product security level
    When it is deployed with no manual hardening applied
    Then every account and component holds only the minimum access its task requires
    And an unexpected failure leaves the service denying access rather than exposing data
    And the chosen security decisions are recorded against the threat model for the service

  # from Security_Terminology
  @security @owasp:terminology @usecase:precise-terms-prevent-false-control
  Scenario: A claimed control is tested against its precise definition, not its loose name
    Given a design note that says user data is "encrypted" by Base64 encoding it
    When the control is reviewed against the agreed security terms
    Then the note is corrected because encoding is reversible and gives no confidentiality
    And the requirement for real confidentiality is routed to encryption with a secret key

  # from Threat_Modeling
  @security @owasp:threat-modeling @usecase:stride-tampering-coverage
  Scenario: An identified tampering threat has a tested mitigation before release
    Given a data flow diagram with a trust boundary between the client and the orders service
    When STRIDE review identifies a Tampering threat where a client can alter an order total
    Then the threat has a recorded response mapped to a server-side integrity check on the order total
    And that mitigation is expressed as a security requirement with a test that proves a tampered total is rejected

  # from Virtual_Patching
  @security @owasp:virtual-patching @usecase:block-known-injection
  Scenario: A WAF rule blocks a known injection flaw before the code fix ships
    Given a known SQL injection flaw in the reqID parameter of a vendor plugin
    And an allow-list virtual patch that accepts only integer values for reqID
    When an attacker sends reqID=1' or 1='1 to the affected endpoint
    Then the enforcement layer rejects the request and logs the rule ID
    And a normal request with reqID=42 is allowed through unchanged

  # from Vulnerability_Disclosure
  @security @owasp:vuln-disclosure @usecase:intake-path-exists
  Scenario: A researcher can reach the security team and get an acknowledgement
    Given an outside researcher has found a flaw in a public-facing service
    When the researcher looks for a way to report it securely
    Then a security.txt file at /.well-known/security.txt lists a Contact and an Expires field
    And a report sent to that contact is acknowledged within the published triage window
    And the researcher is never met with a legal threat for a good-faith report
