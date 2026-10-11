# Enterprise & tactical patterns, the layer Gang-of-Four omits

The 23 GoF patterns are object-wiring patterns. They say nothing about persistence, domain
modelling, messaging, presentation wiring, or the functional/immutable style most business code
is written in today. This reference is that layer. Every entry is on the **same strict template
as the GoF catalog** (`design-patterns-catalog.md`), a mechanical gate (`scripts/check-catalog-completeness.mjs`)
verifies every entry carries every label **and** a citation token (a non-Wikipedia `http(s)` URL,
a `doi:`, an `ISBN`, or a book page as `(p. NNN)`).

**Main sources (no Wikipedia). Most are primary; a few newer patterns cite the originating author's
article or the reference library instead:**
- Fowler, Rice, Foemmel, Hieatt, Mee & Stafford, *Patterns of Enterprise Application Architecture*,
  Addison-Wesley 2002, **ISBN 0-321-12742-0**, cited by the book's page, e.g. *Repository (322)*.
  Public index: <https://martinfowler.com/eaaCatalog/>.
- Martin Fowler, *Inversion of Control Containers and the Dependency Injection pattern*, <https://martinfowler.com/articles/injection.html>.
- Microsoft Azure Architecture Center, *Cloud Design Patterns*, <https://learn.microsoft.com/azure/architecture/patterns/>
  (fetched 2026-10-10 for the cloud/messaging patterns the 2002 book predates).
- Peter Norvig, *Design Patterns in Dynamic Languages*, <https://norvig.com/design-patterns/>.
- Eric Evans, *Domain-Driven Design*, Addison-Wesley 2003, **ISBN 0-321-12521-5** (Entity, Aggregate).
- Brian Goetz et al., *Java Concurrency in Practice*, Addison-Wesley 2006, **ISBN 978-0-321-34960-6**
  (the concurrency cluster).
- OWASP Cheat Sheet Series, <https://cheatsheetseries.owasp.org/> (security cluster; cross-linked to
  the repo's `owasp-secure-coding-bdd` references).

Evidence state on every citation is `[documented]` (sourced to the primary reference, not yet exercised
in this repo's code); it is upgraded to `[observed]`/`[proven]` by the entry's **Verify correct application**
step, per `skeptical-audit`.

---

## Cross-linked, not duplicated

These enterprise patterns are already owned by other skills in this library. Do **not** re-catalog them
here, route to the owner:

- **Hexagonal / Clean / Layered architecture** → `enterprise-architecture-standards` (`references/software-architecture-styles.md`).
- **CQRS**, **Event Sourcing**, **Saga** → `enterprise-architecture-standards` (`references/microservices-patterns.md`).
- **Strangler Fig** → `release-deployment-safety` (the safe-migration owner) and `enterprise-architecture-standards`.
- **Circuit Breaker**, **Retry**, **Bulkhead**, **Cache-Aside** → `enterprise-architecture-standards`
  (`references/resilience-reliability-patterns.md` / `performance-scalability.md`) and, for their live
  signals and rollout, `sre-operational-readiness` and `release-deployment-safety`.

When the forces point at one of these, cite the owning skill in the pattern-decision record rather than
copying its entry.

---

## Cluster caveat, persistence & DTO (compliance-bound)

Any pattern in the persistence cluster **or** the DTO entry that copies or serializes records, **Repository,
Data Mapper, DTO, Identity Map**, and the PoEAA *Serialized LOB (272)*, inherits the data-map, retention,
and deletion-propagation duties of `compliance-data-lifecycle`. Three concrete rules:
- A copy of a record is a new place the fact lives; it must appear on the data map and in the deletion/erasure
  cascade (a cached `Identity Map` entry or an outbox row that outlives a right-to-erasure request is a leak).
- **A DTO must not widen a field's exposure**, a DTO that adds `passwordHash`, `ssn`, or an internal flag the
  caller never had is a new disclosure, not a transfer object.
- **A Serialized LOB can bury unclassified PII** inside an opaque blob, defeating `compliance-data-lifecycle`'s
  column-level classification scan. Classify what goes into the blob, or do not serialize PII into one.

---

### Dependency Injection / Inversion of Control, DI/IoC
Intent: Supply a component's collaborators from the outside (constructor/setter/interface injection or an IoC
container) instead of having it construct or look them up itself, so wiring is a composition-root concern.
Forces: A class needs collaborators; hard-`new`-ing them couples it to concrete types and hides its real
dependencies; tests can't substitute them; the same object gets rebuilt everywhere.
Best situation: Any non-trivial object graph where you want to test units in isolation, swap implementations
per environment, and make every dependency explicit in the signature.
Pros: Dependencies become visible and substitutable; enables unit tests with fakes; one composition root owns
lifetimes; removes service-locator hiding.
Cons: Indirection between "what is needed" and "what is provided"; a container adds startup magic and
runtime-resolution errors; over-use turns everything into an interface.
Avoid when: A pure function or a single obvious collaborator, injecting a framework for a one-field object is
ceremony. Prefer plain constructor parameters over a container until the graph is large.
Failure/rot prevented: Hidden, hard-coded dependencies and untestable "reach out and grab a singleton" code.
Misuse: Using the container as a **Service Locator** (`container.get(X)` deep in a method), that re-hides the
dependency the pattern was meant to expose, and is the anti-pattern DI replaces.
Security trade-off: Centralizes construction of auth/crypto collaborators so they can be audited in one place;
but a mis-scoped container can leak a request-scoped principal into a singleton (privilege bleed), scope
security-sensitive services per request.
Operational cost: Container resolution failures surface at startup/first-request, not compile time; needs a
startup health check that resolves the graph; DI graphs complicate cold-start latency.
Adopt safely: Introduce constructor injection first (no container); add a container only when wiring is
painful; wire behind the composition root so call sites don't change, reversible.
Modern alternative: Plain constructor injection (no framework); in functional code, partial application /
passing functions; language module systems.
Verify correct application: A unit test constructs the class with a fake collaborator and no real I/O; an
`arch-gate` rule bans `new ConcreteService()` / global `getInstance()` inside `domain/`.
Example:
```ts
// ❌ hidden, hard-coded dependency, can't test without a real DB
class OrderService { private repo = new PostgresOrderRepo(); place(o: Order) { return this.repo.save(o); } }
// ✅ injected, the dependency is explicit and substitutable
class OrderService { constructor(private repo: OrderRepository) {} place(o: Order) { return this.repo.save(o); } }
```
Source(s): Fowler, *Inversion of Control Containers and the Dependency Injection pattern*,
<https://martinfowler.com/articles/injection.html>. `[documented]`

---

## Persistence cluster (Fowler *PoEAA*), see the compliance caveat above

### Repository, persistence
Intent: Mediate between the domain and data mapping via a collection-like interface, so clients query domain
objects without thinking in SQL (Fowler, *PoEAA*, Repository (322)).
Forces: Domain code is littered with query construction; the same query is rebuilt in many places; you want to
unit-test domain logic against an in-memory store, not a database.
Best situation: A large system with substantial querying logic, especially when more than one data source
exists (e.g. an in-memory store for fast unit tests, a real DB in production).
Pros: Clients "never think in SQL"; querying logic centralized; swappable backing store makes domain tests
fast; a natural home for a Specification.
Cons: An extra layer; for a tiny app it duplicates what an ORM/Data Mapper already gives; leaky repositories
that expose `IQueryable` re-couple callers to the store.
Avoid when: CRUD on a handful of tables where a Data Mapper/Active Record is enough, a repository per table
with one `findById` is ceremony.
Failure/rot prevented: Query logic sprawled across handlers and components; untestable data access.
Misuse: A "repository" that returns the ORM's query builder, or one method per screen (`getOrdersForDashboard`), that is a query grab-bag, not a collection abstraction.
Security trade-off: A single choke point to enforce row-level authorization and tenant scoping; but a generic
`find(criteria)` can become an injection/over-fetch vector if criteria are unvalidated.
Operational cost: Adds a layer to trace; an in-memory test double can diverge from real DB semantics (null
ordering, collation) and hide bugs.
Adopt safely: Introduce behind the existing data-access call sites (expand-contract); keep the interface
collection-shaped; migrate one aggregate at a time.
Modern alternative: A well-scoped ORM repository/DAO, or a thin query module of named functions.
Verify correct application: A contract test runs the SAME suite against the in-memory and the real
implementation and both pass; an `arch-gate` rule bans `supabase.from()` / raw SQL outside the repository.
Example:
```ts
// ❌ query logic inside a handler, untestable, duplicated
app.get('/orders', async (req,res) => res.json(await sql`select * from orders where status='open'`));
// ✅ collection-like interface the domain calls; store is swappable
interface OrderRepository { openOrders(): Promise<Order[]> }
```
Source(s): Fowler, *PoEAA*, Repository (322), ISBN 0-321-12742-0; index <https://martinfowler.com/eaaCatalog/repository.html>. `[documented]`

### Unit of Work, persistence
Intent: Track every object read/changed in a business transaction and coordinate writing out changes and
concurrency control as one commit (Fowler, *PoEAA*, Unit of Work (184)).
Forces: Scattered ad-hoc saves; partial writes on failure; dirty-flag bookkeeping spread across objects; too
many small DB round-trips.
Best situation: A business transaction touches several objects and must commit atomically, with one place that
knows what changed.
Pros: One atomic commit; batches writes; a single home for optimistic-lock checks; removes manual dirty flags.
Cons: Complexity if a transaction touches one row; a long-lived unit of work can hold locks/memory; ORM
"session" semantics surprise newcomers.
Avoid when: A single-row insert/update, a direct write is clearer than a tracking session.
Failure/rot prevented: Partial, inconsistent writes and "I forgot to save that object too" bugs.
Misuse: Keeping the unit of work open across user think-time (it becomes a long transaction holding locks), or
using it as a cache.
Security trade-off: Atomic commit keeps audit rows and the action they describe consistent (no orphaned audit);
but a huge unit of work widens the blast radius of one poisoned write.
Operational cost: Long/implicit transactions cause lock contention and deadlocks that are hard to trace; needs
transaction-duration metrics.
Adopt safely: Wrap one workflow at a time; keep the transaction short; make rollback the default on any failure.
Modern alternative: A database transaction block (`BEGIN/COMMIT`) or an ORM session scoped to the request.
Verify correct application: An integration test asserting that a mid-transaction failure leaves **zero** rows
written (all-or-nothing); a concurrency test proving the optimistic-lock version bump.
Example:
```ts
// ❌ two separate writes, second can fail, leaving the first committed
await repo.save(order); await repo.save(auditEntry);
// ✅ one unit of work commits both or neither
await uow.run(async (tx) => { tx.add(order); tx.add(auditEntry); });
```
Source(s): Fowler, *PoEAA*, Unit of Work (184), ISBN 0-321-12742-0. `[documented]`

### Data Mapper, persistence
Intent: A mapper layer that moves data between objects and the database while keeping the two independent of
each other and of the mapper (Fowler, *PoEAA*, Data Mapper (165)).
Forces: The object model and the relational schema need to evolve independently; domain objects should carry
no persistence code; mappings are non-trivial.
Best situation: A complex Domain Model whose shape diverges from the tables, "use Data Mapper when you want
the database schema and the object model to evolve independently."
Pros: Domain objects stay persistence-ignorant and unit-testable; schema can change without touching domain
logic; isolates complex O/R mapping.
Cons: The most machinery of the data-source patterns; for schema≈objects it is more than Active Record needs.
Avoid when: The object maps ~1:1 to its table and logic is modest, **Active Record (160)** is cheaper.
Failure/rot prevented: Persistence concerns leaking into and ossifying the domain model.
Misuse: A "mapper" that leaks DB types (cursors, driver rows) into the domain, re-coupling the two it exists
to separate.
Security trade-off: Centralizes field selection so you can avoid `SELECT *` over-exposure (see the repo's
column-grant lesson); a careless mapper that hydrates every column re-introduces it.
Operational cost: An extra translation layer to profile; N+1 and over-fetch hide inside the mapper.
Adopt safely: Introduce for one aggregate behind the repository interface; keep hand-written or metadata-driven
mapping in one module.
Modern alternative: A mature ORM built on **Metadata Mapping (306)** (e.g. Prisma, TypeORM, SQLAlchemy).
Verify correct application: A test loads then saves an object and asserts a round-trip with no DB types on the
domain object; a static check that domain files import no driver package.
Example:
```ts
// ❌ domain object knows the database
class Order { save(db: Pg) { db.query('update orders ...'); } }
// ✅ a mapper translates; the domain object stays clean
class OrderMapper { toRow(o: Order): OrderRow; toDomain(r: OrderRow): Order }
```
Source(s): Fowler, *PoEAA*, Data Mapper (165), ISBN 0-321-12742-0. `[documented]`

### Identity Map, persistence
Intent: Ensure each object is loaded only once per session by keeping every loaded object in a map and reusing
it (Fowler, *PoEAA*, Identity Map (195)).
Forces: The same row gets loaded into two in-memory objects that then disagree; redundant reads; equality by
reference breaks.
Best situation: A session/unit of work that may load the same entity through more than one path.
Pros: One canonical in-memory instance per row; fewer reads; prevents inconsistent duplicate copies.
Cons: It is a cache, staleness, memory growth, and invalidation become your problem; wrong in multi-request
scope.
Avoid when: Short, stateless request handling where each read is fresh and discarded, no duplicate-load
problem exists.
Failure/rot prevented: Two in-memory copies of one record silently diverging (a data-ownership violation in
memory).
Misuse: Using it as a long-lived or cross-request cache, it is a within-session identity guarantee, not an
application cache.
Security trade-off: Reuse keeps authorization decisions consistent within a request; but a map that outlives a
logout/erasure can serve a stale, now-forbidden object.
Operational cost: Unbounded growth and stale reads are classic incident causes; needs scope limits and clear
lifecycle (see compliance caveat for erasure).
Adopt safely: Scope it strictly to the unit of work; clear it on commit; never share across requests.
Modern alternative: Most ORM sessions implement this internally, rely on the session rather than hand-rolling.
Verify correct application: A test loads the same id twice in one session and asserts `a === b` (identical
instance); a test that the map is empty after the session ends.
Example:
```ts
// ❌ two loads, two objects, edits to one are lost
const a = await load(42); const b = await load(42); // a !== b
// ✅ identity map returns the same instance within the session
const a = session.load(42); const b = session.load(42); // a === b
```
Source(s): Fowler, *PoEAA*, Identity Map (195), ISBN 0-321-12742-0. `[documented]`

### Lazy Load, persistence
Intent: An object that does not contain all its data but knows how to fetch the rest on first access (Fowler,
*PoEAA*, Lazy Load (200)).
Forces: Loading a whole object graph eagerly is wasteful when most of it is unused, but you do not want callers
to manage the fetch.
Best situation: Large object graphs where a given use touches only part of them.
Pros: Avoids loading unused data; keeps the initial read cheap; transparent to the caller.
Cons: **The N+1 query problem**, iterating a collection triggers one query per element; latency hides behind a
property access; surprises outside a session.
Avoid when: You will use the whole graph anyway (then eager-load / join), or the graph is small.
Failure/rot prevented: Eagerly loading enormous graphs when a request needs one field.
Misuse: Lazy-loading inside a loop (the N+1 trap) or after the session closed (a lazy-load exception in the view).
Security trade-off: Deferring loads can skip an authorization check that ran at load time; ensure the lazy
fetch re-applies row scoping.
Operational cost: The top hidden source of latency and DB load; needs query-count assertions and slow-query
alerts.
Adopt safely: Default to explicit eager loads for known-hot paths; introduce laziness only where profiling
shows waste; keep it inside the session.
Modern alternative: Explicit DataLoader-style batching, GraphQL field resolvers with batching, or an explicit
projection that selects exactly what's needed.
Verify correct application: A test asserts the query **count** for a representative operation (catches N+1); a
load test watches queries-per-request.
Example:
```ts
// ❌ N+1, one query per order inside the loop
for (const o of orders) console.log((await o.customer()).name);
// ✅ batch-load the association once
const customers = await loadCustomers(orders.map(o => o.customerId));
```
Source(s): Fowler, *PoEAA*, Lazy Load (200), ISBN 0-321-12742-0. `[documented]`

### Query Object, persistence
Intent: An object that represents a database query, an interpreter over criteria that can build the SQL, so
queries are constructed in objects, not string concatenation (Fowler, *PoEAA*, Query Object (316)).
Forces: Query strings are built by hand and concatenated; the same filters are duplicated; callers must know
table/column names and SQL dialect.
Best situation: A system with many, composable queries, or one that must target more than one database dialect.
Pros: Queries are composable and reusable objects; shields callers from schema and SQL; a foundation for
Repository and Specification.
Cons: Building a query-object framework is real work; for a few fixed queries it is over-engineering.
Avoid when: A handful of static, parameterized queries, a named function with a parameterized statement is
simpler and safer.
Failure/rot prevented: Hand-built SQL strings duplicated and drifting across the codebase.
Misuse: Re-inventing an ORM's query builder, or letting the query object accept raw SQL fragments (re-opening
injection).
Security trade-off: Done right it forces **parameterized** queries (kills SQL injection); done wrong (string
interpolation inside the object) it just relocates the injection.
Operational cost: An abstraction between intent and emitted SQL can generate pathological queries; log and
review the generated SQL.
Adopt safely: Start with the handful of queries that are duplicated; keep parameter binding mandatory; review
generated SQL in tests.
Modern alternative: A type-safe query builder (Kysely, Drizzle, jOOQ) or an ORM's criteria API.
Verify correct application: A test asserts the emitted SQL is parameterized (no interpolated values); a
property test that composition of two criteria is equivalent to the intended filter.
Example:
```ts
// ❌ concatenated SQL, duplicated and injectable
const sql = `select * from orders where status='${status}' and total > ${min}`;
// ✅ a composable, parameterized query object
new OrderQuery().withStatus(status).totalAbove(min).toSql(); // => parameterized
```
Source(s): Fowler, *PoEAA*, Query Object (316), ISBN 0-321-12742-0. `[documented]`

### Specification, persistence / domain
Intent: Encapsulate a business rule or selection criterion as a standalone, combinable predicate object that
can both test an in-memory object and be translated into a query (Evans & Fowler, *Specifications*).
Forces: The same selection/validation rule ("is this order eligible?") is restated in query filters, UI guards,
and validation, and they drift apart.
Best situation: A rule used in more than one place, filter a repository, validate an input, and enable a UI
action, that must stay identical everywhere.
Pros: One definition of the rule, reusable for in-memory checks and DB queries; composable with and/or/not;
keeps the Ubiquitous Language in code.
Cons: A combinator framework is overkill for one-off filters; translating arbitrary specifications to efficient
SQL is hard.
Avoid when: A rule used in exactly one place, inline it.
Failure/rot prevented: A business rule duplicated across query, validation, and UI that silently diverges.
Misuse: Specifications so generic they become an ad-hoc query language, or ones that can't translate to SQL and
force loading the whole table into memory.
Security trade-off: A single authoritative rule object means an authorization/eligibility check can't be
half-updated in one of three copies; but an in-memory-only spec that loads everything first can leak rows.
Operational cost: In-memory evaluation of a spec that should have been a `WHERE` clause is a performance trap.
Adopt safely: Extract the first rule that already exists in two places; prove both call sites now use it; add
SQL translation only where needed.
Modern alternative: A predicate function `(x) => boolean` plus a matching query builder, composed with
higher-order functions.
Verify correct application: One test suite runs the SAME specification against in-memory objects and against
the DB query and gets the same result set.
Example:
```ts
// ❌ the "premium & active" rule restated in two places that drift
const active = users.filter(u => u.plan==='premium' && !u.suspended); // ... and a different SQL elsewhere
// ✅ one specification, used for both filter and query
const premiumActive = and(hasPlan('premium'), isActive); users.filter(premiumActive.isSatisfiedBy);
```
Source(s): Evans & Fowler, *Specifications*, <https://martinfowler.com/apsupp/spec.pdf>; concept also in
*PoEAA* under Repository (322), ISBN 0-321-12742-0. `[documented]`

---

## Domain / DDD tactical cluster

### Value Object, domain/DDD
Intent: A small object compared by the equality of its attributes rather than by identity; typically immutable
(Fowler, *PoEAA*, Value Object (486)).
Forces: A concept (money, date range, email, coordinate) is passed around as loose primitives, so invariants
aren't enforced and equality is wrong.
Best situation: Any small domain concept where "two of these with the same contents are the same", money,
quantities, ranges, identifiers.
Pros: Equality by value; immutability makes it safe to share and thread-safe; a home for the concept's
invariants and operations (e.g. `Money.add`).
Cons: More types than raw primitives; allocation overhead for very hot paths.
Avoid when: A single transient scalar with no invariant, a bare `number` is fine.
Failure/rot prevented: "Primitive obsession", invariants (currency mixing, invalid email) enforced ad hoc or
not at all.
Misuse: A mutable "value object" (shared then mutated → spooky action), or putting an identity/lifecycle on it
(that makes it an Entity).
Security trade-off: Centralizes input invariants (a validated `Email` can't hold an injection payload); but a
value object that logs its contents can leak PII, see the compliance caveat.
Operational cost: Negligible; very high allocation volume in hot loops may need attention.
Adopt safely: Replace one primitive-obsessed field at a time; make it immutable from the start; keep a factory
that validates.
Modern alternative: Records / `readonly` structs / frozen objects; branded types in TypeScript.
Verify correct application: A test asserts structural equality (`Money(5,'USD') equals Money(5,'USD')`) and that
mutation is impossible (frozen); an invariant test that the constructor rejects bad input.
Example:
```ts
// ❌ primitives, no invariant, wrong equality, currency mixing possible
function total(a: number, b: number) { return a + b; }
// ✅ value object with invariant and value equality
class Money { constructor(readonly amount: number, readonly currency: string) {}
  add(o: Money){ if(o.currency!==this.currency) throw new Error('currency'); return new Money(this.amount+o.amount,this.currency);} }
```
Source(s): Fowler, *PoEAA*, Value Object (486), ISBN 0-321-12742-0. `[documented]`

### Entity, domain/DDD
Intent: A domain object defined by a stable, continuous **identity** over its lifecycle rather than by its
attribute values (Evans, *DDD*).
Forces: Some objects are "the same thing" even as every attribute changes (a customer who changes name and
address is still that customer); equality-by-value is wrong for them.
Best situation: Objects with a lifecycle and history that must be tracked by identity, customer, order, account.
Pros: Identity-based equality and tracking; a clear home for behaviour and invariants that span the object's
life; anchors the Aggregate.
Cons: Needs identity management (keys, Identity Map); easy to turn into an **Anemic Domain Model** (data bag +
external service) if behaviour leaks out.
Avoid when: The concept has no identity and no lifecycle, model it as a **Value Object** instead.
Failure/rot prevented: Treating an identity-bearing thing as interchangeable data, and scattering its
invariants across services.
Misuse: An "entity" that is only public getters/setters with all logic in a service, that is the Anemic Domain
Model anti-pattern, not DDD.
Security trade-off: Centralizing an entity's state transitions lets you enforce authorization on each
transition; getters/setters everywhere make unauthorized state changes easy.
Operational cost: Identity/key management and concurrency control (optimistic locking) are now first-class
concerns.
Adopt safely: Give the entity behaviour methods and private setters; move one invariant inside at a time;
introduce via the repository/aggregate boundary.
Modern alternative: None that replaces identity; pair with sum types for lifecycle states (see **State** in the
GoF catalog).
Verify correct application: A test that two entities with different ids but identical fields are **not** equal;
a test that an invalid state transition is rejected by the entity, not an external caller.
Example:
```ts
// ❌ anemic entity, all data, logic lives elsewhere
class Account { balance = 0; } // service mutates account.balance directly
// ✅ identity + behaviour owns its invariant
class Account { constructor(readonly id: string){} #balance=0; withdraw(n:number){ if(n>this.#balance) throw new Error('overdraft'); this.#balance-=n; } }
```
Source(s): Evans, *Domain-Driven Design*, ISBN 0-321-12521-5. `[documented]`

### Aggregate, domain/DDD
Intent: A cluster of entities and value objects with one **aggregate root** as the only external entry point,
forming a single consistency/transaction boundary (Evans, *DDD*).
Forces: Invariants span several objects; without a boundary, any code mutates any inner object and breaks
cross-object rules; transactions sprawl.
Best situation: A set of objects that must stay consistent together (an Order and its OrderLines; an invariant
like "total = sum of lines").
Pros: One guarded boundary for a group of invariants; external code holds only the root; a natural
transaction/locking unit (pairs with Coarse-Grained Lock).
Cons: Boundaries are hard to draw; too-large aggregates cause lock contention; too-small ones push invariants
outside.
Avoid when: Objects have no shared invariant, don't force unrelated entities into one aggregate.
Failure/rot prevented: Cross-object invariants violated because callers reach inner objects directly; sprawling
multi-aggregate transactions.
Misuse: Exposing inner entities for external mutation (bypassing the root), or an aggregate so large it locks
half the table.
Security trade-off: The root is one authorization choke point for the whole cluster; letting callers hold inner
references bypasses it.
Operational cost: Aggregate size directly drives lock contention and transaction duration, a sizing/SLO concern.
Adopt safely: Start small (one root + its truly-owned children); reference other aggregates by id, not by
object; change via root methods only.
Modern alternative: None direct; between aggregates use eventual consistency (Domain Events / Saga, cross-linked).
Verify correct application: A test that mutating an inner object only succeeds through a root method; an
`arch-gate` rule that inner entity classes aren't imported outside the aggregate's module.
Example:
```ts
// ❌ external code mutates an inner line, breaking the total invariant
order.lines.push(new Line(item, qty));
// ✅ the root enforces the invariant
order.addLine(item, qty); // recomputes and validates order total internally
```
Source(s): Evans, *Domain-Driven Design*, ISBN 0-321-12521-5. `[documented]`

### Domain Event, domain/DDD
Intent: Capture something that happened in the domain as an immutable object, so other parts of the system can
react without the originator knowing them (Fowler, *Domain Event*).
Forces: A state change must trigger side effects (notify, project, integrate) but the core should not depend on
those consumers; the change and its reactions should decouple.
Best situation: A significant state change that several independent reactions care about, or that must produce
a durable record / audit of "what happened."
Pros: Decouples the fact from its reactions; enables audit, projections, and integration; aligns code with the
business vocabulary.
Cons: Indirection makes control flow harder to follow; delivery/ordering/duplication become concerns;
over-eventing turns a simple call into a pub/sub maze.
Avoid when: One synchronous reaction owned by the same module, just call it.
Failure/rot prevented: Business logic tangled with notification/integration side effects; lost history of
state changes.
Misuse: Using events for in-process calls that need an immediate, ordered result; "event" objects that are
mutable or carry behaviour.
Security trade-off: An event is a copy of a fact that now travels, it can carry PII beyond the boundary
(compliance caveat) and must be authorized at the consumer; but it also gives a tamper-evident audit trail.
Operational cost: At-least-once delivery means consumers need idempotency (see Idempotent Receiver); needs
dead-letter handling and lag metrics.
Adopt safely: Emit events inside the transaction via a **Transactional Outbox**; start with one consumer; keep
events immutable and versioned.
Modern alternative: An in-process event bus for local reactions; a broker + outbox for cross-service.
Verify correct application: A test that the state change produces exactly the expected event(s); a consumer
contract test on the event schema (pairs with `comprehensive-test-strategy` contract tests).
Example:
```ts
// ❌ the core service directly does unrelated side effects
placeOrder(o); emailCustomer(o); updateAnalytics(o); // core now depends on email + analytics
// ✅ emit a fact; reactions subscribe
placeOrder(o); publish(new OrderPlaced(o.id));
```
Source(s): Fowler, *Domain Event*, <https://martinfowler.com/eaaDev/DomainEvent.html>. `[documented]`

### Null Object (Special Case), domain/DDD
Intent: Provide a subclass with well-defined neutral behaviour for the absent/special case, so callers need no
null checks (Fowler, *PoEAA*, Special Case (496)).
Forces: Scattered `if (x == null)` / `if (x == undefined)` guards duplicate the "nothing here" behaviour and
are easy to forget, causing null-deref crashes.
Best situation: A missing collaborator has a sensible do-nothing / neutral behaviour (a null logger, a guest
user with no permissions, an empty discount).
Pros: Removes repetitive null checks; the neutral behaviour is defined once; impossible to "forget" the null case.
Cons: Can hide genuine "this should never be missing" bugs by silently doing nothing; another class to maintain.
Avoid when: Absence is an **error** that must be handled explicitly, use **Result/Either** or throw, don't
paper over it with a no-op.
Failure/rot prevented: Null-dereference crashes and duplicated, inconsistent null-handling.
Misuse: Using a null object where absence is a real failure, it then **swallows** the error (violates the
repo's recover/retry/report rule).
Security trade-off: A "null permissions" object must default to **deny**, never allow; a null-object that
quietly grants access is a privilege-escalation bug.
Operational cost: Silent no-ops are hard to debug ("why did nothing happen?"); emit a metric/log when the null
object is used where it is unexpected.
Adopt safely: Introduce for one truly-neutral collaborator; make the null object's behaviour explicit and
tested; keep it fail-closed for anything security-related.
Modern alternative: `Option`/`Maybe` types with pattern matching; language optional-chaining for simple reads.
Verify correct application: A test that the consumer behaves correctly with the null object and performs no
side effect; for security objects, a test that the default is deny.
Example:
```ts
// ❌ repeated null checks, one forgotten = crash
if (logger) logger.info(msg); // and 40 other sites, one missing the guard
// ✅ a null object with safe neutral behaviour
class NullLogger implements Logger { info(){} error(){} } // callers just call logger.info(msg)
```
Source(s): Fowler, *PoEAA*, Special Case (496), ISBN 0-321-12742-0. `[documented]`

### Result / Either (typed errors), domain/DDD
Intent: Model an operation's outcome as a value that is either success-with-a-value or failure-with-an-error,
so failure is part of the type and cannot be ignored (railway-oriented error handling).
Forces: Exceptions are invisible in signatures and silently skip code; returning `null`/`-1` for failure gets
unchecked; error handling is inconsistent.
Best situation: Expected, recoverable failures that the caller must handle, validation, parsing, external
calls with known failure modes.
Pros: Failure is in the type, the compiler forces you to handle it; composes (`map`/`flatMap`); no hidden
control flow; distinguishes expected failures from bugs.
Cons: Verbose without language/library support; mixing `Result` and exceptions in one codebase is confusing;
deep chains can be hard to read.
Avoid when: Truly exceptional, unrecoverable conditions (programmer bugs, OOM), let those throw; and trivial
code where an exception at the boundary is fine.
Failure/rot prevented: Unhandled errors, a forgotten failure case becomes a **compile error**, not a
production null-deref.
Misuse: Wrapping everything (including bugs) in `Result` and then `.unwrap()`-ing without handling, that just
re-creates the swallowed-error problem.
Security trade-off: Forces explicit handling of auth/validation failures (no silent fall-through to a
privileged path); but a `Result` whose error carries internal detail can leak it if returned to a client.
Operational cost: Must still log/alert on the error arm (recover/retry/report), a `Result` that is pattern-matched
and dropped is a swallowed failure with extra steps.
Adopt safely: Introduce at one module boundary; convert exceptions to `Result` at the edge; keep the error type
closed (a sum type) so new cases force handling.
Modern alternative: This *is* the modern alternative to exceptions for expected failures (Rust `Result`, fp-ts
`Either`, Kotlin `Result`); pair with sum-type exhaustiveness.
Verify correct application: A compile-time check (exhaustive `switch` on the error union with `never`); a test
that the error arm is handled, not dropped.
Example:
```ts
// ❌ failure is invisible / ignorable
function parsePrice(s: string): number { return Number(s); } // NaN flows on silently
// ✅ failure is in the type and must be handled
type Result<T,E> = { ok: true; value: T } | { ok: false; error: E };
function parsePrice(s: string): Result<number,'NOT_A_NUMBER'> { const n=Number(s); return isNaN(n)?{ok:false,error:'NOT_A_NUMBER'}:{ok:true,value:n}; }
```
Source(s): Wlaschin, *Railway Oriented Programming*, <https://fsharpforfunandprofit.com/rop/>. `[documented]`

---

## Functional & immutable cluster (first-class, not merely "modern alternatives")

Most GoF patterns exist to simulate first-class functions and immutability in a class-only language; where the
language has them, these are the primary tools, not fallbacks (Norvig, *Design Patterns in Dynamic Languages*).

### Higher-order-function composition, functional
Intent: Pass and return behaviour as values, functions that take/return functions, to parameterize and
assemble behaviour without a class hierarchy.
Forces: Behaviour varies but a full Strategy/Command/Template-Method class hierarchy is heavy; the varying part
is "just a function."
Best situation: A varying algorithm, callback, policy, or decoration where the unit of variation is one function
(sort comparator, retry policy, validation rule).
Pros: Collapses Strategy/Command/Template-Method/Observer-callback into a value; no boilerplate classes; trivial
to test (call it); composes.
Cons: Over-composition yields "point-free" code nobody can read; stack traces through anonymous functions are
poor; closures can capture more than intended.
Avoid when: The behaviour carries substantial state/lifecycle (then an object is clearer), or the team can't
read functional style.
Failure/rot prevented: Class-explosion for one-method "strategy" classes (Norvig: 16 of 23 GoF patterns
simplify or vanish with first-class functions).
Misuse: Deeply nested anonymous callbacks (callback hell), or closures that capture and mutate shared state.
Security trade-off: A passed-in function is code injected into your flow, only accept callables from trusted
callers; never build one from untrusted strings (`eval`).
Operational cost: Harder-to-read stack traces and profiles; name your functions so traces are legible.
Adopt safely: Replace one single-method Strategy/Command class with a function type; keep functions named and pure.
Modern alternative: This is the baseline; pair with pipelines (below) for sequences.
Verify correct application: A unit test calls the function directly with inputs; a review check that no
single-method "strategy class" exists where a function would do.
Example:
```ts
// ❌ a class per trivial strategy
class AscendingSort { compare(a:number,b:number){return a-b;} }
// ✅ the strategy is just a function
const byAmount = (a:Order,b:Order) => a.total - b.total; orders.sort(byAmount);
```
Source(s): Norvig, *Design Patterns in Dynamic Languages*, <https://norvig.com/design-patterns/>. `[documented]`

### Pipeline / Compose, functional
Intent: Express a computation as a linear sequence of small transformations, each feeding the next, instead of
nested calls or mutable intermediate variables.
Forces: A multi-step transform is written as deeply nested calls or a pile of reassigned temporaries that are
hard to read, reorder, or test step-by-step.
Best situation: Data/ETL transforms, request/response processing, validation chains, a clear "in → steps → out."
Pros: Each step is small, pure, independently testable and reorderable; reads top-to-bottom; no shared mutable
intermediate state.
Cons: Very long pipelines obscure where a value came from; poor error locality unless each step is total;
debugging mid-pipeline needs tooling.
Avoid when: One or two steps (nesting is fine), or steps with complex branching/feedback (a pipeline flattens
only linear flow).
Failure/rot prevented: Tangled nested calls and reused mutable temporaries where a later edit silently corrupts
an earlier value.
Misuse: Forcing branching/stateful logic into a "pipeline" with flags; pipelines whose steps secretly mutate
shared state.
Security trade-off: A natural place to make **validate-at-the-edge** the first stage (reject bad input before
any processing); but a pipeline that logs each stage can spill sensitive intermediates.
Operational cost: Middle-of-pipeline failures are harder to attribute; instrument per-stage on hot paths.
Adopt safely: Convert one nested transform; keep each step pure and named; thread errors with Result if steps
can fail.
Modern alternative: Native `|>`/pipe operators, array method chains, Rx/stream operators, Unix-style pipes
(**Pipes and Filters**).
Verify correct application: Unit-test each stage in isolation; a test that reordering-sensitive stages are in
the required order.
Example:
```ts
// ❌ nested calls + mutable temp
let r = normalize(parse(trim(input))); r = validate(r);
// ✅ a readable pipeline of pure steps
const result = pipe(input, trim, parse, normalize, validate);
```
Source(s): Norvig, *Design Patterns in Dynamic Languages*, <https://norvig.com/design-patterns/>. `[documented]`

### Immutability-as-default, functional
Intent: Treat data as unchangeable by default, produce new values instead of mutating in place, so shared
state cannot be altered unexpectedly (Norvig; Goetz, *Java Concurrency in Practice*).
Forces: Shared mutable objects are aliased and changed from afar, causing spooky action-at-a-distance,
race conditions, and defensive copying everywhere.
Best situation: Shared data, concurrent access, value-like domain concepts, and anything passed across module
boundaries.
Pros: Inherently thread-safe; safe to share/cache without copies; equality and reasoning are simpler; enables
cheap snapshots/undo.
Cons: Allocation/GC pressure from copies; awkward for large structures without persistent-data-structure
libraries; some APIs expect mutation.
Avoid when: Tight numeric loops / large buffers where in-place mutation is a measured necessity (keep the
mutation local and encapsulated).
Failure/rot prevented: Shared-mutable-state bugs, the hidden write from another module, and data races under
concurrency.
Misuse: "Immutable" objects that expose a mutable inner array/map (shallow freeze), callers mutate the
internals.
Security trade-off: Immutable inputs can't be altered after validation (no TOCTOU between check and use); but
deep-freezing untrusted input doesn't sanitize it, still validate.
Operational cost: Higher allocation/GC on hot paths; profile before making large hot structures immutable.
Adopt safely: Make new types immutable from the start; add `readonly`/freeze at module boundaries; migrate hot
mutable paths last and with measurement.
Modern alternative: `readonly`/`as const`, `Object.freeze`, records, Immutable.js / Immer persistent structures.
Verify correct application: A test that attempting to mutate throws / has no effect (including nested fields); a
concurrency test that shared reads need no lock.
Example:
```ts
// ❌ shared mutable config, any module can change it for everyone
export const config = { retries: 3 }; // somewhere: config.retries = 0;
// ✅ immutable; changes produce a new value
export const config = Object.freeze({ retries: 3 } as const);
```
Source(s): Norvig, <https://norvig.com/design-patterns/>; Goetz et al., *Java Concurrency in Practice*,
ISBN 978-0-321-34960-6. `[documented]`

### Lens / Optics, functional
Intent: A first-class, composable accessor (a getter+immutable-setter pair) that focuses on a part of a larger
immutable structure, so you can "update" deeply nested data without hand-written spread chains.
Forces: Updating one field deep in an immutable tree requires verbose, error-prone nested copying; the update
path is duplicated and drifts.
Best situation: Deeply nested immutable state (config trees, Redux-style stores, parsed documents) updated in
many places.
Pros: Composable focus (`lensA.compose(lensB)`); reusable update paths; keeps immutability without spread-chain
boilerplate; law-abiding (get-set/set-get consistency).
Cons: A steep concept for many teams; libraries add weight; overkill for shallow structures; poor runtime
errors if misused.
Avoid when: Shallow objects or a single nesting level, a spread (`{...s, a:{...s.a, b}}`) is clearer.
Failure/rot prevented: Duplicated, mistake-prone deep-copy update code that silently drops sibling fields.
Misuse: Using lenses to reach into and couple to another module's internal structure (an encapsulation break
dressed up as optics).
Security trade-off: A lens is just focused access, it bypasses no checks on its own; but exposing a setter lens
into an aggregate's internals defeats the aggregate's invariant guard.
Operational cost: Added dependency and a learning cost; negligible runtime beyond the copies immutability
already implies.
Adopt safely: Introduce for one genuinely-deep update that is duplicated; keep lenses co-located with the type
they focus; don't expose optics across module boundaries.
Modern alternative: Immer's `produce` (mutable-looking, immutable-under-the-hood) covers most needs without
optics theory.
Verify correct application: A property test for the lens laws (set-then-get returns the set value; get-then-set
is a no-op); a test that a deep update preserves all siblings.
Example:
```ts
// ❌ hand-rolled deep copy, easy to drop a sibling
const next = {...s, user:{...s.user, address:{...s.user.address, city}}};
// ✅ a composed lens focuses the field
const cityLens = userLens.compose(addressLens).compose(prop('city'));
const next = cityLens.set(city, s);
```
Source(s): *lens* library (van Laarhoven optics), <https://hackage.haskell.org/package/lens>;
Norvig, <https://norvig.com/design-patterns/>. `[documented]`

---

## Security cluster (first-class), cross-link `owasp-secure-coding-bdd`

These are architectural patterns, not libraries. Each cross-links the repo's
`owasp-secure-coding-bdd/references/` so a selected pattern inherits the full threat-model checklist.

### Trust boundary, security
Intent: Draw explicit lines where data/control crosses from a less-trusted zone to a more-trusted one, and make
every crossing a checkpoint that authenticates, authorizes, and validates.
Forces: Code implicitly trusts callers it shouldn't (another service, the client, a queue); privilege and
validation are assumed "someone upstream did it"; trust is ambient and undocumented.
Best situation: Any interface between zones of differing trust, public API edge, service-to-service calls,
message consumers, a module wrapping a legacy/third-party system (pairs with Anti-Corruption Layer).
Pros: Makes "who is trusted for what" explicit and reviewable; localizes auth/validation to known points;
foundation for least privilege and segmentation.
Cons: Too many fine-grained boundaries add latency and ceremony; a boundary assumed but not enforced is worse
than none (false confidence).
Avoid when: Purely in-process, same-trust code, inventing boundaries inside one trust zone is cost without
benefit.
Failure/rot prevented: Confused-deputy and privilege-escalation bugs from ambient trust; unvalidated data
flowing deep before anyone checks it.
Misuse: Documenting a boundary without enforcing it, or re-validating identity so inconsistently that each
crossing trusts differently.
Security trade-off: This *is* the security control, the trade-off is latency/complexity vs. containment; under-drawing
leaks privilege, over-drawing harms performance and clarity.
Operational cost: Each boundary needs auth/authz telemetry and failure alerts; adds hops to trace.
Adopt safely: Identify the real zones first; enforce at one crossing (reject-by-default); add correlation IDs so
crossings are traceable (per the ACL guidance).
Modern alternative: Zero-trust service mesh / mTLS between services; a gateway enforcing authz at the edge.
Verify correct application: A `@security` BDD scenario that an unauthenticated/under-privileged crossing is
denied; a test that invalid data is rejected **at** the boundary, not inside.
Example:
```ts
// ❌ internal handler trusts the caller implicitly
function transfer(req){ doTransfer(req.from, req.to, req.amount); } // no authz/validation at the edge
// ✅ the boundary authenticates, authorizes, validates before entry
function transfer(req){ const p=authenticate(req); authorize(p,'transfer'); const cmd=validate(req.body); doTransfer(cmd); }
```
Source(s): OWASP Threat Modeling Cheat Sheet,
<https://cheatsheetseries.owasp.org/cheatsheets/Threat_Modeling_Cheat_Sheet.html>; repo `owasp-secure-coding-bdd`. `[documented]`

### Validate-at-the-edge, security
Intent: Validate and normalize all input to a strict allow-list the moment it enters the system, so no
component downstream ever handles untrusted/un-shaped data.
Forces: Validation is sprinkled deep in business logic (or missing); each consumer re-checks differently;
malformed/malicious input reaches sensitive code before anyone rejects it.
Best situation: Every external input, HTTP bodies/params, uploaded files, message payloads, third-party
responses, env/config.
Pros: One authoritative schema per entry point; downstream code can assume valid, typed data; shrinks the attack
surface; parse-don't-validate yields precise types.
Cons: Schemas must be kept in sync with the domain; overly strict edge rules can reject legitimate edge cases;
duplication if not centralized.
Avoid when: Never skip it for external input; *internal*, already-validated data needn't be re-validated at
every call (that's the trust boundary's job).
Failure/rot prevented: Injection (SQL/command/XSS), deserialization attacks, and "garbage in" corrupting state
deep in the system.
Misuse: Block-list filtering (always bypassable) instead of allow-list; validating format but not
authorization; trusting client-side validation.
Security trade-off: The core input-security control; the trade-off is schema-maintenance effort vs. a
dramatically smaller attack surface, under-validating is a direct vulnerability.
Operational cost: Rejections need clear, non-leaky error messages and a metric (a spike = attack or a broken
client); schema versioning on public APIs.
Adopt safely: Add a schema at one entry point (parse into a typed value object); reject-by-default; roll out per
endpoint behind the existing handler.
Modern alternative: Schema/"parse-don't-validate" libraries (Zod, io-ts, Pydantic) producing typed value objects.
Verify correct application: Property/fuzz tests that malformed input is rejected at the edge; a test that
downstream code receives only the validated type.
Example:
```ts
// ❌ raw input used directly deep inside
db.query(`select * from u where id = ${req.query.id}`);
// ✅ parse to a typed, validated value at the edge
const { id } = UserQuery.parse(req.query); // throws on bad input; id is a validated number
```
Source(s): OWASP Input Validation Cheat Sheet,
<https://cheatsheetseries.owasp.org/cheatsheets/Input_Validation_Cheat_Sheet.html>; repo `owasp-secure-coding-bdd`. `[documented]`

### Defense-in-depth, security
Intent: Layer independent controls so that no single failure is catastrophic, assume any one control can be
bypassed and ensure another still stands.
Forces: Security rests on one mechanism (a WAF, a client check, a single auth gate); when it fails or is
bypassed, there is nothing behind it.
Best situation: Anything protecting sensitive data or actions, authn/authz, data access, deletion, payments,
admin functions.
Pros: Tolerates the failure/bypass of any single control; combines prevention + detection + response; matches
the repo's "recover/retry/report" discipline.
Cons: Redundant controls add latency, cost, and maintenance; too many layers breed alert fatigue and complexity;
can create a false sense of total safety.
Avoid when: Low-sensitivity, low-impact paths where one proportionate control suffices, don't gold-plate.
Failure/rot prevented: Single-point-of-security-failure, e.g. relying only on the UI hiding a button, with no
server-side authz behind it.
Misuse: Stacking redundant controls of the *same* kind (five block-lists) instead of independent layers;
treating depth as an excuse to weaken any single layer.
Security trade-off: More containment at the cost of latency/complexity; the explicit trade-off is defense depth
vs. performance and operational overhead.
Operational cost: Each layer needs its own monitoring; correlate alerts to avoid noise; document which layer is
authoritative.
Adopt safely: Ensure the **server-side** authoritative control exists first; add detection/secondary controls
incrementally; never remove the backstop when adding a front-line one.
Modern alternative: Complementary, not replacement, e.g. WAF (edge) + input validation (app) + parameterized
queries (data) + least-privilege DB grants.
Verify correct application: A test that bypassing the outer control (e.g. calling the API directly, skipping the
UI) is still denied by the inner control.
Example:
```ts
// ❌ only the UI hides the admin action, the API is open
if (user.isAdmin) showDeleteButton(); // server endpoint has no check
// ✅ layered: UI hides it AND the server authorizes AND the DB grant is least-privilege
app.delete('/users/:id', requireAdmin, (req,res)=> adminRepo.delete(req.params.id)); // + role-scoped DB grant
```
Source(s): OWASP Cheat Sheet Series, <https://cheatsheetseries.owasp.org/>; repo `owasp-secure-coding-bdd`. `[documented]`

---

## Application / integration cluster

### Service Layer, application/integration
Intent: Define the application's boundary with a layer of services that establishes the set of available
operations and coordinates each one's response, owning transaction and security control (Fowler, *PoEAA*,
Service Layer (133)).
Forces: Business workflows live in controllers/UI; multiple clients (web, API, jobs) duplicate orchestration;
transaction/security boundaries are inconsistent.
Best situation: An app with more than one kind of client, or non-trivial use-case orchestration, that needs one
transactional, use-case-shaped API over the domain.
Pros: One use-case API reused by all clients; the natural home for transaction demarcation and authorization;
keeps controllers thin and the domain pure.
Cons: An extra layer that, if it holds logic, can become a **Transaction Script** grab-bag; a pass-through
service that only forwards is pure overhead.
Avoid when: A simple CRUD app with one client, a thin controller calling the domain may be enough (don't add a
hollow layer).
Failure/rot prevented: Business rules and transaction/security boundaries scattered across route handlers (the
repo's #1 boundary-placement violation).
Misuse: An "anemic" service that only delegates (no coordination), or a "fat" service holding all logic that
should be in the domain model.
Security trade-off: One consistent place to enforce authorization and transactions per use case; but a service
that takes `request`/`session` objects drags web concerns into the application layer, pass plain data.
Operational cost: A clean seam for per-use-case metrics/tracing; another layer in every stack trace.
Adopt safely: Extract one workflow from a controller into a service; keep it framework-free (no `req`/`res`);
move transaction control into it.
Modern alternative: Application services / use-case interactors (Clean Architecture), cross-linked to
`enterprise-architecture-standards`.
Verify correct application: A test that calls the service with plain data (no HTTP) and asserts the whole use
case including commit/rollback; an `arch-gate` rule that services import no web framework types.
Example:
```ts
// ❌ orchestration + transaction inside the HTTP handler
app.post('/orders', async (req,res)=>{ /* validate, charge, save, email, all here */ });
// ✅ a service owns the use case; the handler just translates
app.post('/orders', (req,res)=> orderService.place(toCommand(req.body)).then(r=>res.json(r)));
```
Source(s): Fowler, *PoEAA*, Service Layer (133), ISBN 0-321-12742-0. `[documented]`

### Data Transfer Object (DTO), application/integration
Intent: An object that carries many data items across a process/boundary in a single call, to avoid chatty
fine-grained remote access (Fowler, *PoEAA*, Data Transfer Object (401)). *See the persistence/DTO compliance caveat.*
Forces: Crossing a boundary (network, API) per-field is slow; domain objects shouldn't be serialized directly
over the wire; clients need a stable shape independent of the domain.
Best situation: "Whenever you need to transfer multiple items of data between two processes in a single method
call", API request/response shapes, cross-service payloads.
Pros: One round-trip instead of many; decouples the wire contract from the domain model; a stable,
versionable external shape.
Cons: Mapping code between domain and DTO (boilerplate, can drift); proliferation of near-identical DTOs; a DTO
treated as the domain model re-couples them.
Avoid when: Within a single process where you can pass the domain object or a plain record, a DTO adds mapping
for nothing.
Failure/rot prevented: Chatty remote calls, and serializing internal domain structure (and its churn) onto the
public contract.
Misuse: Using DTOs as the in-memory domain model, or auto-mapping the whole entity into the DTO (see the
widening caveat below).
Security trade-off: **A DTO must not widen a field's exposure**, auto-mapping an entity into a response DTO can
leak `passwordHash`/internal flags the caller never had; define response DTOs explicitly, allow-list fields.
Operational cost: Version/contract management on public DTOs; mapping layers to maintain and test.
Adopt safely: Define request/response DTOs explicitly (no blanket auto-map); version the external shape; add
one boundary at a time.
Modern alternative: Schema-first contracts (OpenAPI/GraphQL/protobuf) generating typed DTOs; parse-don't-validate
on the way in.
Verify correct application: A contract test pinning the exact serialized fields (fails if a new sensitive field
leaks in); a consumer-driven contract test on the shape.
Example:
```ts
// ❌ the whole entity serialized, leaks passwordHash, internal flags
res.json(user);
// ✅ an explicit, allow-listed response DTO
res.json({ id: user.id, name: user.name, email: user.email }); // nothing sensitive widened
```
Source(s): Fowler, *PoEAA*, Data Transfer Object (401), ISBN 0-321-12742-0. `[documented]`

### Gateway, application/integration
Intent: Encapsulate access to an external system or resource behind a simple, domain-shaped interface, so the
rest of the code is insulated from that system's API (Fowler, *PoEAA*, Gateway (466)).
Forces: Third-party/external API calls are scattered and their quirks leak everywhere; swapping or stubbing the
external system is impossible; one API change ripples through the codebase.
Best situation: Any external dependency (payment provider, email service, external HTTP API, filesystem) called
from more than one place.
Pros: One place that knows the external system; the rest of the code depends on a clean interface; trivial to
stub for tests; swap providers behind the gateway.
Cons: An extra layer for a one-call dependency; a gateway that mirrors the external API 1:1 adds no insulation.
Avoid when: A single, isolated call to a stable resource, wrapping it changes nothing.
Failure/rot prevented: External-API details and failure handling duplicated across the codebase; untestable code
that can only run against the live third party.
Misuse: A pass-through gateway that re-exposes the vendor's types/exceptions, so callers still couple to the
vendor (contrast **Anti-Corruption Layer**, which also translates semantics).
Security trade-off: One audited choke point for outbound credentials, SSRF guards, and TLS verification; but a
gateway that forwards caller-supplied URLs unchecked is an SSRF vector.
Operational cost: The right place for timeouts, retries, circuit breakers, and per-dependency metrics
(cross-link resilience/SRE); another hop to trace.
Adopt safely: Wrap the external calls behind one interface; return domain types/errors, not vendor types; add a
stub implementation for tests.
Modern alternative: A typed SDK wrapper plus the resilience patterns (Retry/Circuit Breaker, cross-linked).
Verify correct application: A test runs the domain logic against a stub gateway (no network); a contract test of
the gateway against the real API's sandbox.
Example:
```ts
// ❌ vendor SDK called directly in domain code, everywhere
await stripe.charges.create({ amount, currency }); // vendor types leak; untestable
// ✅ a gateway exposes a domain interface
interface PaymentGateway { charge(m: Money): Promise<Result<ChargeId, PaymentError>> }
```
Source(s): Fowler, *PoEAA*, Gateway (466), ISBN 0-321-12742-0. `[documented]`

### Anti-Corruption Layer, application/integration
Intent: Place a translating facade/adapter between subsystems that don't share semantics, so one system's
model doesn't corrupt the other's (Evans, *DDD*; Azure Cloud Design Patterns).
Forces: A new system must integrate with a legacy/third-party system whose convoluted schema, obsolete API, or
alien model would otherwise seep into and distort the clean design.
Best situation: "A migration is planned to happen over multiple stages, but integration between new and legacy
systems needs to be maintained," or two subsystems with different semantics must communicate.
Pros: Keeps the new model clean and independent; isolates all translation in one place; supports gradual
migration without a big-bang cutover (pairs with Strangler Fig).
Cons: "The anti-corruption layer adds latency to calls between the two systems" and "adds an extra service that
you must manage and maintain"; can accrete business logic it shouldn't hold.
Avoid when: "The new and legacy systems have no significant semantic differences", then it is needless
translation; keep the ACL to translation only, not business rules.
Failure/rot prevented: Legacy/foreign quality problems (bad schemas, odd protocols) corrupting a cleanly
designed modern model.
Misuse: Letting the ACL become a second home for business rules or orchestration, rather than pure translation.
Security trade-off: "Because the anti-corruption layer mediates systems that might have different trust levels,
consider enforcing input validation and sanitization at this boundary", it is a natural trust boundary; but it
is also a new privileged bridge to harden.
Operational cost: Plan scaling, monitoring, release and config for it as its own service; "plan for
observability, including correlation IDs and structured logging, to diagnose translation failures."
Adopt safely: Decide up front whether it's permanent or retired post-migration; translate a subset of features
first; keep transaction/data consistency monitored.
Modern alternative: Implement with an adapter service / API gateway / serverless function; event-driven ACL via
a broker for high-throughput decoupling.
Verify correct application: A contract test of the translation in both directions; a test that no new-model type
leaks the legacy model's shape.
Example:
```ts
// ❌ legacy fields and codes spread through the new domain
if (resp.CUST_STAT === 'A') { order.flag = resp.LGCY_CD; }
// ✅ an ACL translates legacy → clean domain model
const customer = legacyAcl.toCustomer(resp); // new code never sees CUST_STAT / LGCY_CD
```
Source(s): Azure Cloud Design Patterns, Anti-Corruption Layer,
<https://learn.microsoft.com/azure/architecture/patterns/anti-corruption-layer>; Evans, *DDD*, ISBN 0-321-12521-5. `[documented]`

### Transactional Outbox, application/integration
Intent: Commit a business state change and the message/event announcing it in the **same database transaction**
(to an outbox table), then relay the outbox to the broker separately, solving the dual-write problem (Azure
Cloud Design Patterns).
Forces: Saving to the DB and publishing to a broker are two systems; a crash between them loses the event or
publishes one for a rolled-back change, causing cross-service inconsistency.
Best situation: A service that must reliably publish domain events/integration messages after a state change,
over an unreliable broker/network.
Pros: "When you save the business object and its events within the same database transaction, the system
guarantees no data loss", the transaction commits both or neither; reliable, guaranteed delivery.
Cons: Added complexity, an outbox table, a relay/worker, and ordering concerns ("you must preserve event
order"); end-to-end latency of the relay hop.
Avoid when: No cross-system publish is needed, or a single resource holds both state and queue atomically (no
dual write exists).
Failure/rot prevented: The dual-write inconsistency, lost events on crash, or events emitted for a change that
rolled back.
Misuse: Writing to the DB and calling `broker.publish()` in the same method (the exact anti-pattern the outbox
removes); an outbox with no cleanup that grows unbounded.
Security trade-off: Outbox rows are copies of facts that may contain PII and now persist until relayed, they
join the data map and erasure cascade (compliance caveat); apply TTL/retention.
Operational cost: Needs a relay worker, dead-letter handling, ordering/dedup, and lag metrics; "set a suitable
TTL" so unprocessed rows (worker/broker outage) are bounded.
Adopt safely: Add the outbox table and relay behind the existing publish call; enable broker **duplicate
detection** and consumer idempotency; roll out one event type first.
Modern alternative: Change-data-capture (Debezium) or a platform outbox (NServiceBus/MassTransit outbox) rather
than hand-rolling.
Verify correct application: An integration test that a crash after commit but before relay still delivers the
event exactly once (outbox replays); a test that a rolled-back change emits no event.
Example:
```ts
// ❌ dual write, publish can fail after the DB commit, losing the event
await repo.save(order); await broker.publish(new OrderPlaced(order.id));
// ✅ one transaction writes order + outbox row; a relay publishes it
await uow.run(tx => { tx.add(order); tx.add(new OutboxMessage('OrderPlaced', order.id)); });
```
Source(s): Azure Architecture Center, *Transactional Outbox with Azure Cosmos DB*,
<https://learn.microsoft.com/azure/architecture/databases/guide/transactional-out-box-cosmos>. `[documented]`

### Idempotent Receiver, application/integration
Intent: Design a message consumer so that processing the same message more than once has the same effect as
processing it once, turning at-least-once delivery into effectively-once processing (Azure Cloud Design
Patterns, *Idempotent Consumer*).
Forces: Brokers provide **at-least-once** delivery, so duplicates are inevitable (producer retries, redelivery
after a lost ack, consumer crash mid-process); naive processing double-charges/double-creates.
Best situation: Consuming from any at-least-once broker where reprocessing "can produce incorrect results, such
as duplicate financial transactions, duplicate resource creation, or repeated notifications," especially with
competing consumers.
Pros: Correctness under retries and redelivery; lets you safely use at-least-once delivery and aggressive
retries; a general reliability principle (also for ETL, webhooks, jobs).
Cons: Requires a stable dedup key, a deduplication store, and atomic "process + record key"; lifecycle/cleanup
of dedup records; ordering is still not guaranteed.
Avoid when: "The operations the consumer performs are already naturally idempotent" (upsert by business id,
absolute-value set, HTTP PUT), reprocessing is harmless, so bookkeeping is wasted cost.
Failure/rot prevented: Duplicate side effects, double charges, duplicate records, repeated emails, from
redelivered messages.
Misuse: "Don't substitute broker deduplication for idempotent consumer logic" (broker dedup is send-side,
windowed); check-then-set in two steps (a race); keying on transport ids that change on redelivery.
Security trade-off: Idempotency keys prevent replay from causing repeated privileged effects; but a shared dedup
store keyed on message id alone lets one consumer suppress others, key on (consumer, message).
Operational cost: "Manage the lifecycle of deduplication records" (TTL beyond the redelivery window);
"instrument for observability", a rising duplicate rate signals producer/broker misconfiguration.
Adopt safely: "Commit the processed key and the side effects atomically" (the Inbox pattern); "guard against
concurrent duplicates" with a uniqueness constraint; prefer naturally idempotent operations first.
Modern alternative: Naturally idempotent operations (upsert / absolute set / PUT); a framework inbox
(NServiceBus/MassTransit) over hand-rolled dedup.
Verify correct application: A test that delivering the same message twice produces one effect and one row; a
concurrency test that two simultaneous duplicates don't both commit (uniqueness constraint wins).
Example:
```ts
// ❌ processes every delivery, a redelivery double-charges
async function onPaid(m){ await charge(m.orderId, m.amount); }
// ✅ atomic insert of the dedup key is the guard; conflict = duplicate, skip
async function onPaid(m){ const first = await tryInsertProcessed(m.messageId); if(!first) return; await charge(m.orderId, m.amount); }
```
Source(s): Azure Cloud Design Patterns, Idempotent Consumer,
<https://learn.microsoft.com/azure/architecture/patterns/idempotent-consumer>. `[documented]`

### Competing Consumers, application/integration
Intent: Run multiple concurrent consumers on one message channel so work is processed in parallel, balancing
load and improving throughput/resilience (Azure Cloud Design Patterns).
Forces: Request volume is "highly variable"; a single consumer is overwhelmed at peak and idle at trough; a
failed consumer blocks processing.
Best situation: "The application workload is divided into tasks that can run asynchronously," tasks are
"independent and can run in parallel," volume is variable, and the solution must stay available when a task fails.
Pros: Load-leveled via the queue buffer; scales elastically (autoscale on queue depth, "scale down to zero when
empty"); resilient, "a failed service instance doesn't block a producer"; no complex consumer coordination.
Cons: "The order in which consumer service instances receive messages isn't guaranteed"; needs idempotency,
poison-message/dead-letter handling, and result correlation; the queue itself can become a bottleneck.
Avoid when: Tasks "must run synchronously," "in a specific sequence," or have "a high degree of dependence", parallel competing consumers break ordering/dependency.
Failure/rot prevented: A single-consumer bottleneck and the message loss/stall that follows one consumer's
failure.
Misuse: Using it where strict ordering matters without sessions; no dead-letter path (poison messages loop
forever); assuming exactly-once (it's at-least-once → pair with Idempotent Receiver).
Security trade-off: Decoupling isolates producer from consumer; but each consumer instance needs least-privilege
access to the queue and downstream, and poison messages must be quarantined, not retried blindly.
Operational cost: Needs autoscaling on queue depth, dead-letter queues, poison-message capture, and
per-consumer throughput/lag metrics; "use a reliable messaging system."
Adopt safely: Make processing idempotent first; add a dead-letter queue and max-delivery count; autoscale on
depth; use sessions if partial ordering is required.
Modern alternative: Managed queue + serverless consumers with built-in scaling (e.g. queue-triggered functions),
or Kafka consumer groups.
Verify correct application: A load test that throughput scales with consumer count and the queue drains; a
chaos test that killing a consumer mid-message redelivers it (no loss).
Example:
```ts
// ❌ one synchronous consumer, overwhelmed at peak, a crash stalls everything
for (;;) { const m = await queue.receiveOne(); await handle(m); }
// ✅ a pool competes on the same queue; each message goes to one consumer
startConsumerPool({ queue, concurrency: 10, handler: handle }); // autoscale on depth
```
Source(s): Azure Cloud Design Patterns, Competing Consumers,
<https://learn.microsoft.com/azure/architecture/patterns/competing-consumers>. `[documented]`

### Claim-Check, application/integration
Intent: Store a large message payload in an external data store and send only a small reference (the claim
check) through the broker; the receiver uses it to fetch the payload (Azure Cloud Design Patterns).
Forces: Messaging systems restrict message size and are optimized for small messages; large payloads cause
"size-limit rejection," "broker resource pressure," "throughput degradation," and "cost escalation."
Best situation: "Message payloads regularly exceed the maximum message size," large messages "consume
disproportionate broker resources," "payloads contain sensitive information that shouldn't be visible to the
messaging system," or messages traverse many serializing hops.
Pros: Avoids size limits; keeps the broker fast and cheap; keeps sensitive/large data out of the messaging path;
the store can apply its own access controls and lifecycle.
Cons: "Adds extra network trips"; the store must stay available/durable for the payload's lifetime; payload and
token aren't written atomically (orphan/unresolvable-token risk).
Avoid when: "Latency sensitivity outweighs payload size concerns," or a transport/tier supports the payload
size inline, then direct delivery "is simpler and faster."
Failure/rot prevented: Oversized messages rejected or degrading the whole broker; sensitive payloads sitting in
queue logs.
Misuse: Embedding security tokens in the claim check (the docs say don't, use **Valet Key** for scoped access);
no payload-lifecycle owner, leaving orphaned blobs or dangling tokens.
Security trade-off: Keeps sensitive data out of the broker and under the store's dedicated access controls; but
the token must not grant access by itself, and the external store becomes a new asset to secure and classify
(compliance caveat).
Operational cost: Extra retrieval latency and an external store dependency to monitor; "coordinate message
expiration and payload retention so a valid claim check doesn't point to deleted data."
Adopt safely: "Publish the token only after the payload write succeeds"; pair with **Idempotent Consumer** for
duplicate deliveries; define the payload-deletion owner and retention.
Modern alternative: Framework claim-check support (e.g. NServiceBus DataBus); or compress/split the payload if
it then fits inline.
Verify correct application: A test that the broker message never contains the payload (only the token); a test
that a token published before its payload (or after deletion) is handled, not silently broken.
Example:
```ts
// ❌ a 40 MB payload shoved through the broker, rejected / degrades everyone
await broker.publish({ report: hugeBase64 });
// ✅ store the payload, send only the claim check
const ref = await blob.put(hugeBuffer); await broker.publish({ claimCheck: ref });
```
Source(s): Azure Cloud Design Patterns, Claim Check,
<https://learn.microsoft.com/azure/architecture/patterns/claim-check>. `[documented]`

---

## Presentation cluster

**Cluster caveat, accessibility, device support, usability.** These patterns shape *code structure* only.
They do **not** deliver conformance: the rendered result must still satisfy `universal-accessibility-wcag`
(WCAG 2.2 AA), `universal-browser-device-support` (every supported engine/device), and
`usability-ux-universal-design` (plain-language, forgiving, intuitive UX). A clean MVVM binding to an
inaccessible control is still inaccessible.

### Model-View-Controller (MVC), presentation
Intent: Split a UI into a Model (data + domain behaviour), a View (presentation), and a Controller (input
handling), so presentation and logic vary independently (Fowler, *PoEAA*, Model View Controller (330)).
Forces: UI code mixes data access, business rules, and rendering in one place, so neither can change or be tested
without the other.
Best situation: Server-rendered web apps and classic UI frameworks where input handling, domain state, and
rendering are distinct responsibilities.
Pros: Separates concerns → independent change and testing of logic vs. view; multiple views over one model;
controllers stay thin.
Cons: Overhead for a trivial screen; "fat controller" drift (business logic creeps back in); the model/controller
split is interpreted many ways.
Avoid when: A static page or a one-widget view with no real logic.
Failure/rot prevented: Business logic buried in views/controllers where it can't be reused or tested (the repo's
boundary-placement rule).
Misuse: Controllers that hold domain logic (should call a Service Layer); models that know about the view
(render/HTTP), a dependency-direction violation.
Security trade-off: The controller is a clean place to enforce authz/validation per action; but a controller
that trusts view-supplied data without re-validating is a boundary leak.
Operational cost: Per-controller/action metrics are easy; little runtime overhead.
Adopt safely: Move logic out of one view into the model/service; keep controllers translating input→service→view.
Modern alternative: Component frameworks (React/Vue) and MVVM/Flux below; server MVC frameworks remain standard.
Verify correct application: A test of the model/controller with no view rendered; an `arch-gate` rule that views
import no data-access/domain-write code.
Example:
```ts
// ❌ data access + rules + rendering in the view/controller
app.get('/cart',(req,res)=>{ const rows = db.query(...); const total = rows.reduce(...); res.render('cart',{total}); });
// ✅ controller delegates to the domain/service, then renders
app.get('/cart',(req,res)=> res.render('cart', cartService.summary(req.user.id)));
```
Source(s): Fowler, *PoEAA*, Model View Controller (330), ISBN 0-321-12742-0; <https://martinfowler.com/eaaDev/uiArchs.html>. `[documented]`

### Model-View-ViewModel (MVVM), presentation
Intent: Put presentation state and logic in a ViewModel that the View binds to declaratively (data binding), so
the View has no logic and the ViewModel is testable without a UI (Fowler, *Presentation Model*).
Forces: View code holds formatting, enable/disable, and state logic that can't be unit-tested without rendering;
the same state is manually synced between widgets and fields.
Best situation: Rich client/SPA UIs on a data-binding framework (WPF, Angular, Vue) where view state is complex.
Pros: Highly testable presentation logic (no UI needed); declarative binding removes manual DOM/widget sync;
designers and logic authors work independently.
Cons: Binding frameworks hide control flow and complicate debugging; "ViewModel bloat"; overkill for simple
static views.
Avoid when: A static or trivial view, binding machinery outweighs the benefit.
Failure/rot prevented: Untestable presentation logic trapped in view code, and manual state-sync bugs.
Misuse: Business/domain rules in the ViewModel (should be in the domain/service); a ViewModel reaching into the
DOM directly, defeating binding.
Security trade-off: Centralizes what the view may show/do (easier to gate sensitive fields); but client-side
ViewModel checks are not security, authorize on the server (defense-in-depth).
Operational cost: Binding-engine performance and memory (watchers/leaks) on large views; needs profiling.
Adopt safely: Extract view state into a ViewModel for one screen; keep domain logic out of it; unit-test the
ViewModel.
Modern alternative: React hooks / signals / stores achieve the same testable-state-outside-the-view goal.
Verify correct application: A unit test driving the ViewModel's state transitions with no rendered view;
accessibility tests on the bound View (per the cluster caveat).
Example:
```ts
// ❌ formatting + enable logic inside the component template/handlers
<button disabled={cart.items.length===0 && !user.isGuest ? false : true}>Pay {'$'+(cart.total/100)}</button>
// ✅ a testable view-model exposes ready-to-bind state
const vm = useCheckoutViewModel(cart, user); // vm.canPay, vm.totalLabel, unit-tested, view just binds
```
Source(s): Fowler, *Presentation Model*, <https://martinfowler.com/eaaDev/PresentationModel.html>. `[documented]`

### Model-View-Presenter (MVP), presentation
Intent: A Presenter holds all presentation logic and drives a passive View through an interface, so the View is
a thin, swappable, testable shell (Fowler, *GUI Architectures*).
Forces: Views are hard to test (need the real widget toolkit); logic and widgets are entangled; you want to test
presentation logic headlessly.
Best situation: UIs on toolkits without good data binding, or where you want the View fully passive and mocked
in tests (classic desktop/mobile MVP).
Pros: Presenter is unit-testable against a mock View interface; clear one-to-one View↔Presenter responsibility;
View stays dumb.
Cons: Lots of View-interface boilerplate; the Presenter can become large; largely superseded by MVVM/components
where binding exists.
Avoid when: A framework provides data binding (use MVVM) or components (use those), MVP's manual wiring is then
redundant.
Failure/rot prevented: Presentation logic locked inside untestable view/widget code.
Misuse: A "passive view" that still contains logic, or a Presenter that reaches into concrete widgets instead of
the View interface.
Security trade-off: Centralizes what the View is told to display (gate sensitive data in the Presenter); client
decisions still need server-side authorization.
Operational cost: More interfaces/wiring to maintain; negligible runtime cost.
Adopt safely: Define a View interface for one screen; move logic into the Presenter; test with a fake View.
Modern alternative: MVVM with binding, or component + hook/store architectures.
Verify correct application: A unit test driving the Presenter with a mock View, asserting the View calls; no
widget toolkit loaded in the test.
Example:
```ts
// ❌ presentation logic inside the widget callback
button.onClick(()=>{ if(field.text()==='') label.setError('required'); else submit(field.text()); });
// ✅ a passive View interface the Presenter drives (and tests mock)
interface LoginView { showError(m:string):void; token():string }
class LoginPresenter { constructor(private v:LoginView){} submit(){ if(!this.v.token()) this.v.showError('required'); } }
```
Source(s): Fowler, *GUI Architectures*, <https://martinfowler.com/eaaDev/uiArchs.html>. `[documented]`

### Flux / Redux (unidirectional state), presentation
Intent: Keep application state in a single store mutated only by dispatching actions through pure reducers, so
state changes are unidirectional, explicit, and replayable (Redux, *Three Principles*).
Forces: State scattered across components with two-way binding produces cascading, hard-to-trace updates; "who
changed this?" is unanswerable; async + shared state races.
Best situation: Large SPAs with lots of shared, cross-component state and complex update interactions that need
traceability (time-travel/debugging).
Pros: Single source of truth; state transitions are explicit and testable pure functions; predictable,
inspectable, replayable updates; one data-ownership story for the UI.
Cons: Significant boilerplate and indirection; overkill for local/simple state; a global store becomes a dumping
ground; "everything in Redux" is an anti-pattern.
Avoid when: State is local to one component or a small subtree, `useState`/local state is simpler.
Failure/rot prevented: Tangled two-way-binding update cascades and ambiguous ownership of shared UI state.
Misuse: Putting server cache, form-field, or ephemeral UI state in the global store; reducers with side effects
(must be pure).
Security trade-off: A single auditable place for state transitions; but never store secrets/tokens in a store
that is serialized to `localStorage` or devtools, that exposes them.
Operational cost: Store size and re-render performance; action/selector volume; devtools help but add weight.
Adopt safely: Use it for genuinely-shared state only; keep reducers pure; put async in middleware; keep local
state local.
Modern alternative: Lighter stores (Zustand, Redux Toolkit, signals) or server-state libraries (React Query) for
server cache.
Verify correct application: Unit tests of reducers as pure `(state,action)→state` functions; a test that a
forbidden side effect in a reducer is caught (reducers are pure).
Example:
```ts
// ❌ shared state mutated directly from many components, untraceable
cart.items.push(item); // who changed cart? everywhere does
// ✅ state changes only via dispatched actions through a pure reducer
dispatch({ type: 'cart/add', item }); // reducer: (state, action) => newState
```
Source(s): Redux, *Three Principles*,
<https://redux.js.org/understanding/thinking-in-redux/three-principles>. `[documented]`

---

## Concurrency cluster (Goetz, *Java Concurrency in Practice*)

### Producer-Consumer, concurrency
Intent: Decouple work-producing threads from work-consuming threads via a shared bounded queue, so each runs at
its own pace and backpressure is explicit (Goetz, *JCIP*).
Forces: Producers and consumers run at different rates; coupling them directly blocks producers, drops work, or
needs ad-hoc hand-off and locking.
Best situation: Work generated and processed at different, variable rates in one process, request pipelines,
log/metric processing, background jobs.
Pros: Decouples rates; the bounded queue provides natural **backpressure** (producers block when full, bounding
memory); simplifies thread coordination.
Cons: An unbounded queue hides overload and risks OOM; wrong queue size throttles or buffers too much;
shutdown/draining is fiddly.
Avoid when: Single-threaded or trivially synchronous work, a direct call is simpler.
Failure/rot prevented: Unbounded memory growth and lost/dropped work when a fast producer outruns a slow consumer.
Misuse: Using an **unbounded** queue (removes backpressure → OOM under load); sharing mutable work items between
producer and consumer without handing off ownership.
Security trade-off: Bounded queues bound resource consumption (a DoS mitigation); an unbounded one is a
memory-exhaustion vector under hostile load.
Operational cost: Must monitor queue depth and rejection/block rate; tune bound and consumer count; handle
poison items (cross-link Competing Consumers for the distributed form).
Adopt safely: Start with a bounded blocking queue; pick a rejection policy; add consumers based on measured
depth; ensure clean drain on shutdown.
Modern alternative: Bounded channels (Go channels, `java.util.concurrent` blocking queues), reactive streams
with backpressure.
Verify correct application: A test that a full queue blocks/rejects the producer (backpressure holds); a load
test that memory stays bounded under a fast producer.
Example:
```ts
// ❌ unbounded buffer, a fast producer exhausts memory
const q: Task[] = []; produce(t => q.push(t)); // no bound, no backpressure
// ✅ bounded queue applies backpressure
const q = new BoundedQueue<Task>(1000); produce(async t => await q.put(t)); // blocks when full
```
Source(s): Goetz et al., *Java Concurrency in Practice*, ISBN 978-0-321-34960-6. `[documented]`

### Thread Pool, concurrency
Intent: Reuse a fixed/managed set of worker threads to execute many short tasks, instead of creating a thread
per task (Goetz, *JCIP*).
Forces: Creating a thread per task is expensive and unbounded, under load it exhausts memory and the scheduler
thrashes.
Best situation: Many short, independent tasks (request handling, parallel I/O) where thread creation cost and
concurrency bounding matter.
Pros: Amortizes thread-creation cost; **bounds** concurrency (protects downstream resources); a central place to
configure sizing, queueing, and rejection.
Cons: Wrong sizing causes starvation or thrashing; one pool shared across task types causes head-of-line
blocking; blocking tasks in a CPU pool stall it (deadlock risk).
Avoid when: A handful of long-lived threads, or a runtime with lightweight tasks (async/goroutines) that make
manual pools unnecessary.
Failure/rot prevented: Thread-per-request resource exhaustion and unbounded concurrency overwhelming downstreams.
Misuse: One global pool for both CPU-bound and blocking-I/O tasks (blocking starves CPU work); unbounded pool
(defeats the point).
Security trade-off: Bounding concurrency limits resource-exhaustion DoS; an unbounded pool is a DoS amplifier.
Operational cost: Must monitor active/queued/rejected counts and saturation; separate pools per workload type
(a Bulkhead, cross-linked); tune to downstream capacity.
Adopt safely: Size to the resource it protects; isolate workloads in separate pools; set a bounded queue +
rejection policy; add saturation metrics.
Modern alternative: Async runtimes / goroutines / virtual threads where the platform schedules lightweight tasks.
Verify correct application: A load test that concurrency never exceeds the pool bound; a test that saturation
triggers the chosen rejection, not an unbounded spike.
Example:
```ts
// ❌ a new thread/worker per task, unbounded under load
requests.forEach(r => spawnWorker(() => handle(r)));
// ✅ a bounded pool with a queue and rejection policy
const pool = new ThreadPool({ size: 16, queue: 1000, onReject: shed }); requests.forEach(r => pool.submit(()=>handle(r)));
```
Source(s): Goetz et al., *Java Concurrency in Practice*, ISBN 978-0-321-34960-6. `[documented]`

### Actor, concurrency
Intent: Encapsulate state in an actor that communicates only by asynchronous messages and processes them one at
a time, so there is no shared mutable state and thus no locks (Agha, *Actors*).
Forces: Lock-based shared-state concurrency is deadlock-prone and hard to reason about; you want isolated state
with safe concurrency and location transparency.
Best situation: Highly concurrent, stateful entities, connections, sessions, devices, game objects, and
distributed systems needing location transparency (Erlang/Akka-style).
Pros: No shared mutable state → no locks/deadlocks on the actor's state; one-message-at-a-time removes data
races inside an actor; scales across cores/nodes; supervision for fault recovery.
Cons: A different mental model; message-ordering/backpressure/mailbox-overflow concerns; debugging async message
flows is hard; overkill for simple concurrency.
Avoid when: Simple parallelism a thread pool or immutable data covers, or strongly-consistent cross-entity
transactions (actors are eventually consistent across each other).
Failure/rot prevented: Lock-based deadlocks and data races from shared mutable state.
Misuse: Sharing mutable objects *through* messages (defeats isolation); a "god actor" serializing everything
(a bottleneck); unbounded mailboxes (OOM).
Security trade-off: State isolation limits blast radius of a compromised component; but message endpoints need
authorization, and unbounded mailboxes are a DoS vector.
Operational cost: Monitor mailbox depth, actor restarts, and dead letters; supervision trees and backpressure
need design; harder to trace than synchronous calls.
Adopt safely: Model one stateful entity as an actor; send immutable messages only; bound mailboxes; define
supervision/restart strategy.
Modern alternative: Erlang/Elixir processes, Akka, Orleans virtual actors; or CSP channels for simpler cases.
Verify correct application: A concurrency test that an actor processes its mailbox serially (no internal race);
a test that messages carry immutable data only.
Example:
```ts
// ❌ shared mutable counter guarded by error-prone locking
let n = 0; lock(() => { n++; });
// ✅ an actor owns the state; only messages reach it
const counter = spawn((state={count:0}, msg)=> msg==='inc' ? {count:state.count+1} : state);
counter.send('inc'); // processed one message at a time, no lock
```
Source(s): Agha, *Actors: A Model of Concurrent Computation in Distributed Systems*, MIT Press, ISBN 0-262-01092-5. `[documented]`

### Immutable Object (shared-safe), concurrency
Intent: Make an object's state unchangeable after construction so it can be shared freely across threads with no
synchronization (Goetz, *JCIP*).
Forces: Sharing mutable objects across threads requires locks or careful publication; forgetting either causes
races and visibility bugs.
Best situation: Objects shared across threads, configuration, keys, value-like domain objects, cache entries.
Pros: "Immutable objects are always thread-safe", no locks, safe publication, free sharing and caching; simpler
reasoning.
Cons: Allocation/GC for each change; large structures need persistent-data-structure techniques to be efficient.
Avoid when: Thread-confined state (one thread only) or hot mutable buffers where copying is a measured cost.
Failure/rot prevented: Data races and stale-read (visibility) bugs on shared mutable objects.
Misuse: "Effectively immutable" objects that leak a reference to a mutable field (`this.list = input` without a
defensive copy), callers mutate shared state.
Security trade-off: Immutable validated inputs remove check-then-mutate (TOCTOU) windows; but freezing untrusted
data does not sanitize it, still validate at the edge.
Operational cost: GC pressure on very hot allocation paths; otherwise negligible.
Adopt safely: Make the fields `final`/`readonly`, copy mutable inputs in, expose no mutators; measure hot paths
before worrying about allocation.
Modern alternative: Records, frozen objects, persistent collections (Immutable.js), `readonly`/`as const`.
Verify correct application: A concurrency test sharing the object across threads with no lock and no race; a test
that no method or leaked reference can mutate it.
Example:
```ts
// ❌ "immutable" but leaks its mutable array, shared mutation
class Config { constructor(public hosts: string[]) {} } // caller keeps & mutates hosts
// ✅ truly immutable: copy in, freeze, no mutators
class Config { readonly hosts: readonly string[]; constructor(hosts: string[]){ this.hosts = Object.freeze([...hosts]); } }
```
Source(s): Goetz et al., *Java Concurrency in Practice*, ISBN 978-0-321-34960-6. `[documented]`

### Future / Promise, concurrency
Intent: Represent the eventual result of an asynchronous computation as a first-class value that can be passed
around and composed before the result exists (Goetz, *JCIP*).
Forces: Async results handled with raw callbacks produce nested "callback hell," lost errors, and no uniform way
to compose or await many operations.
Best situation: Any async operation (I/O, remote call, parallel compute) whose result is consumed later or
combined with others.
Pros: Composable (`then`/`map`/`all`); uniform success/error channel; enables fan-out/fan-in and timeouts; reads
closer to sequential code (with async/await).
Cons: Unhandled rejections silently vanish; mixing blocking and async code deadlocks pools; subtle error
propagation; cancellation is often weak.
Avoid when: Synchronous, immediate results, wrapping them in a promise adds overhead and confusion.
Failure/rot prevented: Callback-nesting spaghetti and dropped async errors.
Misuse: Not awaiting/handling a promise (a **swallowed failure**, violates recover/retry/report); `.then` chains
that drop the error arm; blocking on a future inside the pool that must complete it (deadlock).
Security trade-off: A uniform error channel means auth/validation failures aren't silently dropped, *if*
rejections are handled; an unhandled rejection can leave a request in a half-authorized state.
Operational cost: Needs an unhandled-rejection handler and per-operation timeouts; async stack traces are poorer, add context to errors.
Adopt safely: Always `await`/handle; set timeouts on external futures; use `all`/`allSettled` deliberately;
enable unhandled-rejection alerts.
Modern alternative: `async`/`await`, structured concurrency, reactive streams for multi-value async.
Verify correct application: A test that a rejected promise is handled (recover/retry/report), not dropped; a test
that a hung operation hits its timeout.
Example:
```ts
// ❌ fire-and-forget, the error is swallowed
save(order); // returns a Promise nobody awaits or catches
// ✅ awaited and handled, with a timeout
try { await withTimeout(save(order), 5000); } catch (e) { logger.error(e); throw e; }
```
Source(s): Goetz et al., *Java Concurrency in Practice*, ISBN 978-0-321-34960-6. `[documented]`
