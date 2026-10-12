# Pinning

## What it is

How to tie a client to the exact certificate or public key it expects from a server, so that only that
credential is accepted even if some other valid-looking one appears. This is the per-sheet guidance from
the OWASP Pinning Cheat Sheet, condensed to the controls that hold, the attack they stop, and the strong
caution that you probably should not pin at all.

## The attack it stops

Normal TLS trusts any certificate that chains to a CA the client's trust store accepts. That lets a
man-in-the-middle win in two ways: the attacker gets a rogue but genuine certificate for your domain from
some trusted CA, or slips a malicious CA into the client's trust store. Either way the client sees a
"valid" certificate and connects to the attacker. Pinning narrows trust from "any CA-signed certificate"
down to "this specific key," so a rogue certificate from a different key is rejected. Note the cheat sheet
is blunt that this threat is now small and that the outage risk of pinning usually outweighs it.

## Controls

In the cheat sheet's order:

1. **First decide whether to pin at all; the usual answer is no.** Modern CA and browser safeguards have
   shrunk the problem, and a bad pin bricks the client. Do not pin if you do not control both ends of the
   connection, if you cannot push pin updates securely, if updating the pins is disruptive (such as
   needing a redeploy), if the key cannot be known before it goes live, or if it is not a native mobile
   app.
2. **Pin at development time when you can.** Build the expected certificate or key into the app out of
   band so an attacker cannot taint it. Trust On First Use or updating the pin over an unpinned channel
   are weaker, because the first or updating connection can be attacked.
3. **Hold a pinset, not a single pin.** Accept a match against any entry in a small set, which leaves room
   for failover and key rotation.
4. **Pin the right level in the chain.** Avoid pinning the root CA (it trusts every intermediate under
   it). Pinning an intermediate CA cuts risk but still trusts everything that CA issues. Pinning the leaf
   certificate is preferred for exact trust, but always include a backup pin (such as the intermediate or
   an alternate) so a leaf change does not lock users out.
5. **Choose certificate, public key, or a hash of either.**
   - **Certificate:** easiest to implement, but if the site rotates certificates you must ship app
     updates, and losing control of that timing causes outages.
   - **Public key:** more flexible, since a key can outlive a certificate and be reused on renewal, but
     you must extract the key, and some providers issue a new key each renewal. Prefer pinning the
     `subjectPublicKeyInfo`, which carries the key parameters plus algorithm and OID context, over a bare
     `RSAPublicKey`.
   - **Hash:** compact and often available as a native fingerprint API, but it drops the algorithm and OID
     context and shares the certificate's rotation-outage risk.
6. **Fail closed in the connection callback.** Verify the peer's certificate or key in the library's
   `OnConnect`-style hook; on mismatch, abort the connection, log it on the client, and warn the user.
   Never give the user a way to proceed past the failed pin, since people click past warnings.
7. **Do not whitelist interception proxies.** A DLP or egress-filtering proxy breaks end-to-end security
   just like an attacker; only add its key to the pinset if Risk Acceptance formally instructs you to.
8. **Reuse vetted platform support instead of writing checks by hand.** Use Android Network Security
   Configuration or OkHttp, iOS App Transport Security or TrustKit, .Net `ServicePointManager`, or
   Electron libraries. Hand-rolled pinning is error-prone and tends to produce severe bugs. With OpenSSL,
   confirm `SSL_get_verify_result` returns `X509_V_OK` and that `SSL_get_peer_certificate` is non-NULL,
   because a missing server certificate still yields `X509_V_OK`.

## @security scenario

```gherkin
@security @owasp:pinning @usecase:rogue-certificate-rejection
Scenario: A pinned mobile client rejects a valid rogue certificate
  Given a native app that pins the server leaf key plus a backup intermediate pin, built in at release time
  When a man-in-the-middle presents a certificate that chains to a trusted CA but uses a different key
  Then the OnConnect check finds no match in the pinset and aborts the connection
  And the failure is logged on the client and the user is given no option to continue past it
```

This scenario is the canonical copy. When you apply this sheet to real code, add it to the repo's shared
feature-file index (see `bdd-comprehensive-testing`, "Storing BDD scenarios permanently") and wire it into
CI (its "CI/CD wiring") so it runs as a blocking autotest alongside every other Gherkin scenario.

## The real guarantee

What actually blocks the rogue certificate is the pin check itself, enforced in the connection callback: it
compares the presented credential against the built-in pinset and tears down the socket on any mismatch, so
a different key cannot pass no matter which CA signed it. The `@security` scenario proves one rogue
certificate is refused; the fail-closed pin check, paired with a backup pin to avoid self-inflicted
outages, is what makes every mismatched credential fail. A test is a check; the enforced pinset is the
guarantee, but only pin when the threat truly warrants the outage risk.

## Sources

- OWASP Pinning Cheat Sheet (<https://cheatsheetseries.owasp.org/cheatsheets/Pinning_Cheat_Sheet.html>, retrieved 2026-10-11): the decision of whether and when to pin, when to add a pin, what to pin (level in the chain and certificate vs public key vs hash), the fail-closed callback behavior, the interception-proxy exception, and the platform implementation notes. `[documented]`
