# Multi-Tenant Security

## What it is

How to keep one customer's data away from another customer's when many tenants share the same application, code,
and often the same database. Multi-tenancy powers most SaaS, but shared infrastructure means a single bug or
misconfiguration can leak across every tenant at once. This is the per-sheet guidance from the OWASP Multi-Tenant
Application Security Cheat Sheet, condensed to the controls that hold and the attack they stop.

## The attack it stops

Because tenants share a stack, the dangerous failures are cross-tenant ones: data from one tenant surfacing to
another, an attacker slipping into a different tenant's context, or weak separation at the database, cache, storage,
or compute layer. The classic case is IDOR: an endpoint that looks up a record by its id alone returns a document
that belongs to someone else's tenant. Related attacks include forging a tenant identifier in a header, token, or
queued message; poisoning a shared cache or queue; escalating from a tenant admin into platform-wide access; and one
tenant starving shared resources so others go down. The fix is to verify tenant context against a real identity and
to enforce an isolation boundary every path must cross.

## Controls

Following the cheat sheet's best practices:

1. **Establish and verify tenant context.** Set the tenant early in the request, in middleware. Treat any
   tenant id a client supplies (header, parameter, token claim) as a selector only, then confirm the authenticated
   principal actually has active membership in that tenant before acting. Bind context to the server-verified
   identity and pass it to downstream components without letting them swap in unverified input.
2. **Pick a database isolation strategy and enforce it.** Separate databases give the strongest boundary at the
   highest cost; separate schemas need disciplined roles and `search_path` handling; shared row-level tables need
   enforceable ownership, full policy coverage, a constrained request role, and negative tests. With PostgreSQL
   row-level security, enable and `FORCE` RLS on tenant tables and scope policies to the current tenant. Remember
   `FORCE` does not stop a superuser or `BYPASSRLS` role, so run ordinary tenant requests through a least-privileged
   role, keep privileged connections for migrations and authorized admin jobs, and check the role actually deployed
   (`rolsuper`, `rolbypassrls` in `pg_roles`), not just what config claims.
3. **Keep tenant context transaction-local.** Set it with `SET LOCAL` or `set_config(..., true)` inside a
   transaction, re-establish it for every transaction, never trust a freshly borrowed pooled connection to carry
   the right value, fail closed when context is missing, and commit or roll back before returning the connection.
   ORM-level filtering (for example SQLAlchemy `do_orm_execute` with `with_loader_criteria`) is useful defense in
   depth but does not cover raw SQL or bulk paths, so let database policies be the final boundary.
4. **Verify isolation through the real path.** Test with the same role, connection, and pooling the app uses. Prove
   cross-tenant operations are denied and same-tenant ones succeed for every protected table, derive the expected
   table list from the schema (via `pg_class` and `pg_policies`) rather than a hand-kept list that can drift, fail a
   config test if the request role can bypass RLS, and run two tenants over reused connections to prove no leftover
   context leaks.
5. **Prevent IDOR.** For every tenant-scoped resource, confirm the caller may act in that resource's tenant.
   Fold tenant scope into the lookup (a composite `tenant_id` plus `resource_id` is one option) and enforce
   authorization at a boundary every access path crosses, with data-layer checks as backup. Return the same
   not-found response whether or not the record exists for another tenant, so you do not reveal it. Opaque ids help
   against enumeration but are not authorization.
6. **Isolate cache and sessions.** Label each cached value global, tenant-scoped, or user-scoped. Put the tenant id
   in the key of anything that varies by tenant, give shared entries an explicit global namespace, and include
   every other factor that changes the result (user, locale, permission version). Authorize before reading a
   protected value, since key separation is not authorization, and use separate cache instances when you need
   stronger physical isolation.
7. **Guard APIs, async work, and shared resources.** Add tenant identity as one dimension of rate limiting
   alongside global, endpoint, user, and IP limits, and extend tenant-aware limits to other bottlenecks (queued
   work, concurrency, DB connections, CPU) that can let one tenant degrade others. Validate tenant context on every
   tenant-scoped request, bind API credentials to specific tenants and scopes, and sign B2B requests over the
   security-relevant context. For async work, carry tenant context from the authenticated producer through trusted
   routing or an integrity-protected payload, then re-authenticate and re-authorize at the consumer; a shared queue
   is not itself an isolation boundary.
8. **Isolate file and blob storage.** Classify objects, partition tenant-scoped ones under a tenant-aware key or
   bucket, and authorize the exact object and operation before serving it or signing a URL. Keep signed URLs narrow
   in object, method, and lifetime, validate that a supplied path cannot escape the tenant prefix, and use
   tenant-specific encryption keys when the compliance model demands cryptographic isolation.
9. **Secure onboarding and offboarding.** Provision new tenants with isolated resources and per-tenant keys where
   required, and keep an audit trail of provisioning and deprovisioning. On offboarding, revoke sessions and API
   keys, export data only when policy requires, and enforce your retention and deletion rules everywhere the
   tenant's data can live: active stores, caches, object versions, replicas, exports, and backups, while
   restricting anything held for legal reasons. For single-tenant recovery from a shared backup, restore into a separate resource, selectively recover
   only the target tenant, reapply current access rules, and test that another tenant's records stay absent and an
   unauthorized restore is rejected.
10. **Log and monitor per tenant.** Attach verified tenant context to tenant-scoped security and audit events. A
    central audit store is fine if reads enforce tenant scope and cross-tenant reads need an explicit platform
    permission (a tenant admin is not automatically a platform auditor). Keep audit writes append-only and backed
    by database or WORM controls, alert on denied or repeated cross-tenant access attempts, and never log sensitive
    tenant data in clear text.

## @security scenario

```gherkin
@security @owasp:multi-tenant @usecase:cross-tenant-idor
Scenario: A document request cannot reach another tenant's record
  Given an authenticated user whose verified context belongs to tenant A
  When the user requests a document id that belongs to tenant B
  Then the lookup is scoped to tenant A and returns the same not-found response as a missing record
  And no tenant B data is returned even though the id is valid
```

This scenario is the canonical copy. When you apply this sheet to real code, add it to the repo's shared
feature-file index (see `bdd-comprehensive-testing`, "Storing BDD scenarios permanently") and wire it into CI
(its "CI/CD wiring") so it runs as a blocking autotest in the same place as every other Gherkin scenario.

## The real guarantee

What actually keeps tenants apart is an enforceable isolation boundary that every access path must cross, anchored
to a server-verified identity and current membership: the database policy, constrained role, or scoped storage
decides, so a forged header or a reused connection cannot reach across. The `@security` scenario proves one IDOR
attempt is denied; the tenant-scoped boundary enforced below the handler is what makes every request safe. A test
is a check; the enforced isolation boundary is the guarantee.

## Sources

- OWASP Multi-Tenant Application Security Cheat Sheet (<https://cheatsheetseries.owasp.org/cheatsheets/Multi_Tenant_Security_Cheat_Sheet.html>, retrieved 2026-10-11): the key risks and the best practices for tenant context, database isolation and PostgreSQL RLS, IDOR prevention, cache and session isolation, API and async and resource controls, file storage, onboarding and offboarding, backup restore, and logging and audit summarized above. `[documented]`
