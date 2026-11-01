# PoEAA adversarial audit of the pattern skills (fixed in v1.4)

After v1.3.1 the operator queued three follow-ups: a new COA skill, a deep-dive literature review, and
this audit. The operator asked for this one first. Its fixes are the scope of release v1.4 (ADR-0103).

**Headline: 51 patterns total; 4 covered well; 7 covered poorly; 39 missing; 1 miscited.**

The skills cite Fowler's *Patterns of Enterprise Application Architecture* as a primary source, and the
catalog gate says it keeps them "honest." Measured against the book, the skills cover fewer than one
pattern in ten well. The page numbers they cite are right, but the gate that is supposed to guard them
cannot tell a right page from a wrong one, three existing entries contradict the book on when to use
their pattern, and a fourth carries an example that teaches a money bug the book warns against by name.

- **Plain-English version:** [`plain-english-summary.md`](plain-english-summary.md). `[observed]` Grade 4
  by `node always-on/run-check.mjs run usability-ux-universal-design readability.mjs --
  docs/audit/poeaa-2026-11/plain-english-summary.md --max-grade 7` (exit 0; the operator asked for grade 7
  or below).
- **The fix:** the v1.4 spec and its scenarios, [`docs/design/poeaa-v1.4/`](../../design/poeaa-v1.4/README.md),
  and ADR-0103.
- **Audited:** `techfleetworks/enterprise-software-AI-skills` at tag `v1.3.1` (commit `14d4bf5`).
- **Source of record:** Martin Fowler with David Rice, Matthew Foemmel, Edward Hieatt, Robert Mee, and Randy
  Stafford, *Patterns of Enterprise Application Architecture*, Addison-Wesley 2002, ISBN 0-321-12742-0. Read
  this session from a local PDF (488 PDF pages).
- **Date:** 2026-10-31.
- **Stance:** adversarial. Every pattern started at FAIL. "Covered well" needed the book's words and the
  skill's words side by side, agreeing on intent, forces, and trade-offs. The study guide was not used as a
  source for any claim here.
- **Evidence states** follow [`evidence-discipline.md`](../../../.claude/skills/skeptical-audit/references/evidence-discipline.md).

## What the findings mean, in outcomes

The skills exist so that an agent picks a pattern for a real reason and can prove the pattern holds.
Measured that way, here is what goes wrong today and what v1.4 changes.

| Today an agent using the skills will... | Because of | After v1.4 |
|---|---|---|
| trust a page number that nothing checked | F1 | a wrong, missing, or invented page fails the gate |
| look up a claim on page 133 and not find it | F2 | narrative-chapter claims cite the chapter |
| flag Fowler's recommended thin Service Layer as a mistake | F3 | both variants are named; neither is a misuse |
| have no guidance on the first decision in the book (how to organize business logic), and be told one option is a "grab-bag" | F4 | three entries and two chooser rows; no option is called a smell |
| let the second person to save silently erase the first person's edits | F5 | offline-lock entries with a two-session test |
| put many small remote calls on a slow network, or add DTOs inside one process | F6 | Remote Facade entry with the book's "only across processes" rule |
| be told a rule "becomes proven" with no rule to copy | F7 | a kit of arch-gate rules, each proven to fire |
| find no chooser row for most of the book's problems | F8 | a row for each, with no dangling route |
| skip a Gateway on a stable service and lose the easy test stub | F9 | the avoid-when follows the book |
| store money as a floating-point number, copying the skill's own example | F20 | no example stores money as a float; a Money entry with a split test |

The remaining findings (F10 to F19) are smaller: an entry that is right on the main point but leaves out
a rule the book gives, or a whole group of patterns with no entry.

## How pages are cited here (read this first)

The PDF is the "Team LiB" e-book edition. `[observed]` **It carries no printed page numbers at all**, so
one fixed offset from PDF page to printed page cannot exist. `[observed]` The drift proves it: Fowler's text says the
"First Law of Distributed Object Design (page 89)" (PDF 116), and that law appears on PDF 103 (printed is
PDF minus 14). Special Case, printed page 496, opens on PDF 469 (printed is PDF plus 27). The gap moves by
41 pages across the book.

So printed pages come from the book itself. Fowler cross-references every pattern by its printed page,
in the form "Domain Model (116)". For each of the 51 catalog patterns this audit collected every such
cross-reference in the full text and took the page they agree on. `[observed]` All 51 resolved to one
page (from 3 hits for Repository (322) to 139 for Domain Model (116)). The only stray value was one
"Metadata Mapping (329)" against twelve "(306)", which reads as a typo in the book.

Every book quote below gives the printed page (from the cross-references) **and** the PDF page it was
read on. Where a claim sits in a narrative chapter rather than a pattern chapter, the printed page cannot
be recovered from this edition, so only the chapter and PDF page are given. `[observed]` Every quote in
this report was re-found in the extracted text by a script before publishing; that pass caught and fixed
four wrong PDF pages in an earlier draft of this report.

**Re-run the extraction:**

```
pdftotext -layout "Patterns of Enterprise Application Architecture.pdf" book.txt
```

Split on form feed (one chunk per PDF page), then count matches of `<Pattern Name> \((\d{2,3})\)` per pattern.

## The scoreboard

| Verdict | Count | Patterns |
|---|---|---|
| Covered well | 4 | Repository, Data Mapper, Identity Map, Query Object |
| Covered poorly | 7 | Unit of Work, Lazy Load, Data Transfer Object, Gateway, Model View Controller, Special Case, Value Object |
| Miscited | 1 | Service Layer (also covered poorly) |
| Missing | 39 | every other pattern in the catalog (full list in the coverage table) |
| **Total** | **51** | Fowler's Part 2 catalog, chapters 9 to 18 (TOC read on PDF 5 and 6) |

`[observed]` The book's table of contents (PDF 5 and 6) lists 51 patterns across ten chapters. Twelve of
them have an entry in the skill catalog that cites the book. Specification also cites the book, but it is
Evans and Fowler, not a PoEAA catalog pattern, so it is not scored; its claim that the book mentions it
under Repository holds (PDF 316).

**What did hold up.** `[observed]` Every printed page the skills cite matches the book's own
cross-references: Service Layer (133), Active Record (160), Data Mapper (165), Unit of Work (184), Identity
Map (195), Lazy Load (200), Serialized LOB (272), Metadata Mapping (306), Query Object (316), Repository
(322), Model View Controller (330), Data Transfer Object (401), Gateway (466), Value Object (486), Special
Case (496). `[observed]` Every phrase the skills quote from the book was found in the extracted text. That
is real care by the authors, and it is also luck: F1 shows nothing would have caught a wrong page.

## Findings, most severe first

### How each finding is written and rated

Each finding gives, in a code block: the skill file and heading (**Skill / file**); the book's words with
printed and PDF page (**Book says**); the skill's words (**Skill says**); a **Verdict** of `missing`,
`covered-poorly`, `miscited`, `wrong-intent` (the skill says the opposite of the book), or `unprovable`
(no way to show the pattern or the citation is right); and a **Severity**. Then it says why it matters,
the smallest fix, the v1.4 outcome, and the scenarios that define that outcome.

Severity follows one rule set. It was given to the auditor with the task (operator's brief) and is
written out here in full so a reader can re-apply it:

- **critical**: the skills' own evidence guard does not work (a check that cannot fail).
- **high**: a miscitation (these skills police evidence, so a bad citation is never minor); a missing
  pattern an agent would reach for often (Repository, Unit of Work, Service Layer, Data Mapper, DTO,
  Remote Facade, the offline locks, and the domain-logic trio Transaction Script, Domain Model and Table
  Module); guidance that contradicts the book on one of those patterns, or where the wrong choice loses
  data or money; a promised proof that does not exist; or a chooser that cannot route to those patterns.
- **medium**: guidance that contradicts or narrows the book where the cost is a weaker design; a missing
  group of patterns where an ORM or framework makes the choice for most teams.
- **low**: a rule or nuance left out of an entry that is right on the main point; quote wording.

### F1. The catalog gate cannot detect a wrong or missing PoEAA page

```
Skill / file:   pattern-selector/scripts/check-catalog-completeness.mjs, lines 52 and 118
Book says:      (not a book claim; this is about the gate that guards book claims)
Skill says:     "A real citation: a non-Wikipedia URL, a DOI, an ISBN, or a book page" (line 49), and
                enterprise-patterns.md line 7: "a mechanical gate ... verifies every entry carries every
                label **and** a citation token"
Verdict:        unprovable
Severity:       critical
```

`[observed]` The gate passes when the pages are wrong and when they are gone. On copies of
`enterprise-patterns.md`:

| Mutation | Gate exit |
|---|---|
| Original file | 0 |
| Every "Fowler, *PoEAA*, Name (NNN)" page rewritten to (999) | 0 |
| 22 of the 23 PoEAA page numbers deleted | 0 |
| Repository (322) changed to Repository (17) | 0 |

Two reasons. First, the gate checks that a citation token exists somewhere in the entry, never that it is
correct. Second, the PoEAA form the catalog uses, "Repository (322)", does not even match the gate's page
pattern `\(pp?\.?\s*\d+\)`, which needs a "p". Every PoEAA entry passes on its ISBN alone. The file's own
header (line 8) tells authors to cite "a book page as `(p. NNN)`", a form no PoEAA entry uses.

**Why it matters.** These skills police evidence. The one gate that guards the catalog's sources would wave
a made-up page through. The current pages are right by care, not by proof, and v1.4 adds about 40 new
PoEAA citations.

**Smallest fix.** A committed page registry for the 51 patterns, and a gate that fails any PoEAA citation
whose page or name does not match it. A discriminating test runs the four mutations above.

**v1.4 outcome.** A wrong, missing, or invented PoEAA page cannot merge, and no PoEAA pattern is silently
absent (each is covered or declined with a reason). Spec WP2, requirements R2.1 to R2.11. Scenarios:
`citation-gate.feature` (all).

### F2. Service Layer's "(133)" does not support the security half of its sentence

```
Skill / file:   pattern-selector/references/enterprise-patterns.md, "Service Layer", Intent (line 797)
Book says:      "the Service Layer (133) is also a good spot to place such things as transaction control
                and security." (Fowler, Chapter 2 narrative, section "Service Layer", read on PDF 45;
                printed page not recoverable from this edition)
Skill says:     "coordinates each one's response, owning transaction and security control (Fowler, *PoEAA*,
                Service Layer (133))."
Verdict:        miscited
Severity:       high
```

`[observed]` The Service Layer pattern chapter (PDF 143 to 149) does not contain the word "security" or
"secure" once. The claim is real, but it lives in Chapter 2. A reader who opens page 133 to check it will
not find it.

**v1.4 outcome.** The clause cites `ch. 2`, and the gate accepts chapter citations only for chapters 1 to
18. Spec R2.5, R3.1. Scenarios: `existing-entries.feature` (service-layer-security-cites-chapter),
`citation-gate.feature` (poeaa-chapter-citation).

### F3. Service Layer calls Fowler's own recommended variant a misuse

```
Skill / file:   enterprise-patterns.md, "Service Layer", Cons and Misuse (lines 805 to 812)
Book says:      "In the domain facade approach a Service Layer is implemented as a set of thin facades over
                a Domain Model (116). The classes implementing the facades don't implement any business
                logic." (Service Layer, p.133, read on PDF 144)
Skill says:     "a pass-through service that only forwards is pure overhead" and "Misuse: An "anemic"
                service that only delegates (no coordination)"
Verdict:        wrong-intent
Severity:       high
```

Fowler names two variants, the domain facade (thin, no logic) and the operation script (thicker). The
skill treats the first as an error. It also drops half of Fowler's trigger. The book: "in an application
with more than one kind of client of its business logic, and complex responses in its use cases involving
multiple transactional resources, it makes a lot of sense to include a Service Layer" (PDF 146). The
skill's "Best situation" keeps the clients and loses the transactional resources.

**Why it matters.** An agent with a rich Domain Model will either skip the boundary or stuff logic into it
to dodge the "misuse." Both are worse than Fowler's advice, and judge-arch reviews that lean on the entry
will flag correct designs.

**v1.4 outcome.** Both variants are named, the delegating service is not a misuse, and both triggers are
given. Spec R3.2. Scenarios: `existing-entries.feature` (service-layer-two-variants,
service-layer-both-triggers); eval `eval-thin-service-layer-ok`.

### F4. Fowler's first decision, how to organize domain logic, has no entries, and the skill disparages one option

```
Skill / file:   enterprise-patterns.md (no Transaction Script, Domain Model, or Table Module entry);
                the only Transaction Script mention is the Service Layer Cons (line 805)
Book says:      "However much of an object bigot you become, don't rule out Transaction Script. There are a
                lot of simple problems out there, and a simple solution will get you up and running much
                faster." (Transaction Script, p.110, read on PDF 123)
Skill says:     "can become a **Transaction Script** grab-bag"
Verdict:        missing (and wrong-intent for Transaction Script)
Severity:       high
```

Chapter 2 of the book is a choice among three patterns, and the Domain Model chapter gives the rule: "if
you have simple not-null checks and a couple of sums to calculate, a Transaction Script (110) is a better
bet" (PDF 130). The skill has no entry for any of the three and no chooser row for "how should this
business logic be organized." The one mention frames a legitimate pattern as rot.

**Why it matters.** Every other PoEAA choice hangs off this one (Domain Model leads to Data Mapper, Table
Module leads to Record Set, Transaction Script leads to the gateways). An agent has no guidance, and it is
nudged toward heavy structure for simple problems.

**v1.4 outcome.** Entries for all three, chooser rows for simple versus complex logic, and no sentence
anywhere calls Transaction Script a smell. Spec WP4. Scenarios: `domain-logic-and-data-source.feature`,
`chooser-routing.feature`; evals `eval-simple-logic-gets-script`, `eval-complex-rules-get-domain-model`.

### F5. Offline concurrency is missing, and Unit of Work merges the two kinds of transaction Fowler separates

```
Skill / file:   enterprise-patterns.md, "Unit of Work", Misuse and Modern alternative (lines 148, 155);
                no Optimistic Offline Lock, Pessimistic Offline Lock, Coarse-Grained Lock, or Implicit
                Lock entry
Book says:      "you have to break the business transaction down into a series of short transactions. This
                means that you are left to your own devices to support the ACID properties of business
                transactions between system transactions--a problem we call offline concurrency."
                (Chapter 5, read on PDF 88) and "The only potentially tricky part here is maintaining an
                accurate change set during the life of the business transaction." (same page)
Skill says:     "Misuse: Keeping the unit of work open across user think-time (it becomes a long
                transaction holding locks)" and "Modern alternative: A database transaction block
                (`BEGIN/COMMIT`)"
Verdict:        missing (offline locks); covered-poorly, wrong-intent (Unit of Work)
Severity:       high
```

Fowler's Unit of Work "Maintains a list of objects affected by a business transaction" (p.184, PDF 187),
and a business transaction can span several screens. Only the commit runs inside a short system
transaction. The skill equates the Unit of Work with the database transaction, so it offers `BEGIN/COMMIT`
as a replacement and treats a think-time Unit of Work as a held lock. A transaction block tracks no changes
and stops no lost update across requests.

Fowler's Identity Map chapter also notes it "doesn't do anything to handle conflicts that cross sessions"
(PDF 198). The skill has nothing that does. "Optimistic lock" appears only as a passing phrase inside Unit
of Work and Entity. Optimistic Offline Lock "Prevents conflicts between concurrent business transactions by
detecting a conflict and rolling back the transaction" (p.416, PDF 400).

**Why it matters.** The lost update (two people edit the same record across screens, and the second save
silently wins) is one of the most common data bugs in business software. The skills give no pattern for
it and suggest a fix that does not work.

**v1.4 outcome.** Four offline-concurrency entries, a two-session conflict test, chooser rows for "two
people edit one record" and "a conflict would cost too much," and a corrected Unit of Work. Spec R3.3, WP5.
Scenarios: `concurrency-and-session.feature`, `existing-entries.feature`
(unit-of-work-business-transaction); eval `eval-lost-update-gets-lock`.

### F6. Remote Facade is missing, so the DTO entry stands alone

```
Skill / file:   enterprise-patterns.md, "Data Transfer Object (DTO)"; no Remote Facade entry
Book says:      "Use Remote Facade whenever you need remote access to a fine-grained object model."
                (Remote Facade, p.388, read on PDF 379) and "When you're working with a remote interface,
                such as Remote Facade (388), each call to it is expensive." (Data Transfer Object, p.401,
                read on PDF 388)
Skill says:     "An object that carries many data items across a process/boundary in a single call, to avoid
                chatty fine-grained remote access"
Verdict:        missing (Remote Facade); covered-poorly (DTO)
Severity:       high
```

In the book the two are a pair: the facade is the coarse-grained interface, the DTO is what it returns,
and an assembler moves data between the domain and the DTO (PDF 380 to 382). The skill has the DTO only,
with no assembler. It also misses the book's limit: "If all your access is within a single process, you
don't need this kind of conversion" (PDF 379), and the First Law, "Don't distribute your objects!"
(Chapter 7, PDF 103).

**Why it matters.** An agent fixing a slow, chatty API has no pattern to reach for, and an agent with no
remote boundary has nothing telling it to leave DTOs out.

**v1.4 outcome.** A Remote Facade entry that is avoided inside one process, the assembler named in the DTO
entry, and a chooser row for "many small calls across the network." Spec WP6. Scenarios:
`distribution-and-base.feature` (remote-facade-only-across-processes, dto-names-assembler); evals
`eval-chatty-client-gets-facade`, `eval-in-process-no-facade`.

### F7. No way ships to prove a PoEAA pattern is applied

```
Skill / file:   enterprise-patterns.md, every "Verify correct application" field; choosing-a-pattern.md
                lines 131 to 138; judge-arch/assets/presets/react-supabase/arch-gate.config.json;
                comprehensive-test-strategy and verifiable-quality-gates (no pattern-specific guidance)
Book says:      (not a book claim)
Skill says:     "Mechanizable → encode as an `arch-gate` rule via `arch-encode` (these reach `proven`)"
Verdict:        unprovable
Severity:       high
```

`[observed]` The arch-gate engine is real and can express these rules today (`include`, `exclude`,
`forbid`; `arch-gate.mjs` lines 177 to 179 and 240). Its presets enforce general layering ("UI must not
access the database directly", "Services must not import UI or touch web globals"). But no shipped rule
targets a PoEAA pattern. The catalog's verify lines describe rules in prose ("an `arch-gate` rule bans
`supabase.from()` / raw SQL outside the repository") with no rule text to copy. `[observed]` A search of
`comprehensive-test-strategy` and `verifiable-quality-gates` finds no Repository, Unit of Work, or Service
Layer test guidance; the one Service Layer hit in `test-pyramid-and-types.md` is about the test layer.

**Why it matters.** This is the half of the job the skills care about most: not just naming the pattern but
proving it holds. The skill promises "proven" and hands the agent a sentence.

**v1.4 outcome.** A "prove it" kit: exact arch-gate rules for the patterns a grep can check, each proven
to fire on a planted violation and stay quiet on clean code, plus named test shapes for the rest. Every
PoEAA entry's verify field names a kit item. Spec WP9. Scenarios: `prove-it-kit.feature`.

### F8. The chooser does not route the book's main problems to its patterns

```
Skill / file:   pattern-selector/references/choosing-a-pattern.md, Step 3 table (lines 69 to 86)
Book says:      the narrative chapters are built around these problems: organizing domain logic
                (Chapter 2), mapping to relational databases (Chapter 3), web presentation (Chapter 4),
                concurrency (Chapter 5), session state (Chapter 6), distribution (Chapter 7) (TOC, PDF 3
                and 4)
Skill says:     16 symptom rows; four reach a PoEAA pattern (Service Layer, Repository with Unit of Work,
                Null Object, and Gateway in the worked example)
Verdict:        covered-poorly
Severity:       high
```

`[observed]` The table lacks a row for: simple versus complex business logic; lost updates across screens; many small remote
calls; where session state should live; a class hierarchy that must go into tables; the same record
loaded twice in one request; one query per row in a loop; money that is split or rounded; domain code that
must not depend on database code.

**v1.4 outcome.** One row per problem (12 in all), each with a cheaper option to check first, and a check
that every routed pattern has an entry. Scenarios: `chooser-routing.feature`.

### F20. A catalog example stores money as a floating-point number, which the book forbids

```
Skill / file:   enterprise-patterns.md, "Value Object", Example (line 359)
Book says:      "You should absolutely avoid any kind of floating point type, as that will introduce the
                kind of rounding problems that Money is intended to avoid." (Money, p.488, read on PDF 462)
Skill says:     "class Money { constructor(readonly amount: number, readonly currency: string) {}"
Verdict:        wrong-intent (in a copyable example)
Severity:       high
```

A TypeScript `number` is a floating-point value. The example is the catalog's model of a good Value
Object, and the chooser's worked example routes "a `Money` value object" to the same idea. The book's
Money chapter also shows the next trap: rounding comes up "particularly when allocating money between
different places" (PDF 463), and Matt Foemmel's 5-cent example "gains a penny" with ordinary rounding.

**Why it matters.** Agents copy examples. This one teaches the exact bug the book's Money pattern exists
to prevent, in the one domain (money) where a rounding error is a real loss. This finding is why Value
Object moved from "covered well" to "covered poorly."

**v1.4 outcome.** No example stores money as a float; the Value Object example uses whole cents; a Money
entry ships with a test that split parts add back up. Spec R3.10, WP6. Scenarios: `existing-entries.feature`
(money-never-floating-point), `distribution-and-base.feature` (money-allocation-adds-up, money-no-floats);
eval `eval-money-split-no-floats`.

### F9. Gateway's "avoid when" contradicts the book

```
Skill / file:   enterprise-patterns.md, "Gateway", Cons and Avoid when (lines 875 to 876)
Book says:      "There's hardly any downside to making the Gateway, and the code elsewhere in the system
                becomes much easier to read." and "don't forget that even if you don't think the resource is
                ever going to change, you can benefit from the simplicity and testability Gateway gives
                you." (Gateway, p.466, read on PDF 443)
Skill says:     "Avoid when: A single, isolated call to a stable resource, wrapping it changes nothing."
Verdict:        wrong-intent
Severity:       medium
```

Fowler's reason for a Gateway on a stable resource is testing: it is "a clear point at which to deploy
Service Stubs (504)" (PDF 443). The skill's reason to skip it is stability. The skill also has no Service
Stub entry.

**v1.4 outcome.** The avoid-when follows the book and names Service Stub. Spec R3.4. Scenarios:
`existing-entries.feature` (gateway-stable-resource), `distribution-and-base.feature`
(service-stub-pairs-with-gateway); eval `eval-stable-resource-still-gateway`.

### F10. MVC treats all three roles as equally important; Fowler does not

```
Skill / file:   enterprise-patterns.md, "Model-View-Controller (MVC)"
Book says:      "the value of MVC lies in its two separations. Of these the separation of presentation and
                model is one of the most important design principles in software" (PDF 322) and "The
                separation of view and controller is less important, so I'd only recommend doing it when it
                is really helpful. For rich-client systems, that ends up being hardly ever" (PDF 323)
                (Model View Controller, p.330)
Skill says:     "Split a UI into a Model (data + domain behaviour), a View (presentation), and a Controller
                (input handling), so presentation and logic vary independently"
Verdict:        covered-poorly
Severity:       medium
```

**v1.4 outcome.** The entry names the two separations and marks the view and controller split optional.
Spec R3.5. Scenario: `existing-entries.feature` (mvc-two-separations).

### F11. Special Case is narrowed to a do-nothing Null Object

```
Skill / file:   enterprise-patterns.md, "Null Object (Special Case)"
Book says:      "Use Special Case whenever you have multiple places in the system that have the same
                behavior after a conditional check for a particular class instance, or the same behavior
                after a null check." and "A null can mean different things." (Special Case, p.496, read on
                PDF 470)
Skill says:     "Provide a subclass with well-defined neutral behaviour for the absent/special case"
Verdict:        covered-poorly
Severity:       medium
```

Fowler's examples include a missing customer and an unknown customer as different special cases, and an
"occupant" customer who still runs up charges (PDF 469 to 470). That behavior is special, not neutral.

**v1.4 outcome.** Fowler's rule, and one special case per meaning of absent. Spec R3.6. Scenario:
`existing-entries.feature` (special-case-many-meanings); eval `eval-two-meanings-two-cases`.

### F12. Session state has one prescription and no trade-off

```
Skill / file:   enterprise-architecture-standards/references/performance-scalability.md, lines 27 to 28;
                no Client, Server, or Database Session State entry anywhere
Book says:      Client Session State "Stores session state on the client." (p.456, PDF 434); Server
                Session State "Keeps the session state on a server system in a serialized form." (p.458,
                PDF 436); Database Session State "Stores session data as committed data in the
                database." (p.462, PDF 439)
Skill says:     "externalize state to a shared store, session data in Redis, not in-process memory"
Verdict:        missing
Severity:       medium
```

The skill picks one option and gives no forces. The choice changes security (state on the client can be
read and changed by the client), failover, and load on the database.

**v1.4 outcome.** Three entries, a chooser row, the scaling guide naming all three, and a security warning
on client-held state. Spec WP5, R4.8. Scenarios: `concurrency-and-session.feature`
(client-session-state-tampering, session-store-trade-offs); eval `eval-session-state-trade-off`.

### F13. Data source patterns: three of four have no entry

```
Skill / file:   enterprise-patterns.md; choosing-a-pattern.md line 114
Book says:      "Active Record is a good choice for domain logic that isn't too complex, such as creates,
                reads, updates, and deletes." (Active Record, p.160, read on PDF 166)
Skill says:     "Active Record + a rich domain (fuses persistence and domain, violating dependency
                direction, prefer Data Mapper)"
Verdict:        missing (Table Data Gateway, Row Data Gateway, Active Record)
Severity:       medium
```

The skill only warns against Active Record. It never says when Active Record is right, and it has nothing
on the two gateway forms that go with Transaction Script and Table Module.

**v1.4 outcome.** Three entries routed from the domain-logic chooser rows. Spec WP4. Scenarios:
`domain-logic-and-data-source.feature` (active-record-when-right and the entries outline).

### F14. Object-relational structural and metadata patterns are missing

```
Skill / file:   enterprise-patterns.md (Serialized LOB and Metadata Mapping are mentioned, never entered)
Book says:      "Represents an inheritance hierarchy of classes as a single table that has columns for all
                the fields of the various classes." (Single Table Inheritance, p.278, read on PDF 271)
Skill says:     "the PoEAA *Serialized LOB (272)*, inherits the data-map, retention, and deletion-propagation
                duties" (a compliance caveat with no entry behind it)
Verdict:        missing (11 patterns)
Severity:       medium
```

Missing: Identity Field, Foreign Key Mapping, Association Table Mapping, Dependent Mapping, Embedded Value,
Serialized LOB, Single Table, Class Table, and Concrete Table Inheritance, Inheritance Mappers, Metadata
Mapping. `database-architecture.md` line 8 covers surrogate keys, which is part of Identity Field. An ORM
still makes the team choose an inheritance mapping, and the skill gives no basis to choose.

**v1.4 outcome.** Eleven entries; each inheritance entry says when to pick a sibling; Serialized LOB keeps
its personal-data warning. Spec WP7. Scenarios: `object-relational-mapping.feature`.

### F15. Base patterns that carry the "dependency direction" rule are missing

```
Skill / file:   enterprise-patterns.md (no entries); judge-arch question 3 depends on this
Book says:      "Defines an interface in a separate package from its implementation." (Separated
                Interface, p.476, read on PDF 452)
Skill says:     (nothing; "Separated Interface" does not appear in any in-scope skill)
Verdict:        missing (Mapper, Layer Supertype, Separated Interface, Registry, Money, Plugin, Service
                Stub, Record Set)
Severity:       medium
```

Separated Interface is the book's tool for letting the domain own the interface its data code implements,
which is what judge-arch's dependency-direction question asks for. Money appears only as an example inside
Value Object (see F20). Registry is the book's form of what the DI entry calls the Service Locator
anti-pattern, and the skill never reconciles the two.

**v1.4 outcome.** Eight entries (WP6's ninth, Remote Facade, comes from F6); Separated Interface ships an
arch-gate rule; Registry and DI agree. Spec WP6. Scenarios: `distribution-and-base.feature`.

### F16. Web presentation patterns are missing

```
Skill / file:   enterprise-patterns.md, Presentation cluster (MVC only from the book)
Book says:      "A controller that handles all requests for a Web site." (Front Controller, p.344, read
                on PDF 334)
Skill says:     (no entry for Page Controller, Front Controller, Template View, Transform View, Two Step
                View, or Application Controller)
Verdict:        missing (6 patterns)
Severity:       medium
```

These still map to current tools: Front Controller is a router with middleware; Application Controller is
a wizard or flow engine; Template View is any template or JSX view. Severity is medium, not high, because
current frameworks fix most of these choices for you.

**v1.4 outcome.** Six entries with modern-alternative fields, under the accessibility caveat. Spec WP8.
Scenarios: `web-presentation.feature`.

### F17. Lazy Load skips the book's own rules and variants

```
Skill / file:   enterprise-patterns.md, "Lazy Load"
Book says:      "It's usually pointless to use Lazy Load on a field that's stored in the same row as the
                rest of the object" and "my preference is not to use it unless I actively think I'll need
                it." (Lazy Load, p.200, read on PDF 202)
Skill says:     "Avoid when: You will use the whole graph anyway (then eager-load / join), or the graph is
                small."
Verdict:        covered-poorly
Severity:       low
```

The skill's intent and N+1 warning match the book (Fowler calls it "ripple loading", PDF 202). It omits the
same-row rule and the four ways to build it (lazy initialization, virtual proxy, value holder, ghost; PDF
200 to 201), which differ in how they treat object identity.

**v1.4 outcome.** The same-row rule and the four variants. Spec R3.7. Scenario: `existing-entries.feature`
(lazy-load-same-row-rule).

### F18. The Data Mapper quote is not verbatim

```
Skill / file:   enterprise-patterns.md, "Data Mapper", Best situation (lines 172 to 173)
Book says:      "The primary occasion for using Data Mapper is when you want the database schema and the
                object model to evolve independently." (Data Mapper, p.165, read on PDF 173)
Skill says:     "use Data Mapper when you want the database schema and the object model to evolve
                independently."
Verdict:        covered-poorly (quote fidelity only)
Severity:       low
```

**v1.4 outcome.** Text in quotation marks is the author's exact words. Spec R3.8. Scenario:
`existing-entries.feature` (quotes-are-verbatim).

### F19. Smaller fidelity gaps in entries that otherwise pass

- **Identity Map** says "never share across requests." Fowler allows "read-only Identity Maps held in a
  process context" (PDF 198). Low.
- **Value Object** omits Fowler's name-clash warning: the J2EE community used "value object" to mean Data
  Transfer Object (PDF 461). Agents still confuse the two. Low.
- **architectural-decision-records** never names a pattern choice as a trigger. `pattern-selector` covers it
  from its side ("If the choice is cross-cutting or large, you wrote an ADR", SKILL.md line 161), so the gap
  is one-sided. Low.

**v1.4 outcome.** Spec R3.9. Scenarios: `existing-entries.feature` (identity-map-read-only-scope,
value-object-name-collision, adr-trigger-names-pattern-choice).

## Coverage table

Printed page from the book's cross-references; PDF page is where the pattern's intent was read. "Missing"
means no catalog entry in `pattern-selector` or `enterprise-architecture-standards`; mentions are noted.
The "v1.4" column names the work package that closes the row.

Re-runnable source for each "missing" row: `git grep -n -i "<pattern name>" -- .claude/skills`.

| # | Pattern | Printed | PDF | Verdict | Evidence | v1.4 |
|---|---|---|---|---|---|---|
| 1 | Transaction Script | p.110 | 122 | missing | Book: "Organizes business logic by procedures where each procedure handles a single request from the presentation." Repo: one mention, as a "grab-bag" (F4). | WP4 |
| 2 | Domain Model | p.116 | 128 | missing | Book: "An object model of the domain that incorporates both behavior and data." Repo: named in anti-patterns (anemic model), no entry. | WP4 |
| 3 | Table Module | p.125 | 136 | missing | Book: "A single instance that handles the business logic for all rows in a database table or view." Repo: none. | WP4 |
| 4 | Service Layer | p.133 | 143 | miscited | F2 (security clause not on p.133) and F3 (wrong-intent). | WP3 |
| 5 | Table Data Gateway | p.144 | 151 | missing | Book: "An object that acts as a Gateway (466) to a database table." Repo: none. | WP4 |
| 6 | Row Data Gateway | p.152 | 158 | missing | Book: "An object that acts as a Gateway (466) to a single record in a data source." Repo: none. | WP4 |
| 7 | Active Record | p.160 | 165 | missing | Book: "An object that wraps a row in a database table or view, encapsulates the database access, and adds domain logic on that data." Repo: cited (160) as an alternative and as a conflict; no entry (F13). | WP4 |
| 8 | Data Mapper | p.165 | 170 | covered well | Book: "when you want the database schema and the object model to evolve independently" and "the test for using these patterns is the complexity of the business logic" (PDF 173 to 174). Repo: "A complex Domain Model whose shape diverges from the tables" and "Avoid when: The object maps ~1:1 to its table and logic is modest, **Active Record (160)** is cheaper." Quote fidelity: F18. | WP3 |
| 9 | Unit of Work | p.184 | 187 | covered poorly | F5. Forces match ("dirty flag", "many more database calls", PDF 191); business versus system transaction does not. | WP3 |
| 10 | Identity Map | p.195 | 196 | covered well | Book: "you don't want a situation where two in-memory objects correspond to a single database record" and "you usually see a single Identity Map for a session" (PDF 198). Repo: "Two in-memory copies of one record silently diverging" and "Scope it strictly to the unit of work." Minor: F19. | WP3 |
| 11 | Lazy Load | p.200 | 200 | covered poorly | F17. | WP3 |
| 12 | Identity Field | p.216 | 215 | missing | Book: "Saves a database ID field in an object to maintain identity between an in-memory object and a database row." Repo: surrogate keys only (`database-architecture.md` line 8). | WP7 |
| 13 | Foreign Key Mapping | p.236 | 233 | missing | Book: "Maps an association between objects to a foreign key reference between tables." Repo: none. | WP7 |
| 14 | Association Table Mapping | p.248 | 245 | missing | Book: "Saves an association as a table with foreign keys to the tables that are linked by the association." Repo: none. | WP7 |
| 15 | Dependent Mapping | p.262 | 258 | missing | Book: "Has one class perform the database mapping for a child class." Repo: none. | WP7 |
| 16 | Embedded Value | p.268 | 263 | missing | Book: "Maps an object into several fields of another object's table." Repo: none. | WP7 |
| 17 | Serialized LOB | p.272 | 266 | missing | Book: "Saves a graph of objects by serializing them into a single large object (LOB), which it stores in a database field." Repo: compliance caveat only (F14). | WP7 |
| 18 | Single Table Inheritance | p.278 | 271 | missing | Book intent quoted in F14. Repo: none. | WP7 |
| 19 | Class Table Inheritance | p.285 | 279 | missing | Book: "Represents an inheritance hierarchy of classes with one table for each class." Repo: none. | WP7 |
| 20 | Concrete Table Inheritance | p.293 | 287 | missing | Book: "Represents an inheritance hierarchy of classes with one table per concrete class in the hierarchy." Repo: none. | WP7 |
| 21 | Inheritance Mappers | p.302 | 296 | missing | Book: "A structure to organize database mappers that handle inheritance hierarchies." Repo: none. | WP7 |
| 22 | Metadata Mapping | p.306 | 300 | missing | Book: "Holds details of object-relational mapping in metadata." Repo: cited (306) as a modern alternative; no entry. | WP7 |
| 23 | Query Object | p.316 | 309 | covered well | Book: "A Query Object is an interpreter" (PDF 309) and "you're almost always better off buying a tool" (PDF 310). Repo: "an interpreter over criteria" and "Modern alternative: A type-safe query builder (Kysely, Drizzle, jOOQ)"; "for a few fixed queries it is over-engineering." | none needed |
| 24 | Repository | p.322 | 315 | covered well | Book: "Clients need never think in SQL" and "situations with multiple data sources are where we really see Repository coming into its own" with an in-memory store for unit tests (PDF 317). Repo: clients "never think in SQL" and "especially when more than one data source exists (e.g. an in-memory store for fast unit tests...)". | none needed |
| 25 | Model View Controller | p.330 | 321 | covered poorly | F10. | WP3 |
| 26 | Page Controller | p.333 | 324 | missing | Book: "An object that handles a request for a specific page or action on a Web site." Repo: none. | WP8 |
| 27 | Front Controller | p.344 | 334 | missing | Book intent quoted in F16. Repo: none. | WP8 |
| 28 | Template View | p.350 | 340 | missing | Book: "Renders information into HTML by embedding markers in an HTML page." Repo: none. | WP8 |
| 29 | Transform View | p.361 | 350 | missing | Book: "A view that processes domain data element by element and transforms it into HTML." Repo: none. | WP8 |
| 30 | Two Step View | p.365 | 354 | missing | Book: "Turns domain data into HTML in two steps: first by forming some kind of logical page, then rendering the logical page into HTML." Repo: none. | WP8 |
| 31 | Application Controller | p.379 | 368 | missing | Book: "A centralized point for handling screen navigation and the flow of an application." Repo: none. | WP8 |
| 32 | Remote Facade | p.388 | 376 | missing | Book: "Provides a coarse-grained facade on fine-grained objects to improve efficiency over a network." Repo: none (F6). | WP6 |
| 33 | Data Transfer Object | p.401 | 388 | covered poorly | F6. Repo quotes the when-to-use sentence verbatim (PDF 391); no assembler, no Remote Facade. | WP6 |
| 34 | Optimistic Offline Lock | p.416 | 400 | missing | F5. | WP5 |
| 35 | Pessimistic Offline Lock | p.426 | 409 | missing | Book: "Prevents conflicts between concurrent business transactions by allowing only one business transaction at a time to access data." Repo: none. | WP5 |
| 36 | Coarse-Grained Lock | p.438 | 419 | missing | Book: "Locks a set of related objects with a single lock." Repo: named once in Aggregate Pros; no entry. | WP5 |
| 37 | Implicit Lock | p.449 | 429 | missing | Book: "Allows framework or layer supertype code to acquire offline locks." Repo: none. | WP5 |
| 38 | Client Session State | p.456 | 434 | missing | F12. | WP5 |
| 39 | Server Session State | p.458 | 436 | missing | F12. | WP5 |
| 40 | Database Session State | p.462 | 439 | missing | F12. | WP5 |
| 41 | Gateway | p.466 | 442 | covered poorly | F9. Intent matches ("An object that encapsulates access to an external system or resource."); avoid-when contradicts. | WP3 |
| 42 | Mapper | p.473 | 448 | missing | Book: "An object that sets sup [sic] a communication between two independent objects." Repo: none (F15). | WP6 |
| 43 | Layer Supertype | p.475 | 450 | missing | Book: "A type that acts as the supertype for all types in its layer." Repo: none. | WP6 |
| 44 | Separated Interface | p.476 | 452 | missing | F15. | WP6 |
| 45 | Registry | p.480 | 455 | missing | Book: "A well-known object that other objects can use to find common objects and services." Repo: "registry" appears only as schema or service registry. | WP6 |
| 46 | Value Object | p.486 | 460 | covered poorly | Intent matches. Book: "Treat something as a Value Object when you're basing equality on something other than an identity" (PDF 461) and "it's a very good idea to make them immutable" to "avoid aliasing bugs" (PDF 460). Repo: "compared by the equality of its attributes rather than by identity; typically immutable". Downgraded by F20 (its own example stores money as a float); minor F19. | WP3 |
| 47 | Money | p.488 | 462 | missing | Book: "Represents a monetary value." Repo: used as an example inside Value Object only, as a float (F20). | WP6 |
| 48 | Special Case | p.496 | 469 | covered poorly | F11. | WP3 |
| 49 | Plugin | p.499 | 472 | missing | Book: "Links classes during configuration rather than compilation." Repo: none. | WP6 |
| 50 | Service Stub | p.504 | 477 | missing | Book: "Removes dependence upon problematic services during testing." Repo: none (F9). | WP6 |
| 51 | Record Set | p.508 | 481 | missing | Book: "An in-memory representation of tabular data." Repo: none. | WP6 |

## The fix: v1.4 work packages

The full requirements, order, risks, and acceptance scenarios are in
[`docs/design/poeaa-v1.4/spec.md`](../../design/poeaa-v1.4/spec.md). In short, nine serial pull requests:

1. **WP1** this audit and the spec (read-only).
2. **WP2** the citation-verifying gate and the page registry (F1, F2). First, so the real gate covers
   every later PoEAA citation as it lands (planned, not built).
3. **WP3** make the twelve existing entries true to the book (F2, F3, F5, F9, F10, F11, F17 to F20).
4. **WP4** domain logic and data source (F4, F13).
5. **WP5** offline concurrency and session state (F5, F12).
6. **WP6** distribution and base, including Money (F6, F15, F20).
7. **WP7** object-relational structural and metadata (F14).
8. **WP8** web presentation (F16).
9. **WP9** the "prove it" kit (F7).

Chooser rows (F8) land with the package that adds their target entries. The catalog template is not
changed.

### First draft of the "prove it" rules (arch-gate format)

These use the shipped engine's fields (`include`, `exclude`, `forbid`, `message`). Globs are examples and
must be fitted to a repo's folders. In WP9 they move to one home, a judge-arch preset
(`judge-arch/assets/presets/poeaa-patterns/`), and the existing `check-arch-rules-discriminate.mjs` is
extended to prove each fires on a planted violation and stays quiet on a clean fixture (spec R9.1, R9.2).
The draft `.from(` pattern also matches `Array.from(`; the clean fixture must cover that.

```json
[
  { "name": "repository: data access only inside repositories",
    "include": ["src/domain/**", "src/services/**"], "exclude": ["src/**/repositories/**"],
    "forbid": ["\\.from\\(['\"]", "\\bsql`", "\\bknex\\("],
    "message": "Query the store only through a Repository (Fowler, PoEAA, Repository (322))." },
  { "name": "data mapper: domain imports no database driver",
    "include": ["src/domain/**"],
    "forbid": ["from ['\"](pg|mysql2|@prisma/client|typeorm|@supabase/supabase-js)['\"]"],
    "message": "Domain objects stay ignorant of the database; mapping lives in the mapper (Data Mapper (165))." },
  { "name": "service layer: no web types in services",
    "include": ["src/services/**"],
    "forbid": ["from ['\"](express|next/server|koa)['\"]", "\\b(req|res)\\.(body|query|params|json)\\b"],
    "message": "Services take plain data, not requests (Service Layer (133))." },
  { "name": "gateway: vendor SDK only inside its gateway",
    "include": ["src/**"], "exclude": ["src/gateways/**"],
    "forbid": ["from ['\"](stripe|@sendgrid/mail|twilio)['\"]"],
    "message": "Reach the external system through its Gateway (466), so it can be stubbed (Service Stub (504))." },
  { "name": "separated interface: domain imports no infra",
    "include": ["src/domain/**"],
    "forbid": ["from ['\"](\\.\\./)+infra(structure)?/", "from ['\"]@/infra(structure)?/"],
    "message": "The domain owns the interface; infrastructure implements it (Separated Interface (476))." }
]
```

Patterns a grep cannot prove get a named test shape:

| Pattern | Test that proves it |
|---|---|
| Unit of Work | Fail mid-commit; assert zero rows written. Commit twice with no change; assert zero writes. |
| Identity Map | Load the same id twice in one session; assert the same instance. New session; assert a new instance. |
| Optimistic Offline Lock | Two sessions load version N; first saves; second save must fail with a conflict, not overwrite. |
| Lazy Load | Assert the query count for a list of N rows is fixed, not N plus 1. |
| Data Transfer Object | Contract test pinning the exact serialized fields. |
| Money | Split an amount by ratios (including 5 cents 70 to 30); assert the parts add up to the whole. |
| Special Case | Each meaning of "absent" has its own object; a test per meaning asserts its behavior. |

## Evidence ledger

| Claim | State | Re-runnable source | Limitation |
|---|---|---|---|
| The catalog has 51 patterns | observed | TOC on PDF 5 and 6 | One edition only |
| Printed pages for all 51 | observed | cross-reference count over `book.txt` | One stray value (Metadata Mapping 329), treated as a typo |
| No fixed PDF offset | observed | PDF 103 versus 116; PDF 469 versus p.496 | Two anchor points measured, not every page |
| All 15 cited pages are correct | observed | cross-reference count per cited name | Checks the page, not every sentence (sentences checked in F2 to F20) |
| Every quote in this report is in the book at the PDF page given | observed | a script that searches the extracted text for each quote and prints its page | Text extraction can split a word at a line break; the script also tried across page breaks |
| Gate passes wrong and missing pages | observed | four mutated copies run through `check-catalog-completeness.mjs` | Run on Windows, Node from PATH |
| Security clause is not in the Service Layer chapter | observed | word search over PDF 143 to 149 | Extraction could drop a word; layout mode kept the body text |
| 39 patterns are missing | observed | `git grep -i` per name over `.claude/skills`, plus a concept search (optimistic, session state, inheritance, coarse-grained, chatty) | A concept under a name this audit did not think of could be missed |
| The v1.4 scenarios parse and are fully tagged | observed | `check-gherkin-valid.mjs` and `check-bdd-tags.mjs` over `docs/design/poeaa-v1.4/features` and `evals`, exit 0; a planted bad tag made the tag gate exit 1 | Those folders are not CI targets until each file graduates |
| Severity ratings | inferred | the rule set under "How each finding is written and rated" | Judgment; the human reviewer may move them |

**Disconfirming pass.** Before filing each "missing", this audit searched for the concept under other names.
That search found three partial covers, all credited above: surrogate keys (`database-architecture.md`
line 8, part of Identity Field), externalized session state (`performance-scalability.md` lines 27 to 28),
and the N+1 section in `performance-scalability.md` lines 36 to 37, which matches Lazy Load's ripple
loading. None of them is a catalog entry with forces and trade-offs. The quote-check pass also tested this
report against itself and caught four wrong PDF pages in the first draft, all fixed here. It also briefly
flagged the Money allocation claim as unsupported; a second search found the sentence on PDF 463, so the
claim stands with that page.

**Not assessed.** Whether the GoF catalog (`design-patterns-catalog.md`) has the same gate weakness for its
own citations; the study guide; how current ORMs implement each pattern.

## Appendix: cross-reference counts behind each printed page

`[observed]` For each pattern, the number of times the book's full text writes `<Pattern Name> (<page>)`
with that page. These counts are the evidence for the printed-page column above, and the WP2 registry
records them (spec R2.11). Gateway and Mapper are counted at their own pages only, since "Table Data
Gateway (144)" and "Data Mapper (165)" also end in those words.

| Pattern | Page | Hits | Pattern | Page | Hits | Pattern | Page | Hits |
|---|---|---|---|---|---|---|---|---|
| Transaction Script | 110 | 47 | Single Table Inheritance | 278 | 13 | Optimistic Offline Lock | 416 | 24 |
| Domain Model | 116 | 139 | Class Table Inheritance | 285 | 12 | Pessimistic Offline Lock | 426 | 20 |
| Table Module | 125 | 46 | Concrete Table Inheritance | 293 | 12 | Coarse-Grained Lock | 438 | 4 |
| Service Layer | 133 | 22 | Inheritance Mappers | 302 | 9 | Implicit Lock | 449 | 4 |
| Table Data Gateway | 144 | 31 | Metadata Mapping | 306 | 12 (plus 1 at 329) | Client Session State | 456 | 13 |
| Row Data Gateway | 152 | 24 | Query Object | 316 | 10 | Server Session State | 458 | 16 |
| Active Record | 160 | 25 | Repository | 322 | 3 | Database Session State | 462 | 11 |
| Data Mapper | 165 | 40 | Model View Controller | 330 | 13 | Gateway | 466 | 27 |
| Unit of Work | 184 | 29 | Page Controller | 333 | 13 | Mapper | 473 | 5 |
| Identity Map | 195 | 39 | Front Controller | 344 | 14 | Layer Supertype | 475 | 37 |
| Lazy Load | 200 | 16 | Template View | 350 | 24 | Separated Interface | 476 | 9 |
| Identity Field | 216 | 10 | Transform View | 361 | 19 | Registry | 480 | 13 |
| Foreign Key Mapping | 236 | 7 | Two Step View | 365 | 11 | Value Object | 486 | 8 |
| Association Table Mapping | 248 | 3 | Application Controller | 379 | 16 | Money | 488 | 4 |
| Dependent Mapping | 262 | 6 | Remote Facade | 388 | 9 | Special Case | 496 | 5 |
| Embedded Value | 268 | 7 | Data Transfer Object | 401 | 20 | Plugin | 499 | 10 |
| Serialized LOB | 272 | 13 | | | | Service Stub | 504 | 10 |
| | | | | | | Record Set | 508 | 43 |

The lowest counts (Repository and Association Table Mapping at 3) are the weakest evidence. Each of the
51 pages also rises in catalog order, which is a second, independent check on the set.
