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

  @audience:agent @usecase:fixed-needs-red-on-revert @category:negative @quality:reliability @severity:critical
  Scenario: A defect is not marked fixed until undoing the fix turns a committed test red
    Finding 5: a harm-critical fix was marked "fixed + verified" while reverting it left the harm-gate test green (found by the auditor session).
    Given the agent changed code to fix a reported defect
    And no committed test fails when that change is reverted
    When the agent marks the defect "fixed"
    Then the mark is refused
    And the agent is told to add a test that fails on the reverted code

  @audience:agent @usecase:green-suite-must-cover-the-claim @category:edge @quality:reliability @severity:high
  Scenario: A passing test suite does not prove a behavior the suite never tests
    Finding 4: the auditor session found the year test suite passing (75 cases) while "What year?" returned UNKNOWN after an event given with a full day, month and year.
    Given the agent claims year answers work
    And no case in the passing suite uses an event noun with a full day-month-year date
    When the agent reports the claim
    Then the claim names the cases that cover it
    And the uncovered shape is listed as not checked

  @audience:agent @usecase:unexplained-pass-attributed @category:negative @quality:reliability @severity:high
  Scenario: A test that turns green without a targeted change is explained before it counts
    Finding 6: a failing test "fixed incidentally" was only proven after the operator pushed back.
    Given a test that failed before the change now passes
    And no edit in the change was aimed at that test's behavior
    When the agent reports the test as fixed
    Then it must first revert each edit in turn and name the one that turns the test red again

  @audience:operator @usecase:review-findings-acted-on @category:adverse @quality:reliability @severity:high
  Scenario: A HIGH review finding is fixed or waived before the work is called done
    Finding 6: the operator had to ask why confirmed HIGH findings were not being fixed.
    Given a fresh-context review returned 1 HIGH finding
    And the finding is neither fixed nor waived by the operator
    When the agent calls the work done
    Then the work is not marked done
    And the open HIGH finding is shown to the operator
