# Security Terminology

## What it is

A shared vocabulary for the security terms that developers mix up even after years on the job: the difference
between encoding and escaping, between hashing and encryption, between authentication and authorization. Getting
these right is what lets a team implement controls correctly and follow standards like the OWASP ASVS. This is
the per-sheet guidance from the OWASP Security Terminology Cheat Sheet, condensed to the convention it sets and
the key terms it defines.

## The attack it stops

When two people use the same word for different things, a real risk slips through the cracks. Someone calls
Base64 "encryption" and assumes the data is now confidential, when it is trivially reversible. Someone
"escapes" input to build a SQL string and thinks the query is safe, when a parameterized query was the real
fix. Someone treats a signed token and an encrypted token as the same thing. Each of these is a control that
looks present in conversation but is absent in the code, and the gap hides because the words papered over it.
Precise, shared terms close that gap so a stated control and the actual control are the same thing.

## Controls

The practice is to use precise, agreed terms and to know what each one means. The key definitions:

**Data handling.**
- **Encoding:** reshaping data into a public format so another system can safely read it. It is always
  reversible and gives no confidentiality; Base64 is not protection. Output encoding matched to its context is
  an XSS defense, and the wrong encoding for the destination leaves an injection hole.
- **Escaping:** writing characters as parser-specific sequences so a given interpreter reads them as plain text,
  not code. Which sequences are correct varies by interpreter and position; for SQL, bind values as query
  parameters instead of escaping them by hand.
- **Sanitization:** cleaning input by stripping, swapping, or altering dangerous content to meet a policy. Use a
  maintained HTML sanitizer when untrusted input must render as HTML; just deleting `<script>` tags is not
  enough, since other tags and attributes can run code. When the value should show as text, encode it instead.
- **Serialization:** turning an object into a storable or sendable form and later rebuilding it. Rebuilding an
  object from untrusted data is insecure deserialization and can lead to remote code execution.

**Cryptography.**
- **Encryption:** converting plaintext to ciphertext with a secret key, for confidentiality. It is reversible
  with the right key, and comes in symmetric (one shared key) and asymmetric (public and private key) forms.
- **Hashing:** mapping data to a fixed-size digest with a one-way function, for integrity; any small input
  change produces a very different digest. It is used for salted password storage and file-integrity checks.
- **Signatures:** using asymmetric crypto to prove a message's origin and integrity, giving authenticity and
  non-repudiation. The signer's private key does the signing, and a trusted public key tied to that
  identity does the checking. A JWT is not automatically signed; it can instead use a shared-key MAC or encryption.

**Identity.**
- **Authentication (AuthN):** confirming who a user is ("who are you?"), by something they know, have, or are.
- **Authorization (AuthZ):** confirming what a user may do ("are you allowed to do this?"), and it happens only
  after authentication succeeds; RBAC and ABAC are common models.

**Federated identity.**
- **Identity Provider (IdP):** the system that holds identity data and performs authentication (for example
  Google or Okta).
- **Relying Party (RP):** an application that leans on an IdP to authenticate its users.
- **Service Provider (SP):** the SAML name for a relying party.
- **Principal:** the user, service, or device being authenticated.

## @security scenario

```gherkin
@security @owasp:terminology @usecase:precise-terms-prevent-false-control
Scenario: A claimed control is tested against its precise definition, not its loose name
  Given a design note that says user data is "encrypted" by Base64 encoding it
  When the control is reviewed against the agreed security terms
  Then the note is corrected because encoding is reversible and gives no confidentiality
  And the requirement for real confidentiality is routed to encryption with a secret key
```

This scenario is the canonical copy. When you apply this sheet to real code, add it to the repo's shared
feature-file index (see `bdd-comprehensive-testing`, "Storing BDD scenarios permanently") and wire it into CI
(its "CI/CD wiring") so the terminology check runs as a blocking autotest in the same place as every other
Gherkin scenario.

## The real guarantee

What actually prevents the hidden risk is a team that names controls precisely and shares one meaning for each
term, so "encrypted," "escaped," and "authorized" mean in the code exactly what they mean in the review. The
`@security` scenario proves one loose claim gets caught and corrected; the shared, exact vocabulary is what
keeps a stated control from standing in for a missing one. A test is a check; the precise shared language is the
guarantee.

## Sources

- OWASP Security Terminology Cheat Sheet (<https://cheatsheetseries.owasp.org/cheatsheets/Security_Terminology_Cheat_Sheet.html>, retrieved 2026-10-11): the definitions and distinctions for data-handling terms (encoding, escaping, sanitization, serialization), cryptography terms (encryption, hashing, signatures), identity terms (authentication, authorization), and federated-identity terms (IdP, RP, SP, principal) summarized above. `[documented]`
