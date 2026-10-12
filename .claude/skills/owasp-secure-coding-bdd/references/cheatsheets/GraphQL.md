# GraphQL

## What it is

How to build and run a GraphQL API without handing attackers injection, denial of service, broken
authorization, or a free map of your schema. GraphQL lets a caller shape the response, which is flexible
but also widens the attack surface. This is the per-sheet guidance from the OWASP GraphQL Cheat Sheet,
condensed to the controls that hold and the attacks they stop.

## The attack it stops

Because a client passes identifiers that your resolvers feed into databases, HTTP calls, and other
back-end systems, unchecked input can turn into SQL, NoSQL, OS command, SSRF, or CRLF injection. A caller
can also request deeply nested or huge result sets to starve the server (DoS). Missing per-object checks
let a caller read or change records they do not own (IDOR, BOLA, BFLA). GraphQL batching bundles many
operations into one network call, so a single request can brute force passwords, OTPs, or tokens and slip
past rate limits and monitoring that count raw requests. Default introspection, GraphiQL, and verbose
errors then hand an attacker the whole schema and internal details for free.

## Controls

In the cheat sheet's order:
1. **Input validation.** Accept only values you expect using an allowlist. Lean on GraphQL's own typing
   (scalars, enums, custom scalars, custom validators, and input types for mutations). Keep the allowed
   character set tight, often alphanumeric to start, and settle on one internal text encoding for unicode.
   Reject bad input politely without leaking how validation works.
2. **Injection prevention.** When input reaches another interpreter (SQL, NoSQL, ORM, OS, LDAP, XML),
   use safe APIs such as parameterized statements, and use ORMs or ODMs the way their docs intend. Where
   no safe API exists, escape or encode with a maintained, well-documented library.
3. **Process validation.** Never let user input steer control flow, such as issuing a request to a host
   the caller supplies, unless there is a real business need.
4. **DoS prevention.** Cap query depth and the object counts a query may ask for, add pagination, set
   timeouts at the application and infrastructure layers, run query cost analysis with a maximum allowed
   cost, rate limit per IP or per user, batch and cache server-side (for example with DataLoader), and
   bound OS-level resources (CPU, memory).
5. **Access control.** Confirm the caller is allowed to read or change each object, with RBAC or similar.
   Check both edges and nodes. Enforce field-level reads and mutation-level writes. Remove or guard
   direct `node`/`nodes` lookups so an ID alone never grants access.
6. **Batching-attack mitigation.** Add object-request rate limiting in code, block batching for sensitive
   objects (usernames, emails, passwords, OTPs, tokens), and limit how many operations run at once.
7. **Secure configuration.** Keep stack traces and debug output off, hold introspection and GraphiQL to
   off-or-limited in live environments, and where the server supports it, suppress the field-name
   "did you mean" suggestion hints.

## @security scenario

```gherkin
@security @owasp:graphql @usecase:batching-brute-force
Scenario: A batched GraphQL request cannot brute force one-time codes
  Given a GraphQL API that verifies one-time codes
  When an attacker sends one request batching many guesses at the code
  Then batching is refused for the sensitive operation and the attempts are counted per caller
  And the request is throttled before enough guesses succeed
```

This scenario is the canonical copy. When you apply this sheet to real code, add it to the repo's shared
feature-file index (see `bdd-comprehensive-testing`, "Storing BDD scenarios permanently") and wire it into
CI (its "CI/CD wiring") so it runs as a blocking autotest alongside every other Gherkin scenario.

## The real guarantee

What actually protects a GraphQL API is enforcing limits and authorization inside the resolvers and
schema, not at the network edge: per-object checks decide access regardless of the ID presented, and
in-code counting of objects and operations stops a batched request that a request-counting proxy never
notices. The `@security` scenario proves one batched brute-force attempt is blocked; the per-caller
counting and the batching ban on sensitive operations are what make every such attempt fail. A test is a
check; the server-side limit and authorization are the guarantee.

## Sources

- OWASP GraphQL Cheat Sheet (<https://cheatsheetseries.owasp.org/cheatsheets/GraphQL_Cheat_Sheet.html>, retrieved 2026-10-11): input validation and injection prevention, DoS controls (depth, amount, cost, timeouts, rate limiting, batching and caching), access control on edges and nodes, batching-attack mitigation, and secure configuration. `[documented]`
