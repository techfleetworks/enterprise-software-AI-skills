# Authentication

## What it is

How to confirm that whoever is logging in is really the account owner, and how to do it without handing attackers
a way to guess credentials, enumerate users, or ride a stolen session. This is the per-sheet guidance from the
OWASP Authentication Cheat Sheet, condensed to the controls that hold and the attack they stop.

## The attack it stops

Password-backed login is the front door attackers pound on: they replay breached credential lists (credential
stuffing), spray one common password across many accounts, or brute-force a single account. They also probe login,
reset, and signup responses to learn which usernames are real, then focus the guessing there. The cheat sheet gives
a concrete leak: a login that checks whether the user exists first and only then hashes and compares the password
answers faster for an unknown user than for a real user with a wrong password, so the response time alone tells the
attacker which usernames exist. Generic responses, per-account lockout, MFA, and TLS together close those paths.

## Controls

In the cheat sheet's order:

1. **User IDs.** Generate the internal identifier randomly so it is not sequential or guessable from outside.
2. **Usernames.** Let people sign in with a verified email address or with a separate username of their choice.
3. **Sensitive accounts.** Never let backend, middleware, or database accounts log in through any front-end UI, and
   do not reuse the internal identity provider for public or DMZ access.
4. **Password strength.** Set a minimum length (treat under 8 characters as weak with MFA on, under 15 without MFA),
   allow at least 64 characters so passphrases fit, and never silently cut a password short. Accept every character
   including unicode and spaces, and impose no composition rules. Do not force periodic resets; rotate only on a
   known leak or compromise. Offer a strength meter (for example `zxcvbn`) and reject common or already-breached
   passwords (for example by checking the Pwned Passwords list).
5. **Secure password recovery.** Build the forgot-password flow per the Forgot Password Cheat Sheet.
6. **Secure storage.** Store password hashes per the Password Storage Cheat Sheet.
7. **Safe hash comparison.** Compare the supplied password against the stored hash with a vetted function (such as
   `password_verify()`); if you must hand-roll it, cap the input length, fix the type of both operands to block type
   confusion, and return in constant time to defeat timing attacks.
8. **Change-password feature.** Require an active authenticated session and re-verify the current password before the
   change, so someone on a forgotten open session cannot reset it.
9. **Transport.** Serve the login page and every authenticated page over TLS or equally strong transport only.
10. **Re-authentication for sensitive features.** Ask for current credentials again before changing the password or
    email, or before high-risk transactions, to blunt CSRF, XSS, and hijacked sessions.
11. **Re-authentication after risk events.** Re-prompt after suspicious activity, account recovery, or critical
    actions. Use adaptive checks, MFA, or an authenticator already bound to the account (current password or passkey);
    do not accept security questions. Invalidate and rotate sessions after re-authenticating.
12. **Strong transaction authentication.** Add a second factor for sensitive operations where warranted.
13. **TLS client authentication.** Where a single trusted device is acceptable, mutual TLS certificates can
    authenticate the client, ideally alongside a password.
14. **Generic error messages.** Return the same response for a wrong password, a missing account, and a locked
    account, across login, reset, and signup, and keep the HTTP status code the same too, so nothing leaks which
    accounts exist. Run the same work (hash then compare) on every path so timing does not become a tell.
15. **Protect against automated attacks.** Prefer MFA as the strongest defense. Add login throttling and per-account
    lockout (count failures against the account, not the IP; tune threshold, observation window, and duration, and
    consider exponential backoff), optionally a CAPTCHA after a few failures, and avoid lockout-driven denial of
    service by allowing recovery. Do not use security questions.
16. **Logging and monitoring.** Log and review authentication failures, password failures, and account lockouts in
    real time.
17. **Passwordless protocols.** For delegated or federated access use OAuth 2.0/2.1 (authorization), OpenID Connect
    (authentication: validate the ID token issuer, audience, signature, and expiry; link a federated identity by
    `iss` plus `sub`, never `email` alone, and only from an authenticated session), SAML, or FIDO (UAF, U2F, and
    FIDO2/WebAuthn, the basis of passkeys). Do not assume authenticator keys are hardware-backed or non-exportable
    unless you verify it.
18. **Password managers.** Use standard HTML form fields with the right `type`, avoid plugin-based login, allow at
    least 64 characters, allow all printable characters, allow paste into username, password, and MFA fields, and
    allow `Tab` between fields.
19. **Changing a registered email.** Confirm the session, store the new address as pending, and send both a
    notification to the old address and a confirmation to the new one via time-limited nonces; with MFA on, verify
    MFA, otherwise verify the current password as an extra step.
20. **Adaptive or risk-based authentication.** Use device fingerprint, IP, and remembered-device cookies as risk
    signals only, never as a stand-in for authentication; require a valid authenticated session before exposing
    private account data.

## @security scenario

```gherkin
@security @owasp:authentication @usecase:user-enumeration-resistance
Scenario: Login responses do not reveal which accounts exist
  Given a login endpoint with one real account and one username that was never registered
  When an attacker submits a wrong password for the real account and any password for the unknown username
  Then both attempts return the same generic "invalid username or password" message
  And both return the same HTTP status code
  And both run the full hash-and-compare path so the response times do not differ in a usable way
```

This scenario is the canonical copy. When you apply this sheet to real code, add it to the repo's shared
feature-file index (see `bdd-comprehensive-testing`, "Storing BDD scenarios permanently") and wire it into CI
(its "CI/CD wiring") so it runs as a blocking autotest in the same place as every other Gherkin scenario.

## The real guarantee

What actually stops user enumeration is removing the discrepancy: the login path returns the same message, the same
status code, and the same timing whether the account exists or not, so there is no signal left to measure. The
`@security` scenario proves one real-versus-unknown pair matches; the uniform response path is what makes every pair
match. A test is a check; the identical response path is the guarantee. Brute force and stuffing are then held by
per-account lockout and MFA, which make guessing at scale infeasible even once an attacker has a valid username.

## Sources

- OWASP Authentication Cheat Sheet (<https://cheatsheetseries.owasp.org/cheatsheets/Authentication_Cheat_Sheet.html>, retrieved 2026-10-11): the full control set above (password strength limits, safe hash comparison, generic error messages and the quick-exit timing example, automated-attack defenses, passwordless protocols, password-manager rules, email-change process, and risk-based authentication). `[documented]`
