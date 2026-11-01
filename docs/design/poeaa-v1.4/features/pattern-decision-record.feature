Feature: The agent's pattern decision is required for design-layer changes and checked for substance
  Work packages 2, 3, and 9 of the v1.4 PoEAA program. Fixes integration findings I1, I2, and I3 and carries
  out operator decision D1 ("Make it required"). Today no rule makes pattern-selector required, and when an
  agent does write a pattern decision, a record with "x" in every field passes. After v1.4, a change to
  repository, service, domain, mapper, or gateway code needs a real decision, and the decision is checked
  against the catalog.
  Source: docs/design/poeaa-v1.4/spec.md, sections 7.2, 7.3, and 7.4.1.

  @audience:agent @usecase:design-layer-requires-pattern-selector @category:happy @quality:functional @severity:high
  Scenario Outline: A design-layer change makes pattern-selector required
    Given the shipped edit-time routing map
    When the agent's selection is checked for a change to "<path>"
    Then the router lists "pattern-selector" as required
    And the selection is held if "pattern-selector" is marked not-applicable

    Examples:
      | path                                                       |
      | src/repositories/orders.ts                                 |
      | lib/services/billing/invoice.ts                            |
      | app/domain/order.ts                                        |
      | src/mappers/order-row.ts                                   |
      | src/gateways/payment.ts                                    |
      | src/orders/orders.repository.ts                            |
      | src/billing/billing.service.ts                             |
      | C:/work/shop/src/repositories/orders.ts                    |
      | /home/dev/shop/app/domain/order.ts                         |

  @audience:agent @usecase:non-design-change-not-forced @category:negative @quality:functional @severity:medium
  Scenario Outline: A change outside the design layer does not force pattern-selector
    Given the shipped edit-time routing map
    When the agent's selection is checked for a change to "<path>"
    Then the router does not list "pattern-selector" as required

    Examples:
      | path                         |
      | README.md                    |
      | src/components/Button.tsx    |
      | scripts/build.sh             |
      | src/services.ts              |
      | src/domain-events/created.ts |

  @audience:operator @usecase:operator-waiver-frees-design-layer @category:permission @quality:security @severity:high
  Scenario: Only the operator can skip the pattern decision on a design-layer change
    Given a change to "src/repositories/orders.ts"
    And the agent marks "pattern-selector" not-applicable
    When the selection is checked with no waiver
    Then the check holds and says only the operator can waive a router-required skill
    When the selection is checked with the operator waiver "pattern-selector"
    Then the check passes

  @audience:agent @usecase:no-pattern-satisfies-requirement @category:edge @quality:functional @severity:medium
  Scenario: Deciding on no pattern, with a reason, satisfies the requirement
    Given a selection that marks "pattern-selector" required
    And a pattern decision whose decision is "no pattern: one caller and one data source, a plain function is enough"
    And every other field of the record is filled with real content
    When the plan is checked
    Then the check passes

  @audience:agent @usecase:missing-record-held @category:negative @quality:functional @severity:high
  Scenario: A design-layer edit with no pattern decision is held
    Given a selection that marks "pattern-selector" required
    And the plan has no pattern-decision record
    When the plan is checked
    Then the check holds and says the pattern-decision planning record is missing

  @audience:agent @usecase:junk-decision-held @category:negative @quality:reliability @severity:high
  Scenario Outline: A decision that names no real pattern is held
    Audit I1: today a record with "x" in every field passes.
    Given a pattern decision whose decision is "<decision>"
    And every other field of the record is filled
    When the plan is checked
    Then the check holds and says the decision must name a catalog pattern or say "no pattern" with a reason

    Examples:
      | decision                 |
      | x                        |
      | the Florble pattern      |
      | d                        |

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

  @audience:operator @usecase:record-fields-match-skill @category:edge @quality:reliability @severity:medium
  Scenario: The validator and the skill ask for the same record fields
    Audit I3: the skill lists 16 fields and the validator requires 14.
    Given the record block in "pattern-selector/SKILL.md"
    And the field list in "always-on/check-task-plan.mjs"
    When the field-list test runs
    Then it passes only when the two lists name the same fields
    And it fails when one field is removed from either list

  @audience:operator @usecase:two-maps-one-glob-list @category:edge @quality:reliability @severity:medium
  Scenario: The edit-time map and the receipt map use the same design-layer globs
    Given the "design-layer" rule in "always-on/routing-rules.config.json"
    And the "design-layer" rule in "judge-arch/assets/skill-receipt.config.json"
    When the glob-list test runs
    Then it passes only when the two glob lists are equal
    And it fails when one glob is removed from either map

  @audience:operator @usecase:receipt-forces-pattern-selector @category:negative @quality:functional @severity:high
  Scenario: A PR receipt cannot mark pattern-selector not-applicable for a design-layer change
    Given a PR whose changed files include "src/repositories/orders.ts"
    And its receipt marks "pattern-selector" not-applicable
    And the receipt carries no operator waiver for "pattern-selector"
    When the receipt is checked with the changed-file list
    Then the receipt check fails and names the "design-layer" coupling rule

  @audience:operator @usecase:receipt-waiver-frees-design-layer @category:permission @quality:security @severity:medium
  Scenario: An operator waiver in the receipt frees pattern-selector, the same as at edit time
    Given a PR whose changed files include "src/repositories/orders.ts"
    And its receipt marks "pattern-selector" not-applicable
    And the receipt carries an operator waiver for "pattern-selector" that names who waived it and why
    When the receipt is checked with the changed-file list
    Then the receipt check passes

  @audience:operator @usecase:design-layer-rule-discriminates @category:adverse @quality:reliability @severity:high
  Scenario: The routing test fails if the design-layer rule is removed
    Given a copy of the routing map without the "design-layer" rule
    When the design-layer routing tests run against that copy
    Then they fail

  @audience:agent @usecase:kit-verify-named @category:negative @quality:reliability @severity:medium
  Scenario: A decision for a pattern with a kit proof must name that proof
    Work package 9, R9.7.
    Given the prove-it kit has a rule for "Repository"
    And a complete pattern decision whose decision is "Repository (322)"
    And its verify field does not name the kit rule
    When the plan is checked
    Then the check holds and names the kit rule the verify field must use
