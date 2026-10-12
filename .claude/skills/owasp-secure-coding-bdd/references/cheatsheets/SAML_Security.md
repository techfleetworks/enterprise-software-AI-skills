# SAML Security

## What it is

How to consume and issue SAML single sign-on messages safely, with a focus on the Web Browser SSO Profile that
uses Redirect and POST bindings. A SAML response carries a signed assertion that says who the user is; if a
service provider accepts one without checking it fully, an attacker can log in as anyone. This is the per-sheet
guidance from the OWASP SAML Security Cheat Sheet, condensed to the controls that hold and the attacks they stop.

## The attack it stops

SAML flows are usually attacked at the endpoints, not in the protocol itself. A service provider that skips a
validation step can be fed a forged or replayed assertion and will trust it. The public Google SSO flaw is the
classic case: the response left out fields a secure exchange needs, so a malicious service provider could mount a
man-in-the-middle attack. A second family of attacks is XML Signature Wrapping, described in the 2012 research
"On Breaking SAML: Be Whoever You Want to Be," where the message carries a valid signature over one element while
the service provider reads identity from a different, unsigned element the attacker added. Stolen, replayed, and
forged assertions, plus theft of the signing key, round out the threat model.

## Controls

In the cheat sheet's order:
1. **Protect messages in transit and prove their origin.** Run the exchange over TLS 1.2 for confidentiality and
   integrity, and have the identity provider digitally sign the assertion with a trusted certified key so
   tampering and forgery are detectable. Where attributes are sensitive, encrypt the assertion with XMLEnc.
2. **Require the full set of protocol fields.** An `AuthnRequest` must carry a unique `ID` plus the requesting
   `SP`, and the response must echo that id back in `InResponseTo`. The response must include its own `ID`, the
   recipient `SP`, the issuing `IdP`, and an assertion signed by the identity provider's private key. The
   contained authentication assertion must name an `ID`, the subject client, the `IdP`, and the `SP`.
3. **Validate signatures against wrapping.** Always schema-validate the document first, using local trusted copies
   of schemas, never auto-downloading them, and harden the schema to remove loose or wildcard processing. Pin the
   expected signing key yourself (`StaticKeySelector` for one key, `X509KeySelector` for several) and ignore any
   `KeyInfo` in the document. Never pick security elements with `getElementsByTagName`; use absolute XPath, so the
   element you verify is the element you read.
4. **Apply every processing rule.** Walk the full `AuthnRequest` and response processing rules from the SAML core
   and profile specs. Skipping steps is what lets stolen, forged, and man-in-the-middle assertions through.
5. **Handle each binding correctly.** Follow the redirect and POST binding rules, and set caching headers on the
   POST binding so a message cannot be pulled from cache and replayed.
6. **Add defense-in-depth countermeasures.** Where you can, give each trusted partner its own endpoint and apply
   IP filtering. Keep response lifetimes short, and mark responses `OneTimeUse` to block replay and browser-state
   exposure.
7. **Treat IdP-initiated (unsolicited) SSO as higher risk.** It has no login-CSRF protection because the service
   provider never created a pre-login session. If you must support it, follow the unsolicited-response validation
   rules, allowlist any `RelayState` URL to stop open redirects, and add replay detection at the response or
   assertion level.
8. **Manage the signing certificate and key well.** Prefer self-signed signing certificates for the explicit-trust
   SAML model, exchanged over a metadata URL served on trusted WebPKI TLS rather than by email. Use RSA keys of at
   least 2048 bits or ECC of at least 256 bits, and a certificate signing hash of SHA-256 or stronger (never
   SHA-1). Plan rotation ahead of `notAfter`, and remember that reusing the same public key on a renewed
   certificate does not rotate the private key. Set `KU` to `digitalSignature` and consider the document-signing
   `EKU`, so the TLS server certificate is never reused for SAML signing. Validate CRL and OCSP when present.
   Guard the private key as a top asset, ideally in a FIPS 140-2 or 140-3 HSM so it cannot be copied out.
9. **Identity provider duties.** Check the certificate for algorithm fitness and strength, offer strong
   authentication, confirm which identity provider minted the token, sync to a common time source, set levels of
   identity assurance, prefer pseudonymous subject identifiers over data like SSNs, and sign each assertion or the
   whole response.
10. **Service provider duties.** Track session state, decide your authorization granularity, and verify that each
    assertion or the whole response is signed by an authorized identity provider. Confirm the `Destination`
    exactly matches your Assertion Consumer Service URL, the `Audience` matches your EntityID, and the
    `NotBefore`, `NotOnOrAfter`, `Recipient`, `InResponseTo`, and `SubjectConfirmationData` all check out. Require
    a signature algorithm of at least RSA-SHA-256 and reject SHA-1 variants. Confirm the signature's `Reference
    URI` resolves to the exact assertion you authenticate on, and reject anything outside the signed content.
11. **Keep validating inputs and crypto.** Being a security protocol does not exempt SAML from input validation;
    run it on every provider and consumer. Use strong encryption throughout the chain and drop weak XMLEnc
    algorithms such as RSA-1_5.

## @security scenario

```gherkin
@security @owasp:saml @usecase:signature-wrapping-defense
Scenario: A service provider rejects a SAML response with a wrapped signature
  Given a service provider that accepts SAML assertions from a configured identity provider
  When an attacker submits a response whose valid signature covers one element but whose identity claims live in a separate injected element
  Then the login is rejected because the authenticated assertion is not the element protected by the verified signature
  And the response is schema-validated first and the signing key is taken from the pinned configuration, not from KeyInfo in the message
```

This scenario is the canonical copy. When you apply this sheet to real code, add it to the repo's shared
feature-file index (see `bdd-comprehensive-testing`, "Storing BDD scenarios permanently") and wire it into CI
(its "CI/CD wiring") so it runs as a blocking autotest in the same place as every other Gherkin scenario.

## The real guarantee

What actually makes a SAML login safe is that the service provider reads identity only from the exact assertion
covered by a signature it verified against a pinned key, after schema validation and the full set of profile and
processing checks (`Destination`, `Audience`, timestamps, `InResponseTo`, replay limits). The `@security`
scenario proves one wrapped-signature payload is turned away; the bound signature-to-assertion check and the
protocol validations are what make every forged, wrapped, or replayed response safe. A test is a check; the
verified signature over the consumed assertion is the guarantee.

## Sources

- OWASP SAML Security Cheat Sheet (<https://cheatsheetseries.owasp.org/cheatsheets/SAML_Security_Cheat_Sheet.html>, retrieved 2026-10-11): the message confidentiality and integrity controls, required protocol fields, signature-wrapping defenses, processing and binding rules, countermeasures, IdP-initiated SSO handling, X.509 certificate and key guidance, and the identity-provider and service-provider validation duties summarized above. `[documented]`
