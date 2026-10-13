@security @skill-receipt
Feature: The skill-application receipt gate rejects a crafted receipt
  The receipt gate parses an untrusted receipt and untrusted diff filenames. A crafted receipt must not be
  able to read files outside the skills directory or pass off a fabricated quote as proof it read a skill.
  These scenarios are proven mechanically by test/skill-receipt.test.mjs (the traversal and quote cases).

  Background:
    Given a skills directory and an append-only receipt log
    And the human-review banner is present

  @owasp:path-traversal
  Scenario: An anchor path that escapes the skills directory is rejected
    Given an applied skill entry whose anchor path normalizes outside the skills directory
    When the receipt gate runs
    Then it fails closed with exit code 2
    And it reports the traversal attempt rather than reading the file

  @owasp:fabricated-evidence
  Scenario: A fabricated quote that is not in the cited skill is rejected
    Given an applied skill entry whose quote does not appear in any cited skill file
    When the receipt gate runs
    Then it fails with a grounding gap
    And the receipt cannot be passed off as grounded

  @owasp:fabricated-evidence
  Scenario: A quote shorter than the minimum word run is rejected
    Given an applied skill entry whose quote is fewer than eight exact words
    When the receipt gate runs
    Then it fails with a grounding gap
    And weak grounding cannot stand in for reading the skill
