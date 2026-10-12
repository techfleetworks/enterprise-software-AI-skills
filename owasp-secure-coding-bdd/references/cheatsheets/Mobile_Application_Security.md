# Mobile Application Security

## What it is

How to build a mobile app that stays safe once it ships to a device you do not control: put trust
decisions on the server, store secrets in platform-backed hardware, lock down the network, and prove the
binary has not been tampered with. This is the per-sheet guidance from the OWASP Mobile Application
Security Cheat Sheet, condensed to the controls that hold and the attacks they stop.

## The attack it stops

A mobile app runs on hardware the attacker may own, root, or jailbreak. Anything the app decides on the
device alone can be patched out, hooked at runtime, or read straight from storage. Attackers lift
hardcoded keys and tokens out of the binary, pull cached secrets off disk, intercept traffic on a hostile
network, and reach protected screens through deep links, Siri, or lock-screen shortcuts that skip the
login step. Each of these turns a convenient feature into a way in. The fix is to treat the client as
untrusted and keep the real checks, keys, and data where the device cannot reach them.

## Controls

In the cheat sheet's order:

**Architecture and design**
1. **Design for security up front.** Build it in from the start, applying least privilege, defense in
   depth, and separation of concerns, and follow recognized standards such as NIST and IETF.
2. **Secure the API link.** Talk to the backend over authenticated channels using OAuth2, JWT, or
   equivalents, and rotate keys and tokens on a schedule.
3. **Least privilege.** Ask for only the device permissions and backend rights the app genuinely uses,
   keep file permissions tight, and ship the most locked-down settings as the default.
4. **Supply chain.** Sign the app, pull in only vetted third-party components, control how updates and
   patches reach users, and watch for reported flaws in the libraries you depend on.

**Authentication and authorization**
5. **Do not trust the client.** Run auth checks on the server and only send data down after they pass.
   Encrypt sensitive local data and guard the keys with platform key storage; if a key must come from a
   password, derive it through a proper password-based KDF with a random salt and a real work factor.
   Never keep user passwords on the device, prefer revocable device-bound tokens, avoid spoofable values
   like device IDs for auth, assume every client-side check can be defeated and repeat it server-side, and
   add code that notices binary tampering.
6. **Credential handling.** Keep no credentials baked into the app, encrypt them in transit, and store
   revocable access tokens rather than user credentials on the device.
7. **Password and PIN policy.** Permit long passphrases without forced character mixes, screen out common
   or breached passwords per NIST, reject short PINs such as four digits, and keep secrets in Keychain
   (iOS) or Keystore (Android).
8. **Biometrics.** Use the platform's own biometric APIs and always give a fallback like a PIN.
9. **Session management.** Expire sessions after idle time, offer remote logout, issue random session
   tokens, and protect session data on both ends.
10. **Token storage.** Keep auth tokens in secure storage and handle their expiry cleanly.
11. **Sensitive operations.** Make users re-authenticate before high-risk actions such as a password or
    payment change, consider the same before showing very sensitive data, and enforce authorization on
    every backend call.

**Data storage and privacy**
12. **Encrypt data.** Protect sensitive data at rest and in transit, keep private data in internal
    storage, use the platform's crypto APIs instead of rolling your own, and lean on hardware security
    (Secure Enclave on iOS, StrongBox on Android) for keys and crypto.
13. **Prevent leakage.** Watch for sensitive data escaping through caches, logs, and background
    screenshots.
14. **Use HTTPS** for all traffic.
15. **Third-party libraries** must be secure and current.
16. **PII.** Collect only what you must, swap in less sensitive values where you can, gather it less often
    (for example fewer location pings), auto-expire and delete it, and get consent first.

**Network communication**
17. **Do not trust the network.** Treat every link as tappable.
18. **Secure protocols.** Use HTTPS everywhere, never disable certificate validation, avoid mixed-version
    SSL, add your own encryption on top in case TLS later breaks, pick strong standard cipher suites with
    adequate key sizes, use certificates from a trusted CA, and keep sensitive data out of SMS.
19. **Certificate pinning.** Weigh pinning for high-value connections.

**User interface**
20. **Mask on screen.** Hide sensitive field values against over-the-shoulder viewing.
21. **Notify users** of security events like a login from an unfamiliar device.
22. **Validate input** and **validate output** to block injection and execution.

**Code quality**
23. Run **static analysis**, make security a **code-review** focus, and **keep libraries updated**.

**Application integrity**
24. Turn off debugging, add runtime integrity checks on the code, obfuscate the binary, and apply
    anti-tampering at runtime: look for debuggers, hooks, or injected code; detect emulators and
    rooted or jailbroken devices; verify signatures live; and respond to tampering, for example by
    cutting functionality.

**Testing**
25. Do **penetration testing** (including crypto review and trying to hit backend functions with the
    session token stripped out), run **automated tests** that confirm security features and access
    controls work, and do **usability testing** so protections do not push users to route around them.

**Post-deployment**
26. Keep an **incident response** plan, ship **regular updates** and be able to force an upgrade when
    needed (store-review lag makes this acute on mobile), and use **real-time monitoring**.

**Platform-specific**
27. **Android:** obfuscate with ProGuard, keep sensitive data out of SharedPreferences, disable backup
    mode, store keys in a hardware-backed Keystore (`setIsStrongBoxBacked(true)`, verified with
    `KeyInfo.isInsideSecureHardware()`, gated by `setUserAuthenticationRequired(true)`), and attest device
    and app state with the Play Integrity API validated server-side (SafetyNet is retired).
28. **iOS and iPadOS:** require device unlock before sensitive App Intents and Siri actions
    (`authenticationPolicy` set to `.requiresLocalDeviceAuthentication`, and `requestConfirmation()` for
    destructive work, neither of which replaces your own auth); add auth checks to screens reached by deep
    links and validate Universal Link parameters; mark sensitive widget views `privacySensitive(_:)` and
    use data protection; keep sensitive data out of `plist` files; enforce ATS; store keys in the Secure
    Enclave; and attest integrity with App Attest and DeviceCheck verified server-side.
29. **Advanced hardware.** Reach TEEs and secure modules through standard OS APIs, and add runtime
    anomaly detection for higher-risk cases.

## @security scenario

```gherkin
@security @owasp:mobile @usecase:deep-link-auth-bypass
Scenario: A deep link to a protected screen still requires authentication
  Given a mobile app with an App Lock enabled and no active authenticated session
  When an attacker opens a deep link that targets a sensitive in-app screen
  Then the app routes the user to the login screen before any protected data loads
  And the link parameters are validated and the authorization check runs on the server, not on the device
```

This scenario is the canonical copy. When you apply this sheet to real code, add it to the repo's shared
feature-file index (see `bdd-comprehensive-testing`, "Storing BDD scenarios permanently") and wire it into
CI (its "CI/CD wiring") so it runs as a blocking autotest in the same place as every other Gherkin
scenario.

## The real guarantee

What actually keeps a mobile app safe is that the trust decisions and the secrets live where the device
cannot be made to lie about them: auth and authorization run server-side, keys sit in platform-backed
hardware, and every entry point reaches the same check. The `@security` scenario proves one deep link
cannot skip the login; the server-side authorization is what makes every entry point safe. A test is a
check; moving the decision off the untrusted client is the guarantee.

## Sources

- OWASP Mobile Application Security Cheat Sheet (<https://cheatsheetseries.owasp.org/cheatsheets/Mobile_Application_Security_Cheat_Sheet.html>, retrieved 2026-10-11): the full control set across architecture, authentication, storage, network, UI, code quality, application integrity, testing, post-deployment, and the Android and iOS platform-specific guidance summarized above. `[documented]`
