# Business Logic Security

## What it is

Business logic security is about stopping abuse that comes not from malformed input but from the app doing
exactly what it was told, when what it was told does not match what the business needs. A user pays a negative
price, skips a required step, redeems a coupon twice, or slips a second request past the server's bookkeeping
before it updates, all with perfectly valid input. Generic scanners miss these flaws because they do not know the intended workflow.
This is the per-sheet guidance from the OWASP Business Logic Security Cheat Sheet, condensed to the controls
that hold and the attack they stop.

## The attack it stops

The clearest example is a checkout that trusts a price sent by the browser. Every field passes validation: the
product exists, the quantity is a positive whole number, the coupon matches the right pattern. Nothing technical
is broken, yet the server builds the total from the client's price field instead of its own records, so a
shopper buys a television for a cent. The same class of bug lets a user approve their own expense report, drain
a balance with two simultaneous withdrawals, or claim a one-per-person signup bonus a hundred times from a
hundred throwaway accounts.

## Controls

In the cheat sheet's order:
1. **Re-derive every security-relevant value on the server.** If a request field influences price, access,
   ownership, or state, treat it as a guess from the client and recompute it from trusted data.
   - Prices, totals, tax, shipping, and discounts: accept only product ids, quantities, and a coupon code, then
     compute money server-side. Never accept a price, a "discounted total", or a shipping-cost field.
   - Permissions and ownership: confirm on every request that this user may act on this object right now.
     Checking once at load time and trusting later requests is the common mistake.
   - Identity and role: take the acting user from the session or token, never from a body field. Only accept a
     user id, tenant id, or role in the body for an explicit admin action, and validate it against what that
     caller may manage.
2. **Enforce multi-step workflows as explicit server-side state machines.**
   - Store the workflow state on the server, keyed to the user or session, and validate each transition against
     the current state. Reject a step that does not match the state, and run terminal actions (submit order,
     approve, transfer) only in the exact required state.
   - Do not keep the "current step" in a hidden field or a client-readable cookie; the client can set those to
     anything.
   - Reject replays of finished steps. Mark one-time operations (signup bonus, coupon redemption, voucher claim,
     referral reward) done in durable storage and fail repeats.
   - Expire partial states. Give paused workflows a deadline and make the user restart once it passes.
3. **Make every check-then-act operation atomic.**
   - Find the critical sections shaped "check a condition, then act": check balance then debit, check a coupon
     unused then record it, check a slot free then book it, check a registration unique then insert.
   - Use a database transaction with the right isolation: a `SERIALIZABLE` transaction, an explicit row lock
     (`SELECT ... FOR UPDATE`), or a conditional update (`UPDATE ... WHERE balance >= amount`) whose
     affected-row count you check.
   - For external actions like charging a card, use the provider's idempotency mechanism, scope your own keys to
     the caller and operation, bind them to the original parameters, reject reuse with changed parameters,
     authorize before returning a cached result, and keep durable state for retries and recovery. On its own, a
     local database transaction cannot wrap an external side effect and the record of its outcome in one atomic
     unit.
   - Do not assume the race window is "too fast to hit". Tools fire many requests within a millisecond, and
     HTTP/2 multiplexing lands them together.
4. **Give abuse-friendly features their own controls.** Referrals, promo codes, signup credits, free trials,
   password reset, or anything that emails users or calls out to other services dispenses value and attracts
   abuse.
   - Rate-limit per feature, not just at the edge or at login.
   - Use identity signals stronger than email, such as device or payment-method fingerprints, phone
     verification, or KYC.
   - Keep audit trails on every value-dispensing action (triggering user, target, IP, timestamp).
   - Set maximums at every layer: per action, per account, and per source (device or payment method).
   - Make value-giving actions cost more than harmless ones, for example a short delay or a CAPTCHA, which barely
     touches a real user but taxes an automated abuser.
   - Watch for multi-accounting, self-referral, coupon stacking, free-trial resets, resource exhaustion, and
     account-existence leaks from differing reset messages.
5. **Threat model the business process itself, not only the technical design.**
   - Walk each feature step by step and ask which of the system's assumptions would help the user if they were
     false; that is where bugs live. Ask whether steps can run out of order, be skipped, or repeated, and
     whether two sessions can act on one object at once.
   - Run the "dishonest user" exercise: imagine someone using the feature exactly as built but in an order or
     volume nobody planned, to extract maximum value.
   - Write each invariant in plain English ("a coupon is good for one use per user", "a balance can never go
     negative") and name the exact code that enforces it. If the honest answer is "the interface stops them" or
     "nobody would bother", then nothing enforces it.
6. **Authorize at the business-logic layer, not just the auth layer.** Authentication and role checks are
   necessary but not enough.
   - Do contextual checks: ask whether this user may take this action on this particular object, given its
     current state, at this moment. A manager approves expense reports but not their own; a user cancels an order
     but not after it ships.
   - Avoid implicit permissions. Link each sensitive operation to all the entry points that can reach it (new
     API versions, internal tools, webhooks) and apply the same rules at each one.
7. **Validate inputs for business meaning, not only format.**
   - Check ranges: a quantity no more than stock, a date in an allowed window, an amount within account and
     regulatory limits.
   - Check combinations: individually valid fields can be jointly invalid, like a check-out before the check-in,
     or a transfer between accounts the user cannot both act on. Unit-test these.
   - Do not trust hidden, disabled, JavaScript-set, or round-tripped fields; every field in a request is
     attacker-controlled.
8. **Log and alert on value-changing operations.**
   - Log the user, target, action, outcome, request context (IP, user agent, correlation id), and business
     context (price computed, coupon applied, new state), kept tamper-evident and apart from general logs.
   - Alert on anomalous rates: many signups from one IP or device, repeated reset failures, spikes in
     redemptions or credits, bursts from one user, or workflows finishing faster than a human could. Simple
     per-user, per-IP, per-device thresholds catch most automated abuse.
   - Close the loop: every detection should both resolve the incident and tighten the control that should have
     stopped it.
9. **Test the rules, not just the happy path.** For each invariant, write a test that fails if it is violated.
   Race concurrent requests and assert the end state stays consistent. Attempt to skip, repeat, and reorder
   workflow steps and expect rejection. Test with an adversarial mindset, from the misuse the feature was not
   designed for.

## @security scenario

```gherkin
@security @owasp:business-logic @usecase:server-side-price
Scenario: The server ignores a client-supplied price at checkout
  Given a product with a server-side price
  And a shopper submits a checkout request
  When the request includes a price field set to one cent
  Then the server computes the total from its own records and ignores the submitted price
  And the order total matches the real catalog price, not the client value
```

This scenario is the canonical copy. When you apply this sheet to real code, add it to the repo's shared
feature-file index (see `bdd-comprehensive-testing`, "Storing BDD scenarios permanently") and wire it into CI
(its "CI/CD wiring") so it runs as a blocking autotest in the same place as every other Gherkin scenario.

## The real guarantee

What actually holds the line on business logic is the server owning every value that matters (price, ownership,
identity, state), running each check-then-act step atomically, and enforcing the workflow order itself rather
than trusting the UI. The `@security` scenario proves one checkout ignores a forged price; the server-side
recomputation is what makes every forged value safe, just as a row lock makes every race safe and a state
machine makes every skipped step fail. A test is a check; the server-side rule, enforced where the code owns it,
is the guarantee.

## Sources

- OWASP Business Logic Security Cheat Sheet (<https://cheatsheetseries.owasp.org/cheatsheets/Business_Logic_Security_Cheat_Sheet.html>, retrieved 2026-10-11): the controls for server-side re-derivation, explicit workflow state machines, atomic check-then-act operations, abuse-friendly feature protection, business-process threat modeling, contextual authorization, business-meaning input validation, observability, and testing. `[documented]`
