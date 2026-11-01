Feature: The catalog covers edits that span screens and where session state lives
  Work package 5 of the v1.4 PoEAA program. Fixes audit findings F5 and F12. The book's concurrency
  chapter is about the "business transaction": a user's task that spans several screens, while each
  database transaction is short. Without a pattern for it, the second person to save silently erases the
  first person's work (a lost update). The book's session state chapter weighs three places to keep
  state. Today the skills have none of these seven patterns and give one prescription for session state.
  Source: docs/audit/poeaa-2026-11/poeaa-adversarial-audit.md, findings F5 and F12.

  @audience:agent @usecase:concurrency-session-entries-exist @category:happy @quality:functional @severity:high
  Scenario Outline: Each offline concurrency and session state pattern has a full, correctly cited entry
    Given the enterprise catalog
    When the agent looks up "<pattern>"
    Then there is an entry whose heading starts with "<pattern>", with every template field filled
    And its Source field cites "Fowler, *PoEAA*, <pattern> (<page>)"
    And the catalog gate passes

    Examples:
      | pattern                  | page |
      | Optimistic Offline Lock  | 416  |
      | Pessimistic Offline Lock | 426  |
      | Coarse-Grained Lock      | 438  |
      | Implicit Lock            | 449  |
      | Client Session State     | 456  |
      | Server Session State     | 458  |
      | Database Session State   | 462  |

  @audience:agent @usecase:optimistic-lock-proof @category:concurrency @quality:reliability @severity:high
  Scenario: Optimistic Offline Lock names the test that proves it works
    The book: Optimistic Offline Lock "Prevents conflicts between concurrent business transactions by detecting a conflict and rolling back the transaction" (PDF 400).
    Given the "Optimistic Offline Lock" entry in the enterprise catalog
    When the agent reads the Verify correct application field
    Then it describes two sessions that load the same version of a record
    And it says the first save succeeds
    And it says the second save must fail with a conflict instead of overwriting

  @audience:agent @usecase:lost-update-example @category:concurrency @quality:reliability @severity:high
  Scenario: The Optimistic Offline Lock example shows the lost update and its fix
    Given the "Optimistic Offline Lock" entry in the enterprise catalog
    When the agent reads the Example field
    Then the bad example saves without checking a version
    And the good example saves only when the stored version still matches the version that was read

  @audience:agent @usecase:client-session-state-tampering @category:adverse @quality:security @severity:high
  Scenario: Client Session State warns that the client can change what it holds
    Given the "Client Session State" entry in the enterprise catalog
    When the agent reads the Security trade-off field
    Then the Security trade-off field contains "the client can read and change it"
    And the Security trade-off field contains "sign or encrypt it and verify it on every request"
    And the Security trade-off field contains "data that decides access, such as a role or a price, stays on the server"
    And the field links to the owasp-secure-coding-bdd cheat sheets "Insecure_Direct_Object_Reference_Prevention" and "JSON_Web_Token"

  @audience:agent @usecase:session-store-trade-offs @category:edge @quality:reliability @severity:medium
  Scenario: The scaling guide names the three session state options instead of one
    Audit F12: performance-scalability.md says "session data in Redis" and gives no trade-off.
    Given the enterprise-architecture-standards reference "performance-scalability.md"
    When the agent reads the guidance on session state
    Then it names "Client Session State", "Server Session State" and "Database Session State"
    And it links to the pattern-selector catalog for the trade-offs

  @audience:agent @usecase:coarse-lock-matches-aggregate @category:edge @quality:reliability @severity:low
  Scenario: Coarse-Grained Lock and Aggregate point to each other
    The Aggregate entry already says it "pairs with Coarse-Grained Lock", but no entry exists to pair with.
    Given the "Coarse-Grained Lock" and "Aggregate" entries in the enterprise catalog
    When the agent reads either entry
    Then each one links to the other
