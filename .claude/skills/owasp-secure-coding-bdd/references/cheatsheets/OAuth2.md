# OAuth 2.0

## What it is

How to run OAuth 2.0 (and the OpenID Connect layer on top of it) so an attacker cannot steal an authorization code,
replay a token, trick a client into talking to the wrong server, or slip credentials through a weak grant. This is
the per-sheet guidance from the OWASP OAuth 2.0 Protocol Cheat Sheet, condensed to the current best-practice controls
and the attacks they stop.

## The attack it stops

OAuth hands out codes and tokens that stand in for a user's consent, so the attacker's goal is to grab one and use
it. A public client that runs the Authorization Code grant without protection is open to code interception: malware
or a malicious app on the device captures the authorization code as it comes back and redeems it for tokens. A
bearer token that leaks can be replayed by anyone who holds it. A client that works with more than one authorization
server can be steered to send a code to the wrong one (a mix-up). Open redirect endpoints leak codes and tokens to
attacker URLs, missing CSRF protection lets an attacker graft their own authorization onto a victim's session, and
grants that pass the user's password straight through the client expose that password needlessly.

## Controls

Follow the source order.

1. **Do not run open redirectors.** Clients and the authorization server must not bounce the browser to a target
   URL taken straight from a query parameter, because that is how codes and tokens get exfiltrated.
2. **Protect against CSRF.** Rely on PKCE where the authorization server supports it, on the OpenID Connect `nonce`
   in those flows, or otherwise on a one-time `state` value that is securely tied to the user's browser.
3. **Defend against mix-up when talking to several servers.** When a client can use more than one authorization
   server, have it check the issuer, through the `iss` response parameter or the `iss` claim in the ID Token.
4. **Fall back to distinct redirect URIs.** When the other mix-up defenses are not in place, use a separate redirect
   URI per authorization server so the client can tell which one answered.
5. **Keep the server from leaking credentials.** The authorization server must not accidentally forward or redirect
   a request that may carry the user's credentials.
6. **Use PKCE on the Authorization Code grant.** PKCE stops an intercepted or injected code from being redeemed,
   because the attacker lacks the `code_verifier`; the OpenID Connect `nonce` can add to this. Make the challenge or
   nonce specific to one transaction and bound to the client and the browser that started it.
7. **Use a safe PKCE method and support it server-side.** Pick a challenge method that does not reveal the verifier
   in the authorization request (so an attacker reading that request cannot defeat PKCE), and require the
   authorization server to support PKCE.
8. **Enforce the verifier at the token endpoint.** When a client sends a `code_challenge` in the authorization
   request, the authorization server must check the matching `code_verifier` when the code is exchanged.
9. **Block PKCE downgrade.** The authorization server accepts a token request carrying a `code_verifier` only when
   the original authorization request included a `code_challenge`.
10. **Drop the Implicit grant; use Authorization Code with PKCE everywhere.** The Implicit grant (`response_type=token`)
    is deprecated and removed from OAuth 2.1 because it exposes tokens in the URL fragment and they cannot be
    sender-constrained. Use `response_type=code` with PKCE for every client type, including single-page and native
    apps, and migrate existing ones. Use the hybrid `code id_token` response only when an ID Token is needed at the
    authorization endpoint, and still fetch access tokens from the token endpoint, never through the front channel.
11. **Sender-constrain access tokens.** For stronger replay protection, bind tokens to the client with mutual TLS
    (RFC 8705) or DPoP (RFC 9449) so a leaked token cannot be used without the client's private key. Keep bearer and
    PoP tokens audience-restricted either way.
12. **Protect refresh tokens.** Sender-constrain them (DPoP or mTLS) or rotate them, issuing a fresh refresh token
    and immediately voiding the old one so a replayed token is detected.
13. **Grant the least privilege.** Scope each access token down to the minimum the use case needs, which caps the
    damage if the token leaks and keeps clients and users from exceeding what was authorized.
14. **Restrict the audience.** Tie each access token to specific resource servers, ideally a single one, and have
    every resource server confirm on each request that the token was meant for it, refusing it otherwise. Clients
    and servers can steer this with the `scope` and `resource` parameters.
15. **Restrict resources and actions.** Tie each token to the particular resources and operations it may touch, and
    have the resource server check that on every request, refusing anything outside it. The `scope` and
    `authorization_details` parameters express this.
16. **Do not use the Resource Owner Password Credentials grant.** It exposes the user's password to the client and
    widens the attack surface.
17. **Authenticate clients, preferably with asymmetric methods.** Use client authentication where you can, and favor
    public-key methods such as mTLS or `private_key_jwt`, so the authorization server need not store sensitive shared
    secrets.
18. **Lock down identity claims.** The authorization server must not let a client set its own `client_id`, `sub`, or
    any claim that could be mistaken for a real resource owner, and should use end-to-end TLS.
19. **Require encrypted transport.** Never send authorization responses over unencrypted connections, and do not
    allow `http`-scheme redirect URIs except for native clients using loopback redirection.

## @security scenario

```gherkin
@security @owasp:oauth2 @usecase:auth-code-interception
Scenario: A stolen authorization code cannot be redeemed without the PKCE verifier
  Given a public client running the Authorization Code grant with PKCE
  When an attacker intercepts the authorization code and sends it to the token endpoint
  Then the authorization server refuses to issue tokens because the request has no code_verifier matching the earlier code_challenge
  And no access or refresh token is returned to the attacker
```

This scenario is the canonical copy. When you apply this sheet to real code, add it to the repo's shared
feature-file index (see `bdd-comprehensive-testing`, "Storing BDD scenarios permanently") and wire it into CI
(its "CI/CD wiring") so it runs as a blocking autotest in the same place as every other Gherkin scenario.

## The real guarantee

What actually makes a stolen authorization code worthless is the PKCE binding: only the client that began the flow
holds the `code_verifier`, and the authorization server will not exchange the code without it. The `@security`
scenario proves one intercepted code is rejected; the cryptographic binding between the request and the verifier is
what rejects every intercepted code. Sender-constraining tokens does the same job for a leaked token, tying it to a
key the attacker does not have. A test is a check; the binding the attacker cannot reproduce is the guarantee.

## Sources

- OWASP OAuth 2.0 Protocol Cheat Sheet (<https://cheatsheetseries.owasp.org/cheatsheets/OAuth2_Cheat_Sheet.html>, retrieved 2026-10-11): the essentials (open redirect, CSRF, mix-up), the PKCE controls, dropping the Implicit grant, sender-constrained and rotated tokens, privilege and audience and resource restriction, avoiding the Resource Owner Password Credentials grant, asymmetric client authentication, and transport and identity-claim requirements. `[documented]`
