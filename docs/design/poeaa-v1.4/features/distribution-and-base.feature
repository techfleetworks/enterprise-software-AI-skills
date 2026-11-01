Feature: The catalog covers remote calls and the book's base patterns
  Work package 6 of the v1.4 PoEAA program. Fixes audit findings F6, F15 and F20. In the book, Remote
  Facade and Data Transfer Object are a pair: the facade gives a few large calls, the DTO carries the data.
  The base patterns hold rules the other skills depend on: Separated Interface is how the domain owns the
  interfaces its database code implements (the "dependency direction" question judge-arch asks), Money is
  how amounts avoid rounding errors, and Service Stub is how a Gateway gets tested.
  Source: docs/audit/poeaa-2026-11/poeaa-adversarial-audit.md, findings F6, F15 and F20.

  @audience:agent @usecase:distribution-base-entries-exist @category:happy @quality:functional @severity:high
  Scenario Outline: Each distribution and base pattern has a full, correctly cited entry
    Given the enterprise catalog
    When the agent looks up "<pattern>"
    Then there is an entry whose heading starts with "<pattern>", with every template field filled
    And its Source field cites "Fowler, *PoEAA*, <pattern> (<page>)"
    And the catalog gate passes

    Examples:
      | pattern             | page |
      | Remote Facade       | 388  |
      | Mapper              | 473  |
      | Layer Supertype     | 475  |
      | Separated Interface | 476  |
      | Registry            | 480  |
      | Money               | 488  |
      | Plugin              | 499  |
      | Service Stub        | 504  |
      | Record Set          | 508  |

  @audience:agent @usecase:remote-facade-only-across-processes @category:negative @quality:performance @severity:high
  Scenario: Remote Facade says not to use it inside one process
    The book: "If all your access is within a single process, you don't need this kind of conversion" (PDF 379).
    Given the "Remote Facade" entry in the enterprise catalog
    When the agent reads the Avoid when field
    Then it says not to add a Remote Facade when the caller and the objects run in one process

  @audience:agent @usecase:dto-names-assembler @category:edge @quality:functional @severity:medium
  Scenario: The DTO entry names the assembler and its partner facade
    Audit F6: the book uses an assembler to move data between the domain objects and the DTOs (PDF 380 to 382).
    Given the "Data Transfer Object (DTO)" entry in the enterprise catalog
    When the agent reads the entry
    Then it names an assembler that moves data between domain objects and the DTO
    And it links to the "Remote Facade" entry

  @audience:agent @usecase:money-allocation-adds-up @category:boundary @quality:reliability @severity:high
  Scenario: The Money entry proves that split amounts add back up to the whole
    The book: rounding problems come up "particularly when allocating money between different places" (PDF 463), with Matt Foemmel's case of 5 cents split so that rounding "gains a penny".
    Given the "Money" entry in the enterprise catalog
    When the agent reads the Verify correct application field
    Then it names a test that splits an amount by ratios and checks the parts add up to the original amount
    And the test includes splitting 5 cents 70 to 30

  @audience:agent @usecase:money-no-floats @category:negative @quality:reliability @severity:high
  Scenario: The Money entry forbids floating-point amounts
    Audit F20: the book says "You should absolutely avoid any kind of floating point type" for money (PDF 462).
    Given the "Money" entry in the enterprise catalog
    When the agent reads the Misuse and Example fields
    Then Misuse names storing an amount as a floating-point number
    And the good example stores the amount as an integer count of the smallest unit

  @audience:agent @usecase:separated-interface-dependency-direction @category:edge @quality:reliability @severity:high
  Scenario: Separated Interface gives the rule that proves dependency direction
    The book: Separated Interface "Defines an interface in a separate package from its implementation" (PDF 452).
    Given the "Separated Interface" entry in the enterprise catalog
    When the agent reads the Verify correct application field
    Then it names an arch-gate rule that fails when domain code imports from the infrastructure folder
    And it links to judge-arch's dependency-direction question

  @audience:agent @usecase:registry-vs-service-locator @category:edge @quality:functional @severity:medium
  Scenario: Registry and Dependency Injection agree with each other
    Audit F15: the DI entry calls a Service Locator an anti-pattern, and the book's Registry is a well-known object used to find services (PDF 455). The skill never connects the two.
    Given the "Registry" and "Dependency Injection / Inversion of Control, DI/IoC" entries in the enterprise catalog
    When the agent reads both entries
    Then the Registry entry says when a Registry is acceptable and when to inject instead
    And the DI entry links to the Registry entry

  @audience:agent @usecase:service-stub-pairs-with-gateway @category:edge @quality:functional @severity:medium
  Scenario: Service Stub and Gateway point to each other
    The book: a Gateway gives "a clear point at which to deploy Service Stubs (504)" (PDF 443).
    Given the "Service Stub" and "Gateway" entries in the enterprise catalog
    When the agent reads either entry
    Then each one links to the other
