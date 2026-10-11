# NoSQL Security

## What it is

How to use NoSQL databases (MongoDB, CouchDB, Cassandra, DynamoDB, and others) without the common failures their flexible schemas invite: injection through query objects, open management interfaces, weak authentication, and unsafe defaults. This is the per-sheet guidance from the OWASP NoSQL Security Cheat Sheet, condensed to the controls that hold and the attack they stop. The headline risk is NoSQL injection, where untrusted input becomes part of the query itself.

## The attack it stops

NoSQL drivers take queries as structured objects, so an attacker does not need classic SQL syntax; they need a value that the query engine reads as an operator. If code trusts a client-supplied value as a field, an attacker sends an object like `{ name: { $ne: "" } }`, which MongoDB reads as a not-equal filter that matches every record, bypassing the intended lookup. Worse patterns build the filter by concatenating input into a string and `eval`-ing it, or accept a client-controlled `$where` expression, which runs attacker JavaScript inside the database. Alongside injection, the sheet covers databases left unauthenticated on public IPs, default accounts, and credentials leaked in code or CI logs.

## Controls

In the order the cheat sheet presents them:
1. **Prevent NoSQL injection by validating types before you build the filter.** Never concatenate input into a query string and never `eval` it. Building a query object is not enough on its own, because an untrusted value that is itself an object can carry operators; confirm the value is the expected scalar type (for example `typeof name === 'string'`) before using it as a field value, and do not pass client-supplied objects through as values.
2. **Do not accept raw JSON query fragments from the client to run as queries.** Reject client-controlled operators such as `$where`, `$regex`, and `$expr` unless they are strictly required and validated. Treat a check like scanning the serialized body for `"$"` as a weak denylist, not a substitute for field-specific allow-list validation.
3. **For text search, use safe driver APIs** such as `$text` with controlled input.
4. **Use secure driver and ODM patterns.** Prefer high-level ODM/ORM layers (Mongoose, Spring Data, the Datastax driver) that build queries safely, avoid `.eval()`-style and raw query execution from untrusted data, and sanitize and validate any raw expression before it reaches the database.
5. **Enable authentication and least-privilege authorization.** Never run a database unauthenticated; use role-based access control, give service accounts the narrowest role, use separate users for admin, backup, read-only, and application roles, and use identity federation or short-lived credentials where supported (for example AWS IAM to DynamoDB).
6. **Lock down the network and transport.** Keep each service listening on an internal address rather than `0.0.0.0`; isolate it with segmented networks, private subnets, and security groups; require TLS on every driver connection and admin console; and either disable remote administration or fence it behind VPNs and admin-only networks.
7. **Harden the configuration.** Change default ports, disable sample and demo users, turn off or restrict server-side code execution such as MongoDB server-side JavaScript, and require TLS for internal replication where supported.
8. **Manage secrets properly.** Never embed credentials in source; store them in a dedicated secrets vault such as Vault, AWS Secrets Manager, or Azure Key Vault; keep them out of container images and CI logs; and rotate them regularly, favoring short-lived tokens.
9. **Log, monitor, and audit.** Record connection attempts, admin actions, and failed authentication; send logs to a tamper-evident SIEM; alert on anomalies such as query spikes, slow queries, and large exports; and watch for suspicious commands like `$where` and map-reduce jobs.
10. **Secure backups.** Encrypt them at rest and in transit, restrict access to backup storage, strip PII where policy requires, and test restores regularly.
11. **Keep the supply chain patched.** Update drivers, ODMs, and plugins, since vulnerable dependencies are an entry point.
12. **Follow the summary rules.** Do use driver query objects, validate and allow-list user-supplied field names, restrict management interfaces, and require MFA for admin access. Do not expose database ports or consoles to the internet, accept raw client JSON queries, use root or admin accounts for the application, or rely on network controls alone to cover badly written queries.

## @security scenario

```gherkin
@security @owasp:nosql-injection @usecase:operator-injection-auth-bypass
Scenario: A query rejects an operator object submitted where a scalar is expected
  Given a lookup endpoint that filters users by a name value from the request
  When an attacker submits name as the object { "$ne": "" } instead of a string
  Then the request is rejected because the value fails the scalar-type check
  And no query runs that would match every user record
```

This scenario is the canonical copy. When you apply this sheet to real code, add it to the repo's shared feature-file index (see `bdd-comprehensive-testing`, "Storing BDD scenarios permanently") and wire it into CI (its "CI/CD wiring") so it runs as a blocking autotest alongside every other Gherkin scenario.

## The real guarantee

The thing that actually makes operator injection impossible is the type check that runs before the filter is built: if a field value must be a string and the code rejects anything that is not, an attacker's `{ $ne: "" }` object never reaches the query engine as an operator. The `@security` scenario proves one operator object is rejected; the enforced scalar-type validation is what makes every operator-smuggling payload fail. A test is a check; the type validation before query construction is the guarantee.

## Sources

- OWASP NoSQL Security Cheat Sheet (<https://cheatsheetseries.owasp.org/cheatsheets/NoSQL_Security_Cheat_Sheet.html>, retrieved 2026-10-11): the threat list and secure-by-design principles, NoSQL injection prevention (type validation before filter building, rejecting client operators and raw JSON, safe driver/ODM use), authentication and RBAC, network and TLS hardening, configuration hardening, secrets management, logging and auditing, backups, and the do/don't checklist. `[documented]`
