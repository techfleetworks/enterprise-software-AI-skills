# REST Security

## What it is

How to build a RESTful web service that stays safe: encrypted transport, an access check at every endpoint,
careful token and content-type handling, and correct HTTP semantics. REST calls are stateless, so each one
must stand on its own and prove the caller is allowed to do what it asks. This is the per-sheet guidance
from the OWASP REST Security Cheat Sheet, condensed to the controls that hold and the attacks they stop.

## The attack it stops

Plain HTTP lets anyone on the path read credentials and tamper with data. An endpoint that skips its own
authorization check trusts the caller or the frontend, so a request sent straight to it, out of order, or
with a forged token slips through. A JWT verified using the algorithm named in its own header, or one that
accepts `alg: none`, can be swapped or re-signed by an attacker. Credentials in the URL leak into logs,
unbounded input and content-type confusion open the door to injection and parser attacks, and exposed
management endpoints or verbose errors hand over control and internals.

## Controls

In the cheat sheet's order:
1. **HTTPS only.** Serve every endpoint over TLS to protect credentials and data in transit and let clients
   authenticate the service; consider mutual client certificates for highly privileged services.
2. **Access control at every endpoint.** Non-public calls each enforce authorization. Decide locally at the
   endpoint to cut latency and coupling, and centralize authentication in an identity provider that issues
   access tokens.
3. **JWT.** Require integrity protection by signature or MAC and reject unsecured tokens (`alg: none`).
   Prefer signatures over MACs. Verify using your own configured algorithm, never the one the header names.
   Require and validate `iss`, `aud`, and `exp` (and `nbf` when the profile demands it), and support a
   `jti` denylist so a logout or timeout can revoke a token before it expires.
4. **API keys.** Require a key on every call to a protected endpoint, answer `429` when calls arrive too
   fast, revoke keys that break the usage terms, and never lean on keys alone for high-value resources.
5. **Restrict HTTP methods.** Allowlist the permitted verbs, answer `405` for the rest, and confirm the
   caller is authorized for that verb on that resource.
6. **Prevent out-of-order execution.** Validate workflow state on the server for each request, model the
   flow as explicit states, bind tokens or identifiers to a stage, do not trust the frontend to sequence
   calls, and reject invalid transitions clearly.
7. **Input validation.** Distrust all input, check length, range, format, and type, lean on strong types
   and regexes, reject illegal content, use validation libraries, cap request size (`413` when exceeded),
   log validation failures, and parse with an XXE-safe parser.
8. **Content types.** Make the body match the declared type. Require a supported request `Content-Type`
   where there is a body and answer `415` otherwise, harden XML parsing, and define accepted types
   explicitly. Do not copy the request `Accept` value into the response `Content-Type`; pick a supported
   type that fits the client's preferences or answer `406`, and always send the correct type header.
9. **Management endpoints.** Keep them off the public internet; if they must be reachable, require strong
   or multi-factor auth, isolate them on separate ports, hosts, or subnets, and restrict with firewall
   rules or ACLs.
10. **Error handling.** Return generic errors and keep stack traces and internal hints out of responses.
11. **Audit logs.** Write logs around security events, record token validation errors, and sanitize log
    data to prevent log injection.
12. **Security headers.** On browser-facing responses send `Cache-Control: no-store`, `Content-Security-
    Policy: frame-ancestors 'none'`, a correct `Content-Type`, `Strict-Transport-Security`,
    `X-Content-Type-Options: nosniff`, and `X-Frame-Options: DENY`, plus the HTML-only headers as
    defense in depth.
13. **CORS.** Turn off CORS headers when cross-origin calls are not expected, and otherwise name allowed
    origins as narrowly as possible.
14. **Keep secrets out of URLs.** Pass passwords, tokens, and API keys in the body or headers, never in the
    URL where logs capture them.
15. **Correct status codes.** Return the status code that fits the result instead of overloading `200` or
    `404`.

## @security scenario

```gherkin
@security @owasp:rest-security @usecase:jwt-alg-none
Scenario: The API refuses a JWT that tries to skip signature verification
  Given a REST endpoint that accepts a JWT for access control
  When a caller presents a token whose header sets the algorithm to none
  Then the API rejects it with an authentication failure
  And the API verifies the signature using its own configured algorithm, not the one named in the token header
```

This scenario is the canonical copy. When you apply this sheet to real code, add it to the repo's shared
feature-file index (see `bdd-comprehensive-testing`, "Storing BDD scenarios permanently") and wire it into
CI (its "CI/CD wiring") so it runs as a blocking autotest alongside every other Gherkin scenario.

## The real guarantee

What actually protects a REST API is verifying each token against the server's own configuration and running
an authorization check inside every endpoint: the algorithm is fixed by the service, so a header claiming
`none` cannot disable the check, and each stateless call proves the caller's rights on its own. The
`@security` scenario proves one `alg: none` token is refused; the server-chosen verification algorithm is
what makes every such token fail. A test is a check; the server-side verification is the guarantee.

## Sources

- OWASP REST Security Cheat Sheet (<https://cheatsheetseries.owasp.org/cheatsheets/REST_Security_Cheat_Sheet.html>, retrieved 2026-10-11): HTTPS-only transport, per-endpoint access control, JWT verification and denylisting, API keys, HTTP method restriction, out-of-order execution prevention, input and content-type validation, management-endpoint isolation, error handling, audit logging, security headers, CORS, keeping secrets out of URLs, and correct status codes. `[documented]`
