# Authorization Testing Automation

## What it is

How to keep an application's access rules from silently breaking across releases by driving an automated test
from an authorization matrix. The matrix lists, for each feature, which logical roles may use it (and
optionally a data dimension), and an integration test replays every role against every service and compares the
result to the matrix. This is the per-sheet guidance from the OWASP Authorization Testing Automation Cheat
Sheet, condensed to the controls that hold.

## The attack it stops

Most authorization bugs do not appear at launch; they creep in when a later release adds or changes a feature
and nobody checks the effect on access rules, usually to save time or money. The result is a role that should be
blocked gaining access. The sheet's own sample run shows it: with the test in place, the anonymous point of view
calls `DeleteMessage` and `CreateMessage` and gets `200` where `403` was expected, meaning an unauthenticated
caller can create and delete messages. A matrix-driven test flags that the moment the release is built, rather
than after it reaches production.

## Controls

In the cheat sheet's order:

1. **Record the authorization model as a matrix of two dimensions:** which feature is involved and which logical
   role is allowed to reach it. Add a third dimension, data, when access also turns on filtering business
   records. When you test, each logical role becomes a point of view.
2. **Formalize the matrix in a pivot file, kept apart from the code,** so that a program can process it, a
   person can read and update it as the combinations change, the roles can be arranged in a hierarchy to build
   combinations easily, and it stays as free as it can from the specific technology and design the app is built
   with.
   - The example uses XML with three sections: `roles` (each logical role and its access level), `services`
     (each exposed service with its URI, HTTP method, the allowed and denied response codes, and the roles that
     may call it), and `services-testing` (a test payload for any service that needs input beyond the URL or
     path). Placeholders in `{}` mark where the test injects values.
3. **Build integration tests that read the pivot file as their only source of truth,** so the test needs little
   maintenance when the matrix changes, and a failure names the exact role-and-service combination that breaks
   the matrix.
4. **Write one test case per point of view (role), sharing as much code as possible,** so results are grouped by
   access level and failures are easy to read. Load and parse the matrix once (the sample unmarshals the XML
   into an object with JAXB), then for each role call every service and compare the HTTP status to the matrix:
   if the role is listed for that service the call must return the allowed code, otherwise it must return the
   denied code, and any other outcome is an error. Issue each point of view its own access token (a JWT) for the
   matching role.
   - Harden the XML parsing against XXE: the sample turns off external general entities, external parameter
     entities, and external DTD loading before it reads the matrix file.
5. **Render the matrix for human audit and review.** It stays in a readable format, but an on-the-fly rendering
   (the sample applies an XSL stylesheet that turns the XML into an HTML table of roles and their service
   mappings) makes it easier to spot inconsistencies and to discuss, review, and audit the rules.
6. **Run the matrix test whenever a new release is created,** so the team learns right away whether a change
   conflicts with the authorization definition or its implementation.

## @security scenario

```gherkin
@security @owasp:authorization-testing-automation @usecase:release-authz-drift
Scenario: A new release cannot grant a role access the matrix denies
  Given an authorization matrix that denies the anonymous role the DeleteMessage service
  And an integration test that replays every role against every service
  When the suite runs the anonymous point of view against DeleteMessage on the new release
  Then the service returns the denied code 403, not the allowed code 200
  And the test fails and names the role-and-service combination that broke the matrix
```

This scenario is the canonical copy. When you apply this sheet to real code, add it to the repo's shared
feature-file index (see `bdd-comprehensive-testing`, "Storing BDD scenarios permanently") and wire it into CI
(its "CI/CD wiring") so it runs as a blocking autotest in the same place as every other Gherkin scenario.

## The real guarantee

The thing that actually catches authorization drift is the matrix held as the single source of truth plus a
test that replays every role against every service on every release. The scenario proves one denied combination
stays denied; the matrix-driven suite is what holds all of them as features change. A test is a check; the
matrix tied to an on-every-release suite is the guarantee.

## Sources

- OWASP Authorization Testing Automation Cheat Sheet (<https://cheatsheetseries.owasp.org/cheatsheets/Authorization_Testing_Automation_Cheat_Sheet.html>, retrieved 2026-10-11): the two-dimension authorization matrix, the XML pivot-file format and its three sections, the per-point-of-view integration test that compares HTTP status to the matrix (with hardened XML parsing), the XSL rendering for audit, and the run-on-every-release objective summarized above. `[documented]`
