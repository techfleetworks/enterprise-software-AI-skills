Feature: OWASP authorization and access-control controls
  Executable @security scenarios drawn from the per-sheet cheat-sheet files in this category.
  In an adopting repo these merge into the single shared feature-file index (see bdd-comprehensive-testing).
  Each mirrors the @security scenario in its references/cheatsheets/<Slug>.md file.

  # from Authorization
  @security @owasp:authorization @usecase:horizontal-privilege-escalation
  Scenario: A user cannot read another account's transactions by changing the ID
    Given an authenticated user who owns account 901
    When the user requests acct_id 523, which belongs to someone else
    Then the server runs an access control check for that specific account
    And the request is denied because the user does not own account 523

  # from Authorization_Decisions_And_Output_Handling
  @security @owasp:authorization-output-handling @usecase:batch-decision-enforcement
  Scenario: A denied item in a batch is not released by another item's permit
    Given a batch of access checks for one subject over several resources
    When the decision point permits some resources and denies one
    And the response for the denied resource is matched by its identifier
    Then the denied resource is withheld from the output
    And no permitted item's result is applied to the denied one

  # from Authorization_Patterns
  @security @owasp:authorization-patterns @usecase:fail-closed-pdp-outage
  Scenario: A protected call is denied when the decision point is unreachable
    Given a service that acts as the enforcement point for a protected operation
    And a policy decision point that is timing out
    When a request arrives for the protected operation
    Then the enforcement point receives no valid decision
    And it denies the operation instead of letting it through

  # from Authorization_Policy_And_Data_Distribution
  @security @owasp:authorization-policy @usecase:revocation-propagation
  Scenario: A revoked membership stops access within its freshness budget
    Given a user whose tenant membership grants access to a resource
    And a stated freshness budget for membership data at the decision point
    When an administrator revokes that membership at the authoritative source
    And the propagation bound for the change cannot be confirmed as met
    Then the decision point denies the affected operation by default
    And it never turns a stale, missing, or timed-out input into a grant

  # from Authorization_Regression_Testing
  @security @owasp:authorization-regression-testing @usecase:idor-multi-user-replay
  Scenario: One user cannot reach another user's resource after a refactor
    Given User A has created a private resource
    And User B holds the same role on a different account
    When User B requests User A's resource by its identifier to read, update, or delete it
    Then the API returns 403 Forbidden or 404 Not Found
    And it never returns 200 OK carrying User A's data

  # from Authorization_Testing_Automation
  @security @owasp:authorization-testing-automation @usecase:release-authz-drift
  Scenario: A new release cannot grant a role access the matrix denies
    Given an authorization matrix that denies the anonymous role the DeleteMessage service
    And an integration test that replays every role against every service
    When the suite runs the anonymous point of view against DeleteMessage on the new release
    Then the service returns the denied code 403, not the allowed code 200
    And the test fails and names the role-and-service combination that broke the matrix

  # from Business_Logic_Security
  @security @owasp:business-logic @usecase:server-side-price
  Scenario: The server ignores a client-supplied price at checkout
    Given a product with a server-side price
    And a shopper submits a checkout request
    When the request includes a price field set to one cent
    Then the server computes the total from its own records and ignores the submitted price
    And the order total matches the real catalog price, not the client value

  # from Insecure_Direct_Object_Reference_Prevention
  @security @owasp:idor @usecase:object-level-authorization
  Scenario: A user cannot read another user's document by changing the id
    Given User A and User B each own a document
    And User A is authenticated
    When User A requests User B's document by changing the id in the URL
    Then the request is denied
    And the lookup is scoped to documents owned by the current user so no other user's object is returned

  # from Transaction_Authorization
  @security @owasp:transaction-authorization @usecase:server-side-authorization
  Scenario: A tampered transaction cannot be authorized from the client
    Given a user has entered a wire transfer to account A for an amount
    And the server has generated and stored the significant transaction data
    When an attacker alters the target account to B in the authorization request
    Then the server rejects the authorization because the data no longer matches what was confirmed
    And the transaction does not execute
