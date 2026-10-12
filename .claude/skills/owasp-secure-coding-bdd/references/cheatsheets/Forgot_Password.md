# Forgot Password

## What it is

How to build a password reset flow that does not leak which accounts exist and does not let an attacker take over
an account through the reset path. This is the per-sheet guidance from the OWASP Forgot Password Cheat Sheet,
condensed to the controls that hold and the attack they stop.

## The attack it stops

A sloppy reset flow usually leaks account existence. If the page says "no such user" for one address and "we sent
you an email" for another, an attacker can walk a list of addresses and learn which ones are real, which is the
user enumeration attack. A different timing for the two cases leaks the same fact even when the words match. A
second class of attack targets the reset token itself: if the token is short, guessable, reusable, or never
expires, an attacker can forge or brute-force it and set a new password on an account they do not own. The reset
link can also be poisoned through the `Host` header so the email points at an attacker domain.

## Controls

In the order the cheat sheet gives them:

1. **Reply the same way for every address.** Show one message whether or not the account exists, so the response
   never confirms an account.
2. **Keep the response time uniform.** Make the existing and non-existing paths take the same amount of time (for
   example with async work or shared logic), so timing does not leak which accounts are real.
3. **Throttle reset requests.** Rate-limit per account, add a CAPTCHA, or use similar controls so an attacker
   cannot fire thousands of resets per hour and flood the user's inbox or SMS.
4. **Keep the rest of the flow secure.** Apply the usual input validation and SQL injection defenses on the reset
   endpoints.
5. **Send the reset path over a side channel**, such as email or SMS, rather than showing it on the page.
6. **Prefer URL tokens** as the simplest, fastest method; PINs sent by SMS, offline identifiers, and security
   questions are the other options, and methods can be combined for higher assurance. Always leave the user some
   route to recover, even if that means contacting support and proving identity.
7. **Generate every token or code safely.** Use a cryptographically secure random generator, make it long enough
   to resist brute force, tie it to one user in the database, invalidate it after a single use, give it a short
   expiry, and store it securely (the lifetime rule does not apply to offline identifiers). JWTs may stand in for
   random tokens but carry their own risks.
8. **Harden the URL token path.** Do not trust the `Host` header when building the link (hard-code the domain or
   check it against a trusted list) to block host header injection, serve the link over HTTPS, set
   `Referrer-Policy: no-referrer` on the reset page to stop referrer leakage, and rate-limit token submission.
9. **Change nothing until a valid token arrives.** Do not lock the account or alter anything on the request
   alone, or the reset flow becomes a denial-of-service tool.
10. **Finish the reset safely.** Have the user type the new password twice, enforce the same password policy used
    everywhere else, store it with the secure hashing practices, and email the user that the password changed
    (never put the password in the email).
11. **Do not auto-login after reset.** Send the user to the normal login, which keeps the session code simple and
    avoids new bugs. Offer to end all existing sessions, or end them automatically.
12. **Recover a suspected-compromised account carefully.** Do not trust recently added recovery info, do not auto
    restore superseded addresses or phone numbers, suspend compromised authenticators, review recovery settings
    and MFA with the verified owner, kill existing sessions and outstanding reset links after recovery, and tell
    the user through every registered channel with instructions for reporting fraud.
13. **Do not lock accounts over forgotten-password traffic**, since that lets an attacker deny service to anyone
    whose username they know. Security questions, if used at all, are only an extra layer, never the sole check.

## @security scenario

```gherkin
@security @owasp:forgot-password @usecase:account-enumeration
Scenario: The reset request reveals nothing about whether an account exists
  Given a forgot-password endpoint
  When an attacker submits a known-registered address and then an address with no account
  Then both requests return the same message
  And both requests take the same amount of time within a small tolerance
  And no account is locked or changed until a valid single-use token is presented
```

This scenario is the canonical copy. When you apply this sheet to real code, add it to the repo's shared
feature-file index (see `bdd-comprehensive-testing`, "Storing BDD scenarios permanently") and wire it into CI
(its "CI/CD wiring") so it runs as a blocking autotest in the same place as every other Gherkin scenario.

## The real guarantee

The thing that actually stops enumeration is a response, and a response time, that are identical for every
address: with no observable difference, there is nothing for the attacker to read. The thing that actually stops
token takeover is a token that is cryptographically random, single-use, short-lived, and bound to one user, so a
guessed or replayed value never works. The `@security` scenario checks one pair of requests; the uniform response
and the one-time token are what make every request safe. A test is a check; the indistinguishable response and
the single-use token are the guarantee.

## Sources

- OWASP Forgot Password Cheat Sheet (<https://cheatsheetseries.owasp.org/cheatsheets/Forgot_Password_Cheat_Sheet.html>, retrieved 2026-10-11): the consistent-message and uniform-timing rules, the reset methods (URL tokens, PINs, offline, security questions), token generation and handling practices, host header and referrer hardening, the post-reset steps, compromised-account recovery, and the no-lockout rule. `[documented]`
