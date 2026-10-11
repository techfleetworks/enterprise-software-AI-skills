Feature: OWASP authentication and session-management controls
  Executable @security scenarios drawn from the per-sheet cheat-sheet files in this category.
  In an adopting repo these merge into the single shared feature-file index (see bdd-comprehensive-testing).
  Each mirrors the @security scenario in its references/cheatsheets/<Slug>.md file.

  # from Authentication
  @security @owasp:authentication @usecase:user-enumeration-resistance
  Scenario: Login responses do not reveal which accounts exist
    Given a login endpoint with one real account and one username that was never registered
    When an attacker submits a wrong password for the real account and any password for the unknown username
    Then both attempts return the same generic "invalid username or password" message
    And both return the same HTTP status code
    And both run the full hash-and-compare path so the response times do not differ in a usable way

  # from Authentication_Patterns
  @security @owasp:authentication-patterns @usecase:identity-header-spoofing
  Scenario: A service rejects a forged identity header from a direct caller
    Given a service that trusts an identity header injected by its sidecar proxy
    When an attacker reaches the service port directly and sends a self-chosen identity header
    Then the request is refused because the service only accepts traffic from its sidecar
    And the sidecar strips or overwrites any inbound identity header before injecting its own verified value

  # from Bot_Management_and_Anti-Automation
  @security @owasp:bot-management @usecase:credential-stuffing-dual-bucket
  Scenario: Distributed credential stuffing trips a per-username rate limit
    Given a login endpoint with separate per-username and per-IP rate buckets
    When one username is targeted with many password guesses spread across many IP addresses
    Then the per-username bucket exceeds its threshold and further attempts get a generic 429
    And the response leaks no detail about which bucket fired or how many attempts remain

  # from Choosing_and_Using_Security_Questions
  @security @owasp:security-questions @usecase:recovery-enumeration-and-single-factor
  Scenario: Security questions are gated behind email proof and never stand alone
    Given a password reset flow that uses security questions as a secondary layer
    When an attacker enters an email address to start recovery
    Then the response is a generic message that does not reveal whether the account exists
    And the security questions are shown only after the user follows a single-use emailed link
    And a correct answer alone does not authenticate without the prior factor

  # from Credential_Stuffing_Prevention
  @security @owasp:credential-stuffing @usecase:breached-credential-replay
  Scenario: A breach-sourced credential replay is blocked by a second factor
    Given a login endpoint with MFA enabled
    When an attacker submits a valid username and password pair leaked from another site
    Then the password alone does not grant a session
    And a second, independent factor is required before login succeeds
    And the attempt is counted in per-IP attack metrics

  # from Email_Validation_and_Verification
  @security @owasp:email-validation @usecase:verify-before-activation
  Scenario: An account stays inactive until the email is proven owned
    Given a user registers with an email address
    When the account is created but the emailed verification token has not been used
    Then the account cannot be used and its features stay locked
    And only a single-use, time-limited, cryptographically random token completes verification

  # from Forgot_Password
  @security @owasp:forgot-password @usecase:account-enumeration
  Scenario: The reset request reveals nothing about whether an account exists
    Given a forgot-password endpoint
    When an attacker submits a known-registered address and then an address with no account
    Then both requests return the same message
    And both requests take the same amount of time within a small tolerance
    And no account is locked or changed until a valid single-use token is presented

  # from Multifactor_Authentication
  @security @owasp:mfa @usecase:second-factor-required
  Scenario: A correct password alone does not grant access
    Given a user account with MFA enabled
    When an attacker submits the correct password but no valid second factor
    Then no authenticated session is created and access is denied
    And a one-time code is single-use, attempt-limited, and invalidated once it verifies, so it cannot be replayed or guessed

  # from Passkey_Security
  @security @owasp:passkey @usecase:phishing-resistance
  Scenario: A passkey assertion captured on a fake origin is rejected
    Given a passkey registered for the relying party's real RP ID and an exact origin allowlist
    When an attacker relays the authentication ceremony through a look-alike phishing origin
    Then the server rejects the assertion because the origin is not an exact allowlist member and the RP ID hash does not match
    And the failed ceremony does not silently fall back to a password or a typed one-time code

  # from Password_Storage
  @security @owasp:password-storage @usecase:offline-cracking-resistance
  Scenario: Stored password hashes resist offline cracking
    Given a user registers with a password
    When the password is persisted
    Then it is stored as an Argon2id hash at or above m=19456, t=2, p=1 with a unique salt
    And it is never stored in plain text or as a fast unsalted hash

  # from Session_Management
  @security @owasp:session-management @usecase:session-fixation
  Scenario: The session ID is regenerated when the user authenticates
    Given an anonymous visitor holding a pre-login session ID
    When that same visitor logs in successfully with valid credentials
    Then the server issues a brand new session ID and destroys the pre-login one
    And the old pre-login ID is no longer accepted on any request
