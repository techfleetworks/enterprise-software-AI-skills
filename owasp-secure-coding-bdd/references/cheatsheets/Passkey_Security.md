# Passkey Security

## What it is

How to build the relying-party side of passkeys (discoverable WebAuthn credentials) so that registration,
authentication, credential management, and recovery are all safe, not just the sign-in click. This is the per-sheet
guidance from the OWASP Passkey Security Cheat Sheet, condensed to the controls that hold and the attack they stop.

## The attack it stops

A password or a typed one-time code can be captured on a fake login page and replayed; attackers run reverse-proxy
phishing kits that relay a real-looking login screen and steal whatever the user enters. A passkey defeats that
because the authenticator signs a response bound to the relying-party ID, the web origin, and a one-time challenge,
so a credential coaxed out on a look-alike origin will not verify on the real server. But that protection only holds
if the server checks those bindings, and it does not cover the rest of the account lifecycle: a hijacked session can
still add an attacker's passkey, and a weak email reset can still bypass the passkey entirely. The controls close
both the ceremony and the lifecycle.

## Controls

In the cheat sheet's order:

1. **User presence is not user verification.** Treat UP (someone touched the authenticator) and UV (the authenticator
   locally checked a PIN or biometric) as different properties. For multi-factor or high-assurance use, request UV and
   verify the returned UV flag on the server; a passkey is not automatically multi-factor just because the device can
   do UV.
2. **Know the limits.** Correct verification gives phishing resistance, verifier-name binding, and replay resistance,
   but passkeys do not by themselves stop a compromised session adding a credential, an insecure recovery bypass, a
   credential linked to the wrong account, app or session-management bugs, or compromise of the sync account. Apply
   the Authentication, Session Management, and Transaction Authorization cheat sheets around them.
3. **Choose the RP ID carefully.** Use the narrowest stable domain, not a registrable parent domain shared with
   unrelated subdomains. Use the same expected RP ID in registration and authentication, keep an explicit allowlist of
   permitted origins (scheme, host, port), and never build the expected origin from an untrusted request header.
   Enumerate each native-app origin on its own, and govern the `assetlinks.json` and `apple-app-site-association`
   files under the same change control as the allowlist. Serve all WebAuthn pages over HTTPS and protect them from
   script injection.
4. **Use a maintained library.** Do not hand-write CBOR parsing, COSE key handling, attestation, or assertion
   verification; use a maintained server-side WebAuthn library, keep it updated, and test both passing and failing
   ceremonies. The library does not make the account workflows safe on its own.
5. **Registration: establish an authorized account context.** Handle adding a passkey as a sensitive change. On an
   existing account, insist on a session authenticated moments ago and re-verify the user before enrollment; do not
   lean on a long-lived cookie. On a brand-new account, tie the ceremony to the verified signup transaction and never
   let the client pick the account. Protect the endpoints against CSRF, rate-limit, and log attempts.
6. **Registration: generate and bind options.** Build the challenge from a secure RNG using 16 or more random bytes,
   let it expire quickly, and honor it only once. Tie server-side state to the ceremony type, to the session and the
   account it is for, to the RP ID and origin rules you expect, to the UV and attestation policy, and to an expiry. Do
   not reuse an
   authentication challenge for registration or cross an account boundary. Generate an opaque user handle with no PII
   that maps to exactly one account and is never reassigned. Put existing credential IDs in `excludeCredentials`, but
   still enforce uniqueness server-side.
7. **Registration: verify the response.** Through the library, confirm the client data type is `webauthn.create`, the
   challenge matches the issued one, the origin is an exact allowlist member, the RP ID hash matches, UP is set and UV
   is set when required, the algorithm is one you offered, the public key and credential ID are valid, extensions are
   handled per policy, and attestation is verified when policy requires it. Store the credential only after every
   check passes, associate it with the server-side account (never a client-supplied ID), enforce credential-ID
   uniqueness, and keep the mapping auditable.
8. **Registration: minimize attestation.** Most public apps are better off asking for no attestation and leaving
   users free to pick any authenticator model; attestation does not prove an authenticator stays uncompromised. Use it
   only for
   a documented enterprise or regulatory need, and then define accepted formats, trust anchors, validation, failure
   behavior, and a reviewed exception path.
9. **Authentication: generate and bind options.** Issue a fresh unpredictable challenge per ceremony, tied to the
   ceremony type, the RP ID, the origin rules, the UV requirement, the session or transaction it belongs to, and an
   expiry, and consume it once. For account-first flows send only that account's credential IDs in `allowCredentials`
   and keep responses
   generic so they do not reveal whether an account exists. For username-less flows omit `allowCredentials`, then
   resolve the returned user handle and credential ID to the same account; do not trust a client-supplied name.
10. **Authentication: verify the response.** Through the library, confirm the client data type is `webauthn.get`, the
    challenge matches an unexpired unused one, the origin is an exact allowlist member, the RP ID hash matches, the
    credential ID belongs to the account from the verified context, the signature is valid under the stored public
    key, UP is set and UV is set when required, the user handle matches the credential's account, and cross-origin and
    extension outputs comply with policy. Only then create the session, and rotate the session ID at login.
11. **Handle signature counters conservatively.** A non-increasing counter can hint at a cloned or malfunctioning
    authenticator, but it is not reliable clone detection (some authenticators omit it, synced credentials are not
    strictly monotonic). Record and weigh anomalies with other risk signals rather than locking out every user.
12. **Use safe failure behavior.** Return generic errors that do not distinguish unknown account, unknown credential,
    bad signature, or policy rejection, keep timing consistent, and rate-limit by account and signals without creating
    a lockout denial of service. When a passkey check fails, never slip quietly to a weaker method; make any fallback a
    deliberate, logged, documented path. Do not log challenges, full responses, session IDs, or extra PII.
13. **Credential management.** Give users an authenticated page showing each passkey's name, creation, and last-used
    date, not raw IDs. Make the user re-verify recently before they add or drop a passkey, adjust recovery methods, or
    turn off the last strong authenticator. Allow more than one authenticator, notify the user on changes through a
    trusted channel, record lifecycle events, revoke immediately on removal or reported compromise, and confirm a
    usable method remains before removing the final passkey. Never silently reassign a credential to another account.
14. **Account recovery and bootstrap.** The account is only as strong as its weakest recovery route. Prefer recovery
    via another registered passkey, a separately secured single-use recovery code, or a high-assurance identity check.
    Encourage enrolling multiple authenticators early, protect recovery codes as secrets, rate-limit and risk-check
    recovery, do not let email or SMS silently bypass a stronger policy for high-risk accounts, and after recovery
    rotate sessions, review credentials, and notify the user.
15. **Synced vs device-bound credentials.** Synced passkeys improve availability but inherit the provider's account,
    sync, and recovery security; device-bound passkeys suit policies needing the key on one authenticator but need a
    replacement plan. Use backup eligibility and backup state as risk inputs only, not as UV results or proof of a
    trustworthy provider, and do not assume a synced passkey meets every assurance level (NIST excludes syncable
    authenticators at AAL3).

## @security scenario

```gherkin
@security @owasp:passkey @usecase:phishing-resistance
Scenario: A passkey assertion captured on a fake origin is rejected
  Given a passkey registered for the relying party's real RP ID and an exact origin allowlist
  When an attacker relays the authentication ceremony through a look-alike phishing origin
  Then the server rejects the assertion because the origin is not an exact allowlist member and the RP ID hash does not match
  And the failed ceremony does not silently fall back to a password or a typed one-time code
```

This scenario is the canonical copy. When you apply this sheet to real code, add it to the repo's shared
feature-file index (see `bdd-comprehensive-testing`, "Storing BDD scenarios permanently") and wire it into CI
(its "CI/CD wiring") so it runs as a blocking autotest in the same place as every other Gherkin scenario.

## The real guarantee

What actually makes passkeys phishing-resistant is server-side verification of the bindings in the signed response:
the origin must be an exact member of the allowlist and the RP ID hash must match the expected RP ID, so an assertion
produced for any other origin fails and cannot be replayed. The `@security` scenario proves one relayed ceremony is
rejected; the enforced origin and RP ID checks are what reject every relayed ceremony, and refusing a silent fallback
keeps the attacker from downgrading to a phishable method. A test is a check; the server-side ceremony verification
is the guarantee.

## Sources

- OWASP Passkey Security Cheat Sheet (<https://cheatsheetseries.owasp.org/cheatsheets/Passkey_Security_Cheat_Sheet.html>, retrieved 2026-10-11): the security model (UP versus UV, RP ID and origin allowlist, maintained library), the registration and authentication verification steps, minimizing attestation, signature-counter handling, safe failure with no silent fallback, and the credential-lifecycle and recovery controls including synced versus device-bound passkeys. `[documented]`
