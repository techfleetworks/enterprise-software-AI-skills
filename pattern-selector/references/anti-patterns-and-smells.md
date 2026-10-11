# Anti-Patterns & Smells, what to detect and REMOVE

A pattern selector's most valuable output is often "undo this structure," not "add one." Over-abstraction
is itself a top cause of rot, so this reference is the counterweight to the catalog: the recurring *bad*
structures, how to spot them, and what to do instead. When step 2 of `choosing-a-pattern.md` finds one of
these, the job is removal/refactoring, not a new pattern.

Each entry: what it is · how to spot it · why it rots · the fix · source.

### God Object / God Class
- **Spot it:** one class/module that knows or does "everything", hundreds of lines, many unrelated
  responsibilities, most of the system reaching into it. A Facade or Mediator that kept accreting.
- **Rots because:** every change touches it (merge contention, ripple bugs); it can't be tested in
  isolation; it violates single-responsibility and boundary placement.
- **Fix:** split by responsibility into cohesive units behind their own interfaces (the "S" in SOLID);
  move data to its owner. Not a new pattern, *less* concentration.
- **Source:** Brown et al., *AntiPatterns* (1998, ISBN 0-471-19713-0); SOLID/SRP (Martin, *Clean
  Architecture* 2017).

### Anemic Domain Model
- **Spot it:** "domain" objects that are just bags of getters/setters with no behavior; all the logic lives
  in service/"manager" classes operating *on* them.
- **Rots because:** it's procedural code wearing OO clothes, invariants aren't enforced where the data
  lives, so they're re-checked (or forgotten) everywhere; the model guarantees nothing.
- **Fix:** move the behavior/invariants onto the entity/value object (a rich Domain Model); the Result/Value
  Object/Aggregate entries in `enterprise-patterns.md` are the constructive side.
- **Source:** Fowler, *Anemic Domain Model*, <https://martinfowler.com/bliki/AnemicDomainModel.html>.

### Big Ball of Mud
- **Spot it:** no discernible architecture, everything depends on everything, boundaries are accidental,
  control flow is spaghetti.
- **Rots because:** change is unpredictable and risky; nothing can be reasoned about locally.
- **Fix:** introduce boundaries incrementally (Strangler Fig, an Anti-Corruption Layer at the worst seam);
  don't big-bang rewrite. See `enterprise-architecture-standards`.
- **Source:** Foote & Yoder, *Big Ball of Mud* (1997), <http://www.laputan.org/mud/>.

### Premature abstraction / pattern-cargo-culting (the one THIS skill most risks)
- **Spot it:** an interface/factory/manager/strategy with exactly one implementation; a framework built for
  a second use case that doesn't exist; a pattern applied because it's "best practice," not because a force
  demanded it.
- **Rots because:** indirection with no payoff, more files to read, more hops to trace, a worse change
  than the straight-line code it replaced. It is the failure mode the YAGNI gate exists to stop.
- **Fix:** inline it back to the concrete code until a second real case appears (Rule of Three). This is a
  valid, common decision outcome: "remove this pattern."
- **Source:** GoF authors, *Design Patterns 15 Years Later* (InformIT 2009),
  <https://www.informit.com/articles/article.aspx?p=1404056>; Hunt & Thomas, *The Pragmatic Programmer* (YAGNI).

### Singleton-as-global-state
- **Spot it:** a Singleton holding mutable state, reached directly from everywhere (`X.getInstance()`).
- **Rots because:** hidden global dependency, untestable (can't substitute it), order-dependent, and a
  concurrency hazard. The GoF authors themselves said they'd reconsider Singleton (InformIT 2009).
- **Fix:** a single instance *provided by a DI container/scope* and injected, one instance, no global
  access. See DI/IoC in `enterprise-patterns.md`.
- **Source:** GoF 1994 (ISBN 0-201-63361-2) + InformIT 2009 interview.

### Over-mocking (test smell that drives production rot)
- **Spot it:** unit tests that mock everything, asserting interactions instead of outcomes; tests that
  break on every refactor though behavior is unchanged.
- **Rots because:** it couples tests to structure, hides real integration bugs, and pressures the code into
  awkward shapes to be "mockable."
- **Fix:** mock external dependencies only, never the unit under test; prefer fakes/real collaborators up
  the pyramid. See `comprehensive-test-strategy` (solitary vs sociable).
- **Source:** Fowler/Vocke, *The Practical Test Pyramid*,
  <https://martinfowler.com/articles/practical-test-pyramid.html>.

## How this ties to the gates
- "Remove this structure" decisions are recorded like any other pattern-decision (the record's Decision is
  "no pattern / remove X, because …").
- Where an anti-pattern is greppable (a `getInstance()`, a `new ConcreteX()` outside its factory, a domain
  file importing a vendor SDK), encode the ban as an `arch-gate` rule via `arch-encode`.
- The judgment calls ("is this abstraction premature?") are exactly what `judge-arch` reviews in fresh
  context against the four questions.
