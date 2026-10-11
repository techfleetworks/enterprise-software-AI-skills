# Authorization Regression Testing

## What it is

How to stop later code changes from quietly breaking access controls that worked at launch, by running an
automated authorization suite on every build. It turns point-in-time manual testing into a continuous,
developer-owned regression suite that catches broken access control, insecure direct object reference (IDOR),
and tenant-isolation failures before they ship. This is the per-sheet guidance from the OWASP Authorization
Regression Testing Cheat Sheet, condensed to the controls that hold and the attack they stop.

## The attack it stops

Authorization rarely stays still. New endpoints appear, data layers get refactored, services get split apart,
and any of those changes can silently drop a check that used to be there. Broken access control topped the
OWASP Top Ten in 2021, and IDOR is one of its most-exploited forms. The concrete case is the multi-user replay:
after a data-layer refactor removes a server-side ownership check, User B requests User A's invoice by its id
and gets back `200 OK` with A's data instead of a refusal. Vertical escalation (a normal user reaching an
admin-only endpoint) and tenant leakage (one tenant's records showing up in another tenant's query) fail the
same way. A regression suite replays these attacks on every build so the regression is caught before merge, not
in production.

## Controls

In the cheat sheet's order:

1. **Design a central, machine-readable authorization matrix** instead of scattered one-off cases.
   - Describe the access model with the Actor-Resource-Action pattern: the actor (who is trying, e.g.
     `Tenant_Admin`, `Standard_User`, `Anonymous_User`), the resource (what is being reached, e.g.
     `Invoice_123`, `/api/v2/users`, `System_Settings`), and the action (the operation, e.g. `READ`, `CREATE`,
     `DELETE`, `EXECUTE`).
   - Keep the matrix in `JSON`, `YAML`, or structured fixtures, not a spreadsheet, so the framework can
     generate cases and you maintain less by hand as the policy evolves.
2. **Build regression patterns that target the ways authorization usually rots.**
   - *Horizontal escalation / IDOR (the multi-user replay):* sign in as User A, create a resource, and save its
     id; sign in as User B (same role, different account) and try to read, update, and delete A's resource.
     Expect `403` or `404` (so you do not leak whether the resource exists), never `200`. The root cause is a
     missing server-side ownership check on the object id.
   - *Vertical escalation (the role demotion check):* point tests at admin-only endpoints (e.g.
     `/api/admin/users/delete`), loop through every non-admin role including the unauthenticated one, and try to
     run them. Each endpoint must reject the request itself; hiding a button in the UI is not enforcement, since
     anything on the client is trivial to get around, so the check has to live in the API.
   - *Tenant isolation (the cross-tenant boundary test):* set up two tenants, seed data into the first, then run
     broad reads (e.g. `GET /api/all-records`) as a user from the second. The response must carry zero records
     from the first tenant; even one leaked id is a critical failure.
3. **Drive validation from the API contract.**
   - Declare authorization in the OpenAPI contract through its `securitySchemes` and `security` fields, both
     globally and on each operation, then test the declared schemes and required scopes against the real access
     policy. Use a check like Schemathesis `ignored_auth` to probe missing and invalid credentials, and add
     your own tests with valid tokens that lack a required scope, because rejecting a missing credential does
     not prove scope enforcement works.
   - Enforce those contract definitions in the API gateway or framework middleware, and add a regression test
     that the middleware was not turned off or bypassed by a refactor.
4. **Put the tests in the normal developer toolkit, next to functional tests.**
   - Use the stack's standard runner (`pytest`, `Jest`, `JUnit`) so the barrier is low and the suite runs
     inside the same CI pipeline that already runs the functional tests.
   - Supplement the matrix with schema-driven generation, but write your own expired-token and missing-scope
     fixtures, each with the denial response you expect, rather than assuming the contract produces those
     credentials; Dredd hooks can rewrite requests and set custom expectations.
   - Make switching identity cheap: swap the JWT in the `Authorization` header instead of running a full login
     for every test.
5. **Gate merges on the suite in CI/CD.**
   - Make the authorization suite a required check so a failing test blocks the pull request from merging.
   - Tag the authorization tests as their own group (e.g. `@pytest.mark.authz` or an `authz-tests` script) so
     developers can run them fast and alone during local work.
   - Watch lower environments for unusual spikes of `401` or `403` during integration runs, which can mean a
     functional change is colliding with an existing access control.

## @security scenario

```gherkin
@security @owasp:authorization-regression-testing @usecase:idor-multi-user-replay
Scenario: One user cannot reach another user's resource after a refactor
  Given User A has created a private resource
  And User B holds the same role on a different account
  When User B requests User A's resource by its identifier to read, update, or delete it
  Then the API returns 403 Forbidden or 404 Not Found
  And it never returns 200 OK carrying User A's data
```

This scenario is the canonical copy. When you apply this sheet to real code, add it to the repo's shared
feature-file index (see `bdd-comprehensive-testing`, "Storing BDD scenarios permanently") and wire it into CI
(its "CI/CD wiring") so it runs as a blocking autotest in the same place as every other Gherkin scenario.

## The real guarantee

The thing that actually keeps authorization from rotting is the server-side ownership and role check on every
request, verified against the matrix on every build and gated so a failure blocks the merge. The scenario
proves one replay is blocked; the enforced check plus the blocking CI gate are what keep each future change from
reopening the hole. A test is a check; the gated, matrix-driven suite is the guarantee.

## Sources

- OWASP Authorization Regression Testing Cheat Sheet (<https://cheatsheetseries.owasp.org/cheatsheets/Authorization_Regression_Testing_Cheat_Sheet.html>, retrieved 2026-10-11): the Actor-Resource-Action matrix, the horizontal, vertical, and tenant-isolation regression patterns, contract-driven validation with OpenAPI and Schemathesis, framework integration, and the CI/CD gating rules summarized above. `[documented]`
