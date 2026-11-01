Feature: The catalog gate proves every PoEAA citation is correct, not just present
  Work package 2 of the v1.4 PoEAA program. Fixes audit finding F1 (the gate passed wrong and missing
  pages) and supports F2 (a chapter citation for a claim that lives in a narrative chapter). Today the gate
  only checks that some citation token exists, and an ISBN satisfies it. After v1.4 the gate compares every
  "Fowler, PoEAA, <Pattern> (<page>)" against a committed page registry of the 51 catalog patterns, and it
  also checks that every pattern is either covered or declined on purpose.
  Source: docs/audit/poeaa-2026-11/poeaa-adversarial-audit.md, findings F1 and F2.

  Background:
    Given the PoEAA page registry lists all 51 catalog patterns with their printed pages
    And the registry lists "Repository" at printed page 322

  @audience:operator @usecase:poeaa-correct-page-passes @category:happy @quality:reliability @severity:high
  Scenario: An entry that cites the right page passes
    Given a catalog entry cites "Fowler, *PoEAA*, Repository (322)"
    When the catalog gate checks the catalog
    Then the gate exits 0

  @audience:operator @usecase:poeaa-wrong-page-fails @category:negative @quality:reliability @severity:critical
  Scenario Outline: An entry that cites the wrong page fails and says what the page should be
    Audit F1: the gate exited 0 with every page rewritten to (999), and with Repository (322) changed to (17).
    Given a catalog entry cites "Fowler, *PoEAA*, Repository (<cited>)"
    When the catalog gate checks the catalog
    Then the gate exits 1
    And the message names "Repository", the cited page <cited>, and the registry page 322

    Examples:
      | cited |
      | 17    |
      | 999   |
      | 321   |
      | 323   |

  @audience:operator @usecase:poeaa-missing-page-fails @category:negative @quality:reliability @severity:critical
  Scenario: An entry that names a PoEAA pattern without a page fails
    Audit F1: the gate exited 0 with 22 of the 23 PoEAA page numbers deleted.
    Given a catalog entry cites "Fowler, *PoEAA*, Repository" with no page
    When the catalog gate checks the catalog
    Then the gate exits 1
    And the message says the citation has no page

  @audience:operator @usecase:poeaa-isbn-alone-not-enough @category:negative @quality:reliability @severity:critical
  Scenario: The book's ISBN alone no longer satisfies an entry sourced to PoEAA
    Audit F1: every PoEAA entry passed on its ISBN, because "Repository (322)" never matched the page pattern.
    Given a catalog entry's Source field names PoEAA and the ISBN "0-321-12742-0"
    And the entry carries no "<Pattern> (<page>)" or chapter citation
    When the catalog gate checks the catalog
    Then the gate exits 1
    And the message says a PoEAA source needs a pattern page or a chapter

  @audience:operator @usecase:poeaa-unknown-pattern-fails @category:negative @quality:reliability @severity:high
  Scenario: A citation to a pattern name that is not in the book fails
    Given a catalog entry cites "Fowler, *PoEAA*, Repositry (322)"
    When the catalog gate checks the catalog
    Then the gate exits 1
    And the message says "Repositry" is not in the PoEAA registry

  @audience:operator @usecase:poeaa-chapter-citation @category:boundary @quality:reliability @severity:medium
  Scenario Outline: A claim from a narrative chapter cites the chapter, and the chapter must exist
    Audit F2: the security half of the Service Layer sentence lives in Chapter 2, not on page 133.
    Given a catalog entry cites "Fowler, *PoEAA*, ch. <chapter>"
    When the catalog gate checks the catalog
    Then the gate exits <exit>

    Examples:
      | chapter | exit |
      | 1       | 0    |
      | 2       | 0    |
      | 18      | 0    |
      | 0       | 1    |
      | 19      | 1    |

  @audience:operator @usecase:poeaa-registry-pages-rise @category:boundary @quality:reliability @severity:high
  Scenario: The registry rejects a page that breaks the book's order
    The book prints its patterns in catalog order, so printed pages rise from Transaction Script (110) to Record Set (508). A typo in the registry shows up as a page that is out of order.
    Given the registry lists "Identity Map" at 195 and "Lazy Load" at 200
    And a maintainer changes "Lazy Load" to 190
    When the registry's own test runs
    Then the test fails
    And the message names "Lazy Load" as out of order

  @audience:operator @usecase:poeaa-registry-has-51 @category:empty-overflow @quality:reliability @severity:high
  Scenario Outline: The registry must hold exactly the 51 catalog patterns
    Given the registry holds <count> patterns
    When the registry's own test runs
    Then the test <result>

    Examples:
      | count | result |
      | 51    | passes |
      | 50    | fails  |
      | 52    | fails  |
      | 0     | fails  |

  @audience:operator @usecase:poeaa-every-pattern-covered-or-declined @category:negative @quality:reliability @severity:high
  Scenario: Every catalog pattern is either covered or declined on purpose
    Audit scoreboard: 39 of 51 patterns had no entry and nothing said so. A silent gap is the failure.
    Given the registry marks "Two Step View" as "covered" with the heading "Two Step View"
    And no catalog heading starts with "Two Step View"
    When the catalog gate checks coverage
    Then the gate exits 1
    And the message names "Two Step View" as covered in the registry but missing from the catalog

  @audience:operator @usecase:poeaa-heading-matches-registry @category:edge @quality:reliability @severity:high
  Scenario Outline: A covered pattern matches its catalog heading by the registry's heading field
    Review finding F-A: catalog headings carry a cluster suffix and sometimes a different spelling, such as "### Model-View-Controller (MVC), presentation" for the registry's "Model View Controller".
    Given the registry row "<pattern>" has the heading "<heading>"
    And the catalog has the entry "### <heading>, <cluster>"
    When the catalog gate checks coverage
    Then the gate counts "<pattern>" as covered

    Examples:
      | pattern               | heading                     | cluster                  |
      | Repository            | Repository                  | persistence              |
      | Model View Controller | Model-View-Controller (MVC) | presentation             |
      | Data Transfer Object  | Data Transfer Object (DTO)  | application/integration  |
      | Special Case          | Null Object (Special Case)  | domain/DDD               |

  @audience:operator @usecase:poeaa-bare-page-checked @category:negative @quality:reliability @severity:critical
  Scenario Outline: A bare cross-reference with a wrong page fails too
    Review finding F-B: the catalog also uses Fowler's bare form, such as "Active Record (160)" inside an Avoid when field. Checking only the "Fowler, *PoEAA*" form would leave these unchecked.
    Given a catalog entry's text contains "<text>"
    When the catalog gate checks the catalog
    Then the gate exits <exit>

    Examples:
      | text                                   | exit |
      | Active Record (160) is cheaper         | 0    |
      | Active Record (161) is cheaper         | 1    |
      | built on Metadata Mapping (306)        | 0    |
      | built on Metadata Mapping (329)        | 1    |
      | uses a Table Data Gateway (144)        | 0    |
      | reached by a Data Mapper (165)         | 0    |
      | wrapped in a Gateway (466)             | 0    |
      | wrapped in a Gateway (144)             | 1    |

  @audience:operator @usecase:poeaa-registry-pins-observed-pages @category:negative @quality:reliability @severity:high
  Scenario: The registry test pins the pages the audit observed, so an in-order typo still fails
    Review finding F-G: Repository changed from 322 to 320 still sits in order between Query Object (316) and Model View Controller (330).
    Given the registry's test pins the 15 pages the audit matched to the book's cross-references
    And a maintainer changes "Repository" to 320 in the registry
    When the registry's own test runs
    Then the test fails
    And the message names "Repository" with the pinned page 322

  @audience:operator @usecase:poeaa-declined-needs-reason @category:empty-overflow @quality:reliability @severity:medium
  Scenario: A declined pattern must give a reason
    Given the registry marks "Record Set" as "declined" with an empty reason
    When the catalog gate checks coverage
    Then the gate exits 1
    And the message says a declined pattern needs a reason

  @audience:operator @usecase:poeaa-registry-missing-fails-closed @category:error @quality:reliability @severity:high
  Scenario: A missing registry is a block, not a pass
    Given the PoEAA page registry file does not exist
    When the catalog gate checks the catalog
    Then the gate exits 2
    And the message names the registry path it expected

  @audience:operator @usecase:poeaa-gate-test-discriminates @category:negative @quality:reliability @severity:critical
  Scenario: The gate's own tests fail when the page check is switched off
    A check that cannot fail proves nothing (verifiable-quality-gates).
    Given the page comparison in the catalog gate is replaced by one that always passes
    When the gate's committed tests run
    Then at least one test fails
    And the failing test is the one that plants a wrong page

  @audience:operator @usecase:poeaa-header-matches-gate @category:edge @quality:reliability @severity:low
  Scenario: The catalog header describes the citation form the gate enforces
    Audit F1: the header told authors to cite "(p. NNN)", a form no PoEAA entry uses.
    Given the header of the enterprise catalog
    When a maintainer reads how to cite PoEAA
    Then the header shows the form "<Pattern> (<page>)" and the form "ch. <n>"
    And the example citation in the header passes the catalog gate
