# gRPC Security

## What it is

How to secure a gRPC service: a high-performance RPC framework that rides on HTTP/2 and Protocol Buffers.
Its streaming, interceptors, and binary messages raise security questions that differ from plain REST.
This is the per-sheet guidance from the OWASP gRPC Security Cheat Sheet, condensed to the controls that
hold and the attacks they stop.

## The attack it stops

Without TLS, traffic can be read or altered in transit by anyone on the path. If a method lacks an auth
check, a caller invokes it freely, and a common trap is guarding only unary calls while streaming methods
stay open, because a unary interceptor never runs for a stream. Protocol Buffers give you types but not
business rules, so an unvalidated field can still carry SQL or command injection. Oversized messages, long
streams, and request floods exhaust CPU and memory. Verbose errors and left-on reflection hand an attacker
your internals and a full map of the service's methods and messages.

## Controls

In the cheat sheet's order:
1. **Transport security.** Serve TLS 1.2 or higher with strong ciphers in production and turn off weak
   protocols. For service-to-service calls use mutual TLS so each side verifies the other, and rotate
   short-lived certificates automatically (90 days or less).
2. **Authentication.** Check identity on every protected method. Carry tokens or API keys in request
   metadata, never in method parameters. Keep tokens short-lived (roughly 15 to 60 minutes) with refresh.
   Protect streaming methods with checks in a stream interceptor, not only a unary one.
3. **Authorization.** Enforce method-level checks under least privilege, mapping each method to the role
   it needs, and log every authorization failure.
4. **Input validation.** Validate each Protocol Buffer message on the server (for example with
   protoc-gen-validate), allowlist string fields, and run database queries through prepared, parameterized
   statements to stop injection.
5. **Message and stream limits.** Set size caps for received and sent messages in both directions. Because
   one stream can carry many valid messages, also cap messages per stream and session duration so a
   per-message limit is not the only bound.
6. **Rate limiting and timeouts.** Limit request rate per client for unary calls, admit streams through a
   stream interceptor, and enforce per-message limits inside a stream. Base each limit on the connection
   you trust or the authenticated caller, never on headers that were merely forwarded. A per-process store
   does not span replicas,
   so use a shared limiter when limits must hold across instances. Set client and server timeouts.
7. **Error handling.** Return generic messages to the caller while logging the detail server-side, and use
   the right status codes (`UNAUTHENTICATED`, `PERMISSION_DENIED`, `INVALID_ARGUMENT`).
8. **Security logging and monitoring.** Record auth attempts, authorization failures, and suspicious
   activity with correlation IDs and no secrets; watch request rates, failure rates, and odd traffic, and
   alert on spikes. Use distributed tracing for cross-service analysis.
9. **Reflection and service discovery.** Turn off gRPC reflection in production, and protect service
   discovery with mTLS, RBAC, or a service mesh so endpoints cannot be spoofed.
10. **Security testing.** Test every method for auth and authorization, field validation, rate limiting,
    message-size enforcement, and error-message disclosure, using tools such as `grpcurl`.

## @security scenario

```gherkin
@security @owasp:grpc @usecase:streaming-auth-bypass
Scenario: A streaming gRPC method rejects an unauthenticated caller
  Given a gRPC service whose streaming method requires authentication
  When a caller opens the stream with no valid token in metadata
  Then a stream interceptor denies the call with an UNAUTHENTICATED status before the handler runs
  And the attempt is logged as an authentication failure
```

This scenario is the canonical copy. When you apply this sheet to real code, add it to the repo's shared
feature-file index (see `bdd-comprehensive-testing`, "Storing BDD scenarios permanently") and wire it into
CI (its "CI/CD wiring") so it runs as a blocking autotest alongside every other Gherkin scenario.

## The real guarantee

What actually protects a gRPC service is enforcing the check in the interceptor that runs for the call type
being made: a unary interceptor cannot guard a stream, so the stream interceptor is what closes that gap.
The `@security` scenario proves one unauthenticated stream is refused; the stream interceptor running before
the handler is what makes every unauthenticated stream fail. A test is a check; the interceptor on the
right call path is the guarantee.

## Sources

- OWASP gRPC Security Cheat Sheet (<https://cheatsheetseries.owasp.org/cheatsheets/gRPC_Security_Cheat_Sheet.html>, retrieved 2026-10-11): transport security (TLS and mTLS), authentication and authorization via metadata and interceptors (including the unary-versus-stream gap), Protocol Buffer validation and injection prevention, message-size and stream limits, rate limiting and timeouts, secure error handling and logging, disabling reflection, securing service discovery, and security testing. `[documented]`
