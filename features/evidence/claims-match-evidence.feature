Feature: Claims of "fixed", "clean" and "done" match the evidence behind them
  A check that cannot fail must not report a pass, a defect is not "fixed" until undoing the fix turns a test
  red, and a report to the operator keeps its evidence words when it is made simple. Source: audit of one
  private agent session, 2026-10-26 (Findings 4 to 6).

  @audience:agent @usecase:regression-diff-must-be-able-to-fail @category:negative @quality:reliability @severity:critical
  Scenario: A before-and-after comparison that reads a missing field cannot report "0 new failures"
    Finding 4: the side-effect script read "ok" and "passed" fields that no gate record had, so its new-failure list could never be non-empty.
    Given a comparison script reads a status field that is absent from every gate record
    When it compares the base build with the changed build
    Then it stops with an error naming the missing field
    And it does not print a count of new failures

  @audience:agent @usecase:new-failure-inside-red-gate @category:edge @quality:reliability @severity:critical
  Scenario: A new problem inside a gate that was already failing is reported as new
    Finding 4: one gate failing in both builds went from 420 to 430 problems, and the check said "clean".
    Given a gate fails on the base build with 420 problems
    And the same gate fails on the changed build with 430 problems
    When the agent checks the change for side effects
    Then the 10 extra problems are reported as new failures
    And the change is not called clean until they are explained or fixed
