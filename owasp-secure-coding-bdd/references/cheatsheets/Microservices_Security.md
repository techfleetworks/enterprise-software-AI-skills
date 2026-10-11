# Microservices Security

## What it is

How to place authentication and authorization correctly across a system split into many services, so that
identity is proven once at the edge, every service still enforces its own access rules, and service-to-service
calls are authenticated. This is the per-sheet guidance from the OWASP Microservices Security Cheat Sheet,
condensed to the patterns that hold and the attacks they stop. It focuses on the two design-phase requirements
that matter most in this architecture: who the caller is, and what that caller is allowed to do.

## The attack it stops

In a microservice system, trusting the perimeter alone is the mistake. If only the gateway checks access, an
attacker who reaches a service directly, by slipping past the gateway or calling from inside the network, runs
operations no one authorized. If services accept calls from each other without proving who is calling, one
compromised or spoofed service can impersonate another and move laterally. If user identity is forwarded in a
form a receiving service cannot validate, a tampered assertion grants access it should not. And if the logging
pipeline is unauthenticated or leaks secrets, an attacker can inject or sniff log traffic, or harvest sensitive
data that was written into the logs.

## Controls

The sheet's patterns, in order:
1. **Edge-level authorization.** Use the gateway to turn away unauthorized ingress and to stop traffic that would
   bypass it, but treat this as coarse filtering only. It does not establish that any downstream operation is
   authorized.
2. **Service-level authorization.** Every service enforces access to its own protected operations, including
   calls coming from other internal services. As the system grows, prefer shared, reviewed policies, while each
   service still applies the object-, tenant-, and business-specific rules it alone has the context for.
3. **External entity identity propagation.** Carry the authenticated user's context in a shape every
   downstream service is able to check, and prove the calling service's identity separately. A signature protects an
   assertion's integrity but does not by itself grant access to the requested resource.
4. **Service-to-service authentication.** Pick one of two established patterns.
   - **Mutual TLS.** Each service carries a key pair and authenticates to the service it calls over mTLS, which
     also gives confidentiality and integrity. It is usually backed by a self-hosted PKI, and its hard parts are
     provisioning keys, bootstrapping trust, revoking certificates, and rotating them.
   - **Token-based.** The caller obtains a signed token from a token service using its own service ID and
     password, then attaches it (for example in an HTTP header) to each outgoing request; the callee extracts and
     validates it. Choose how you validate based on how fast revocation must take effect, token lifetime, and
     availability needs:
     - **Online validation** queries the token service (with OAuth, introspection tells you whether a token
       remains active and can surface a revocation the authorization server knows about), at the cost of latency
       and a dependency on that service; if you cache
       introspection results, bound the cache to the freshness you need and never past token expiry.
     - **Local validation** verifies a signed token with trusted issuer keys and the right token profile (for
       JWT access tokens, RFC 9068 defines the rules, and signature checking alone is not enough). It avoids a
       per-request call but cannot see server-side revocation before expiry, so pair it with short lifetimes or a
       revocation mechanism that meets your required response time.
   - Neither validation path replaces service-level authorization, and a request is rejected when the required
     token validation cannot be completed. Token-based auth normally runs over TLS for in-transit confidentiality
     and integrity.
5. **Logging architecture.** Build audit logging for accountability and anomaly detection on these principles:
   each service writes log messages to local output (stdout/stderr); a per-host logging agent collects and
   forwards them; a message broker (such as NATS or Kafka) decouples collection from a central logging service
   that subscribes and processes them. Within that pattern:
   - Buffer logs locally so a brief downstream outage does not stop collection, but accept that local files are
     not lossless, since storage limits, rotation, and node loss can drop records before shipping.
   - Run a dedicated agent per host; after it recovers from a failure it can only resend records still held
     locally.
   - Use the broker to decouple collection from processing, set buffer limits and overflow behavior, monitor
     delivery failures, and test outage recovery; a broker alone neither prevents log loss nor stops denial of
     service.
   - Have the agent and broker authenticate each other mutually (for example with TLS) and encrypt the log
     traffic, which counters service and transport spoofing, traffic injection, and sniffing.
   - Make the broker enforce an access-control policy and least privilege, which counters privilege escalation.
   - Strip secrets and needless sensitive data before a service emits any log entry, even to local files or
     stdout; agent-side filtering is a backstop and cannot unwrite what is already on disk.
   - Generate a correlation ID that uniquely marks each call chain, and have the agent attach it to every
     message so related entries group together.
   - Have the agent report its own health and availability, publish logs in a structured format (such as JSON or
     CSV), and append context like hostname, container, class, and filename.

## @security scenario

```gherkin
@security @owasp:microservices @usecase:bypass-gateway-direct-call
Scenario: A service rejects a direct internal call that skipped the gateway
  Given an internal microservice that enforces its own authorization on every request
  When another service calls a protected operation without a valid, authenticated service token
  Then the operation is refused because the required token validation did not complete
  And the call succeeds only after the caller is authenticated and authorized at the service itself
```

This scenario is the canonical copy. When you apply this sheet to real code, add it to the repo's shared
feature-file index (see `bdd-comprehensive-testing`, "Storing BDD scenarios permanently") and wire it into CI
(its "CI/CD wiring") so it runs as a blocking autotest in the same place as every other Gherkin scenario.

## The real guarantee

The thing that actually stops a bypassed-perimeter or lateral attack is authorization enforced at each service,
on each request, over an authenticated caller identity: the gateway can be skipped, but the service itself still
refuses an unauthorized or unauthenticated call. The `@security` scenario proves one direct internal call is
turned away; per-service authorization plus service-to-service authentication are what make every path into the
operation safe. A test is a check; the per-service enforced authorization is the guarantee.

## Sources

- OWASP Microservices Security Cheat Sheet (<https://cheatsheetseries.owasp.org/cheatsheets/Microservices_Security_Cheat_Sheet.html>, retrieved 2026-10-11): the patterns for edge- and service-level authorization, external entity identity propagation, service-to-service authentication by mutual TLS or signed tokens (online versus local validation), and the audit-logging architecture with its security recommendations. `[documented]`
