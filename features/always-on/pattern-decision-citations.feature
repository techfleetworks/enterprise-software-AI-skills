Feature: An agent's pattern decision cites PoEAA pages that match the registry
  Work package 2 of the v1.4 PoEAA program (spec R2.12, integration finding I1). Before this, the edit-time
  plan check passed a pattern decision with any text in it, including a wrong page or a pattern that is not in
  the book. Now every "<Pattern> (<page>)" in the record is checked against the same page registry the catalog
  gate uses. An install whose skills predate the registry is told the check was not run, not blocked.
  Source: docs/design/poeaa-v1.4/spec.md, section 7.3, R2.12.

  @audience:agent @usecase:wrong-page-in-record-held @category:negative @quality:reliability @severity:high
  Scenario Outline: A wrong or unknown PoEAA page in the record is held
    Given the PoEAA page registry is installed
    And a pattern decision whose decision is "<decision>"
    When the plan is checked
    Then the check holds and names "<problem>"

    Examples:
      | decision          | problem                            |
      | Repository (17)   | Repository is on page 322, not 17  |
      | Florble (100)     | Florble is not in the registry     |

  @audience:agent @usecase:right-page-in-record-passes @category:happy @quality:functional @severity:medium
  Scenario: A correct PoEAA citation in the record passes
    Given the PoEAA page registry is installed
    And a complete pattern decision whose decision is "Repository (322) over Data Mapper (165)"
    And its verify field names the kit item for Repository
    When the plan is checked
    Then the check passes

  @audience:agent @usecase:older-mirror-not-blocked @category:edge @quality:reliability @severity:medium
  Scenario: An install without the page registry is told, not blocked
    Given the installed skills have no PoEAA page registry
    And a complete pattern decision whose decision is "Repository (322)"
    And its verify field names the kit item for Repository
    When the plan is checked
    Then the check passes
    And it prints "not-assessed: PoEAA registry not installed"
    And the notice says to refresh the skills
