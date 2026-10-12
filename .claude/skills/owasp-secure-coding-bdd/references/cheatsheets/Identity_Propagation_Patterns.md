# Identity Propagation Patterns

## What it is

How to carry authenticated user context from one service to the next without letting the credential become a
skeleton key. When a request crosses service boundaries, each hop needs a representation of the user that the
receiver can actually check, scoped so it only works where it is meant to. This is the per-sheet guidance from the
OWASP Identity Propagation Patterns Cheat Sheet, condensed to the controls that hold and the attacks they stop.

## The attack it stops

If a downstream service trusts whatever user context arrives, several things go wrong. A leaked bearer token
accepted by many services can be replayed against any of them, so one leak becomes access everywhere. A service
allowed to assert identities can lie about who the user is or what they may do. An ID token meant to prove a login
gets misused as an API key. A forwarded proxy header gets spoofed by a client that reached the service directly.
In each case the receiver skipped the question that matters: can I validate this assertion, and does it actually
permit this specific action on this specific resource?

## Controls

In the cheat sheet's order:
1. **Keep the caller's identity separate from the user's.** Authenticate the service-to-service connection on its
   own; holding a user's context does not prove which service is calling. Use the service-authentication controls
   from the Microservices Security guidance for the connection itself.
2. **Validate assertions at every boundary.** Accept them only from issuers you have configured and authorized for
   that claim. For JWTs, check the signature, the permitted algorithm, the issuer, the audience, the token type,
   and the validity window per the token profile; a good signature alone is not enough. For opaque tokens, use the
   issuer's own validation mechanism. The token's shape never tells you what it is allowed to do.
3. **Respect each protocol's purpose.** An OpenID Connect ID token proves a login happened and must not stand in
   for an API access token. Likewise, passing along a certificate does not transfer the proof that its holder
   controls the matching private key over a TLS connection. Each credential type carries its own validation and
   proof rules, so keep them intact.
4. **Never trust context blindly.** Reject missing or invalid context, and still authorize the requested action
   and resource at the receiving service. A verified signature proves the issuer and integrity of an assertion; it
   does not grant permission for the request in hand.
5. **External identity propagation: forward only to intended recipients.** The edge can pass an external access
   token to a service the token was meant for, and each recipient validates it first. Do this only when those
   services share the token's validation profile. Do not stretch a token's audience just so it can be forwarded
   further, since every extra recipient is one more place it can leak, and services that accept the same token are
   not isolated from each other.
6. **Simple service-level forwarding: do not mint identities casually.** A service can pull user attributes and
   pass along a signed object, header, or assertion of its own, but an authenticated channel or its signature only
   proves who sent the data, not that the sender is entitled to speak for that user. Any service you trust to
   supply attributes can falsify them. With a trusted proxy header, strip client-supplied copies, authenticate the
   proxy, and make sure requests cannot skip it. When context spans several boundaries, prefer an assertion from a
   designated issuer instead.
7. **Token exchange: issuer-side enforcement.** A service can present an incoming token to a Security Token Service
   and ask for one aimed at a specific downstream recipient (RFC 8693, carrying subject and actor tokens along
   with the audiences and scopes being requested). The requesting service must prove its own identity to the STS,
   which then authorizes the exchange and trims the privileges it issues; asking for a smaller token does not
   replace the issuer actually enforcing that limit. Reach for this when the next call needs a separate audience
   or an explicit delegation, preserve the user-versus-actor distinction wherever policy turns on it, and plan for
   STS outages without ever accepting invalid credentials.
8. **Protocol-agnostic propagation: normalize at the edge.** The edge validates the external credential and gets a
   standard internal assertion from a trusted issuer, so internal services validate that one assertion rather than
   every external protocol. Prefer this when many external mechanisms feed the same internal services. Keep the
   power to issue assertions separate from the power to verify them, and limit each assertion's recipients and
   lifetime. Signing protects integrity only; it does not hide claims, stop bearer replay, or save you from a
   compromised issuer. The Transaction Tokens draft is one emerging example, propagated unmodified inside a trust
   domain and not replay resistant.
9. **Protect privacy and apply least privilege.** Send only the attributes a recipient needs, prefer pseudonymous
   identifiers, and protect tokens in transit. Mapping an external id to an internal one does not by itself stop
   correlation, and signing is not confidentiality. Keep internal assertions out of responses sent to clients, and
   follow the Logging guidance on what identity data to leave out of logs.

## @security scenario

```gherkin
@security @owasp:identity-propagation @usecase:audience-restricted-forwarding
Scenario: A downstream service refuses a forwarded token meant for a different audience
  Given an internal service that receives a propagated access token
  When a caller forwards a token whose audience names another service
  Then the request is rejected because the token's audience does not match this service
  And the service independently authorizes the requested action and resource rather than trusting the presence of a valid token
```

This scenario is the canonical copy. When you apply this sheet to real code, add it to the repo's shared
feature-file index (see `bdd-comprehensive-testing`, "Storing BDD scenarios permanently") and wire it into CI
(its "CI/CD wiring") so it runs as a blocking autotest in the same place as every other Gherkin scenario.

## The real guarantee

What actually contains a propagated identity is that each receiving service validates the assertion it is given
against a configured issuer, checks that the audience and profile fit, and then authorizes the specific action on
its own. The `@security` scenario proves one wrong-audience token is refused; the per-boundary validation plus
least-privilege authorization is what keeps a leaked or over-scoped credential from unlocking every service. A
test is a check; the boundary that validates and authorizes for itself is the guarantee.

## Sources

- OWASP Identity Propagation Patterns Cheat Sheet (<https://cheatsheetseries.owasp.org/cheatsheets/Identity_Propagation_Patterns_Cheat_Sheet.html>, retrieved 2026-10-11): the per-boundary validation rules, the separation of caller and user identity, the four propagation patterns (external forwarding, simple service-level forwarding, token exchange, protocol-agnostic propagation), and the privacy and least-privilege recommendations summarized above. `[documented]`
