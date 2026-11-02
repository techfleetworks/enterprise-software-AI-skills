---
status: "accepted"
date: 2026-10-31
decision-makers: mdenner
---

# 0106 - A PoEAA page registry owns the book's page facts, and the catalog gate checks every citation against it

Source: v1.4 work package 2 (WP2) of the PoEAA program in ADR-0103 and `docs/design/poeaa-v1.4/spec.md`
(requirements R2.1 to R2.12). The operator asked to start it on 2026-10-31 ("Start WP2 now"), stacked on the
unmerged WP1 branch.

## Context and Problem Statement

The pattern-selector catalog cites Fowler's *Patterns of Enterprise Application Architecture* by printed page,
for example "Repository (322)". The audit (`docs/audit/poeaa-2026-11/poeaa-adversarial-audit.md`, finding
F1) showed that the catalog gate only looked for some citation token:

- `[observed]` With every PoEAA page rewritten to (999), or deleted, the gate still exited 0. The ISBN alone
  satisfied it, because "Repository (322)" never matched its `(p. NNN)` page pattern.
- `[observed]` The edit-time plan check (`always-on/check-task-plan.mjs`) passed a pattern decision with any
  text in it, including "Repositry (17), the Florble pattern" (spec finding I1).

So a wrong page could merge, and an agent's decision record was never compared with the book. Where should the
page facts live, and what should check them?

## Considered Options

- **Option 1: a committed page registry, read by one module that the catalog gate and the plan check both call.**
- **Option 2: hard-code the pages in the gate's source.**
- **Option 3: check citations against the book's text in CI.**
- **Option 4: keep checking presence only, and rely on review.**

## Decision Outcome

Chosen: option 1.

- `pattern-selector/references/poeaa-registry.json` is the single owner of PoEAA page facts: one row per
  catalog pattern (51), with its chapter, printed page, cross-reference hit count, catalog heading, any aliases
  (other spellings the catalog uses), and status
  (`covered`, or `declined` with a reason). It ships with the skill, so a consumer gets it with the skills.
- `pattern-selector/scripts/poeaa-registry.mjs` is the one reader. It loads and validates the registry (51 unique
  rows, pages and chapters rising in catalog order, every field set, a reason on every declined row, no alias
  shared by two rows) and finds citations in text: bare pattern-and-page tokens such as `Lazy Load (200)`,
  matched longest name first so "Table Data Gateway (144)" is never read as Gateway; prefixed citations such as
  `Fowler, *PoEAA*, Repository (322)` and `Fowler, *PoEAA*, ch. 2`; and unknown title-case names. A name
  matches by its registry name or an alias (the catalog's own spellings, such as "Model-View-Controller (MVC)"
  and "Null Object"), in any case, with a space or a hyphen between words; a page may be written "(322)",
  "( 322 )", or "(p. 322)". In a Source field every such token is a page whatever its length. The page
  comparison is one line, marked as the mutation target.
- `check-catalog-completeness.mjs` fails (exit 1) on a wrong page, a prefixed pattern with no page or a name not
  in the registry, a chapter outside 1 to 18, a Source that names PoEAA with neither a page nor a chapter, a
  covered pattern with no catalog heading, and an invalid registry. It fails closed (exit 2, naming the path)
  when the registry is missing. `--also-scan` applies the citation checks to the chooser and the other
  references, which have no template entries.
- `check-task-plan.mjs` plan mode calls the same module on the pattern-decision record and holds on a wrong page
  or an unknown name with a three-digit page, in any field including nested lists. When the installed skills
  have neither the registry nor its reader (an older mirror), it prints "not-assessed: PoEAA registry not
  installed" and passes, as the edit-gate does for a hook that is not wired. Exactly one of the two present (a
  broken install), or a registry that is unreadable or invalid, is held.

### How the registry was built (spec R2.11)

`[observed]` The e-book has no printed page numbers. Each page comes from the book's own cross-references: the
number of times its full text writes the pattern's name followed by that page in parentheses. The audit appendix lists every count,
and the registry stores it as `hits`. The lowest counts are Repository and Association Table Mapping (3 each),
the weakest evidence. One stray value was found: Metadata Mapping appears once as (329) against 12 times as
(306); the registry uses 306, and the gate now rejects "Metadata Mapping (329)". Two independent checks guard
the registry: the order check (pages rise in catalog order, from Transaction Script 110 to Record Set 508), and
the 15 pages the audit matched to pages the catalog already cited, pinned in `test/poeaa-registry.test.mjs`,
which catches an in-order typo such as Repository 322 changed to 320. `[observed]` Every page, hit count, and
chapter in the registry matches the audit appendix and the book's table of contents (0 mismatches; a node
script on this branch parsed the appendix table and compared every row).

On first landing the 12 patterns with catalog entries are `covered`; the other 39 are `declined` with the
reason naming the package that adds them (for example "planned for v1.4, WP5") (spec R2.10), so the gate is green on each
commit of the chain and every gap is written down.

### The BDD runner runs Scenario Outlines

The WP2 scenarios use five Scenario Outlines, and the later packages use many more, but `bdd-run.mjs` failed
closed on any outline. It now runs an outline once per Examples row, with each column placeholder filled from the row,
as Cucumber does; every row keeps the outline's name, which `check-bdd-executed.mjs` already treats as "all rows
must pass". Placeholders are filled in one pass, so a cell that looks like another column is kept as written.
The scenario name keeps its placeholders, because the datastore names the outline that way. An Examples block
with no rows still fails closed. Data tables and doc strings remain unsupported.

### Consequences

- Good: a wrong, missing, or invented PoEAA page cannot merge into the catalog, and an agent's pattern decision
  is held to the same pages at edit time. `[observed]` With the page comparison replaced by a no-op, 17 of the
  catalog gate's tests fail (the BDD scenario `poeaa-gate-test-discriminates` repeats this on every run).
- Good: a fresh-context review found wrong citations the first draft let through (a two- or four-digit page in
  a Source, a misspelled name followed by more text, lowercase names, the catalog's own hyphenated spellings,
  a chapter from another book). `[observed]` Each is now a failing-input test in `test/pattern-catalog.test.mjs`
  or `test/check-task-plan.test.mjs`.
- Good: the new gate found a real gap on its first run: a Source citing only a PoEAA page, with no ISBN or URL,
  was not counted as a citation at all. `[observed]` Such a Source now counts, and a wrong page in it fails
  (`test/pattern-catalog.test.mjs`, the header-example test).
- Good: the 39 missing patterns are visible as declined rows with reasons, not silent.
- Bad: the gate must now be run on all catalog files together, because coverage spans all of them. Running
  it on the GoF catalog alone fails coverage. The skill and the fitness test run it on both.
- Bad: `check-task-plan.mjs` imports code from the installed pattern-selector skill and runs it in its own
  process, the first in-process import in `always-on/`. That code has the same trust as the hook scripts that
  load it (both come from the same install, and an agent that can edit one can edit the other), and a missing
  or broken copy is reported or held, never silently skipped. The check does not defend against a deliberately
  edited install; review and the CI gates on the repo do.
- Limit: the plan check reads a title-case name with a three-digit page as a PoEAA citation. A record that writes
  such a token for something else is held and must reword it. Shorter numbers ("Step (2)"), acronyms
  ("PR (415)"), and four-digit numbers are not read as citations, so a misspelled name with a four-digit page
  ("Repositry (3220)") is not caught there.
- Limit: the registry is only as right as the book's cross-references. A page with few hits is weaker evidence.
- The edit-time check only runs where the enforcement hooks are installed with a plans file, and the mirror at
  `~/.claude/skills` gets the registry only when it is refreshed (spec I4, I5; release step R10.1).

## Pros and Cons of the Options

### Option 1: a committed registry with one reader

- Good: one owner for each page fact, and one rule shared by the catalog gate and the plan check.
- Good: the registry is data, so a page fix is a one-line change with a test that pins it.
- Bad: a second file to keep with the skill; a stale mirror lacks it (handled as not-assessed).

### Option 2: pages hard-coded in the gate

- Good: one file.
- Bad: the plan check would need its own copy of the pages, so the two would drift; mixing data into a script
  hides the facts from a reader of the skill.

### Option 3: check against the book's text in CI

- Good: the strongest check.
- Bad: the book is copyrighted and cannot be committed; page facts and short quotes can.

### Option 4: presence only

- Bad: it is the failure the audit found.
