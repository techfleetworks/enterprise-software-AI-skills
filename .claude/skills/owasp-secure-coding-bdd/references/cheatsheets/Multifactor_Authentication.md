# Multifactor Authentication

## What it is

How to require a second, independent proof of identity so a stolen or guessed password alone cannot take over an
account, and how to pick, store, reset, and defend those factors without opening new holes. This is the per-sheet
guidance from the OWASP Multifactor Authentication Cheat Sheet, condensed to the controls that hold and the attack
they stop.

## The attack it stops

Most accounts fall because of weak, reused, or breached passwords: attackers replay credential lists, spray common
passwords, or phish them. The sheet cites Microsoft analysis that MFA would have blocked about 99.9% of those
account compromises, because a password by itself is no longer enough. A plain example: someone logs in from a
trusted device in the usual place and sails through, but the same credentials used from a new country over a Tor exit
node trigger a second-factor prompt or an account lock, so a thief with only the password is stopped. MFA also has to
resist attacks aimed at the second factor itself, such as push-prompt bombing, reverse-proxy phishing, and SIM swaps.

## Controls

In the cheat sheet's order:

1. **Use independent factors.** Combine two different categories (something you know, have, or are). Two of the same
   kind (password plus PIN) is not MFA, and the factors must not fall to one attack. Any MFA beats no MFA.
2. **Quick recommendations.** Require some MFA for everyone, offer TOTP as a self-serve option, require MFA for
   admins and other high-privilege users, build a secure MFA reset, and consider MFA as a service.
3. **When to require MFA.** Always at login, and also for sensitive actions: changing the password or security
   questions, changing the account email, disabling MFA, or elevating to an admin session. Cover every login path,
   including separate APIs and mobile apps.
4. **OTP handling and storage.** Give one-time codes a short TTL, make them single-use, cap verification attempts,
   and invalidate the code once it verifies. Do not log OTP values or keep them in long-term plaintext. Generate them
   with a cryptographically secure RNG, prefer 8 or more digits where usable, and on resend issue a fresh code that
   overwrites the old one.
5. **Hashing OTPs.** Still hash stored OTPs, not for offline-cracking resistance (the keyspace is tiny) but to avoid
   plaintext in logs and reduce exposure if the database leaks during the short validity window.
6. **Risk-based authentication.** Reduce prompt fatigue by requiring MFA mainly for higher-risk events, such as a new
   device, a new or high-risk location, or a login outside normal context, using signals like corporate IP ranges or
   geolocation.
7. **Passkeys as MFA.** Passkeys give phishing-resistant MFA by pairing possession of the private key with local PIN
   or biometric verification. Require user verification and check the returned UV flag on the server; user presence
   (a touch) alone is not a second factor.
8. **Failed second-factor attempts.** Offer another MFA method, allow an MFA reset, and notify the user (time,
   browser, location) and suggest a password change if they do not recognize it.
9. **Resetting MFA.** Provide recovery that does not become a bypass. Options include single-use recovery codes
   issued at setup, enrolling multiple factor types, a mailed one-time code, a rigorous support-desk identity check,
   or vouching by a trusted user; weigh each against the application's risk.
10. **Changing MFA factors.** Reauthenticate with an existing enrolled factor first, do not rely on the session alone
    (it may be hijacked), treat replacement as high-risk with risk-based checks, notify the user out of band, and
    consider delays or step-up for high-value accounts.
11. **Third-party MFA service.** It can help teams without the resources to build MFA, but a compromise of that
    service could bypass MFA everywhere it is used, so weigh that dependency.
12. **Something you know.** Passwords and PINs: simple and universal, but weak, reused, and phishable. Security
    questions are no longer an acceptable factor (NIST); do not use them.
13. **Something you have.** Hardware OTP tokens (hard to compromise remotely, but costly and phishable), software
    TOTP apps (cheap and common, follow RFC 6238's 30-second default, but the device can be compromised and seeds
    stored insecurely), U2F hardware tokens (phishing-resistant, the private key never leaves the token), client
    certificates (phishing-resistant, centrally revocable, but need a PKI), and smart cards (PIN-locked, need a PKI
    and a reader).
14. **SMS and phone calls (restricted).** NIST labels SMS and voice codes restricted, since SS7 interception,
    SIM-swap, and number-porting attacks undermine them. Do not use them for high-value or PII-handling apps; where
    they are the only option, document the risk, rate-limit per account, watch for signs of a SIM swap, and map out a
    move to TOTP, push approval, or WebAuthn/FIDO2.
15. **Email as a factor.** Weak, because it usually just reproves the email password (often the same as the app
    password) and gives no protection if the mailbox is already compromised.
16. **Something you are.** Biometrics (fingerprint, face, iris, voice) are hard to spoof and fast, but need hardware,
    raise privacy concerns, and cannot be changed if compromised.
17. **Somewhere you are.** Location, source IP, and geolocation are risk signals or access restrictions only, never
    an independent factor; a password plus a trusted IP is not MFA.
18. **Something you do.** Behavioral biometrics (keystroke or mouse dynamics, gait, behavioral profiling) count as a
    weak form of "something you are," useful for risk decisions and continuous checks but not a standalone factor.
19. **Adaptive authentication.** Adjust requirements by context (geolocation and IP reputation, device fingerprint,
    time of access, behavioral signals, known-compromised credentials); on elevated risk, prompt for another factor,
    force re-authentication, or deny and alert. Ensure signals cannot be spoofed and fallbacks are not weaker than
    the primary method.
20. **Defend MFA-specific attacks.** Prefer phishing-resistant authenticators (FIDO2/WebAuthn) as the primary
    control. Against push bombing (MFA fatigue), require number matching, rate-limit prompts, and monitor for
    anomalies. Against reverse-proxy phishing, prefer origin-bound authenticators and watch for impossible travel or
    sudden MFA changes. Against SIM swap, prefer TOTP or WebAuthn over SMS and watch for number changes. Against
    device-binding bypass, prefer hardware-backed non-exportable keys and validate attestation where required. Against
    downgrade, disable legacy protocols and block fallback from strong to weak factors unless policy documents it.

## @security scenario

```gherkin
@security @owasp:mfa @usecase:second-factor-required
Scenario: A correct password alone does not grant access
  Given a user account with MFA enabled
  When an attacker submits the correct password but no valid second factor
  Then no authenticated session is created and access is denied
  And a one-time code is single-use, attempt-limited, and invalidated once it verifies, so it cannot be replayed or guessed
```

This scenario is the canonical copy. When you apply this sheet to real code, add it to the repo's shared
feature-file index (see `bdd-comprehensive-testing`, "Storing BDD scenarios permanently") and wire it into CI
(its "CI/CD wiring") so it runs as a blocking autotest in the same place as every other Gherkin scenario.

## The real guarantee

What actually stops a stolen-password takeover is the requirement for a second, independent factor that the same
attack cannot reach, so the password alone never completes the login. The `@security` scenario proves one password-
only attempt is refused; the enforced second-factor requirement is what refuses every such attempt. A test is a
check; the independent factor is the guarantee. For the strongest form, choose a phishing-resistant authenticator
(FIDO2/WebAuthn) bound to the origin, so even a credential relayed through a fake login page cannot be reused.

## Sources

- OWASP Multifactor Authentication Cheat Sheet (<https://cheatsheetseries.owasp.org/cheatsheets/Multifactor_Authentication_Cheat_Sheet.html>, retrieved 2026-10-11): the factor categories and their trade-offs, OTP handling and hashing, when to require MFA, reset and factor-change rules, the restricted status of SMS and email, location as a non-factor, and the MFA attack patterns with mitigations (fatigue, reverse-proxy phishing, SIM swap, device-binding bypass, downgrade). `[documented]`
