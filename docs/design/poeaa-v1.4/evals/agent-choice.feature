Feature: An agent using the skills picks the pattern the book would pick
  These are agent-behavior evals, not gated tests. An agent's choice is probabilistic, so these scenarios
  are scored by running each prompt through a fresh agent session with the v1.4 skills loaded and grading
  the pattern-decision record it writes, not by a pass or fail step in CI. They never move into the
  top-level features/ directory. They exist so a person can read what "the fix worked" means for each
  finding in terms of the agent's real decisions. Each scenario names the finding it measures.
  Source: docs/audit/poeaa-2026-11/poeaa-adversarial-audit.md.

  @eval @audience:agent @usecase:eval-simple-logic-gets-script @category:happy @quality:functional @severity:high
  Scenario: Simple logic gets a simple pattern
    Finding F4.
    Given a feature that saves a form and totals two fields
    When the agent writes its pattern-decision record
    Then it picks Transaction Script or Active Record
    And it does not add a Domain Model, a Data Mapper, and a Repository for it

  @eval @audience:agent @usecase:eval-complex-rules-get-domain-model @category:happy @quality:functional @severity:high
  Scenario: Complex, changing rules get a Domain Model
    Finding F4.
    Given a pricing feature with discounts, tiers, and rules that change every quarter
    When the agent writes its pattern-decision record
    Then it picks Domain Model
    And it names Data Mapper as the way the model reaches the database

  @eval @audience:agent @usecase:eval-lost-update-gets-lock @category:concurrency @quality:reliability @severity:high
  Scenario: Two people editing one record across screens get an offline lock
    Finding F5.
    Given two support agents can open the same order, edit it over several screens, and save
    When the agent writes its pattern-decision record
    Then it picks Optimistic Offline Lock with a version check on save
    And it does not claim a database transaction alone prevents the lost update

  @eval @audience:agent @usecase:eval-chatty-client-gets-facade @category:happy @quality:performance @severity:high
  Scenario: A chatty remote client gets a Remote Facade and DTOs
    Finding F6.
    Given a mobile app makes 40 small API calls to draw one screen
    When the agent writes its pattern-decision record
    Then it picks Remote Facade with Data Transfer Objects
    And it names an assembler between the domain and the DTOs

  @eval @audience:agent @usecase:eval-in-process-no-facade @category:negative @quality:performance @severity:medium
  Scenario: Code in one process does not get a Remote Facade
    Finding F6.
    Given a module calls another module in the same process
    When the agent writes its pattern-decision record
    Then it does not add a Remote Facade or DTOs between them

  @eval @audience:agent @usecase:eval-stable-resource-still-gateway @category:edge @quality:functional @severity:medium
  Scenario: A stable outside resource still gets a Gateway for testing
    Finding F9.
    Given code reads files from a storage service whose API has not changed in years
    When the agent writes its pattern-decision record
    Then it picks a Gateway
    And it gives testing with a Service Stub as the reason

  @eval @audience:agent @usecase:eval-thin-service-layer-ok @category:edge @quality:functional @severity:medium
  Scenario: A thin Service Layer over a rich domain is not flagged
    Finding F3.
    Given a web app and a batch job both call a rich Domain Model through thin service methods
    When the agent reviews the design
    Then it does not call the thin service methods a misuse
    And it names Fowler's domain facade variant

  @eval @audience:agent @usecase:eval-two-meanings-two-cases @category:edge @quality:functional @severity:medium
  Scenario: Two meanings of "no customer" get two special cases
    Finding F11.
    Given billing code treats a missing customer and an unknown customer differently
    When the agent writes its pattern-decision record
    Then it picks Special Case with one object for each meaning

  @eval @audience:agent @usecase:eval-money-split-no-floats @category:boundary @quality:reliability @severity:high
  Scenario: Splitting a bill uses Money with whole cents
    Findings F15 and F20.
    Given a feature that splits one invoice among three payers
    When the agent writes its pattern-decision record and its example code
    Then it picks Money with amounts in whole cents
    And its test checks that the three parts add up to the invoice total

  @eval @audience:agent @usecase:eval-session-state-trade-off @category:edge @quality:security @severity:medium
  Scenario: Session state is chosen by weighing the three options
    Finding F12.
    Given an app that must keep a shopping cart between requests on several servers
    When the agent writes its pattern-decision record
    Then it names Client, Server, and Database Session State
    And it states the security trade-off of keeping the cart on the client

  @eval @audience:agent @usecase:eval-citations-pass-registry @category:negative @quality:reliability @severity:high
  Scenario: Every PoEAA page the agent cites matches the registry
    Findings F1 and F2.
    Given any of the prompts above
    When the agent cites PoEAA in its decision record
    Then every "Pattern (page)" it cites matches the PoEAA page registry
    And any claim from a narrative chapter cites the chapter
