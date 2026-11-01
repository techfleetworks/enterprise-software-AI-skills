Feature: Each PoEAA pattern comes with a ready way to prove it is applied
  Work package 9 of the v1.4 PoEAA program. Fixes audit finding F7. The skill promises that a choice a
  grep can check "becomes proven" in arch-gate, but no shipped rule targets any PoEAA pattern, and the
  catalog's verify lines are sentences with nothing to copy. After v1.4 there is a "prove it" kit: exact
  arch-gate rules for the patterns a grep can check, and a named test shape for the rest. The rules have
  one home, a judge-arch preset (judge-arch/assets/presets/poeaa-patterns/), because judge-arch already
  owns arch-gate presets. Their proof extends the existing check-arch-rules-discriminate harness with
  clean fixtures that must pass, instead of adding a second harness. The catalog links to the preset and
  does not copy the rule text.
  Source: docs/audit/poeaa-2026-11/poeaa-adversarial-audit.md, finding F7.

  @audience:operator @usecase:kit-rule-fires-on-violation @category:negative @quality:reliability @severity:high
  Scenario Outline: Each kit rule fails on a planted violation and passes clean code
    Given the rule "<rule>" in the poeaa-patterns preset
    And a planted fixture "<bad>" that breaks the pattern
    When check-arch-rules-discriminate runs over the preset's fixtures
    Then it reports the rule "<rule>" flagged the file "<bad>"
    And the preset's clean fixture for "<rule>" produces no violation
    And the harness exits 0 only when both hold

    Examples:
      | rule                                              | bad                                |
      | repository: data access only inside repositories  | src/domain/orders/place-order.ts   |
      | data mapper: domain imports no database driver    | src/domain/orders/order.ts         |
      | service layer: no web types in services          | src/services/order-service.ts      |
      | gateway: vendor SDK only inside its gateway       | src/domain/billing/charge.ts       |
      | separated interface: domain imports no infra      | src/domain/orders/order-repo-use.ts |

  @audience:operator @usecase:kit-clean-fixture-array-from @category:edge @quality:reliability @severity:medium
  Scenario: The repository rule does not fire on Array.from
    Review note: the draft rule's ".from(" pattern also matches "Array.from(", a common false positive.
    Given the clean fixture for "repository: data access only inside repositories" calls "Array.from(items)"
    When check-arch-rules-discriminate runs over the preset's fixtures
    Then the clean fixture produces no violation

  @audience:operator @usecase:kit-harness-no-second-runner @category:negative @quality:reliability @severity:medium
  Scenario: The kit adds no second planted-violation runner
    Given the judge-arch scripts folder after WP9
    When the check searches every script under judge-arch/scripts for the text "planted.json"
    Then the only match is check-arch-rules-discriminate.mjs

  @audience:operator @usecase:kit-harness-discriminates @category:negative @quality:reliability @severity:high
  Scenario Outline: The harness fails when a kit rule stops working
    Given the rule "<rule>" in the poeaa-patterns preset is changed to forbid nothing
    When check-arch-rules-discriminate runs over the preset's fixtures
    Then it exits 1
    And it names "<rule>" as the rule that let its planted fixture "<bad>" through

    Examples:
      | rule                                              | bad                                |
      | repository: data access only inside repositories  | src/domain/orders/place-order.ts   |
      | data mapper: domain imports no database driver    | src/domain/orders/order.ts         |
      | service layer: no web types in services          | src/services/order-service.ts      |
      | gateway: vendor SDK only inside its gateway       | src/domain/billing/charge.ts       |
      | separated interface: domain imports no infra      | src/domain/orders/order-repo-use.ts |

  @audience:operator @usecase:kit-rules-load-in-engine @category:error @quality:reliability @severity:high
  Scenario: Every kit rule is valid input for the shipped arch-gate engine
    Given the poeaa-patterns preset config
    When arch-gate loads it with --config
    Then it does not exit 2 for a bad rule
    And every rule uses only the fields "name", "include", "exclude", "forbid" and "message"

  @audience:agent @usecase:verify-field-names-kit-item @category:negative @quality:reliability @severity:high
  Scenario: Every PoEAA entry's verify field names a kit rule or a kit test shape
    Audit F7: verify lines today say what a rule would do, with no rule text to copy.
    Given every catalog entry whose Source cites PoEAA
    When the agent reads its Verify correct application field
    Then the field names a kit rule by its exact name, or a kit test shape by its exact name

  @audience:agent @usecase:kit-test-shapes-listed @category:happy @quality:reliability @severity:medium
  Scenario Outline: Patterns a grep cannot prove have a named test shape
    Given the kit's list of test shapes
    When the agent looks up "<pattern>"
    Then the kit gives a test that <proof>

    Examples:
      | pattern                 | proof                                                                           |
      | Unit of Work            | fails mid-commit and finds zero rows written                                    |
      | Identity Map            | loads one id twice in a session and gets the same instance                      |
      | Optimistic Offline Lock | saves from two sessions on one version and gets a conflict on the second save   |
      | Lazy Load               | counts queries for a list of N rows and finds a fixed number, not N plus 1      |
      | Data Transfer Object    | pins the exact serialized fields of the response                                |
      | Money                   | splits an amount by ratios and finds the parts add up to the whole              |
      | Special Case            | checks each meaning of absent has its own object and behavior                   |

  @audience:operator @usecase:test-strategy-links-kit @category:edge @quality:reliability @severity:medium
  Scenario: The test strategy skill points to the kit
    Audit F7: comprehensive-test-strategy and verifiable-quality-gates have no pattern-specific test guidance.
    Given the comprehensive-test-strategy skill
    When a maintainer reads where pattern-specific tests are described
    Then it links to the pattern-selector "prove it" kit

  @audience:operator @usecase:proven-means-invariant @category:edge @quality:reliability @severity:low
  Scenario: The chooser says what a grep rule proves and what it does not
    A forbid rule proves a forbidden import is absent. It does not prove the pattern was designed well.
    Given the chooser's section on which decisions can be checked by a machine
    When a maintainer reads what "proven" covers
    Then it says an arch-gate rule proves the rule's invariant holds
    And it says judge-arch still reviews whether the pattern was the right choice
