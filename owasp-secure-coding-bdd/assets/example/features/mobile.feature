Feature: OWASP mobile and embedded security controls
  Executable @security scenarios drawn from the per-sheet cheat-sheet files in this category.
  In an adopting repo these merge into the single shared feature-file index (see bdd-comprehensive-testing).
  Each mirrors the @security scenario in its references/cheatsheets/<Slug>.md file.

  # from Automotive_Security
  @security @owasp:automotive @usecase:can-message-forgery
  Scenario: A forged safety-critical CAN message is rejected
    Given a safety-critical ECU that accepts commands protected by SecOC with freshness checks
    When an attacker on the bus injects a frame without a valid authenticator or replays a captured one
    Then the ECU rejects the message and does not act on it
    And the rejection is logged without recording any secret material

  # from Drone_Security
  @security @owasp:drone @usecase:unsigned-mavlink-command
  Scenario: An unsigned MAVLink command on an untrusted link is rejected
    Given a drone configured to require valid MAVLink 2 message signatures on an untrusted link
    When an attacker sends a forged or replayed command without a valid signature and fresh timestamp
    Then the flight controller rejects the command and does not act on it
    And the event is logged for monitoring

  # from Mobile_Application_Security
  @security @owasp:mobile @usecase:deep-link-auth-bypass
  Scenario: A deep link to a protected screen still requires authentication
    Given a mobile app with an App Lock enabled and no active authenticated session
    When an attacker opens a deep link that targets a sensitive in-app screen
    Then the app routes the user to the login screen before any protected data loads
    And the link parameters are validated and the authorization check runs on the server, not on the device
