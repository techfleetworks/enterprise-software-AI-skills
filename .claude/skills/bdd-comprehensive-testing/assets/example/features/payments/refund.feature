Feature: Refund a completed order

  @audience:customer @usecase:refund-happy-path @category:happy @quality:functional @severity:high
  Scenario: Customer refunds an eligible order
    Given a signed-in customer with a completed, refund-eligible order
    When they request a full refund
    Then the refund is accepted and the order shows "Refunded"

  @audience:customer @usecase:refund-ineligible @category:negative @quality:functional @severity:high
  Scenario: Customer cannot refund an order past the refund window
    Given a signed-in customer whose order is past the refund window
    When they request a refund
    Then the request is rejected with a clear "past refund window" message
    And no refund is issued

  @audience:guest @usecase:refund-permission-denied @category:permission @quality:security @severity:critical
  Scenario: A guest cannot refund any order
    Given an anonymous visitor
    When they call the refund endpoint for any order
    Then the response is 404 and no refund is issued

  @audience:customer @usecase:refund-double-submit @category:concurrency @quality:reliability @severity:critical
  Scenario: A double-submitted refund is only applied once
    Given a signed-in customer refunding an eligible order
    When they submit the same refund request twice concurrently
    Then exactly one refund is issued
    And the second request is rejected or de-duplicated

  @audience:admin @usecase:refund-failure @category:error @quality:reliability @severity:critical
  Scenario: Admin refund surfaces a downstream payment failure
    Given an admin issuing a refund
    And the payment processor is returning errors
    When they submit the refund
    Then they see a clear failure message and the order stays "Completed"
    And the failure is recorded for retry
