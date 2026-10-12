# REST Assessment

## What it is

How to security-test a RESTful web service, where the real challenge is that the attack surface is hidden:
the client UI rarely exercises every path, parameters live in URLs and headers in non-standard ways, and
custom token auth defeats tools that expect a login form. This is the per-sheet guidance from the OWASP
REST Assessment Cheat Sheet, condensed to the checks that hold and the weaknesses they expose.

## The attack it stops

A REST service you cannot fully see is a service you cannot fully defend. An attacker who maps the real
endpoints and fields will find the ones you never tested: an object endpoint that trusts an ID without
checking ownership (BOLA/IDOR), a create or update call that writes fields you never advertised (mass
assignment), token checks that accept a tampered, expired, or wrong-audience JWT, and endpoints with no
throttling that make credential guessing and data harvesting cheap. A disciplined assessment finds these
first.

## Controls

The cheat sheet's assessment method, in order:
1. **Recover the attack surface from documentation.** Look for a formal description (WADL or WSDL 2.0 can
   describe REST), a developer guide, or the service definition in source and config files.
2. **Capture full requests through a proxy.** Record whole requests, not just URLs, since REST uses more
   than GET parameters.
3. **Analyze requests to find hidden parameters.** Watch for unusual headers acting as parameters, URL
   segments with a repeating date/number/ID pattern, structured JSON or XML values, an extensionless final
   segment, and segments that take many different values.
4. **Verify suspected parameters.** Set a URL segment to an invalid value: a `404` points to a real path
   element, while an application-level message points to a parameter.
5. **Tune the fuzzing.** From observed values, focus on marginal invalid inputs (such as `0` for an
   always-positive field) and on sequences that reach beyond the range meant for the current user, and
   emulate the service's authentication while fuzzing.
6. **Assess OpenAPI/Swagger descriptions.** Probe `/openapi.json`, `/swagger.json`, and `/docs` first,
   reconcile the description against real behavior (an accepted undefined field is a discrepancy to
   investigate against the intended schema and policy, not automatic proof of a flaw), fuzz from a valid
   schema-conformant request by mutating one constraint at a time, and build a per-operation matrix from
   the effective `security` requirements: no credentials, a valid token, and a token missing the needed
   requirement.
7. **Test JWT and OAuth2 handling first.** Tamper with claims and re-sign with your own key, strip the
   signature, and try `alg: none` and algorithm confusion. Send expired (`exp`), not-yet-valid (`nbf`),
   and wrong-issuer or wrong-audience tokens, plus malformed tokens, and confirm clean auth failures.
   Check that scopes and roles are enforced on reads and writes alike.
8. **Test for BOLA.** Run the swap test: make the same object under two accounts and replay each request
   under the other session's identifiers across `GET`, `PUT`, `PATCH`, and `DELETE`. Prefer identifiers the
   other session can already see, include nested routes, test vertical escalation (BFLA), and repeat for
   every object type.
9. **Test for mass assignment.** Append extra fields the contract never lists (such as a role, a verified
   flag, or an internal ID), then read the object back to confirm it persisted and changed behavior, not
   just that it echoed.
10. **Test rate limiting and throttling.** Drive auth, token, and recovery endpoints, exercise expensive
    operations, figure out which key the throttle counts against (an address-based cap falls to simply
    switching IP), and record the limit, its trigger point, and the response.

## @security scenario

```gherkin
@security @owasp:rest-assessment @usecase:bola-swap-test
Scenario: One tenant cannot read another tenant's object by its identifier
  Given two accounts that each own a separate order
  When one account replays the other account's GET request using that order's identifier
  Then the API denies access and returns no data for the order it does not own
  And the same ownership check applies to PUT, PATCH, and DELETE on that resource
```

This scenario is the canonical copy. When you apply this sheet to real code, add it to the repo's shared
feature-file index (see `bdd-comprehensive-testing`, "Storing BDD scenarios permanently") and wire it into
CI (its "CI/CD wiring") so it runs as a blocking autotest alongside every other Gherkin scenario.

## The real guarantee

What actually protects a REST service is a per-object authorization check that runs for every verb on every
resource, proven against the full attack surface the assessment recovers, not only the endpoints the UI
happens to call. The `@security` scenario proves one cross-tenant read is denied; the ownership check on
every verb and object is what makes every swap attempt fail. A test is a check; the server-side ownership
enforcement across the whole surface is the guarantee.

## Sources

- OWASP REST Assessment Cheat Sheet (<https://cheatsheetseries.owasp.org/cheatsheets/REST_Assessment_Cheat_Sheet.html>, retrieved 2026-10-11): recovering the attack surface from documentation and proxy captures, identifying and verifying non-standard parameters, tuning fuzzing, assessing OpenAPI/Swagger descriptions, JWT and OAuth2 token testing, BOLA swap testing, mass-assignment testing, and rate-limiting assessment. `[documented]`
