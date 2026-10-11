# Transport Layer Security

## What it is

How to set up TLS so that traffic between a client and your web application stays private, cannot be
altered in flight, and reaches the real server. This is the per-sheet guidance from the OWASP Transport
Layer Security Cheat Sheet, condensed to the controls that hold and the attack they stop.

## The attack it stops

Without TLS, or with a weak TLS setup, anyone sitting on the network path can read what is sent, change
it, or impersonate the server. An attacker who can force an old protocol or a broken cipher recovers
session cookies and other secrets; one who obtains a mismatched or untrusted certificate, or who tricks a
user past a certificate warning, runs a man-in-the-middle. A correctly configured server speaks only
modern protocols and strong, forward-secret ciphers, presents a certificate that proves its identity, and
serves every page over the encrypted channel, so the listener on the wire gets nothing useful.

## Controls

In the cheat sheet's order:

**Server configuration**
1. **Use only strong protocols.** Make TLS 1.3 the default and allow TLS 1.2 only where older clients
   need it. Turn off TLS 1.0 and TLS 1.1 (deprecated by RFC 8996), and always keep SSLv2 and SSLv3 off.
   If an end-of-life client truly must connect, give it a separate endpoint with no sensitive data rather
   than weakening the main one, and switch on `TLS_FALLBACK_SCSV` to block downgrade tricks.
2. **Use only strong ciphers.** For TLS 1.3, pick the standard AEAD suites (AES-GCM or
   ChaCha20-Poly1305). For TLS 1.2, prefer AEAD suites too and stay away from CBC-mode ones. Always
   disable null suites, anonymous suites (`TLS_*_anon_*`), EXPORT suites, and `TLS_RSA_*` or static
   Diffie-Hellman (`TLS_DH_*`, `TLS_ECDH_*`), which give no forward secrecy; favor ECDHE on TLS 1.2. The
   Mozilla config generator produces balanced settings for common servers.
3. **Set appropriate Diffie-Hellman groups.** Negotiate groups through the `supported_groups` extension:
   the `ffdhe*` finite-field groups, elliptic-curve groups such as `x25519` and `prime256v1`, and the
   post-quantum `X25519MLKEM768`. Do not hand-set DH parameters on TLS 1.2 or earlier.
4. **Disable TLS compression** to close the CRIME side channel that can leak session cookies.
5. **Patch your crypto libraries.** Bugs like Heartbleed lived in the library, not the protocol, so keep
   OpenSSL and friends current.
6. **Test the configuration** with scanners such as SSL Labs, testssl.sh, or SSLyze after hardening.

**Certificates**
7. **Use strong, protected keys.** Use RSA keys of at least 2048 bits, sized for the certificate's
   lifetime, and guard the private key with file permissions and access controls.
8. **Use a strong hash.** Sign certificates with SHA-256, not the broken MD5 or SHA-1.
9. **Use correct domain names.** Put every fully qualified name in the `subjectAlternativeName`; keep the
   primary name in the `commonName` too for compatibility. Leave out IP addresses, bare hostnames, and
   internal names on public certificates.
10. **Be careful with wildcard certificates.** One `*.example.org` key spread across many hosts breaks
    least privilege and becomes a prize target; never share one across different trust levels, and prefer
    automation (ACME) or a TLS-terminating proxy that holds the key in one place.
11. **Pick a CA that fits your users.** Public sites need a widely trusted CA (LetsEncrypt is free and
    trusted); internal apps can use an internal CA that clients have imported.
12. **Restrict issuance with CAA records** so only the CAs you name can issue certificates for the domain.
13. **Weigh the validation type.** DV, OV, and EV certificates are equal in actual security because TLS
    stacks do not treat them differently; the extra cost of OV and EV buys little.

**Application**
14. **Serve every page over TLS,** not just the login. Redirect port 80 with a permanent 301 and back it
    with HSTS; API-only endpoints should refuse plain HTTP outright rather than redirect.
15. **Do not mix secure and insecure content.** A TLS page must not pull scripts or styles over plain
    HTTP, which browsers block anyway as active mixed content.
16. **Set the `Secure` flag on cookies** so they travel only over HTTPS, even if you never listen on
    port 80, since an active attacker can spoof a server there.
17. **Stop caching of sensitive responses** with `Cache-Control: no-store`, and use `Clear-Site-Data` at
    sign-out to clear what the client already holds.
18. **Turn on HSTS** so the browser always reaches you over HTTPS and cannot click past cert warnings.
19. **Consider mutual TLS** (client certificates) for high-value apps or APIs; note it does not hide data
    from a TLS endpoint whose certificate the client wrongly accepts.
20. **Consider public key pinning** for mobile apps, thick clients, or server-to-server links to restrict
    which server certificate you will trust (browser HPKP is dead; see the Pinning sheet).

## @security scenario

```gherkin
@security @owasp:tls @usecase:downgrade-and-plaintext-resistance
Scenario: The server refuses weak TLS and never serves secrets in the clear
  Given a web application reachable over the network
  When a client offers TLS 1.0, an anonymous cipher, or a plain HTTP request to a sensitive page
  Then the handshake is rejected for the deprecated protocol and the weak cipher
  And the HTTP request is redirected to HTTPS or refused, so no session cookie travels unencrypted
  And the presented certificate chains to a trusted CA and matches the host in its subjectAlternativeName
```

This scenario is the canonical copy. When you apply this sheet to real code, add it to the repo's shared
feature-file index (see `bdd-comprehensive-testing`, "Storing BDD scenarios permanently") and wire it into
CI (its "CI/CD wiring") so it runs as a blocking autotest alongside every other Gherkin scenario.

## The real guarantee

What actually protects the traffic is the server configuration itself: modern protocols, forward-secret
AEAD ciphers, and a valid, correctly named certificate mean the attacker on the wire has no weak option to
force and no way to pose as the server. The `@security` scenario proves one downgrade attempt and one
plaintext request are turned away; the hardened protocol and cipher list is what makes every such attempt
fail. A test is a check; the server's TLS configuration is the guarantee.

## Sources

- OWASP Transport Layer Security Cheat Sheet (<https://cheatsheetseries.owasp.org/cheatsheets/Transport_Layer_Security_Cheat_Sheet.html>, retrieved 2026-10-11): the server, certificate, and application controls above, including protocol and cipher selection, Diffie-Hellman groups, certificate naming and validation, and the TLS-everywhere application rules. `[documented]`
