# Serverless / FaaS Security

## What it is

How to secure functions-as-a-service (FaaS) like AWS Lambda, Azure Functions, and Google Cloud Functions. These
short-lived, event-driven functions run in managed, shared environments, which creates risks a traditional
always-on server does not have. This is the per-sheet guidance from the OWASP Serverless / FaaS Security Cheat
Sheet, condensed to the controls that hold and the attack they stop.

## The attack it stops

The serverless model opens specific holes. A function with a wildcard IAM role lets an attacker who reaches it do
anything in the account. An unvalidated event payload from an API gateway or a storage trigger carries injection
straight into the function. Secrets left in global variables or `/tmp` leak across invocations, because the
runtime context is not guaranteed clean between calls. A compromised function can chain into others it is allowed
to call. Hardcoded secrets in code or platform config sit there for anyone who reads them. Tight permissions,
validated input, runtime-fetched secrets, and restricted network access are what shut these down.

## Controls

The cheat sheet gives these practices, in order:

1. **Least privilege.** Give each function the smallest IAM permissions it needs, use a separate role per
   function instead of one shared high-privilege role, and scope database and API keys to the exact actions
   required. Never grant `"Action": "*"` on `"Resource": "*"`; grant only the specific actions on the specific
   resource (for example `dynamodb:GetItem` on one table ARN).
2. **Environment isolation.** Turn off default network access unless the function needs it, place functions in
   private subnets with controlled egress, keep sensitive functions (payments, auth) apart from general ones, and
   keep production and staging strictly separated.
3. **Secure invocation.** Require authentication and authorization on every trigger (API gateway, Pub/Sub, S3,
   IoT), make each function-to-function call prove itself with a signed token or a workload identity, and apply rate
   limiting and throttling to blunt denial-of-service and abuse. For example, configure a JWT authorizer on the API gateway
   that checks the issuer and audience.
4. **Event data validation.** Treat every event payload as untrusted. Validate length, type, and format;
   defend against injection (SQLi, XSS, JSON injection, deserialization); and drop fields and metadata you do
   not need before processing.
5. **Cold start and execution-context safety.** Do not assume the runtime is fresh between invocations. Keep
   secrets and sensitive temporary data out of global or static variables, guard against side-channel leaks such
   as timing differences and leftover `/tmp` files, and use single-use execution environments for sensitive work
   when the platform offers them.
6. **Secrets management.** Pull secrets at runtime from a vault or a caching extension rather than from
   function environment variables, use ephemeral credentials (STS, workload identity federation), and rotate
   secrets automatically.
7. **Monitoring and logging.** Send logs to a central place (CloudWatch, Azure Monitor, GCP Logging), and mask
   secrets and PII before they are written (for example, redact any field whose name contains `password`).
8. **Supply chain security.** Scan dependencies (`npm audit`, `pip-audit`, `safety`), ship minimal deployment
   packages, and sign packages then verify the signature against an approved publisher before deploying, since a
   checksum alone does not prove who built it. On AWS Lambda, use a code signing configuration with
   `UntrustedArtifactOnDeployment` set to `Enforce` rather than the default `Warn`, and sign any layers too.

## @security scenario

```gherkin
@security @owasp:serverless @usecase:least-privilege-function-role
Scenario: A compromised function cannot act beyond its scoped IAM role
  Given a serverless function whose role allows only dynamodb:GetItem and dynamodb:PutItem on the Orders table
  When an attacker who controls the function attempts to delete an unrelated S3 bucket
  Then the platform denies the call because the role grants no such permission
  And no wildcard action or resource is present in the function's policy
```

This scenario is the canonical copy. When you apply this sheet to real code, add it to the repo's shared
feature-file index (see `bdd-comprehensive-testing`, "Storing BDD scenarios permanently") and wire it into CI
(its "CI/CD wiring") so it runs as a blocking autotest in the same place as every other Gherkin scenario.

## The real guarantee

The thing that actually caps the damage from a compromised function is the scoped, per-function IAM role: even
with full control of the code, an attacker can only do the few actions the role allows on the resources it names.
The `@security` scenario proves one out-of-scope call is denied; the least-privilege role is what denies every
such call. A test is a check; the per-function scoped IAM policy is the guarantee.

## Sources

- OWASP Serverless / FaaS Security Cheat Sheet (<https://cheatsheetseries.owasp.org/cheatsheets/Serverless_FaaS_Security_Cheat_Sheet.html>, retrieved 2026-10-11): the key risks and the ordered best practices covering least privilege, environment isolation, secure invocation, event validation, cold-start safety, runtime secrets management, monitoring and logging, and supply chain signing. `[documented]`
