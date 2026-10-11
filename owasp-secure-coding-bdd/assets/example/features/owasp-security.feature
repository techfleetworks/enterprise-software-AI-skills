Feature: OWASP secure-coding controls (executable @security scenarios)
  The canonical @security scenarios from the OWASP cheat-sheet files, in runnable Gherkin.
  In an adopting repo these are merged into the single shared feature-file index that
  bdd-comprehensive-testing owns, so they execute as blocking autotests in CI alongside every
  other scenario (see bdd-comprehensive-testing: "Storing BDD scenarios permanently" and "CI/CD wiring").
  Each scenario mirrors the @security scenario in its references/cheatsheets/<Slug>.md file.

  @security @owasp:password-storage @usecase:offline-cracking-resistance
  Scenario: Stored password hashes resist offline cracking
    Given a user registers with a password
    When the password is persisted
    Then it is stored as an Argon2id hash at or above m=19456, t=2, p=1 with a unique salt
    And it is never stored in plain text or as a fast unsalted hash
