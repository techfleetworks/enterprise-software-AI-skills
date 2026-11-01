Feature: The catalog covers how to organize domain logic and how it reaches the database
  Work package 4 of the v1.4 PoEAA program. Fixes audit findings F4 and F13. The book's first decision is
  how to organize business logic: Transaction Script, Domain Model, or Table Module. Each one leads to a
  way of reaching the database: a table gateway, a row gateway, Active Record, or Data Mapper. Today the
  catalog has only Data Mapper, and its one mention of Transaction Script calls it a "grab-bag".
  Source: docs/audit/poeaa-2026-11/poeaa-adversarial-audit.md, findings F4 and F13.

  @audience:agent @usecase:domain-logic-entries-exist @category:happy @quality:functional @severity:high
  Scenario Outline: Each domain logic and data source pattern has a full, correctly cited entry
    Given the enterprise catalog
    When the agent looks up "<pattern>"
    Then there is an entry whose heading starts with "<pattern>", with every template field filled
    And its Source field cites "Fowler, *PoEAA*, <pattern> (<page>)"
    And the catalog gate passes

    Examples:
      | pattern            | page |
      | Transaction Script | 110  |
      | Domain Model       | 116  |
      | Table Module       | 125  |
      | Table Data Gateway | 144  |
      | Row Data Gateway   | 152  |
      | Active Record      | 160  |

  @audience:agent @usecase:transaction-script-not-a-smell @category:negative @quality:functional @severity:high
  Scenario: No entry treats Transaction Script as a smell
    Audit F4: the book says "don't rule out Transaction Script. There are a lot of simple problems out there" (PDF 123). The skill's only mention called it a "grab-bag".
    Given the enterprise catalog and the anti-pattern list
    When the agent searches for "Transaction Script"
    Then no sentence calls Transaction Script a grab-bag, a smell or an anti-pattern
    And the "Transaction Script" entry's Best situation says it fits business logic with simple checks and sums

  @audience:agent @usecase:domain-model-leads-to-data-mapper @category:happy @quality:functional @severity:medium
  Scenario: Domain Model says which data source and boundary it pairs with
    The book: "If you're using Domain Model, my first choice for database interaction is Data Mapper (165)" and "you may want to consider Service Layer (133)" (Domain Model, When to Use It).
    Given the "Domain Model" entry in the enterprise catalog
    When the agent reads the Best situation and Adopt safely fields
    Then the entry names "Data Mapper" as the usual way to reach the database
    And the entry names "Service Layer" as the usual boundary

  @audience:agent @usecase:active-record-when-right @category:edge @quality:functional @severity:medium
  Scenario: Active Record says when it is the right choice, not only when it is wrong
    Audit F13: the book says "Active Record is a good choice for domain logic that isn't too complex, such as creates, reads, updates, and deletes" (PDF 166). The skill only warns against it.
    Given the "Active Record" entry in the enterprise catalog
    When the agent reads the Best situation and Avoid when fields
    Then Best situation names simple create, read, update and delete logic
    And Avoid when names tables that do not match the objects one to one

  @audience:agent @usecase:table-module-pairs-with-record-set @category:edge @quality:functional @severity:low
  Scenario: Table Module says it works with tabular data
    Given the "Table Module" entry in the enterprise catalog
    When the agent reads the Best situation field
    Then the field says it fits code that works on whole tables of rows, as Record Set data
