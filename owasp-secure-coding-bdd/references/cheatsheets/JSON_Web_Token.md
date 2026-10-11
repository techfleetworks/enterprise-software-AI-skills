# JSON Web Token

## What it is

How to issue and verify JSON Web Tokens so an attacker cannot forge one, swap it for another kind, read secrets out
of it, or keep using one after it is revoked. This is the per-sheet guidance from the OWASP JSON Web Token Cheat
Sheet, condensed to the controls that hold and the attacks they stop.

## The attack it stops

A JWT carries claims (who the user is, what role they hold) that an application trusts because a signature says they
have not been changed. If the verifier is sloppy, that trust breaks. An attacker may hand over a token with no real
signature (`alg` set to `none`), re-sign a forged token by abusing the verifier's key handling, point a header
field at a key the attacker controls, or replay a token minted for one service against another that trusts the same
issuer. Any of these lets them flip `admin` to true or pose as another user. On top of forgery, a signed token is
not secret at all: its claims are only encoded, so anyone who grabs the token reads everything inside.

## Controls

Follow the source order.

1. **Decide whether you even need a JWT.** For user sessions, a JWT forces you to build a revocation deny list to
   log people out, which gives up the stateless benefit you reached for. Often a plain server session is the better
   fit.
2. **Pick signature versus MAC deliberately.** A public-key digital signature lets the issuer keep a private key
   while audiences verify with a freely shared public key, which eases distribution and rotation and removes the
   risk of an audience leaking a shared secret. Prefer it. Use a MAC only when the issuer is also the sole audience.
3. **Manage MAC secrets strictly.** Use a different secret for every issuer-and-audience pairing, never reuse a
   secret for encryption or across issuers and audiences, never publish it, and never use a password as the secret.
   Generate it with a cryptographically secure random source, give it at least the hash output size (256, 384, or
   512 bits for `HS256`, `HS384`, `HS512`) and no fewer than 160 bits of entropy.
4. **Choose a recommended signature algorithm.** EdDSA, ECDSA (`ES256` and up), and RSASSA-PSS (`PS256` and up) are
   recommended; `RS256` and its siblings are not. For a MAC, use `HS256` or stronger. On embedded hardware with weak
   randomness, use deterministic ECDSA. Do not reuse a signing key pair for encryption, and never publish a private
   key.
5. **Refuse unsecured tokens.** Make sure the parser rejects `alg` set to `none`, so no one can present an unsigned
   token as genuine.
6. **Stop key and algorithm confusion.** Hardcode the exact algorithms you accept and do not mix public-key
   algorithms with MAC algorithms in one acceptance list, pick the key based on the expected algorithm, and use a
   library that strongly types keys so a public key cannot be fed in as a MAC secret.
7. **Do not trust key material the header points to.** Header fields such as `jwk`, `jku`, `x5u`, `x5c`, `kid`,
   `x5t`, and `x5t#S256` are attacker-controlled. Only verify with a key you can tie through a trust chain back to an
   anchor you already associate with the issuer, such as a pinned key or the `jwks_uri` from the issuer's published
   metadata. Clean and validate `kid` before using it in any lookup, since it can carry an injection payload, and
   treat URL fetches as a server-side request forgery risk.
8. **Validate issuer and audience.** Compare `iss` as a whole case-sensitive string (scheme and path included),
   either against one expected value or against an explicit allowlist. Select the verification key from the set tied
   to that validated issuer, never from a merged pool of several issuers' keys. Require your own identifier inside
   `aud`, whether `aud` is one string or a list. Where your design leans on these claims, reject tokens that omit
   them.
9. **Separate token kinds.** Set an explicit `typ` media type for each token purpose (for example `at+jwt` for
   OAuth 2.0 access tokens) and reject unexpected or missing `typ` values at endpoints that require it. Where
   explicit typing is not workable, keep kinds apart with separate signing keys, distinct required claims, or strict
   `iss` and `aud` isolation.
10. **Check the lifetime claims.** Validate `exp` (expiry) and `nbf` (not before), and tell the library to require
    the claims your design depends on rather than skipping absent ones.
11. **Handle revocation and replay.** Keep token lifetimes short. For issuer-side revocation, use a Token Status
    List referenced by a `status` claim. If you keep a deny list, key it on `jti` together with `iss`, never on the
    raw token or a hash of it, which token malleability can slip past. Bind a session `nonce` into the claims for
    freshness, and use sender-constrained tokens (DPoP or mutual TLS) so a stolen token is useless without its
    private key.
12. **Protect confidentiality when claims are sensitive.** A signed token only encodes its payload, so treat it as
    readable by anyone who holds it and keep sensitive data server-side behind an opaque reference where you can.
    When claims must travel encrypted, use JWE; because a public-key JWE proves no issuer, never make authorization
    decisions on an unsigned JWE. For both authenticity and secrecy, nest a signed token inside an encrypted one
    (`cty` set to `JWT`), and when consuming it decrypt the outer layer and verify the inner signature, rejecting
    the token if either step fails. Accept only an allowlisted `alg` and `enc` pair, bind each key to one algorithm,
    never let the header choose it, and do not compress claims before encryption.

## @security scenario

```gherkin
@security @owasp:jwt @usecase:forged-token-rejection
Scenario: A verifier rejects a forged privilege-escalation token
  Given an API that accepts JWTs signed with ES256 and verified against the issuer's published JWK Set
  When an attacker presents a token carrying "admin": true that is unsigned (alg none) or re-signed with the issuer's public key as an HMAC secret
  Then the token is rejected because the verifier accepts only the pinned ES256 algorithm and a key tied to the trusted issuer
  And no session or elevated access is granted
```

This scenario is the canonical copy. When you apply this sheet to real code, add it to the repo's shared
feature-file index (see `bdd-comprehensive-testing`, "Storing BDD scenarios permanently") and wire it into CI
(its "CI/CD wiring") so it runs as a blocking autotest in the same place as every other Gherkin scenario.

## The real guarantee

What actually keeps a forged token out is the signature check run against the right key: a pinned algorithm, a key
anchored to the validated issuer, and the `iss`, `aud`, `typ`, and expiry claims all confirmed before any claim is
believed. The `@security` scenario proves one forged token is turned away; the verified signature over a
trust-anchored key, with the algorithm fixed and the claims validated, is what turns every forgery away. A test is a
check; the signature verified against the correct, trusted key is the guarantee.

## Sources

- OWASP JSON Web Token Cheat Sheet (<https://cheatsheetseries.owasp.org/cheatsheets/JSON_Web_Token_Cheat_Sheet.html>, retrieved 2026-10-11): the signature-versus-MAC choice and key and secret management, recommended algorithms, rejecting `alg` none, key and algorithm confusion, not trusting header key material, issuer and audience validation, token type separation, lifetime claims, revocation and replay defenses, and JWE confidentiality guidance. `[documented]`
