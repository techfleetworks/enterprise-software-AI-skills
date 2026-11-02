Feature: A stale global skill mirror is named at session start, even at an unchanged version
  A session rooted outside the skills repo runs the skills mirrored into the user's global skills folder.
  Commits that change a skill without a version bump left that mirror stale with no warning, because the
  session nudge compared only version strings. Source: ADR-0105. Observed 2026-10-31 on the maintainer's
  machine: installed and repo versions both 1.3.1, while the installer's check named 8 skills whose content
  had changed since they were mirrored.

  Background:
    Given the skills were mirrored globally by the installer at the repo's current version

  @audience:operator @usecase:stale-mirror-named-at-start @category:edge @quality:reliability @severity:high
  Scenario: A skill changed in the repo after it was mirrored is named at session start
    Given the repo changed one mirrored skill without a version bump
    When a new session starts outside the repo
    Then the session is told the skills are out of date
    And only the changed skill is named
    And the command that re-mirrors the skills is named

  @audience:operator @usecase:missing-mirrored-skill-named @category:edge @quality:reliability @severity:medium
  Scenario: A skill missing from the global mirror is named at session start
    Given one skill is missing from the global mirror
    When a new session starts outside the repo
    Then the session is told the skills are out of date
    And only the missing skill is named

  @audience:operator @usecase:current-mirror-not-nudged @category:happy @quality:functional @severity:medium
  Scenario: A mirror that matches the repo gets no sync message
    Given every mirrored skill matches the repo
    When a new session starts outside the repo
    Then the session is not told to sync

  @audience:agent @usecase:drift-check-failure-keeps-directive @category:error @quality:reliability @severity:high
  Scenario: A broken drift check never costs the session its directive
    Given the repo changed one mirrored skill without a version bump
    And the drift check module cannot be loaded
    When a new session starts outside the repo
    Then the session is not told to sync
    And the session still gets the always-on directive

  @audience:operator @usecase:other-clone-marker-ignored @category:negative @quality:reliability @severity:medium
  Scenario: A mirror recorded for a different clone does not drive this clone's message
    Given the repo changed one mirrored skill without a version bump
    And the install record names a different clone
    When a new session starts outside the repo
    Then the session is not told to sync
