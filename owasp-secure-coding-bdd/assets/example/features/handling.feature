Feature: OWASP handling, output and resource controls
  Executable @security scenarios drawn from the per-sheet cheat-sheet files in this category.
  In an adopting repo these merge into the single shared feature-file index (see bdd-comprehensive-testing).
  Each mirrors the @security scenario in its references/cheatsheets/<Slug>.md file.

  # from Denial_of_Service
  @security @owasp:denial-of-service @usecase:slow-http-resource-exhaustion
  Scenario: A slow HTTP sender cannot exhaust the connection pool
    Given a web server with a request-read timeout and a minimum ingress data rate configured
    When an attacker opens many connections and sends each request one byte at a time below the minimum rate
    Then each stalled connection is closed once it breaches the read timeout
    And the connection pool stays available so legitimate requests are still served

  # from Error_Handling
  @security @owasp:error-handling @usecase:no-stack-trace-leak
  Scenario: An unhandled server error returns a generic message, not internals
    Given a REST API with a global error handler and a request that triggers an unexpected exception
    When the client receives the response
    Then the status is 500 and the body is a generic Problem Details message
    And the response contains no stack trace, framework version, file path, or SQL text

  # from File_Upload
  @security @owasp:file-upload @usecase:disguised-executable-rejected
  Scenario: An upload endpoint rejects a disguised executable file
    Given an upload endpoint that allows only pdf and docx files for authenticated users
    When an attacker uploads a file named "resume.jpg.php" with a spoofed image Content-Type
    Then the upload is rejected because the real extension and signature are not on the allow-list
    And no file is written inside the webroot and no server-side script is created

  # from Logging
  @security @owasp:logging @usecase:no-secret-and-no-injection
  Scenario: A failed login is logged safely without secrets or injected entries
    Given an authentication endpoint that logs security events through the shared log handler
    When an attacker submits a wrong password containing carriage-return and line-feed characters
    Then one authentication-failure event is recorded with user, source address, and timestamp
    And the password is absent and the CR and LF characters are neutralized so no forged line is written

  # from Logging_Vocabulary
  @security @owasp:logging-vocabulary @usecase:detectable-auth-events
  Scenario: A failed login emits a standard, secret-free security event
    Given an application that logs security events
    When a login attempt fails
    Then a structured event is written whose name uses the standard prefix "authn_login_fail"
    And the entry carries an ISO 8601 timestamp with UTC offset so hosts align
    And the entry contains no password, token, key, or other secret value

  # from Third_Party_Payment_Gateway_Integration
  @security @owasp:payment-gateway @usecase:spoofed-callback-fulfillment
  Scenario: A forged payment callback does not fulfill an order
    Given a checkout that fulfills orders only after payment confirmation
    When an attacker posts a callback claiming an order is paid without a valid gateway signature
    Then the callback is rejected and the order stays unfulfilled
    And fulfillment happens only after a server-side check with the gateway confirms the amount, currency, and order ID
    And a replayed valid callback fulfills the order at most once

  # from Unvalidated_Redirects_and_Forwards
  @security @owasp:open-redirect @usecase:phishing-redirect-blocked
  Scenario: A redirect endpoint refuses an attacker-controlled external URL
    Given a redirect endpoint that only sends users to allowlisted destinations
    When an attacker requests the endpoint with url set to "http://malicious.example.com"
    Then the redirect is refused and the user is not sent to the attacker's site
    And the destination is resolved from a server-side allowlist rather than from the raw parameter

  # from Web_Cache_Security
  @security @owasp:web-cache @usecase:cross-user-response-leak
  Scenario: A shared cache never serves one user's private response to another
    Given an authenticated route that returns personalized data with Cache-Control no-store
    When user A requests the route and then user B requests the same URL through the production cache path
    Then user B receives their own response and never user A's cached content
    And the shared cache stores no personalized response for that route
