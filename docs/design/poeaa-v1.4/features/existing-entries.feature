Feature: The catalog entries that already cite PoEAA agree with the book
  Work package 3 of the v1.4 PoEAA program. Fixes audit findings F2, F3, F5 (the Unit of Work half), F9,
  F10, F11, F17, F18, F19 and F20. These entries exist today and cite the right pages, but some say the
  opposite of the book on when to use the pattern. An agent that trusts them picks the wrong design. Each
  scenario reads one entry in the enterprise catalog and checks a fact the book states.
  Source: docs/audit/poeaa-2026-11/poeaa-adversarial-audit.md.

  @audience:agent @usecase:service-layer-security-cites-chapter @category:negative @quality:reliability @severity:high
  Scenario: The Service Layer security claim cites the chapter where the book makes it
    Audit F2: the book says Service Layer is "a good spot to place such things as transaction control and security" in Chapter 2 (PDF 45). The Service Layer chapter (PDF 143 to 149) never says "security".
    Given the "Service Layer" entry in the enterprise catalog
    When the agent reads the sentence about security control
    Then that sentence cites "Fowler, *PoEAA*, ch. 2"
    And no sentence about security cites "Service Layer (133)" as its only source

  @audience:agent @usecase:service-layer-two-variants @category:negative @quality:functional @severity:high
  Scenario: Service Layer names both of Fowler's variants and does not call the thin one a misuse
    Audit F3: the book's "domain facade approach" is a set of thin facades that "don't implement any business logic" (PDF 144). The skill called a service that only delegates a misuse.
    Given the "Service Layer" entry in the enterprise catalog
    When the agent reads the Intent, Cons and Misuse fields
    Then the entry names the "domain facade" variant and the "operation script" variant
    And the Misuse field does not contain "only delegates"
    And the Cons field does not contain "pure overhead"

  @audience:agent @usecase:service-layer-both-triggers @category:edge @quality:functional @severity:high
  Scenario: Service Layer keeps both of Fowler's reasons to use it
    Audit F3: the book's trigger is "more than one kind of client" and "multiple transactional resources" (PDF 146). The skill kept only the first.
    Given the "Service Layer" entry in the enterprise catalog
    When the agent reads the Best situation and Avoid when fields
    Then they name "more than one kind of client"
    And they name "more than one transactional resource"

  @audience:agent @usecase:unit-of-work-business-transaction @category:negative @quality:reliability @severity:high
  Scenario: Unit of Work tracks a business transaction, not a database transaction
    Audit F5: the book's Unit of Work "Maintains a list of objects affected by a business transaction" (PDF 187), and a business transaction can span screens with only the commit inside a short system transaction (PDF 88). The skill offered BEGIN and COMMIT as a replacement.
    Given the "Unit of Work" entry in the enterprise catalog
    When the agent reads the Intent, Misuse and Modern alternative fields
    Then the Intent field contains "business transaction"
    And the Intent field contains "the commit runs inside one short system transaction"
    And the Modern alternative field does not contain "BEGIN/COMMIT"
    And the entry links to "Optimistic Offline Lock" for conflicts across requests

  @audience:agent @usecase:gateway-stable-resource @category:negative @quality:functional @severity:medium
  Scenario: Gateway does not tell the agent to skip it for a stable resource
    Audit F9: the book says "There's hardly any downside to making the Gateway" and it helps "even if you don't think the resource is ever going to change" (PDF 443).
    Given the "Gateway" entry in the enterprise catalog
    When the agent reads the Avoid when field
    Then the Avoid when field does not contain "stable resource"
    And the Best situation field contains "Service Stub"

  @audience:agent @usecase:mvc-two-separations @category:edge @quality:functional @severity:medium
  Scenario: MVC says which of its two separations matters
    Audit F10: the book says the separation of presentation and model "is one of the most important design principles in software" and the view and controller split "is less important" (PDF 322 to 323).
    Given the "Model-View-Controller (MVC)" entry in the enterprise catalog
    When the agent reads the Intent and Best situation fields
    Then the Intent field contains "the separation of presentation from model matters most"
    And the Best situation field contains "the view and controller split is optional"

  @audience:agent @usecase:special-case-many-meanings @category:edge @quality:functional @severity:medium
  Scenario: Special Case allows a different object for each meaning of "absent"
    Audit F11: the book says "A null can mean different things" and gives a missing customer, an unknown customer, and an occupant who still runs up charges (PDF 470).
    Given the Special Case entry in the enterprise catalog
    When the agent reads the Intent and Best situation fields
    Then the entry quotes Fowler's rule "Use Special Case whenever you have multiple places in the system that have the same behavior after a conditional check"
    And the Best situation field contains "one special case for each meaning of absent"
    And the Intent field does not contain "neutral"

  @audience:agent @usecase:lazy-load-same-row-rule @category:edge @quality:performance @severity:low
  Scenario: Lazy Load gives the book's same-row rule and its four variants
    Audit F17: the book says lazy loading a field "stored in the same row as the rest of the object" is "usually pointless" (PDF 202).
    Given the "Lazy Load" entry in the enterprise catalog
    When the agent reads the Avoid when field
    Then the Avoid when field contains "same row"
    And the entry names "lazy initialization", "virtual proxy", "value holder" and "ghost"

  @audience:agent @usecase:quotes-are-verbatim @category:negative @quality:reliability @severity:low
  Scenario: A sentence in quotation marks is the author's exact words
    Audit F18: the Data Mapper entry put a paraphrase in quotation marks.
    Given the "Data Mapper" entry in the enterprise catalog
    When the agent reads the quoted sentence in the Best situation field
    Then it reads "The primary occasion for using Data Mapper is when you want the database schema and the object model to evolve independently."

  @audience:agent @usecase:identity-map-read-only-scope @category:edge @quality:reliability @severity:low
  Scenario: Identity Map allows a shared read-only map and points to offline locking
    Audit F19: the book allows "read-only Identity Maps held in a process context" and says Identity Map "doesn't do anything to handle conflicts that cross sessions" (PDF 198).
    Given the "Identity Map" entry in the enterprise catalog
    When the agent reads the Adopt safely and Misuse fields
    Then the Adopt safely field contains "read-only objects may share one process-wide map"
    And the entry links to "Optimistic Offline Lock" for conflicts across sessions

  @audience:agent @usecase:value-object-name-collision @category:edge @quality:functional @severity:low
  Scenario: Value Object warns that some writers use the name for a DTO
    Audit F19: the book notes the J2EE community used "value object" to mean Data Transfer Object (PDF 461).
    Given the "Value Object" entry in the enterprise catalog
    When the agent reads the entry
    Then the Misuse field contains "some writers use 'value object' to mean a Data Transfer Object"
    And it links to the "Data Transfer Object (DTO)" entry

  @audience:agent @usecase:money-never-floating-point @category:negative @quality:reliability @severity:high
  Scenario: No catalog example stores an amount of money as a floating-point number
    Audit F20: the Value Object example stores money as a TypeScript "number". The book says "You should absolutely avoid any kind of floating point type, as that will introduce the kind of rounding problems that Money is intended to avoid" (PDF 462).
    Given every code example in the pattern-selector catalog and chooser
    When the check reads each class or type whose name contains "Money"
    Then none of its amount fields is declared as "number"
    And each amount field is declared as "bigint", "AmountInCents", or "Decimal"

  @audience:operator @usecase:adr-trigger-names-pattern-choice @category:edge @quality:functional @severity:low
  Scenario: The ADR skill names a cross-cutting pattern choice as a reason to write an ADR
    Audit F19: pattern-selector asks for an ADR when a choice is cross-cutting, but the ADR skill does not say so from its side.
    Given the architectural-decision-records skill
    When a maintainer reads its list of changes that need an ADR
    Then the section "Does this change need an ADR?" contains "a cross-cutting design pattern choice"
    And that section links to pattern-selector
