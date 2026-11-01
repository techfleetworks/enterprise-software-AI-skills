Feature: The catalog covers the book's web presentation patterns
  Work package 8 of the v1.4 PoEAA program. Fixes audit finding F16. Today the catalog has MVC and three
  patterns from other sources, but none of the six web patterns that follow MVC in the book. Most of
  them now live inside frameworks (a router with middleware is a Front Controller), so each entry's
  Modern alternative field matters more than usual.
  Source: docs/audit/poeaa-2026-11/poeaa-adversarial-audit.md, finding F16.

  @audience:agent @usecase:web-entries-exist @category:happy @quality:functional @severity:medium
  Scenario Outline: Each web presentation pattern has a full, correctly cited entry
    Given the enterprise catalog
    When the agent looks up "<pattern>"
    Then there is an entry whose heading starts with "<pattern>", with every template field filled
    And its Source field cites "Fowler, *PoEAA*, <pattern> (<page>)"
    And the catalog gate passes

    Examples:
      | pattern                | page |
      | Page Controller        | 333  |
      | Front Controller       | 344  |
      | Template View          | 350  |
      | Transform View         | 361  |
      | Two Step View          | 365  |
      | Application Controller | 379  |

  @audience:agent @usecase:front-controller-modern-form @category:edge @quality:functional @severity:low
  Scenario: Front Controller names the modern form an agent will meet
    The book: "A controller that handles all requests for a Web site" (PDF 334).
    Given the "Front Controller" entry in the enterprise catalog
    When the agent reads the Modern alternative field
    Then it names a framework router with middleware

  @audience:agent @usecase:web-entries-keep-a11y-caveat @category:edge @quality:accessibility @severity:low
  Scenario: The new web entries sit under the accessibility caveat
    Given the six web presentation entries in the enterprise catalog
    When the agent reads the section they belong to
    Then that section's caveat names universal-accessibility-wcag
