Feature: OWASP secure-coding controls (executable @security scenarios)
  The canonical @security scenarios from the OWASP cheat-sheet files, in runnable Gherkin.
  In an adopting repo these are merged into the single shared feature-file index that
  bdd-comprehensive-testing owns, so they execute as blocking autotests in CI alongside every
  other scenario (see bdd-comprehensive-testing: "Storing BDD scenarios permanently" and "CI/CD wiring").
  Each scenario mirrors the @security scenario in its references/cheatsheets/<Slug>.md file.

  @security @owasp:sql-injection @usecase:login-auth-bypass
  Scenario: A login form rejects a SQL injection authentication-bypass payload
    Given a login endpoint backed by a SQL database
    When an attacker submits the username "' OR '1'='1" with any password
    Then the credentials are rejected and no session is created
    And the query runs as a parameterized statement so the input is treated as data, not SQL

  @security @owasp:xss @usecase:stored-xss
  Scenario: User-submitted content cannot inject an executable script
    Given a page that stores and renders user-submitted text
    When a user submits the comment "<script>alert(document.cookie)</script>"
    Then the stored value is rendered as inert text through contextual output encoding
    And no script executes in another user's browser

  @security @owasp:password-storage @usecase:offline-cracking-resistance
  Scenario: Stored password hashes resist offline cracking
    Given a user registers with a password
    When the password is persisted
    Then it is stored as an Argon2id hash at or above m=19456, t=2, p=1 with a unique salt
    And it is never stored in plain text or as a fast unsalted hash
