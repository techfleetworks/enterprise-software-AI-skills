Feature: The catalog covers how objects map to tables
  Work package 7 of the v1.4 PoEAA program. Fixes audit finding F14. An object-relational mapper still
  makes the team choose how an inheritance tree becomes tables, how small objects like a date range are
  stored, and how links between objects become keys. Today the catalog has none of the book's eleven
  structural and metadata mapping patterns, and Serialized LOB has a compliance warning with no entry
  behind it.
  Source: docs/audit/poeaa-2026-11/poeaa-adversarial-audit.md, finding F14.

  @audience:agent @usecase:or-mapping-entries-exist @category:happy @quality:functional @severity:medium
  Scenario Outline: Each structural and metadata mapping pattern has a full, correctly cited entry
    Given the enterprise catalog
    When the agent looks up "<pattern>"
    Then there is an entry whose heading starts with "<pattern>", with every template field filled
    And its Source field cites "Fowler, *PoEAA*, <pattern> (<page>)"
    And the catalog gate passes

    Examples:
      | pattern                    | page |
      | Identity Field             | 216  |
      | Foreign Key Mapping        | 236  |
      | Association Table Mapping  | 248  |
      | Dependent Mapping          | 262  |
      | Embedded Value             | 268  |
      | Serialized LOB             | 272  |
      | Single Table Inheritance   | 278  |
      | Class Table Inheritance    | 285  |
      | Concrete Table Inheritance | 293  |
      | Inheritance Mappers        | 302  |
      | Metadata Mapping           | 306  |

  @audience:agent @usecase:inheritance-entries-compare @category:edge @quality:functional @severity:medium
  Scenario Outline: Each inheritance mapping entry says when to pick a sibling instead
    Given the "<pattern>" entry in the enterprise catalog
    When the agent reads the Avoid when field
    Then it names at least one of "Single Table Inheritance", "Class Table Inheritance" or "Concrete Table Inheritance" other than "<pattern>"

    Examples:
      | pattern                    |
      | Single Table Inheritance   |
      | Class Table Inheritance    |
      | Concrete Table Inheritance |

  @audience:agent @usecase:serialized-lob-pii @category:adverse @quality:compliance @severity:high
  Scenario: Serialized LOB keeps its warning about hidden personal data
    The catalog's compliance caveat says a Serialized LOB "can bury unclassified PII inside an opaque blob".
    Given the "Serialized LOB" entry in the enterprise catalog
    When the agent reads the Security trade-off field
    Then it says personal data inside the blob escapes column-level classification
    And it links to compliance-data-lifecycle

  @audience:agent @usecase:identity-field-links-keys-guidance @category:edge @quality:functional @severity:low
  Scenario: Identity Field and the database guide agree on keys
    database-architecture.md already covers surrogate keys, which is part of Identity Field.
    Given the "Identity Field" entry in the enterprise catalog
    When the agent reads the entry
    Then it links to the key guidance in enterprise-architecture-standards "database-architecture.md"
