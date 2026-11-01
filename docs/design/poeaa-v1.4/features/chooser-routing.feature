Feature: The chooser routes the book's main problems to the right pattern
  Fixes audit finding F8. The chooser's symptom table has 16 rows, and only four reach a PoEAA pattern.
  The book's narrative chapters are each built around a problem a team really has. After v1.4 the
  symptom table has a row for each of those problems, and every pattern it names exists in the catalog.
  Rows land with the work package that adds their target entries: the Identity Map, Lazy Load and
  Gateway rows with WP3 (their entries already exist), the rest with WP4 to WP7. This file graduates row by
  row: each work package's PR carries its own rows into a top-level feature file, so no row is ever
  pending in features/.
  Source: docs/audit/poeaa-2026-11/poeaa-adversarial-audit.md, finding F8.

  @audience:agent @usecase:chooser-row-for-problem @category:happy @quality:functional @severity:high
  Scenario Outline: The symptom table has a row for each problem the book solves
    Review finding F-F: the step matches the row's symptom cell exactly, so the row's wording must be the text in this table.
    Given the chooser's Step 3 symptom table
    When the agent reads the row whose symptom cell is "<symptom>"
    Then that row's candidates include "<pattern>"

    Examples:
      | symptom                                                  | pattern                  |
      | business logic is a few checks and sums                  | Transaction Script       |
      | business rules are complex and keep changing             | Domain Model             |
      | two people can edit the same record across screens       | Optimistic Offline Lock  |
      | a conflict would be too costly to undo after the fact    | Pessimistic Offline Lock |
      | a client makes many small calls across the network       | Remote Facade            |
      | where to keep a user's session state                     | Server Session State     |
      | a class hierarchy has to be stored in tables             | Single Table Inheritance |
      | the same record gets loaded twice in one request         | Identity Map             |
      | a loop runs one query per row                            | Lazy Load                |
      | an outside system has an awkward interface               | Gateway                  |
      | amounts of money are added, split or rounded             | Money                    |
      | the domain must not depend on the database code          | Separated Interface      |

  @audience:agent @usecase:chooser-no-dangling-route @category:negative @quality:reliability @severity:high
  Scenario: Every pattern the chooser names has a catalog entry
    Given the chooser's Step 3 symptom table
    And the PoEAA page registry
    When the agent follows each candidate that is a PoEAA pattern
    Then each one has an entry whose heading starts with the registry's heading for that pattern

  @audience:agent @usecase:chooser-cheaper-option-kept @category:edge @quality:functional @severity:low
  Scenario: Each new chooser row still names the cheaper option to check first
    The chooser's rule is to prefer the simpler option when it solves the problem.
    Given a chooser row added in v1.4
    When the agent reads the row
    Then its "First check the cheaper option" cell is not empty
