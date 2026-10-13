# The 23 Gang-of-Four design patterns, a decision catalog

This is a catalog to **decide from, not a mandate to apply**. Weigh the forces the system will face over its
lifetime: a pattern applied without its problem adds indirection, classes, and cognitive load, which is itself
one of the top causes of the rot this library fights, and under-building a system whose growth you can already
see is the opposite failure. Pick none when the forces are small and will stay small, and block only
speculative structure. Read an entry to decide whether its *forces* are actually present, or certain and
imminent, in your code, and read the `Avoid when` and `Misuse` lines as hard as the `Pros`.

Sourcing (no Wikipedia, per the skill's rule): **intents are from GoF 1994** (Gamma, Helm, Johnson,
Vlissides, *Design Patterns: Elements of Reusable Object-Oriented Software*, Addison-Wesley 1994,
ISBN 0-201-63361-2); **applicability / pros / cons are expanded from each pattern's Refactoring.Guru
page** (retrieved 2026-10-10); **measured trade-offs** are from the peer-reviewed studies Hussain et al.
(IEEE QRS 2017, doi:10.1109/QRS.2017.37) and Almadi et al. (Sustainability 2021, doi:10.3390/su131810256),
cited only where a measured claim is made. No pro/con is stated that its source does not support.

The **enterprise/tactical layer** (DI/IoC, Repository, Unit of Work, DTO, Value Object, Null Object,
Result/Either, Service Layer, Transactional Outbox, functional/immutable patterns, presentation and
concurrency patterns) lives in `enterprise-patterns.md` and is **not duplicated here**. The
**architectural / distributed / resilience patterns** this library already owns, Hexagonal/Clean,
Layered, CQRS, Event Sourcing, Saga, Strangler Fig, Circuit Breaker, Retry, Bulkhead, Cache-Aside, are
**cross-linked**, not restated: see `enterprise-architecture-standards`, `release-deployment-safety`, and
`sre-operational-readiness`.

---

## Creational (object creation)

### Factory Method, Creational
Intent: Define an interface for creating an object, but let subclasses decide which class to instantiate, deferring instantiation to subclasses (GoF 1994).
Forces: The concrete type to create depends on runtime context/config, but callers must not know or name it; `new ConcreteX()` is scattered across call sites, so a new variant means editing all of them.
Best situation: You don't know the exact types/dependencies beforehand; a framework must let users plug in their own product types; you want to reuse/pool existing objects instead of rebuilding.
Pros: Avoids tight coupling between the creator and the concrete products; Single Responsibility (creation code moves to one place); Open/Closed (add new products without touching client code).
Cons: Can breed a parallel hierarchy of creator subclasses, so the code gets more complicated, cheapest when added to a hierarchy that already exists.
Avoid when: There is one concrete type with no foreseeable variants, just call the constructor.
Failure/rot prevented: `new`-sprawl, the same construction decision duplicated across call sites that must then be changed in lockstep.
Misuse: A "factory" that always returns the one type, or that grows a giant `switch` it never needed, indirection with no variation behind it.
Security trade-off: none notable (centralizing construction can be a place to enforce safe defaults).
Operational cost: One extra indirection in stack traces; negligible otherwise.
Adopt safely: Behind the existing call sites, introduce the factory, point one caller at it, migrate the rest incrementally (expand-contract); no behavior change.
Modern alternative: A plain function, or a `Map<Key, () => Product>` of constructors, first-class functions make the subclass hierarchy unnecessary.
Verify correct application: A test that drives the factory with ≥2 inputs/configs and asserts the concrete type it returns is chosen by input (not hardcoded); an `arch-gate` rule banning `new ConcreteProduct()` outside the factory module.
Example:
```ts
// ❌ never, the decision duplicated at every call site
const p = env === "pdf" ? new PdfReport() : new CsvReport();
// ✅ always, one owner of the decision
const makeReport = (k: Kind): Report => reportFactory[k]();   // reportFactory: Record<Kind, () => Report>
```
Source(s): GoF 1994, ISBN 0-201-63361-2; https://refactoring.guru/design-patterns/factory-method

### Abstract Factory, Creational
Intent: Provide an interface for creating families of related or dependent objects without specifying their concrete classes (GoF 1994).
Forces: Your code must work with several *families* of related products and must stay independent of their concrete classes; objects from one family must never be mixed with another's.
Best situation: Products are used in compatible sets (per-OS or per-theme UI kits, per-vendor driver suites) and the whole set must switch together.
Pros: Guarantees the products you get from one factory are compatible with each other; isolates concrete classes from client code; Single Responsibility; Open/Closed for new variants.
Cons: Introduces a lot of new interfaces and classes, so the code can become more complicated than it should be; adding a new *kind* of product means changing every factory.
Avoid when: There is only one family, a set of Factory Methods, or plain construction, is enough.
Failure/rot prevented: Cross-family mismatch, a `WinButton` ending up next to a `MacCheckbox` because construction wasn't kept together.
Misuse: An abstract factory over a single family, or one invented "just in case" a second family appears, classic premature abstraction.
Security trade-off: none notable.
Operational cost: More types to navigate; a wrong family selected at the seam fails as a whole, which is easier to spot than a partial mix.
Adopt safely: Introduce behind the existing factory interface; switch one family, keep the rest, then contract.
Modern alternative: A record of factory functions grouped by family; configuration/DI binding the chosen family once at the composition root.
Verify correct application: A family-consistency test, swap the whole family at the root and assert no cross-family object can be produced (the only way to get a product is through the one family interface).
Example:
```ts
// ❌ never, families mixed by hand, nothing stops a mismatch
const ui = { button: new WinButton(), checkbox: new MacCheckbox() };
// ✅ always, one family object yields a compatible set
const f: GuiFactory = pickFactory(os);
const ui = { button: f.createButton(), checkbox: f.createCheckbox() };
```
Source(s): GoF 1994, ISBN 0-201-63361-2; https://refactoring.guru/design-patterns/abstract-factory

### Builder, Creational
Intent: Separate the construction of a complex object from its representation so the same construction process can create different representations (GoF 1994).
Forces: An object needs many optional/nested parameters or step-by-step assembly; a telescoping constructor (many overloads/positional args) has become unreadable and error-prone.
Best situation: Getting rid of a telescoping constructor; building several representations that share construction steps differing only in detail; assembling composite trees; wanting an immutable result not exposed half-built.
Pros: Construct step-by-step, defer or recurse steps; reuse the same construction code for different representations; Single Responsibility (construction isolated from business logic).
Cons: Overall complexity rises because the pattern requires creating multiple new classes.
Avoid when: The object has 2 or 3 straightforward fields, a plain constructor or object literal is clearer.
Failure/rot prevented: Telescoping-constructor rot and half-initialized objects escaping into use.
Misuse: A builder for a trivial struct, or a mutable builder reused across threads/requests leaking state between builds.
Security trade-off: none notable (a builder can validate before producing, closing "invalid object exists" states).
Operational cost: Slightly more allocation; negligible.
Adopt safely: New code usually; for running code, add the builder alongside the constructor, migrate callers, then deprecate the telescoping constructor (expand-contract).
Modern alternative: An options object / named parameters, and a `readonly` type for immutability, often removes the need for a separate builder class.
Verify correct application: A test proving an invalid/partial object cannot be produced, building without a required step fails to compile or throws; property test over optional-field combinations yields only valid objects.
Example:
```ts
// ❌ never, telescoping constructor, positional and unreadable
new Report("Q4", true, false, null, 30, true);
// ✅ always, named steps, validated, immutable result
const r = reportBuilder().title("Q4").withCharts().pageSize(30).build(); // throws if required steps missing
```
Source(s): GoF 1994, ISBN 0-201-63361-2; https://refactoring.guru/design-patterns/builder

### Prototype, Creational
Intent: Specify the kinds of objects to create using a prototypical instance, and create new objects by copying this prototype (GoF 1994).
Forces: You need near-copies of an existing object whose concrete class your code shouldn't depend on, or re-initialization is costly/complex; the exact type is decided at runtime.
Best situation: Your code shouldn't depend on the concrete classes of objects it copies; you want to avoid subclasses that differ only in their initialization, clone a pre-configured preset instead.
Pros: Clone objects without coupling to their concrete classes; drop repeated initialization code in favor of cloning pre-built prototypes; an alternative to inheritance for configuration presets.
Cons: Cloning complex objects that have circular references can be very tricky; deep-vs-shallow copy must be handled deliberately.
Avoid when: Construction is cheap and well-defined, just build a new object.
Failure/rot prevented: Costly re-initialization duplicated everywhere, and subclass-per-preset proliferation.
Misuse: A shallow clone that silently shares mutable sub-objects, so mutating the copy corrupts the original (aliasing bug disguised as a copy).
Security trade-off: Cloning via serialize/deserialize (a common shortcut) opens deserialization-of-untrusted-data and prototype-pollution risks, never clone attacker-controlled objects through `eval`/`JSON` merge into `{}` prototypes; threat-model through `owasp-secure-coding-bdd` (references/cheatsheets/Deserialization.md and references/cheatsheets/Prototype_Pollution_Prevention.md).
Operational cost: Hard-to-reproduce bugs when deep/shallow copy is wrong; add equality/aliasing assertions.
Adopt safely: Behind a `clone()` on the existing type; new code otherwise.
Modern alternative: Immutable data + structural sharing (`structuredClone`, spread with care, immutable libraries), copy-with-changes without a prototype registry.
Verify correct application: A clone-independence test, `clone` equals the original by value but is a distinct reference, and mutating the clone (including nested fields) does not mutate the original (deep-copy test).
Example:
```ts
// ❌ never, shallow copy shares nested mutable state
const copy = { ...orig };           // copy.tags === orig.tags
// ✅ always, deep, independent clone
const copy = structuredClone(orig); // mutating copy.tags leaves orig.tags intact
```
Source(s): GoF 1994, ISBN 0-201-63361-2; https://refactoring.guru/design-patterns/prototype

### Singleton, Creational
Intent: Ensure a class has only one instance and provide a global point of access to it (GoF 1994).
Forces: Exactly one shared resource must exist (one config registry, one connection pool), and ad-hoc copies would conflict, but "global access" is the part that bites.
Best situation: There is genuinely one instance for all clients (a shared pool), and you need stricter control than a bare global variable gives.
Pros: Guarantees a single instance; a global access point; lazy initialization on first use.
Cons: Violates Single Responsibility (manages its lifecycle *and* its job); masks bad design by letting components know too much about each other; needs special handling under concurrency; makes client code hard to unit-test because the private constructor/static access resists mocking. Measured caution: GoF patterns are not uniformly positive for quality attributes and are empirically associated with code smells (Hussain et al. 2017; Almadi et al. 2021), Singleton is a frequent offender via global state.
Avoid when: Almost always in application code, the need is usually "one shared instance," which a DI container gives without the global. GoF co-author Erich Gamma said in 2009 he would drop Singleton, calling it almost always a design smell.
Failure/rot prevented: Accidental multiple instances of a resource that must be unique (two pools, two caches disagreeing).
Misuse: Singleton-as-global-mutable-state, a dumping ground reachable from anywhere, turning every test into a shared-state minefield.
Security trade-off: Global mutable state is a concurrency and tamper hazard, any code path can mutate it, race it, or poison shared config; hidden, app-wide reach widens blast radius. Prefer an injected, scoped instance.
Operational cost: Order-of-initialization bugs, hard-to-reset state between requests/tests, and lock contention under multithreading.
Adopt safely: Prefer **not** to, introduce a DI-scoped single instance instead; if one exists, strangle it by injecting the instance and deleting the static accessor.
Modern alternative: A DI container with a singleton *scope* (one instance, still injected and replaceable in tests), keeps uniqueness, drops the global.
Verify correct application: A test proving both uniqueness *and* testability, the instance is one, and it can be reset/replaced in tests; an `arch-gate` rule against introducing new global static singletons.
Example:
```ts
// ❌ never, global static, unmockable, mutable from anywhere
class Cfg { static instance = new Cfg(); flags = {}; }
// ✅ always, one instance, but injected (DI singleton scope)
constructor(private cfg: Cfg) {}   // container binds Cfg as singleton; tests pass a fake
```
Source(s): GoF 1994, ISBN 0-201-63361-2; https://refactoring.guru/design-patterns/singleton; doi:10.1109/QRS.2017.37; doi:10.3390/su131810256

---

## Structural (composition)

### Adapter, Structural
Intent: Convert the interface of a class into another interface clients expect, letting classes work together that otherwise couldn't due to incompatible interfaces (GoF 1994).
Forces: You must use an existing/legacy/third-party class you can't change, but its interface doesn't match the rest of your code.
Best situation: Wrapping a class whose interface is incompatible; giving several existing subclasses a missing common capability via a wrapper rather than editing each.
Pros: Single Responsibility (conversion code separated from business logic); Open/Closed (introduce new adapters without breaking existing client code).
Cons: Overall complexity rises because you add a new set of interfaces and classes; sometimes it's simpler just to change the service class to match.
Avoid when: You control both sides, align the interfaces directly instead of translating between them.
Failure/rot prevented: Translation logic smeared through callers, each doing its own incompatible conversion of the foreign API.
Misuse: An adapter that quietly adds behavior/business rules (not just conversion), it becomes a hidden second home for logic.
Security trade-off: An adapter is a trust boundary to a foreign system, validate/normalize what crosses it; don't let a lenient third-party contract pass unchecked data inward (cross-link `owasp-secure-coding-bdd`).
Operational cost: One more hop to trace; map foreign errors to your error model so failures aren't swallowed at the seam.
Adopt safely: Textbook Anti-Corruption Layer around a legacy/vendor dependency; introduce behind your interface, migrate callers, keep the vendor isolated.
Modern alternative: A thin wrapper function when only a signature differs, a full adapter class is overkill for a one-method mismatch.
Verify correct application: A conformance/contract test, the adapter satisfies your target interface for the same inputs the real collaborators use (same suite passes against adapter and a stub of the target).
Example:
```ts
// ❌ never, every caller converts the vendor shape itself
const name = `${v.first_name} ${v.last_name}`.trim();   // repeated at N sites
// ✅ always, one adapter to your interface
const user: User = userAdapter(vendor);                 // all callers use User
```
Source(s): GoF 1994, ISBN 0-201-63361-2; https://refactoring.guru/design-patterns/adapter

### Bridge, Structural
Intent: Decouple an abstraction from its implementation so that the two can vary independently (GoF 1994).
Forces: Two independent dimensions of variation (e.g., shapes × rendering backends) would otherwise multiply into an N×M subclass matrix; you need to switch implementation at runtime.
Best situation: Dividing a monolithic class with several variants of some functionality; extending a class along several orthogonal dimensions; switching implementations at runtime.
Pros: Create platform-independent classes; client works with high-level abstractions; introduce new abstractions and implementations independently; keep high-level logic and platform details apart.
Cons: Applying it to a highly cohesive class (one that doesn't actually vary on two axes) just makes the code more complicated.
Avoid when: Only one axis varies, Strategy or plain subclassing is enough; there is no second dimension to bridge.
Failure/rot prevented: Subclass-matrix explosion (`RedCircle`, `BlueCircle`, `RedSquare`, …) where the two axes were tangled into one hierarchy.
Misuse: A "bridge" imposed on a class with only one real axis, ceremony with no combinatorial payoff.
Security trade-off: none notable.
Operational cost: An extra indirection between abstraction and implementor; minor.
Adopt safely: Behind the existing abstraction, extract the implementor interface, inject it, then add implementations.
Modern alternative: Composition + an injected strategy/interface for the second axis; parametric generics where the language supports it.
Verify correct application: A matrix test pairing each abstraction with each implementation and asserting the axes are independent (any abstraction works with any implementor).
Example:
```ts
// ❌ never, two axes fused into a subclass matrix
class RedCircle {} class BlueCircle {} class RedSquare {} /* …N×M… */
// ✅ always, shape (abstraction) bridges to renderer (implementor)
class Circle { constructor(private r: Renderer) {} draw() { this.r.circle(); } }
```
Source(s): GoF 1994, ISBN 0-201-63361-2; https://refactoring.guru/design-patterns/bridge

### Composite, Structural
Intent: Compose objects into tree structures to represent part-whole hierarchies, letting clients treat individual objects and compositions of objects uniformly (GoF 1994).
Forces: Your data is genuinely a tree (files/folders, UI nodes, org charts, nested line-items), and clients keep writing `if (isLeaf) … else …` to walk it.
Best situation: Implementing a tree-like object structure; wanting client code to treat simple (leaf) and complex (composite) elements the same way.
Pros: Work with complex trees conveniently via polymorphism and recursion; Open/Closed (introduce new element types without breaking existing code).
Cons: Hard to give a common interface to classes whose functionality differs too much; you can over-generalize the component interface, making it harder to comprehend.
Avoid when: There is no real hierarchy, a flat list doesn't need a composite.
Failure/rot prevented: Leaf-vs-branch conditionals duplicated across every traversal, each able to drift and miss a node type.
Misuse: Forcing leaves to implement child-management methods (`add`/`remove`) that make no sense for them, weakening the interface.
Security trade-off: Unbounded-depth trees from untrusted input can cause stack-overflow/DoS, bound recursion depth when the tree is externally shaped (cross-link `owasp-secure-coding-bdd`).
Operational cost: Deep recursion is harder to profile and can blow the stack; consider iterative traversal for large trees.
Adopt safely: Behind the existing node interface; introduce the composite for container nodes, keep leaves, migrate traversals.
Modern alternative: Algebraic/recursive data types with pattern-matching (sum types) express trees without a class hierarchy.
Verify correct application: A recursion test over a nested tree, an operation applied to a composite equals the aggregate over its leaves, and leaf and composite are invoked through the same interface.
Example:
```ts
// ❌ never, client branches on node kind everywhere
function size(n){ return n.isFile ? n.bytes : n.children.reduce((s,c)=>s+size(c),0); }
// ✅ always, uniform interface, recursion hidden in the nodes
interface Node { size(): number }   // File.size() and Folder.size() both implement it
```
Source(s): GoF 1994, ISBN 0-201-63361-2; https://refactoring.guru/design-patterns/composite

### Decorator, Structural
Intent: Attach additional responsibilities to an object dynamically; provide a flexible alternative to subclassing for extending functionality (GoF 1994).
Forces: You need optional, combinable behaviors layered on an object (compress → encrypt → buffer a stream) and a subclass per combination would explode.
Best situation: Assigning extra behaviors at runtime without breaking callers; when extending behavior by inheritance is awkward or impossible (e.g., wrapping a final class).
Pros: Extend behavior without a new subclass; add/remove responsibilities at runtime; combine behaviors by stacking wrappers; Single Responsibility (split a monolithic class into smaller ones).
Cons: Hard to remove a specific wrapper from the stack; hard to keep behavior independent of wrapper order; the layer-wiring code can get ugly.
Avoid when: There is one fixed behavior, just write it; no runtime combination is needed.
Failure/rot prevented: Combinatorial subclass explosion (`EncryptedCompressedStream`, …) for every mix of optional behaviors.
Misuse: Order-dependent decorators wired in the wrong order (encrypt-then-compress vs compress-then-encrypt) producing silently wrong output.
Security trade-off: Decorators are a clean home for security layers (auth, rate-limit, input-sanitize), but a mis-ordered stack can bypass a check; assert the order where security depends on it.
Operational cost: Deep wrapper stacks are hard to read in stack traces and to debug; name/log the layers.
Adopt safely: Behind the shared interface, wrap the existing object, add one layer at a time; fully reversible by removing a wrapper.
Modern alternative: Higher-order functions / middleware composition (`pipe(f, g, h)`), function wrapping without a class per layer.
Verify correct application: A composition test, stacking ≥2 decorators yields the combined behavior, the wrapped object still satisfies the interface, and an order-sensitivity test pins the required order.
Example:
```ts
// ❌ never, a subclass for each combination
class EncryptedCompressedStream extends Stream {}
// ✅ always, compose wrappers at runtime
const s = new Buffered(new Encrypted(new Compressed(raw)));
```
Source(s): GoF 1994, ISBN 0-201-63361-2; https://refactoring.guru/design-patterns/decorator

### Facade, Structural
Intent: Provide a unified, higher-level interface to a set of interfaces in a subsystem, making the subsystem easier to use (GoF 1994).
Forces: Most callers need only a small slice of a complex/legacy subsystem but are forced to know its many classes and wiring.
Best situation: Giving callers a limited, straightforward interface to a complex subsystem; structuring a subsystem into layers with a facade as each layer's entry point.
Pros: Isolates client code from the complexity of a subsystem (decouples callers from its internals).
Cons: The facade can become a god object coupled to every class in the app.
Avoid when: The subsystem is already simple, a facade over one or two calls is pure overhead.
Failure/rot prevented: Subsystem internals leaking into dozens of callers, so any subsystem change ripples everywhere.
Misuse: A facade that accretes business logic and grows into a god object; or a "pass-through" facade that only forwards calls and hides nothing. Measured caution: god-object/large-class smells are among those empirically linked to pattern misuse (Almadi et al. 2021).
Security trade-off: A facade is a good single place to enforce authorization/validation for a subsystem, but if callers can still reach past it to the internals, that control is illusory (cross-link `owasp-secure-coding-bdd`).
Operational cost: Centralizes a lot of behavior behind one surface; keep it thin so it doesn't become a bottleneck for change.
Adopt safely: Introduce the facade, route new callers through it, then strangle direct subsystem use (expand-contract) and forbid it with a gate.
Modern alternative: A module's public API / barrel export acting as the facade, language module boundaries instead of a dedicated class.
Verify correct application: An encapsulation test / `arch-gate` rule, callers import only the facade; direct imports of subsystem internals outside the facade are forbidden.
Example:
```ts
// ❌ never, caller wires the whole subsystem
new VideoFile(f); const c = new CodecFactory(); new BitrateReader(/*…*/); /* …8 lines… */
// ✅ always, one entry point
export const convert = (file: string, fmt: Fmt): File => { /* subsystem hidden here */ };
```
Source(s): GoF 1994, ISBN 0-201-63361-2; https://refactoring.guru/design-patterns/facade; doi:10.3390/su131810256

### Flyweight, Structural
Intent: Use sharing to support large numbers of fine-grained objects efficiently (GoF 1994).
Forces: A huge number of similar objects (glyphs, particles, map tiles) share duplicate intrinsic state and together exhaust RAM.
Best situation: Only when the program must support a huge number of objects that barely fit in RAM, those objects duplicate state, and that state can be extracted and shared.
Pros: Saves a lot of RAM when the program has tons of similar objects (shared intrinsic state stored once).
Cons: Trades RAM for CPU when extrinsic context must be recomputed each call; the code becomes much more complicated (splitting intrinsic vs extrinsic state confuses newcomers).
Avoid when: The object count is modest, the memory saving doesn't pay for the complexity.
Failure/rot prevented: Memory blow-up from storing identical state in millions of objects.
Misuse: Flyweight applied prematurely (before a measured memory problem), or making the shared flyweight mutable so one caller's change corrupts all users of it.
Security trade-off: none notable (shared state must be immutable; a mutable shared flyweight is a correctness hazard more than a security one).
Operational cost: Harder to reason about and profile; the intrinsic/extrinsic split must stay disciplined or bugs appear only at scale.
Adopt safely: Behind a factory that returns shared instances, swap construction for the pooled lookup without changing callers; only after profiling proves the need.
Modern alternative: String/object interning, value types, or data-oriented (struct-of-arrays) layouts provided by the runtime.
Verify correct application: An identity/sharing test, N logical objects share M≪N intrinsic instances (assert shared references), and extrinsic state is passed in per call, never stored on the flyweight.
Example:
```ts
// ❌ never, a full object per particle, state duplicated a million times
particles.push(new Particle(x, y, "spark.png", color, sprite));
// ✅ always, share intrinsic state, pass extrinsic per call
particles.push({ x, y, type: treeFactory.get("spark", color) }); // sprite shared
```
Source(s): GoF 1994, ISBN 0-201-63361-2; https://refactoring.guru/design-patterns/flyweight

### Proxy, Structural
Intent: Provide a surrogate or placeholder for another object to control access to it (GoF 1994).
Forces: You must interpose on access to a real object, defer its expensive creation, guard who may call it, cache/log calls, or stand in for a remote object, without changing the object or its clients.
Best situation: Lazy initialization of a heavyweight object (virtual proxy); access control (protection proxy); local stand-in for a remote service (remote proxy); logging or caching proxies; dismissing a heavyweight object when unused (smart reference).
Pros: Control the service object without clients knowing; manage its lifecycle; the proxy works even when the real object isn't ready/available; Open/Closed (new proxies without changing service or clients).
Cons: More classes, so the code can become more complicated; the response from the service may be delayed.
Avoid when: Direct access is fine and no lazy-loading/access-control/remoting concern exists.
Failure/rot prevented: Access-control, caching, or lazy-load logic smeared into callers or into the real object itself.
Misuse: A proxy that silently diverges from the real object's contract (returns stale cache as fresh, swallows remote errors), breaking Liskov substitutability.
Security trade-off: A **remote** proxy is a trust boundary and a classic SSRF surface, it turns a local call into an outbound request to an address that may be attacker-influenced; validate/allow-list the target, set timeouts, and treat the response as untrusted. A **protection** proxy *is* an access-control gate, so a bug in it is an authz bypass. Threat-model via `owasp-secure-coding-bdd` (references/cheatsheets/Server_Side_Request_Forgery_Prevention.md).
Operational cost: Adds latency and a new failure mode (the remote/cache layer); needs its own timeouts, retries, metrics, and alerts (`sre-operational-readiness`).
Adopt safely: Behind the real object's interface, substitute the proxy for the subject; because it shares the interface it's reversible.
Modern alternative: Language `Proxy`/interceptors, an HTTP client with built-in caching/auth middleware, or a DI decorator, often no bespoke class needed.
Verify correct application: A substitutability (LSP) test, the proxy passes the same interface test suite as the real subject, **plus** the proxy-specific behavior asserted (lazy-load happens once; unauthorized callers are rejected; cache hit/miss correct).
Example:
```ts
// ❌ never, remote call reaches an unvalidated, caller-supplied address
const data = await fetch(userProvidedUrl).then(r => r.json());
// ✅ always, proxy enforces the boundary (allow-list + timeout) behind the same interface
class RepoProxy implements Repo { get(id){ return this.remote.get(assertAllowed(id)); } }
```
Source(s): GoF 1994, ISBN 0-201-63361-2; https://refactoring.guru/design-patterns/proxy

---

## Behavioral (communication & responsibility)

### Chain of Responsibility, Behavioral
Intent: Avoid coupling the sender of a request to its receiver by giving more than one object a chance to handle the request, chaining the receivers and passing the request along until one handles it (GoF 1994).
Forces: A request can be handled by one of several handlers whose set/order isn't known up front or changes at runtime (middleware, approval tiers, validation pipeline).
Best situation: The request types/sequence are unknown beforehand; several handlers must run in a particular order; the set and order of handlers change at runtime.
Pros: Control the order of handling; Single Responsibility (decouple senders from the objects that perform the work); Open/Closed (add handlers without breaking client code).
Cons: Some requests may end up unhandled (fall off the end of the chain).
Avoid when: There is a single, known handler, just call it.
Failure/rot prevented: A monolithic `if/else` ladder of handling conditions that must be edited for every new case.
Misuse: A chain with no terminal/default handler, so unmatched requests are **silently dropped**, a failure that does none of recover/retry/report.
Security trade-off: If the chain enforces authz/validation steps, a handler that wrongly `return`s early (or an ordering bug) can skip a security step; assert that security handlers always run.
Operational cost: Harder to trace which handler acted; add per-handler logging and a guaranteed terminal handler, or debugging is painful.
Adopt safely: Behind the existing entry point, convert the `if/else` into handlers one at a time; keep a default handler so nothing is dropped.
Modern alternative: A list/array of handler functions reduced in order; framework middleware pipelines.
Verify correct application: A test that an unhandled request has a **defined** terminal outcome (no silent drop), plus an ordering test and coverage that each handler is reachable.
Example:
```ts
// ❌ never, chain can silently drop a request
for (const h of chain) if (h.canHandle(req)) return h.handle(req); // no else → undefined
// ✅ always, a terminal handler guarantees an outcome
return (chain.find(h => h.canHandle(req)) ?? terminalHandler).handle(req);
```
Source(s): GoF 1994, ISBN 0-201-63361-2; https://refactoring.guru/design-patterns/chain-of-responsibility

### Command, Behavioral
Intent: Encapsulate a request as an object, thereby letting you parameterize clients with different requests, queue or log requests, and support undoable operations (GoF 1994).
Forces: You need to parameterize objects with an operation, queue/schedule/log operations, or support undo/redo, and the invoker should not be coupled to the receiver.
Best situation: Parameterizing objects with operations; queuing, scheduling, or executing operations remotely; implementing reversible (undo/redo) operations.
Pros: Single Responsibility (decouple invoker from the performer); Open/Closed (new commands without changing existing code); undo/redo; deferred/queued execution; compose simple commands into a macro.
Cons: The code gets more complicated, a whole new layer of command objects sits between senders and receivers.
Avoid when: You just need to call a method now, a direct call or a plain function is enough.
Failure/rot prevented: Invoker↔receiver coupling, and operations that can't be logged, queued, retried, or undone because they aren't reified.
Misuse: A command object with no undo/queue/log need, a function given ceremony; or an `execute()` whose inverse `undo()` doesn't actually restore state.
Security trade-off: A queued/serialized command is attacker-interesting if persisted and later executed, don't deserialize-and-run untrusted command payloads; sign/validate queued commands (cross-link `owasp-secure-coding-bdd`).
Operational cost: A command queue adds durability, ordering, and replay concerns (idempotency, poison messages), see `sre-operational-readiness`/outbox patterns in `enterprise-patterns.md`.
Adopt safely: Behind the invoker, reify one operation as a command, keep direct calls elsewhere, migrate as undo/queue needs appear.
Modern alternative: A first-class function (or a tagged `{type, payload}` action object reduced by a handler, as in Flux/Redux), a closure is the simplest command.
Verify correct application: An undo/redo round-trip test, `execute` then `undo` restores the prior state exactly, and a queue/replay test if commands are deferred.
Example:
```ts
// ❌ never, operation not reified, so no undo/queue/log is possible
button.onClick = () => doc.text += input;
// ✅ always, a command with a real inverse
const cmd = { do: () => doc.insert(at, s), undo: () => doc.delete(at, s.length) };
```
Source(s): GoF 1994, ISBN 0-201-63361-2; https://refactoring.guru/design-patterns/command

### Interpreter, Behavioral
Intent: Given a language, define a representation for its grammar along with an interpreter that uses the representation to interpret sentences in the language (GoF 1994).
Forces: You have a small, stable DSL or expression language (filters, rules, formulas) that recurs often enough to be worth a formal grammar of composable expression objects.
Best situation: A simple, well-bounded grammar that is stable and evaluated frequently, each grammar rule maps to one expression class with an `interpret()` method.
Pros: Each grammar rule is a class, so the grammar is easy to extend by adding expression types; the structure mirrors the language directly (expanded from GoF 1994 applicability; Refactoring.Guru has no Interpreter page, see note below).
Cons: The class/object graph blows up as the grammar grows, for anything non-trivial a parser generator or a real parsing library is better (GoF 1994).
Avoid when: The grammar is non-trivial or will grow, reach for a parser generator/combinator library instead of hand-rolling expression classes.
Failure/rot prevented: Ad-hoc, re-implemented string/expression parsing scattered across the code for the same little language.
Misuse: Interpreter stretched to a real programming language or a fast-growing grammar, it becomes an unmaintainable class explosion.
Security trade-off: An interpreter evaluates input as a language, it is a direct **injection** surface. Never `eval` untrusted input; constrain the grammar, bound recursion/time, and validate at the edge. Threat-model via `owasp-secure-coding-bdd` (references/cheatsheets/Injection_Prevention.md).
Operational cost: Recursive evaluation can be slow and stack-hungry; a malicious or huge expression is a DoS vector, bound depth, size, and evaluation time; add timeouts.
Adopt safely: Behind an `evaluate(expr, context)` entry point; new code usually. If replacing ad-hoc parsing, strangle call sites onto the interpreter.
Modern alternative: A parser-combinator or parser-generator library for the parse, and sum types + pattern-matching for evaluation, or a sandboxed expression library instead of hand-rolling.
Verify correct application: A grammar test suite over valid **and** malicious/oversized inputs, out-of-grammar input is rejected (not evaluated), with a fuzz/property test bounding depth and time.
Example:
```ts
// ❌ never, "interpreting" user input by evaluating it as code (injection)
const ok = eval(userRule);                       // RCE
// ✅ always, parse to a bounded AST, then interpret with no host-language access
const ok = interpret(parse(userRule), ctx);      // grammar-restricted, depth-bounded
```
Source(s): GoF 1994, ISBN 0-201-63361-2 (primary, intent/applicability/pros/cons from the book); catalog index https://refactoring.guru/design-patterns/catalog (Refactoring.Guru does not publish a per-pattern Interpreter page, HTTP 404 on 2026-10-10, flagged)

### Iterator, Behavioral
Intent: Provide a way to access the elements of an aggregate object sequentially without exposing its underlying representation (GoF 1994).
Forces: A collection has a complex internal structure you don't want clients to see, or you need multiple/alternative traversals over a custom aggregate.
Best situation: The collection has a complex data structure to hide (for convenience or security); you want to cut duplicated traversal code; you want to traverse different structures through one interface, or the structure's type is unknown beforehand.
Pros: Single Responsibility (traversal moves out of client and collection); Open/Closed (new collections/iterators without breaking code); parallel/independent iterators each hold their own state; iteration can be paused and resumed.
Cons: Overkill for simple collections; may be less efficient than traversing a specialized collection directly.
Avoid when: You're iterating a plain array/list, use the language's built-in iteration.
Failure/rot prevented: Traversal internals (indexes, node pointers) leaking into clients, duplicated and able to drift.
Misuse: A bespoke iterator over a trivial collection, reinventing what the language already provides.
Security trade-off: none notable (an iterator can *hide* internal structure, a mild encapsulation benefit).
Operational cost: Minimal; watch for mutation-during-iteration bugs and ensure iterators don't outlive the collection they read.
Adopt safely: Behind the language's iteration protocol so existing `for…of`/`forEach` callers keep working; new code otherwise.
Modern alternative: Built-in iterators, generators (`function*`, `yield`), and lazy sequences, the language supersedes a hand-written iterator class in most cases.
Verify correct application: A traversal-completeness test, the iterator visits every element exactly once, supports two independent concurrent iterations, and does not corrupt state when paused/resumed.
Example:
```ts
// ❌ never, collection exposes its internals so clients can walk them
for (let i = 0; i < tree._nodes.length; i++) visit(tree._nodes[i]); // internal shape leaked
// ✅ always, implement the iteration protocol, hide the structure
for (const node of tree) visit(node);           // tree defines [Symbol.iterator]()
```
Source(s): GoF 1994, ISBN 0-201-63361-2; https://refactoring.guru/design-patterns/iterator

### Mediator, Behavioral
Intent: Define an object that encapsulates how a set of objects interact, promoting loose coupling by keeping objects from referring to each other explicitly (GoF 1994).
Forces: Many components hold direct references to each other in a tangled many-to-many web (UI widgets, chat participants), so none can be reused or changed in isolation.
Best situation: It's hard to change classes because they're tightly wired to many others; a component can't be reused because it depends on too many others; you're subclassing just to vary how components collaborate.
Pros: Single Responsibility (communications collected in one place); Open/Closed (new mediators without changing components); reduces coupling between components; components become more reusable.
Cons: Over time a mediator can evolve into a god object.
Avoid when: Interactions are few and simple, direct calls are clearer than a hub.
Failure/rot prevented: The n² tangle of components referencing each other directly.
Misuse: A mediator that absorbs all the components' logic and becomes an omniscient god object, the tangle moved into one class.
Security trade-off: none notable.
Operational cost: Centralizes interaction, so the mediator is a single point of failure/bottleneck for that collaboration; keep it coordinating, not computing.
Adopt safely: Introduce the mediator, route one interaction through it, cut peer references incrementally.
Modern alternative: An event bus / pub-sub, or a Redux-style store, for decoupled many-to-many communication.
Verify correct application: A decoupling test / `arch-gate` rule, components reference only the mediator, not each other (peer imports between components are forbidden).
Example:
```ts
// ❌ never, widgets reach into each other directly
checkbox.onToggle = () => { textField.enabled = checkbox.checked; submitBtn.refresh(); };
// ✅ always, widgets talk only to the mediator
checkbox.onToggle = () => dialog.notify(checkbox, "toggled"); // mediator coordinates the rest
```
Source(s): GoF 1994, ISBN 0-201-63361-2; https://refactoring.guru/design-patterns/mediator

### Memento, Behavioral
Intent: Without violating encapsulation, capture and externalize an object's internal state so that the object can be restored to this state later (GoF 1994).
Forces: You need snapshots/undo/checkpoints of an object's state, but exposing its fields to let some outside code save them would break its encapsulation.
Best situation: Producing snapshots to restore a previous state; transaction rollback on error; when direct access to the object's fields would violate its encapsulation (the object makes its own snapshot).
Pros: Snapshot state without violating encapsulation; simplify the originator by letting a caretaker hold the history.
Cons: Can consume lots of RAM if snapshots are taken too often; caretakers must track the originator's lifecycle to discard obsolete mementos; dynamic languages can't guarantee the memento's state stays private.
Avoid when: The state is trivial or already serializable, just copy it.
Failure/rot prevented: Undo/rollback implemented by exposing and hand-copying internal fields, which breaks encapsulation and drifts.
Misuse: A memento whose internals are publicly readable/mutable (so it's just an exposed copy), or unbounded snapshot history that leaks memory.
Security trade-off: A snapshot may capture sensitive in-memory state, treat persisted mementos as data under `compliance-data-lifecycle` (retention/deletion) and don't log them.
Operational cost: Memory growth from history; needs a retention/eviction policy for snapshots.
Adopt safely: New code usually; add `save()/restore()` to the existing type without exposing fields.
Modern alternative: Immutable state + a history list (store previous immutable values); event sourcing for durable history (cross-link `enterprise-architecture-standards`).
Verify correct application: A save/restore round-trip test, `restore(snapshot(x))` reproduces `x`, plus an encapsulation test that the caretaker cannot read the memento's internal fields.
Example:
```ts
// ❌ never, caretaker reads/writes the originator's internals to "save" it
history.push({ x: editor._x, y: editor._y, sel: editor._sel }); // encapsulation broken
// ✅ always, originator makes an opaque memento; caretaker just holds it
history.push(editor.save()); /* … */ editor.restore(history.pop());
```
Source(s): GoF 1994, ISBN 0-201-63361-2; https://refactoring.guru/design-patterns/memento

### Observer, Behavioral
Intent: Define a one-to-many dependency between objects so that when one object changes state, all its dependents are notified and updated automatically (GoF 1994).
Forces: A change in one object must update an unknown, dynamically changing set of others, and you don't want the subject coupled to their concrete types.
Best situation: A change to one object requires changing others whose set is unknown or changes dynamically; objects must observe another but only for a limited time or in specific cases (subscribers join/leave at runtime).
Pros: Open/Closed (introduce new subscriber types without changing the publisher); establish relationships between objects at runtime.
Cons: Subscribers are notified in random (unspecified) order.
Avoid when: There is a single, known dependent, call it directly.
Failure/rot prevented: The subject hardcoding calls to every dependent, which must be edited whenever a dependent is added/removed.
Misuse: Observers never unsubscribed (memory leaks / "lapsed listener"); update cascades where one notification triggers another in a hard-to-trace storm; relying on notification order the pattern doesn't guarantee.
Security trade-off: Notifications may fan sensitive state out to many subscribers, ensure each subscriber is authorized for the data it receives; an untrusted subscriber shouldn't get privileged events.
Operational cost: Cascades and ordering make behavior hard to trace; leaks from missing unsubscribe; needs lifecycle discipline and sometimes a notification log.
Adopt safely: Behind the existing update call, publish events alongside direct calls, migrate dependents to subscribe, then remove the direct calls.
Modern alternative: Reactive streams (RxJS Observables), an event emitter/bus, or signals, language/framework machinery with built-in unsubscription.
Verify correct application: A subscribe/notify/unsubscribe test, all current subscribers are notified on change, and after unsubscribe a subscriber receives nothing (a leak/lapsed-listener test).
Example:
```ts
// ❌ never, subject hardcodes every dependent; add one = edit the subject
save() { this.db.write(); ui.refresh(); analytics.track(); cache.invalidate(); }
// ✅ always, subject emits; dependents subscribe/unsubscribe
save() { this.db.write(); this.emit("saved", this.state); }
```
Source(s): GoF 1994, ISBN 0-201-63361-2; https://refactoring.guru/design-patterns/observer; doi:10.3390/su131810256

### State, Behavioral
Intent: Allow an object to alter its behavior when its internal state changes; the object will appear to change its class (GoF 1994).
Forces: An object behaves very differently depending on a mode/state (order lifecycle, connection, document workflow), and that logic has become massive conditionals keyed on a state field.
Best situation: An object behaves differently by current state and the states are many and change often; a class is polluted with massive conditionals on its state fields; lots of duplicate code across similar states/transitions of a condition-based machine.
Pros: Single Responsibility (per-state code in its own class); Open/Closed (add states without changing existing state classes or context); removes bulky state-machine conditionals from the context.
Cons: Overkill if the machine has only a few states or rarely changes.
Avoid when: There are 2 trivial states, a boolean and an `if` is clearer.
Failure/rot prevented: Sprawling `switch(status)` blocks repeated in every method, where adding a state means editing them all and forgetting one.
Misuse: State objects that reach into and mutate each other, or hide illegal transitions, so the machine's legal paths aren't actually enforced.
Security trade-off: none notable (though a correctly-enforced state machine *prevents* invalid-transition abuse, e.g. "pay" after "refund").
Operational cost: More classes to navigate; the transition map should be explicit so the legal graph is auditable and observable.
Adopt safely: Behind the existing context interface, extract one state's behavior to a state class at a time (expand-contract), keeping the status field until migration completes.
Modern alternative: A sum type (discriminated union) + exhaustive pattern-matching, or a declarative state-machine library (XState), the compiler then enforces exhaustiveness.
Verify correct application: An **exhaustive-transition test**, every (state, event) pair has a defined outcome and illegal transitions are rejected (not silently ignored); exhaustiveness checked by the type system where possible.
Example:
```ts
// ❌ never, behavior keyed by conditionals repeated across methods
ship(){ if(this.s==="paid"){/*…*/} else if(this.s==="pending"){/*…*/} /* every method */ }
// ✅ always, each state owns its behavior; illegal transitions throw
class Paid implements OrderState { ship(o){ o.setState(new Shipped()); } cancel(){ throw IllegalTransition; } }
```
Source(s): GoF 1994, ISBN 0-201-63361-2; https://refactoring.guru/design-patterns/state

### Strategy, Behavioral
Intent: Define a family of algorithms, encapsulate each one, and make them interchangeable, letting the algorithm vary independently from the clients that use it (GoF 1994).
Forces: One behavior has several interchangeable variants (pricing, sorting, routing, tax rules) selected at runtime, and they're tangled into one class as a conditional.
Best situation: You want to switch algorithm variants at runtime; you have many similar classes differing only in how they execute one behavior; you want to isolate business logic from an algorithm's details; you need to replace a massive conditional over algorithm variants.
Pros: Swap algorithms at runtime; isolate an algorithm's implementation from its user; replace inheritance with composition; Open/Closed (new strategies without changing the context).
Cons: Clients must know the differences between strategies to pick one; overkill if you have only a couple of algorithms that rarely change.
Avoid when: There is one algorithm, or a couple that rarely change, a plain function or an `if` is enough.
Failure/rot prevented: A growing `switch`/`if-else` over algorithm variants embedded in its caller, edited for every new variant.
Misuse: A Strategy interface with a single implementation (speculative generality), or strategies that secretly depend on the context's internals, defeating interchangeability.
Security trade-off: none notable.
Operational cost: Minimal; keep strategy selection (the mapping from input to strategy) in one auditable place.
Adopt safely: Behind the existing call, extract the branches into strategies, inject the selector, delete the conditional (expand-contract); fully reversible.
Modern alternative: A **first-class function** passed in, or a `Record<Key, (x) => y>` lookup, the canonical case where a function supersedes a class hierarchy.
Verify correct application: A test that **swaps ≥2 strategies** behind the same interface and asserts different, correct outcomes for the same input (plus selection maps each input to the intended strategy).
Example:
```ts
// ❌ never, variants baked into a conditional inside the caller
function price(o){ if(o.kind==="vip") return x*0.8; if(o.kind==="bulk") return x*0.9; return x; }
// ✅ always, interchangeable strategies (functions) selected at runtime
const price = (o: Order) => pricing[o.kind](o.subtotal);  // pricing: Record<Kind, Fn>
```
Source(s): GoF 1994, ISBN 0-201-63361-2; https://refactoring.guru/design-patterns/strategy

### Template Method, Behavioral
Intent: Define the skeleton of an algorithm in an operation, deferring some steps to subclasses so they can redefine certain steps without changing the algorithm's structure (GoF 1994).
Forces: Several variants share the same step sequence and differ only in a few steps; copy-pasting the whole algorithm per variant has duplicated the invariant skeleton.
Best situation: You want clients/subclasses to extend only particular steps of an algorithm; you have several classes with almost identical algorithms differing only in minor steps.
Pros: Let subclasses override only certain parts of a large algorithm, insulating them from changes elsewhere; pull duplicate code up into a superclass.
Cons: Some subclasses may be constrained by the fixed skeleton; you can violate the Liskov Substitution Principle by suppressing a default step; template methods get harder to maintain the more steps they have.
Avoid when: The step sequence isn't actually shared, or variation is better expressed by passing in behavior, prefer composition.
Failure/rot prevented: Duplicated algorithm skeletons across variants that must be fixed in lockstep when the invariant part changes.
Misuse: Deep inheritance where a subclass overrides a "step" to subvert the algorithm's contract (LSP violation), or a template with so many hooks it's unreadable.
Security trade-off: none notable.
Operational cost: Inheritance coupling makes the skeleton rigid; changes to the base ripple to all subclasses, test every subclass against the invariant.
Adopt safely: Prefer composition for new code; for existing duplication, extract the shared skeleton into a base and override steps (or better, inject step functions).
Modern alternative: A higher-order function that takes the varying steps as callbacks (composition over inheritance), the skeleton is a function, the steps are parameters.
Verify correct application: A per-subclass Liskov/substitution test, every concrete subclass preserves the skeleton's invariant order and overrides only the intended steps (the base algorithm's contract holds for all subclasses).
Example:
```ts
// ❌ never, each exporter duplicates the whole open→write→close skeleton
class CsvExport { run(){ open(); /*csv*/ close(); } } class XmlExport { run(){ open(); /*xml*/ close(); } }
// ✅ always, skeleton fixed once; only the varying step is injected
const exportWith = (fmt: (rows: Row[]) => string) => (rows: Row[]) => { open(); write(fmt(rows)); close(); };
```
Source(s): GoF 1994, ISBN 0-201-63361-2; https://refactoring.guru/design-patterns/template-method; doi:10.1109/QRS.2017.37

### Visitor, Behavioral
Intent: Represent an operation to be performed on the elements of an object structure, letting you define a new operation without changing the classes of the elements on which it operates (GoF 1994).
Forces: A stable class hierarchy (an AST, a document tree) needs many *new, unrelated* operations added over time, and adding each by editing every element class is invasive.
Best situation: Performing an operation across all elements of a complex object structure; extracting auxiliary behaviors out of the element classes to keep their core logic clean; a behavior that makes sense for only some classes in a hierarchy.
Pros: Open/Closed (add a new operation across many classes without changing them); Single Responsibility (gather the versions of one behavior into one visitor); a visitor can accumulate state while traversing.
Cons: You must update every visitor whenever a class is added to or removed from the hierarchy; visitors may lack access to private fields/methods of the elements they visit.
Avoid when: The hierarchy changes more often than the set of operations, then Visitor makes the common change (new element type) the expensive one.
Failure/rot prevented: Operation logic (export, typecheck, pretty-print) smeared across every element class and duplicated per operation.
Misuse: Visitor over an unstable hierarchy, so every new node type forces edits to all visitors, maximizing the cost of the most frequent change. Measured caution: Visitor is among the more complexity-heavy patterns whose misuse is empirically linked to maintainability smells (Almadi et al. 2021).
Security trade-off: none notable.
Operational cost: Double-dispatch (`accept`/`visit`) indirection is hard to follow in traces; the add-a-node-type change touches many files.
Adopt safely: Behind the element hierarchy's `accept` method; add one visitor for a new operation without touching existing operations.
Modern alternative: A sum type (tagged union) + exhaustive `switch`/pattern-matching, the compiler enforces that every element type is handled, no double dispatch needed.
Verify correct application: A double-dispatch coverage test, every (element type × visitor) combination is exercised, and adding an element type fails an exhaustiveness check (so no visitor silently ignores it).
Example:
```ts
// ❌ never, one method per operation smeared across every node class
class NumNode { toJson(){…} typeCheck(){…} print(){…} } // add an op = edit every node
// ✅ always, nodes accept visitors; a new operation is one new visitor
interface Node { accept<T>(v: Visitor<T>): T }  // class NumNode { accept(v){ return v.num(this); } }
```
Source(s): GoF 1994, ISBN 0-201-63361-2; https://refactoring.guru/design-patterns/visitor; doi:10.3390/su131810256
