Feature: OWASP language and framework security controls
  Executable @security scenarios drawn from the per-sheet cheat-sheet files in this category.
  In an adopting repo these merge into the single shared feature-file index (see bdd-comprehensive-testing).
  Each mirrors the @security scenario in its references/cheatsheets/<Slug>.md file.

  # from Bean_Validation
  @security @owasp:bean-validation @usecase:size-boundary-enforced
  Scenario: An oversized message is rejected at the boundary by @Size
    Given a Message model whose text field is annotated @Size(min = 10, max = 500)
    And the controller marks the incoming object @Valid
    When an attacker posts a body of 50000 characters
    Then validation fails and the BindingResult reports the error
    And the controller returns HTTP 400 without passing the value to the service layer

  # from C-Based_Toolchain_Hardening
  @security @owasp:c-toolchain @usecase:release-binary-hardened
  Scenario: The release executable ships with platform exploit mitigations on
    Given a C or C++ project built in its Release configuration
    When the build compiles and links with stack protection, non-executable stack and heap, RELRO, and PIE
    Then checksec reports stack canary, NX, full RELRO, and PIE all enabled on the binary
    And NDEBUG is defined so no assert can auto-abort in production

  # from Django_REST_Framework
  @security @owasp:drf @usecase:default-permission-lockdown
  Scenario: An unauthenticated caller cannot reach a private DRF endpoint
    Given a DRF API whose DEFAULT_PERMISSION_CLASSES is set to a real permission class
    When an anonymous client requests a non-public endpoint
    Then the response is 401 or 403 and no data is returned
    And the endpoint never falls back to the AllowAny default

  # from Django_Security
  @security @owasp:django @usecase:debug-mode-disclosure
  Scenario: A production Django response does not leak internal details
    Given a Django site deployed to production
    When a request triggers a server error
    Then the response is a generic error page with no stack trace or settings
    And DEBUG is False and the deployment check command reports no security warnings

  # from DotNet_Security
  @security @owasp:dotnet @usecase:parameterized-data-access
  Scenario: A .NET data-access call rejects a SQL injection payload
    Given an ASP.NET endpoint that queries the database through parameterized commands
    When a caller submits an input value containing SQL such as "' OR '1'='1"
    Then the value is bound as a parameter and treated as data, not SQL
    And no string-concatenated query is ever executed against the database

  # from FastAPI_Security
  @security @owasp:fastapi @usecase:jwt-signature-verification
  Scenario: An endpoint rejects a token with a forged or unverified signature
    Given a FastAPI route protected by a JWT authentication dependency
    When a client sends a bearer token whose signature does not verify
    Then the request is rejected with 401 and no user is returned
    And the dependency verifies the signature with a pinned algorithm and required exp, iss, and aud claims

  # from JAAS
  @security @owasp:jaas @usecase:logout-credential-release
  Scenario: Logout strips the authenticated identity from the Subject
    Given a user who logged in through a JAAS LoginContext
    And the login committed principals and credentials to the Subject
    When the application calls LoginContext.logout
    Then the module removes the principals and credentials it added from the Subject
    And a later request carrying that Subject is no longer treated as authenticated

  # from Java_Security
  @security @owasp:java @usecase:jpql-parameterization
  Scenario: A JPA lookup treats a malicious color name as data, not JPQL
    Given a Java service that loads a Color by friendly name through JPA
    When an attacker submits the name "yellow' OR '1'='1"
    Then the service runs a JPQL query with a bound named parameter for the name
    And the whole string is matched as one literal value so no extra rows are returned
    And nothing the attacker sent is parsed as query syntax

  # from JavaScript_and_TypeScript_Security
  @security @owasp:javascript @usecase:no-string-code-execution
  Scenario: User input cannot be compiled and run as code
    Given a handler that processes attacker-controlled input
    When the input reaches a code path that could execute it
    Then the input is parsed as data with JSON.parse and never passed to eval or new Function
    And a lint rule and an enforced CSP without 'unsafe-eval' block any string compilation

  # from Laravel
  @security @owasp:laravel @usecase:mass-assignment-privilege-escalation
  Scenario: A profile update cannot set a protected admin column
    Given an authenticated user submits a profile update
    When the request body includes an "is_admin" field set to true
    Then the update binds only fields returned by $request->validated
    And the "is_admin" column keeps its stored value
    And the saved model is never filled from $request->all or an unguarded model

  # from Nextjs_Security
  @security @owasp:nextjs @usecase:server-action-direct-call
  Scenario: A protected Server Action denies a direct unauthorized call
    Given a Server Action whose form renders only on an authenticated page
    When an attacker sends a POST to that action directly without loading the page
    Then the action derives identity on the server, finds no valid session, and refuses the operation
    And it returns no protected fields because its authorization runs at the data access layer, not on the page

  # from Nodejs_Security
  @security @owasp:nodejs @usecase:event-loop-availability
  Scenario: A flood of oversized requests cannot stall the event loop
    Given a Node.js service with per-content-type body size limits and event-loop monitoring
    When an attacker sends many requests with oversized or malformed JSON bodies
    Then requests exceeding the configured size limit are rejected before parsing
    And while the loop is overloaded new requests receive a 503 so current users keep being served

  # from PHP_Configuration
  @security @owasp:php-config @usecase:error-and-session-hardening
  Scenario: PHP configuration hides errors and secures session cookies
    Given a production php.ini applied to the server
    When a request triggers a runtime error and starts a session
    Then no error detail or PHP version reaches the browser and the detail is written only to the error log
    And the session cookie is issued with Secure, HttpOnly, and SameSite=Strict set

  # from Ruby_on_Rails
  @security @owasp:rails @usecase:idor-record-ownership
  Scenario: One user cannot read another user's record by guessing its id
    Given a user is signed in
    When the user requests a record that belongs to a different account by its RESTful id
    Then an authorization policy check runs for that record before it is returned
    And the request is denied because the record is not owned by the signed-in user
    And no record data is included in the response

  # from Symfony
  @security @owasp:symfony @usecase:dql-sql-injection
  Scenario: A post lookup rejects a SQL injection payload in the id parameter
    Given a controller that fetches a post by the "id" query parameter from Doctrine
    When an attacker submits id as "1 OR 1=1"
    Then the value is passed through setParameter as a bound parameter, not concatenated into DQL
    And the query is treated as data so no extra rows are returned
    And no other post is exposed
