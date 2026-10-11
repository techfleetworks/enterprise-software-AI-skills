# Authentication Patterns

## What it is

Where in a system's layers you verify identity, and what each choice costs you in trust boundaries: inside each
service, at a sidecar proxy, at the edge gateway, or down at the network layer. This is the per-sheet guidance from
the OWASP Authentication Patterns Cheat Sheet, condensed to the patterns that hold and the attack they stop.

## The attack it stops

When identity is checked at one layer and trusted at another, an attacker looks for the gap between them. The sharp
example in the sheet is the proxy and edge patterns, where a service trusts an identity header that an upstream
component sets. If a caller can reach the service port directly, or the proxy forwards an identity header it got from
the caller, the attacker simply sends the header themselves and is treated as any user they name. The same family of
failure is calling a service around the gateway entirely, or an internal service reusing external credentials so a
single leak opens sensitive resources. Stripping untrusted headers, locking the service to its proxy, mutual TLS, and
normalizing identity into a signed internal token close those gaps.

## Controls

The patterns in the cheat sheet's order, then its recommendations:

1. **Service-Level Embedded.** Each service stores identities and verifies credentials itself. Simple and fully
   customizable, but it fragments identity, duplicates credential stores and auth code, blocks SSO, scales poorly to
   service-to-service calls, and hides attacks from other services. Keep it only for legacy systems that cannot be
   rewritten, and apply the Authentication and Password Storage cheat sheets even there.
2. **Service-Level Code-Mediated.** An external identity provider authenticates the user and issues proofs; each
   service verifies those proofs in its own code. Gains SSO, a smaller credential attack surface, and standards like
   OIDC and SAML, but every service must get the verification logic right (expiry checks, correct crypto), or it
   opens a hole.
3. **Service-Level Proxy-Mediated.** A sidecar next to each service verifies proofs with the IdP and injects identity
   into the request as headers. Keeps the SSO benefits and removes auth code from the service, and underpins
   workload identity and mutual TLS (for example SPIFFE/SPIRE X.509 identities). Its danger is header spoofing: the
   sidecar has to wipe or replace any caller-supplied identity header before it sets its own (as Envoy does by default
   for `x-forwarded-client-cert`), and the service should take requests only through its own sidecar (bound to
   loopback, or fenced off with a network policy). Where that isolation is not guaranteed, the sidecar signs the
   injected headers (for example with
   HTTP Message Signatures) and the service verifies the signer, freshness, and replay.
4. **Edge-Level.** A shared gateway or ingress proxy authenticates external clients once (OIDC, SAML, OAuth 2.0
   tokens, or mTLS) and propagates identity inward. Consistent, easy to onboard new services, and internal services
   see only a trusted internal representation (a freshly issued JWT or signed headers). Trade-offs: fine-grained or
   step-up policies are harder, it is a single critical point, and it does not cover service-to-service calls, so any
   component that can reach a service directly bypasses it.
5. **Network-Layer (Node-Level).** Peers are authenticated cryptographically in the kernel (IPsec or WireGuard),
   transparent to applications, low overhead, and strong node-to-node isolation. But it authenticates nodes, not
   users or workloads, so it cannot carry user-specific identity and must never be the only control.
6. **Verify external actors at the edge.** Concentrate outside-facing authentication in the gateway and normalize the
   different mechanisms into a signed internal assertion. Forward an external access token only to its intended
   recipient, each receiving service validating it; otherwise exchange it or issue an internal assertion.
7. **Secure internal calls with sidecar mutual TLS keyed to workload identity.** Issue each workload a distinct
   cryptographic identity (such as a SPIFFE-issued X.509 SVID) and let the sidecar enforce mutual TLS on every
   service-to-service connection.
8. **Do not embed authentication in new systems.** Embedded auth fragments identity and rules out SSO; keep it only
   for unchangeable legacy.
9. **Treat network-layer authentication as a complement.** It proves node identity, not user or workload identity,
   so pair it with edge-level or proxy-mediated authentication; network location alone is not trust.
10. **Propagate identity only in a tamper-resistant form.** Whichever pattern you pick, internal services must verify
    the signature on propagated identity and reject any request whose identity context is missing or unsigned.

## @security scenario

```gherkin
@security @owasp:authentication-patterns @usecase:identity-header-spoofing
Scenario: A service rejects a forged identity header from a direct caller
  Given a service that trusts an identity header injected by its sidecar proxy
  When an attacker reaches the service port directly and sends a self-chosen identity header
  Then the request is refused because the service only accepts traffic from its sidecar
  And the sidecar strips or overwrites any inbound identity header before injecting its own verified value
```

This scenario is the canonical copy. When you apply this sheet to real code, add it to the repo's shared
feature-file index (see `bdd-comprehensive-testing`, "Storing BDD scenarios permanently") and wire it into CI
(its "CI/CD wiring") so it runs as a blocking autotest in the same place as every other Gherkin scenario.

## The real guarantee

What actually stops the forged header is that the service never reads identity from an untrusted source: it accepts
traffic only from its sidecar (loopback or a network policy), and the sidecar overwrites every inbound identity
header with its own verified value, or signs it so the service can check the signer. The `@security` scenario proves
one direct-caller attempt is refused; the isolation plus header sanitization is what refuses every such attempt. A
test is a check; the enforced path from proxy to service is the guarantee.

## Sources

- OWASP Authentication Patterns Cheat Sheet (<https://cheatsheetseries.owasp.org/cheatsheets/Authentication_Patterns_Cheat_Sheet.html>, retrieved 2026-10-11): the five patterns and their trust trade-offs, the header-spoofing countermeasures, and the recommendations (edge authentication for external actors, proxy-mediated mTLS with workload identity for internal calls, no embedded auth in new systems, network-layer auth as a complement). `[documented]`
