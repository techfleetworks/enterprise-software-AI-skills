Feature: OWASP API and services controls
  Executable @security scenarios drawn from the per-sheet cheat-sheet files in this category.
  In an adopting repo these merge into the single shared feature-file index (see bdd-comprehensive-testing).
  Each mirrors the @security scenario in its references/cheatsheets/<Slug>.md file.

  # from GraphQL
  @security @owasp:graphql @usecase:batching-brute-force
  Scenario: A batched GraphQL request cannot brute force one-time codes
    Given a GraphQL API that verifies one-time codes
    When an attacker sends one request batching many guesses at the code
    Then batching is refused for the sensitive operation and the attempts are counted per caller
    And the request is throttled before enough guesses succeed

  # from gRPC_Security
  @security @owasp:grpc @usecase:streaming-auth-bypass
  Scenario: A streaming gRPC method rejects an unauthenticated caller
    Given a gRPC service whose streaming method requires authentication
    When a caller opens the stream with no valid token in metadata
    Then a stream interceptor denies the call with an UNAUTHENTICATED status before the handler runs
    And the attempt is logged as an authentication failure

  # from Identity_Propagation_Patterns
  @security @owasp:identity-propagation @usecase:audience-restricted-forwarding
  Scenario: A downstream service refuses a forwarded token meant for a different audience
    Given an internal service that receives a propagated access token
    When a caller forwards a token whose audience names another service
    Then the request is rejected because the token's audience does not match this service
    And the service independently authorizes the requested action and resource rather than trusting the presence of a valid token

  # from JSON_Web_Token
  @security @owasp:jwt @usecase:forged-token-rejection
  Scenario: A verifier rejects a forged privilege-escalation token
    Given an API that accepts JWTs signed with ES256 and verified against the issuer's published JWK Set
    When an attacker presents a token carrying "admin": true that is unsigned (alg none) or re-signed with the issuer's public key as an HMAC secret
    Then the token is rejected because the verifier accepts only the pinned ES256 algorithm and a key tied to the trusted issuer
    And no session or elevated access is granted

  # from Microservices_based_Security_Arch_Doc
  @security @owasp:microservices-arch @usecase:least-privilege-lateral-movement
  Scenario: A compromised service cannot reach a store outside its recorded grants
    Given the architecture inventory lists each service with its minimal scopes and storage grants
    When an attacker who controls a low-value service calls a database not listed in that service's grants
    Then the request is refused because the service holds only its documented least-privilege credentials
    And the attempt is recorded by the shared security monitoring infrastructure service

  # from Microservices_Security
  @security @owasp:microservices @usecase:bypass-gateway-direct-call
  Scenario: A service rejects a direct internal call that skipped the gateway
    Given an internal microservice that enforces its own authorization on every request
    When another service calls a protected operation without a valid, authenticated service token
    Then the operation is refused because the required token validation did not complete
    And the call succeeds only after the caller is authenticated and authorized at the service itself

  # from OAuth2
  @security @owasp:oauth2 @usecase:auth-code-interception
  Scenario: A stolen authorization code cannot be redeemed without the PKCE verifier
    Given a public client running the Authorization Code grant with PKCE
    When an attacker intercepts the authorization code and sends it to the token endpoint
    Then the authorization server refuses to issue tokens because the request has no code_verifier matching the earlier code_challenge
    And no access or refresh token is returned to the attacker

  # from REST_Assessment
  @security @owasp:rest-assessment @usecase:bola-swap-test
  Scenario: One tenant cannot read another tenant's object by its identifier
    Given two accounts that each own a separate order
    When one account replays the other account's GET request using that order's identifier
    Then the API denies access and returns no data for the order it does not own
    And the same ownership check applies to PUT, PATCH, and DELETE on that resource

  # from REST_Security
  @security @owasp:rest-security @usecase:jwt-alg-none
  Scenario: The API refuses a JWT that tries to skip signature verification
    Given a REST endpoint that accepts a JWT for access control
    When a caller presents a token whose header sets the algorithm to none
    Then the API rejects it with an authentication failure
    And the API verifies the signature using its own configured algorithm, not the one named in the token header

  # from SAML_Security
  @security @owasp:saml @usecase:signature-wrapping-defense
  Scenario: A service provider rejects a SAML response with a wrapped signature
    Given a service provider that accepts SAML assertions from a configured identity provider
    When an attacker submits a response whose valid signature covers one element but whose identity claims live in a separate injected element
    Then the login is rejected because the authenticated assertion is not the element protected by the verified signature
    And the response is schema-validated first and the signing key is taken from the pinned configuration, not from KeyInfo in the message

  # from Web_Service_Security
  @security @owasp:web-service-security @usecase:xml-entity-expansion-dos
  Scenario: A SOAP endpoint rejects an XML entity-expansion bomb
    Given a SOAP web service that validates payloads against its XSD
    When an attacker posts a message that defines nested entities expanding to gigabytes
    Then the parser refuses the payload before expansion and no large allocation occurs
    And the service stays responsive to legitimate requests

  # from Webhook_Security
  @security @owasp:webhook @usecase:forged-delivery-rejected
  Scenario: A webhook handler rejects a delivery with an invalid signature
    Given a webhook endpoint that verifies an HMAC-SHA256 signature over the raw body
    When an attacker posts a fake event whose signature does not match any active secret
    Then the handler returns 401 with a generic body and no detail about why
    And no side effect such as order fulfillment or a record change is triggered

  # from WebSocket_Security
  @security @owasp:websocket @usecase:cross-site-hijacking
  Scenario: A WebSocket handshake from an untrusted origin is refused
    Given a WebSocket server that checks the Origin header against an allow-list
    When a malicious page opens a handshake and the browser attaches the user's session cookie
    Then the server rejects the handshake because its origin is not on the allow-list
    And no authenticated socket is established for the attacker

  # from Workload_Identity_Federation
  @security @owasp:workload-identity @usecase:scoped-oidc-trust
  Scenario: Cloud federation refuses an OIDC token from an untrusted branch
    Given a cloud role whose trust policy pins the issuer, audience, repository, and allowed branch
    When a job from a different branch or repository presents its OIDC token to request production credentials
    Then the provider refuses to issue credentials because the token's subject and claims do not match the trust policy
    And the permissions policy separately limits the credentials to only the resources the deployment needs
