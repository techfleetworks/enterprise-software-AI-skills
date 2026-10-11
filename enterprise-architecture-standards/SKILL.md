---
name: enterprise-architecture-standards
description: Use for every non-trivial piece of code, service, database schema, or integration an agent builds: new services, new endpoints, schema changes, refactors, and anything described as "production," "enterprise," "scalable," or "for a large team." Applies system architecture, database architecture, sound coding principles, microservices and integration patterns, resilience patterns, and performance and scalability practices at the standard a senior team at a large company expects. Trigger proactively when the user asks to design, architect, build, scale, or refactor a system, service, database, or API, or asks how "properly built" or "enterprise-grade" software should look, even without those words, for example "add a new service," "design the schema for X," "how should these services talk to each other," "this needs to handle more load."
---

# Enterprise Architecture and Engineering Standards

## Why this exists

Most systems do not fail because nobody knew the right pattern. They fail because the right pattern was not applied under deadline pressure. This skill makes architectural rigor the default, not something bolted on after the system already has scaling problems, data-integrity bugs, or a service boundary nobody can change. It works with `bdd-comprehensive-testing` and `owasp-secure-coding-bdd`, not instead of them: those cover behavior and security, this one covers whether the system is well designed in the first place, the right shape, the right data model, the right resilience, the right performance, before those tests get written.

## The three concerns to design for

Kleppmann frames system design around three concerns, and they are a good lens for every decision here (Designing Data-Intensive Applications, Ch 1):

- **Reliability:** "continuing to work correctly, even when things go wrong." A fault is one component going wrong; a failure is the whole system stopping. The job is to stop faults from becoming failures.
- **Scalability:** "a system's ability to cope with increased load." It is not a label. Describe load with real numbers, and describe performance as a distribution (p95, p99, p999 tail latencies), not an average, because averaging percentiles is meaningless and tail latency is what users feel.
- **Maintainability:** operability, simplicity (remove accidental complexity), and evolvability (make change easy).

## The workflow

### Step 1: Classify what is being built

Different work calls for different reference files. Find which apply; most real tasks touch more than one. Read only the ones you need, not all nine for a small fix.

- **New service or system boundary** (a new microservice, a new bounded context, splitting a monolith): `references/software-architecture-styles.md` + `references/microservices-patterns.md`.
- **Database schema, data model, or persistence choice** (new tables, a new datastore, a migration, sharding): `references/database-architecture.md`.
- **Any non-trivial function, class, or module:** `references/coding-principles.md`. To select the specific design pattern (the forces, the pattern or deliberately none, its trade-offs, and how it is verified), use the `pattern-selector` skill.
- **Service-to-service communication, external integration, or a public or internal API:** `references/api-integration-design.md`.
- **Anything that can fail, time out, or cascade** (calls to other services, databases, queues): `references/resilience-reliability-patterns.md`.
- **Anything with a load, latency, or scale requirement,** or a hot path: `references/performance-scalability.md`.
- **Anything that must be operated, monitored, or debugged in production:** `references/observability-operations.md`.
- **Any significant decision or standard that should outlive this conversation:** `references/enterprise-governance-standards.md`.

### Step 2: Make the decision explicit before writing code

For anything beyond a trivial change, state the choice plainly:
- What are the two or three realistic options?
- What does each trade off (complexity vs flexibility, consistency vs availability, latency vs throughput, cost vs resilience)?
- Which fits this system's actual current scale and team size, not the scale it might have in five years.

A few load-bearing rules to apply, from the sources:
- **Depend inward.** Martin's Dependency Rule: "source code dependencies can only point inwards," toward higher-level policy; keep the database and the web framework at the edge as details (Clean Architecture). Business and domain code must not import the framework, the transport, or the UI.
- **A microservice is independently deployable and modeled around a business domain.** Newman's single most important rule is to "embrace the concept of independent deployability" (Building Microservices, Ch 1). Microservices are "an architectural approach, not the architectural approach"; they are "a bad choice for brand-new products or startups" and not a cost-cutting move. A monolith "is a choice, and a valid one at that"; the modular monolith is often the right default. Avoid the distributed monolith, which has the downsides of both.
- **Find boundaries by the domain.** The primary way to find a service boundary is DDD: a bounded context "delimits the applicability of a particular model" (Evans, Domain-Driven Design, Ch 14), and the aim is high cohesion inside a boundary and low coupling across it (Newman, Ch 2). One aggregate is owned by one service.
- **Each service owns its data.** Database per service; "microservices should avoid the use of shared databases" (Newman, Ch 1; Richardson, microservices.io). To keep consistency across services, avoid two-phase commit, which Newman says to "strongly ... avoid," and use a saga, which "coordinate[s] multiple changes in state, but avoids the need for locking" (Ch 6). Note a saga is not ACID-atomic; handle partial failure.
- **Pick the communication shape on purpose.** Decide request-response vs event-driven first, then synchronous vs asynchronous (Newman, Ch 4). Synchronous blocking calls create temporal coupling and risk cascading failure; event-driven collaboration couples services more loosely.

For a decision with real long-term consequences (a new service boundary, a datastore choice, an API contract other teams depend on), record it as an ADR using the `architectural-decision-records` skill, so the reasoning does not live only in chat.

### Step 3: Apply the principles as you build

Each reference file gives concrete guidance, including when not to apply a pattern. Apply it while writing the code, the same way `owasp-secure-coding-bdd` changes the implementation, not just the tests. For data-heavy work, the choices in `database-architecture.md` are grounded in Kleppmann: pick a replication model (single-leader, multi-leader, leaderless) and know its lag and read-your-writes implications; partition to spread load and avoid hot spots; choose an isolation level knowing only serializable prevents all the race anomalies; and treat CAP honestly as "either Consistent or Available when Partitioned," not pick-two-of-three.

### Step 4: Build in resilience, do not bolt it on

For anything that calls out of process, apply the resilience patterns (grounded in Newman, Ch 12): put a timeout on every out-of-process call and a budget on the whole operation; retry only transient failures; use bulkheads to isolate a failure so one exhausted pool cannot sink everything; and mandate circuit breakers "for all your synchronous downstream calls." Details and the full pattern set are in `references/resilience-reliability-patterns.md`.

### Step 5: Cross-check against the other skills

- Every service, endpoint, or schema here still gets full happy and non-happy-path BDD coverage from `bdd-comprehensive-testing`.
- Anything touching auth, data, input, or permissions still gets the `owasp-secure-coding-bdd` pass, including its lockout-prevention step for any permission, access, or deletion change (a migration that drops a column or table, or a new service's IAM role, both qualify).
- Architecture soundness, behavioral correctness, and security are three questions about the same code. Run the skills together.

### Step 6: Do not let "enterprise" become "over-engineered"

The opposite failure of sloppiness is architecture astronautics: a message bus, a microservice, a plugin framework, or a distributed cache for a problem a single well-structured module and a database index would solve better and cheaper. Newman's own stance is to require a positive reason to adopt microservices rather than treating them as the default. Always check: does this system's actual scale, team size, and change rate justify this complexity? State the justification. Simplicity that meets the real requirement is a core principle, not a shortcut.

## Mechanical gate

This skill is broad, so it does not ship one gate of its own. Its rules are enforced three ways. Greppable rules (for example, domain code must not import the web framework, which is the Dependency Rule made concrete) become `arch-gate` forbid rules through the `arch-encode` skill. Judgment calls (is this boundary right, is this premature) are caught by a `judge-arch` review against the four questions. And the specific sub-areas have their own gates in the sibling skills (migration safety, PII classification, test shape, and so on). Where this skill makes a checkable rule, encode it; do not leave it as prose.

## Before you call it done

- [ ] The work was classified and the relevant reference files were read.
- [ ] The decision was stated with two or three options and their trade-offs, sized to the system's actual scale.
- [ ] A significant decision was recorded as an ADR (`architectural-decision-records`). This record is the **evidence ledger** for the choice.
- [ ] Domain code depends inward only; each service owns its data; cross-service consistency uses a saga, not 2PC.
- [ ] Out-of-process calls have timeouts, and synchronous downstream calls have circuit breakers.
- [ ] A greppable rule was encoded into `arch-gate` via `arch-encode`; a judgment call was left for `judge-arch`.
- [ ] BDD coverage and the OWASP pass were done on the same code.

## Reference files

| File | Covers |
|---|---|
| `software-architecture-styles.md` | Monolith, modular monolith, microservices, SOA, event-driven, serverless; layered, hexagonal, clean, onion; when to choose which |
| `microservices-patterns.md` | Decomposition via DDD bounded contexts, API gateway, service discovery, sync/async, saga, event sourcing, CQRS, strangler fig, data-per-service |
| `database-architecture.md` | Relational design and normalization, NoSQL models and fit, sharding and partitioning, replication, CAP/PACELC, indexing, transactions, migrations |
| `coding-principles.md` | SOLID, DRY/KISS/YAGNI, design patterns and when they are overkill, clean-code practices, code-review standards |
| `resilience-reliability-patterns.md` | Circuit breaker, retry with backoff and jitter, bulkhead, timeouts, rate limiting, graceful degradation, idempotency, DR (RTO/RPO), chaos |
| `performance-scalability.md` | Caching, load balancing, async and queue processing, horizontal vs vertical scaling, query optimization, connection pooling, the N+1 problem |
| `api-integration-design.md` | REST/GraphQL/gRPC design, versioning, contract-first, pub/sub and event streaming, ESB vs point-to-point, idempotency keys |
| `observability-operations.md` | Logging, metrics, tracing (the three pillars), SLIs/SLOs/SLAs, health checks, alerting, capacity planning |
| `enterprise-governance-standards.md` | ADRs, non-functional requirements, technical-debt tracking, documentation standards, definition of done |

## Evidence & skeptical assessment (required)

Architecture advice is a set of factual claims about how systems behave under load and change, so it follows the repo's evidence discipline (the contract is in [`skeptical-audit/references/evidence-discipline.md`](../skeptical-audit/references/evidence-discipline.md)). The claims here are grounded in the cited books, and the design decisions they drive are recorded as ADRs, which are the **evidence ledger** for the architecture.

| Claim | Reaches `observed` by | Becomes `proven` when |
|---|---|---|
| "This boundary and dependency direction are right" | the decision is written as an ADR with options and trade-offs | an `arch-gate` rule fails when code crosses the boundary (for example, domain imports the framework) |
| "This will handle the load" | load described in real numbers, performance measured as p95/p99, not an average | a load test holds the target percentiles (via `comprehensive-test-strategy`) |
| "This is resilient" | timeouts, retries, bulkheads, circuit breakers are in the design | a chaos or fault-injection test shows the failure is contained |
| "This is not over-engineered" | the complexity is justified against the system's actual current scale | a `judge-arch` review in fresh context agrees it is not premature |

**Definition of done:** the relevant standards are applied in the code (not just named); significant decisions are ADRs (the evidence ledger); claims about load and resilience are grounded in measurements or tests, not assertions; greppable rules are encoded into `arch-gate`; and the BDD and OWASP passes were run on the same code.

## Why this holds for every developer and every agent

It binds everyone because the standards live in committed files, the decisions live in the ADR log, and the checkable rules live in `arch-gate`, all in git. Agents get the skill through the always-on hook, which lists it in `always-on/enterprise-skills-always-on.md`. People and agents are both held by the gates: a greppable architecture rule fails CI through `arch-gate`, and a `judge-arch` review catches the judgment calls against the four questions. It survives any one person because none of it lives only in someone's head. The honest limit: much of good architecture is judgment that no grep can settle, so this skill pairs every enforceable rule with a `judge-arch` review for the rest, and moves rules into the gate whenever they become checkable.

## Sources and attribution

- Martin Kleppmann, *Designing Data-Intensive Applications*, O'Reilly 2017 (ISBN 978-1-449-37332-0): reliability, scalability, and maintainability as the three concerns; load and percentiles; replication, partitioning, transactions and isolation levels, the honest reading of CAP, and consensus (Ch 1-9). `[documented]`
- Sam Newman, *Building Microservices*, 2nd ed., O'Reilly 2021 (ISBN 978-1-492-03402-5): independent deployability; microservices are not the default and not a cost play; monolith and modular monolith as valid choices; the distributed monolith; coupling and cohesion; DDD boundaries; database per service; avoid 2PC, use sagas; communication styles; and the resiliency patterns (Ch 1-12). `[documented]`
- Eric Evans, *Domain-Driven Design*, Addison-Wesley 2003 (ISBN 0-321-12521-5): ubiquitous language, the tactical building blocks, and the strategic patterns (Bounded Context, Context Map, Anticorruption Layer) used to find and protect service boundaries. `[documented]`
- Robert C. Martin, "The Clean Architecture" (<https://blog.cleancoder.com/uncle-bob/2012/08/13/the-clean-architecture.html>): the Dependency Rule and keeping frameworks and the database at the edge. `[documented]`
- Chris Richardson, microservices.io (<https://microservices.io/patterns/index.html>): the canonical free catalog for microservice decomposition, database per service, saga, API gateway, and service discovery. `[documented]`
- Martin Fowler, *Patterns of Enterprise Application Architecture*, Addison-Wesley 2002 (<https://martinfowler.com/eaaCatalog/>): the enterprise and persistence patterns; detailed pattern selection is owned by the `pattern-selector` skill. `[documented]`
