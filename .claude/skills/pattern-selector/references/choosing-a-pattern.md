# Choosing a Pattern, the decision engine

This is the deterministic flow the skill runs on every feature. It turns a vague "which pattern?" into a
recorded decision. The governing bias, stated up front and enforced at step 2: **weigh the forces the system will
face over its lifetime, not just this sprint. A pattern without its problem is rot, and so is the structure a
growing system should have had but did not. Pick none only when the forces are genuinely small and will stay
small; block only speculative structure.** Sources for the lens: GoF 1994 ch. 1
(<https://refactoring.guru/design-patterns>), Fowler *PoEAA* (<https://martinfowler.com/eaaCatalog/>).

## Step 0, Is there even a design problem here?

If the change is a one-line fix, a config tweak, or a straight-line function with no variation, **stop, no pattern.** Record nothing beyond the code. The engine below is for code with *structure* to decide.

## Step 1, Name the problem as forces, not a pattern

Write the forces down before any pattern name is allowed in the conversation. Include both the forces you
have now and the ones the system will face for certain, because enterprise code is built for its lifetime,
not just this sprint:

- **What varies** (and along how many axes)?, *encapsulate what varies.*
- **What must stay stable** while that varies?
- **What is duplicated** across callers or will be?
- **What is coupled** that shouldn't be (concrete class, transport, storage, vendor)?
- **What must several callers keep consistent** (one fact, many writers)?
- **What is certain and imminent** on the roadmap: more scale, a second or third consumer, a team or
  ownership boundary, an audit or compliance duty, a swap of a vendor or store? A force you can already see
  coming is a real force; one you are inventing to feel thorough is not.
- **What would it cost to retrofit** the structure into a running system later, versus building it now?

If you cannot name a force, present or certain and imminent, there is no pattern decision, there is just code
to write.

## Step 2 (the most important step): anti-pattern check, then pattern-need check

Run two checks, in this order.

### 2a. Is the current code using an anti-pattern?

Look for a God Object, an anemic domain model, a big ball of mud, premature abstraction, or a Singleton
used as global state. See `anti-patterns-and-smells.md`.

- **No:** go to 2b.
- **Yes:** scope the work to remove it (break up the God Object, move behavior onto the model, inline the
  premature abstraction). Then still run 2b, because the cleaned-up code may or may not need a pattern.

### 2b. Does this code need a pattern?

A pattern earns its place when a named force calls for it, present or certain and imminent given the system's
scale, roadmap, team, or compliance reality, and no plain function, class, or language feature already solves
it. A first-class function is a Strategy. A `map` of constructors is a Factory. A sum type with `match` is a
Visitor or State. A DI container is Singleton done right. Prefer the language feature.

YAGNI blocks SPECULATIVE structure only: a factory for one use, an interface with one implementation and no
second consumer in sight, a layer added for a future nobody can name. It does not block deliberate design for
growth you can already see. So weigh the cost of adding the structure now against the cost of retrofitting it
into a running system later; when a force is certain and imminent, building it in is correct, not premature.

- **Yes (a present or certain-and-imminent force):** pick a pattern and scope it. Go to Step 3.
- **No, and 2a found an anti-pattern:** remove the anti-pattern and make the result scalable and
  performant. Add no new pattern. Record the decision and move on to the next piece.
- **No, and there was no anti-pattern:** there is no pattern decision here. Write "no pattern, because the
  forces are small and will stay small" and stop.

A pattern only earns its place past this gate, and "no pattern" earns its place only when the forces really
are small and will stay small, not merely small today.

## Step 3, Map symptoms → candidate patterns

| Symptom in the code / feature | Candidate(s) | First check the cheaper option |
|---|---|---|
| The concrete type to create depends on runtime context | Factory Method / Abstract Factory | a `map`/function of constructors |
| A constructor has many optional params / telescoping | Builder | an options object / named args |
| One of several interchangeable algorithms chosen at runtime | Strategy | **a first-class function** |
| An object behaves differently by mode, with `switch(state)` everywhere | State | a status enum + small functions |
| Add behavior to an object without subclass explosion | Decorator | composition / middleware |
| Add many new *operations* over a stable type hierarchy | Visitor | **pattern-matching on a sum type** |
| Incompatible third-party interface you can't change | Adapter | align the interface if you own both sides |
| A complex subsystem most callers shouldn't see | Facade | a couple of well-named functions |
| One-to-many "when X changes, notify dependents" | Observer / Domain Event | **reactive streams / an event bus** |
| Queue / log / undo an action | Command / Memento | a plain job record |
| The same workflow is about to be copied into a 2nd caller | Template Method / **Service Layer** | extract a shared function |
| Data access is sprawling across the app / untestable queries | **Repository** (+ Unit of Work, Specification) | one data-access module |
| Two call sites must "stay in sync" on one fact | single owner + Observer/Domain Event | one owner, others read |
| A vendor's model is leaking into your domain | **Anti-Corruption Layer** | a mapping function at the edge |
| An unhandled error keeps slipping through | **Result/Either** (typed errors) | exhaustive handling + a lint |
| A null keeps causing branches/NPEs | **Null Object** | an explicit option type |

Full entries (forces, pros, cons, security + operational trade-offs, verify-step, sources) are in
`design-patterns-catalog.md` (GoF) and `enterprise-patterns.md` (the enterprise/FP/security layer).

## Step 4, Score the candidates on five axes (not just elegance)

For each candidate, score honestly:

1. **Fit**, does it match the *named forces*, or just look clever?
2. **Cost**, indirection, new classes/files, the learning curve for the next reader.
3. **Security**, does it widen the attack surface? (global mutable state; deserialization/clone; a new
   trust boundary via a remote Proxy/Gateway/Adapter; an Interpreter's injection surface) → threat-model
   via `owasp-secure-coding-bdd`.
4. **Operational cost**, observability/debuggability burden, new failure modes (Observer cascades,
   Chain-of-Responsibility "request fell through"), latency (Proxy), tuning surface (resilience/concurrency
   patterns) → `sre-operational-readiness`.
5. **Supersession**, is there a modern language/paradigm feature that does this with less? Prefer it.

The winner is the candidate whose **fit** clearly beats its **cost + security + operational** total, or
**"no pattern"** if none does.

## Step 5, Combinations and known conflicts

- **Common good combinations:** Factory + Strategy (build the chosen algorithm); Repository + Unit of Work
  + Specification (data access + transaction + query); Command + Memento (undo); Observer/Domain Event +
  single-owner (consistency). See the catalog entries.
- **Conflicts / smells:** Singleton + anything testable (global state fights DI, prefer a DI-scoped
  instance); Active Record + a rich domain (fuses persistence and domain, violating dependency direction, prefer Data Mapper); a Facade that accretes data/logic until it is a God Object.
- **Sequencing in running code:** never introduce a structural pattern big-bang, see step 6.

## Step 6, Verify it holds, and adopt it safely

- **Verify correct application** names a *pattern-specific* check, not "the feature's tests pass" (a
  Strategy with one concrete strategy passes its tests and proves nothing). Examples: Strategy → a test
  that swaps ≥2 strategies; State → an exhaustive-transition test; Repository → a **contract test** run
  against the in-memory *and* the real store; Visitor → every node type's double-dispatch covered. Author
  it under `bdd-comprehensive-testing` / `comprehensive-test-strategy` so it actually runs.
- **Adopt safely** when refactoring running code: introduce the pattern *behind the existing interface*
  (Strangler Fig), expand/contract any schema it touches, keep it reversible, `release-deployment-safety`.

## Which decisions are mechanizable (and which are not)

Be honest about enforceability, so the skill doesn't over-promise:

- **Mechanizable → encode as an `arch-gate` rule via `arch-encode`** (these reach `proven`). Example:
  ```
  ❌ import { supabase } from '@/lib/supabase'   // inside src/domain/**, data access outside the Repository
  ✅ import { orderRepo } from '@/domain/orders/repository'
  ```
  Rule: forbid `from 'supabase'` / raw SQL in `src/domain/**`; data access only through a `*Repository`.
  Other greppable choices: "no `new ConcreteX()` outside its factory"; "no `JSON.parse` of untrusted input
  without the typed parser"; "no direct `fetch(` outside the Gateway module".
- **Not mechanizable → `judge-arch` reviews it** against all four questions, in fresh context (these stay
  `observed`): "is this Strategy warranted or is one algorithm being dressed up?", "is this Facade turning
  into a God Object?", "is this abstraction premature?". No grep catches these; a skeptical reviewer does.

## Worked example

**Feature:** "Add a second payment provider; checkout currently calls Stripe directly in the controller."

1. **Forces:** the *provider* varies (2 now, more later); the charge *workflow* must stay stable; Stripe
   types are coupled into the controller (a boundary + dependency-direction smell).
2. **YAGNI gate:** more than one provider is real and imminent → a pattern is warranted; it is not an
   anti-pattern-removal case.
3. **Candidates:** Strategy (interchangeable providers) + a thin Gateway/Anti-Corruption Layer (keep each
   SDK's model out of the domain). Cheaper option considered: a first-class function `charge(provider, …)`, rejected because each provider also needs config + webhooks, which a function signature hides.
4. **Score:** Fit high (provider is the thing that varies); Cost moderate (one interface + 2 impls);
   Security, the Gateway is a **trust boundary** (validate webhook signatures, no SSRF to provider URLs) →
   owasp; Operational, one more hop to trace, add a per-provider success-rate metric → sre; Supersession, a function doesn't carry the config/webhook surface, so the interface earns its place.
5. **Decision:** `PaymentProvider` **Strategy** behind a **Gateway**; domain speaks `PaymentProvider`, not
   Stripe. Real guarantee routed to types (a `Money` value object, a discriminated `ChargeResult`).
6. **Verify + adopt:** a contract test every provider impl must pass (same assertions, both providers);
   introduce behind the existing checkout call (Strangler), no schema change. `arch-gate` rule: no `stripe`
   import outside `src/payments/providers/**`.

**Decision record (the output contract):** forces → [Strategy + Gateway] → pros/cons → prevents
provider-coupling-in-controller → security: new trust boundary (owasp) → operational: +1 hop, add metric
→ simpler-alt rejected (function hides config/webhooks) → adopt via Strangler → verify via provider
contract test → `Forces evidence: [observed: checkout.ts:60-120 calls Stripe directly]` ·
`Verification status: [not-assessed → observed when the contract test is green]`.
