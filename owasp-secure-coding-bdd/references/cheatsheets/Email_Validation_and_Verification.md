# Email Validation and Verification

## What it is

How to handle an email address when it serves as a login identifier and recovery channel, so that validating, normalizing, and verifying it does not open the door to takeover. This is the per-sheet guidance from the OWASP Email Validation and Verification in Identity Systems Cheat Sheet, condensed to the controls that hold and the attack they stop.

## The attack it stops

Because email often is the account, sloppy handling lets an attacker own or confuse that identity. The source lists the moves: registering an address that normalizes to the same value as a victim's, exploiting inconsistent normalization between flows, abusing password reset, probing which addresses are registered (enumeration), and hijacking an account through its email-change path. A concrete case is homoglyphs: a Cyrillic character that looks like a Latin one produces an address that reads the same to a human but is a different string, which can slip past naive comparison and collide with a real user.

## Controls

The cheat sheet's recommendations, by topic:

1. **Canonicalization.** Pick one normalization policy and apply it everywhere (registration, login, reset, recovery, linking). Lowercase the domain. Do not apply provider-specific tricks such as stripping Gmail dots unless you fully control that behavior. Keep two values: the address as typed (for display and sending) and the canonical form (for comparison). Write the comparison policy down.
2. **Format validation.** Do not lean on strict custom regex, which rejects valid addresses and drifts between flows. Use a well-tested library, accept a wide range of legitimate formats, and turn away only input that is plainly broken.
3. **Unicode and IDN.** Normalize Unicode input and convert internationalized domains to punycode before comparing. Watch for homoglyph lookalikes across scripts, and be extra careful with internationalized local-parts, since systems normalize and compare them differently.
4. **Case sensitivity.** Treat the domain as case-insensitive always. The local-part is technically case-sensitive under SMTP, though many providers ignore that. Keep the original as entered, set an explicit comparison policy for the local-part, and only fold it when your system fully owns the behavior and folding will not cause account collisions.
5. **Ownership verification.** Confirm the address before the account can be used. Send cryptographically secure random tokens that are single-use and time-limited, and do not activate the account until verification completes.
6. **Password reset.** Use single-use, time-limited tokens, invalidate them after use or expiry, rate limit reset requests, and never reveal whether an address exists.
7. **Email change.** Treat changing the address as changing identity: require re-authentication, notify the old address, confirm the new address, and for high-risk systems confirm from both.
8. **Anti-enumeration.** Return identical responses for valid and invalid cases in login and reset, avoid timing differences that leak which case occurred, and add rate limiting and monitoring.
9. **Temporary/disposable email.** Keep a list of known disposable domains if it fits, but favor risk-based handling over hard blocking, and watch for suspicious signup patterns.
10. **Email as a factor.** Treat email as a weak authentication factor. Require MFA for sensitive actions and never rely on email alone to secure an account.
11. **Logging and monitoring.** Log verification attempts and failures, track reset activity, and detect abnormal bursts. Do not log full addresses; mask or pseudonymize them (for example `j***@example.com`). Never log verification or reset tokens or full action URLs, and treat email data in logs as personal data with restricted access.

## @security scenario

```gherkin
@security @owasp:email-validation @usecase:verify-before-activation
Scenario: An account stays inactive until the email is proven owned
  Given a user registers with an email address
  When the account is created but the emailed verification token has not been used
  Then the account cannot be used and its features stay locked
  And only a single-use, time-limited, cryptographically random token completes verification
```

This scenario is the canonical copy. When you apply this sheet to real code, add it to the repo's shared feature-file index (see `bdd-comprehensive-testing`, "Storing BDD scenarios permanently") and wire it into CI (its "CI/CD wiring") so it runs as a blocking autotest in the same place as every other Gherkin scenario.

## The real guarantee

What actually stops someone from claiming an address they do not own is gating account use on a single-use, time-limited, random verification token sent to that address: without reading the mailbox, the token never comes back, so the account never activates. The `@security` scenario proves an unverified account stays locked; the required proof-of-ownership token is what makes the claim impossible. A test is a check; the verification token is the guarantee.

## Sources

- OWASP Email Validation and Verification in Identity Systems Cheat Sheet (<https://cheatsheetseries.owasp.org/cheatsheets/Email_Validation_and_Verification_Cheat_Sheet.html>, retrieved 2026-10-11): canonicalization and comparison policy, library-based format validation, Unicode/IDN and homoglyph handling, case-sensitivity rules, ownership verification and reset/change token rules, anti-enumeration, disposable-email and weak-factor guidance, and logging protections. `[documented]`
