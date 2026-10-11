# Third Party Payment Gateway Integration

## What it is

How to connect your checkout to an outside payment provider without letting a shopper tamper with what they pay or trick you into shipping unpaid orders. This is the per-sheet guidance from the OWASP Secure Integration of Third-Party Payment Gateways Cheat Sheet, condensed to the controls that hold and the attacks they stop. Done right, the gateway handles the card data and shrinks your PCI DSS scope; done wrong, it opens the door to payment spoofing and order fraud.

## The attack it stops

The flow has steps the attacker controls: the cart they submit, the page they get redirected back from, and the parameters on that return. If your backend trusts any of those, a shopper can lower a price before the order is created, flip their own order to "paid" by crafting the return URL, or replay a single real callback so one payment ships many times. A spoofed or unauthenticated callback can mark an order paid with no money ever moving. Server-side validation, signed server-to-server confirmation, and idempotent fulfillment are what close these holes.

## Controls

1. **Validate the cart on the server.** Recheck every product ID, price, and discount against trusted backend data, and recompute the order total yourself before creating the transaction. Never accept amounts sent from the browser.
2. **Confirm payment with the gateway's API, not the redirect.** Treat the user's return and its parameters as untrusted. Before you fulfill, call the gateway server-side and confirm the real payment state.
3. **Match the specifics.** Check that the confirmed amount, currency, and order ID are exactly what you expected for that order.
4. **Verify callback authenticity.** Accept server-to-server notifications only when they prove they came from the gateway, for example a valid HMAC signature or a shared secret token. Only these server-to-server callbacks should drive verification and fulfillment.
5. **Make fulfillment idempotent.** Record processed events and act on an order once, no matter how many callbacks arrive, to defeat replays and races from duplicate or out-of-order delivery.
6. **Handle late and retried callbacks.** Gateways retry and can deliver out of order, so keep checkout expiry separate from signature freshness; reconcile a late notification against current payment state instead of dropping it because the checkout timed out.
7. **Log and monitor the whole flow.** Record each initiation, redirect, and callback with timestamp and IP, and log callback IDs, validation results, and the matching order. Alert on red flags such as an order marked paid with no gateway confirmation, excessive callbacks for one order, or repeated retries with identical data. Add fraud and risk scoring to catch carding.
8. **Keep sensitive data out of logs and storage.** Log correlation data, not raw headers or bodies, and exclude credentials and unneeded personal or payment data. Never retain card verification codes or PIN data after authorization, even encrypted; restrict and time-bound any investigation records.

## @security scenario

```gherkin
@security @owasp:payment-gateway @usecase:spoofed-callback-fulfillment
Scenario: A forged payment callback does not fulfill an order
  Given a checkout that fulfills orders only after payment confirmation
  When an attacker posts a callback claiming an order is paid without a valid gateway signature
  Then the callback is rejected and the order stays unfulfilled
  And fulfillment happens only after a server-side check with the gateway confirms the amount, currency, and order ID
  And a replayed valid callback fulfills the order at most once
```

This scenario is the canonical copy. When you apply this sheet to real code, add it to the repo's shared feature-file index (see `bdd-comprehensive-testing`, "Storing BDD scenarios permanently") and wire it into CI (its "CI/CD wiring") so it runs as a blocking autotest in the same place as every other Gherkin scenario.

## The real guarantee

What actually stops payment fraud is that fulfillment depends on a signed, server-side confirmation from the gateway and runs at most once per order, so nothing the shopper controls can forge or repeat it. The `@security` scenario proves one spoofed and one replayed callback are rejected; the server-side verification and idempotent fulfillment are what make every forged or duplicated callback harmless. A test is a check; the verified, once-only fulfillment is the guarantee.

## Sources

- OWASP Secure Integration of Third-Party Payment Gateways Cheat Sheet (<https://cheatsheetseries.owasp.org/cheatsheets/Third_Party_Payment_Gateway_Integration_Cheat_Sheet.html>, retrieved 2026-10-11): the server-side cart validation, gateway-API payment verification, callback authenticity and idempotency rules, late-callback reconciliation, and the logging and sensitive-data exclusion guidance. `[documented]`
