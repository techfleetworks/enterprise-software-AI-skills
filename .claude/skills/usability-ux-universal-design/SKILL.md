---
name: usability-ux-universal-design
description: 'Use for ANY user-facing feature, flow, screen, form, navigation, empty or loading or error state, or piece of UI copy to make it user-friendly, intuitive, and approachable for the widest possible range of people: universal and inclusive design for anyone, across any ability, context, language level, and situation. Covers the universal-design principles, established usability heuristics and UX laws, reducing cognitive load, plain-language content, error prevention and forgiving recovery, and lightweight usability testing and research. Trigger proactively on new UI or flows, redesigns, navigation or IA, onboarding, wizards, forms, empty or loading or error or success states, microcopy, labels, tooltips, confirmations, "is this intuitive or confusing," "hard to use," UX, usability, user-friendly, even without those words, whenever a human will interact with what you are building.'
---

# Usability, UX, and Universal Design

## Why this exists

Accessibility (see `universal-accessibility-wcag`) makes a product possible to use for people with
disabilities. **Usability and universal design make it pleasant and effortless for everyone**, including
people who are stressed, distracted, new to the domain, reading in a second language, on a tiny screen,
in a hurry, or having the worst day of their life. Most software is not hard to use because of missing
features; it is hard because it demands too much of the user: too many steps, unclear labels,
unforgiving errors, hidden actions, jargon. This skill encodes how to design for the full range of human
ability and situation, so the answer to "can a stranger figure this out?" is yes.

**Universal design** means design that works for the widest possible range of people without adaptation,
treating the full spectrum of abilities and situations as the default target, not an edge case. A curb
cut built for wheelchairs helps strollers, luggage, and delivery carts too: designing for the extremes
improves it for everyone.

## The main idea

**Reduce what the interface asks of the user's memory, attention, and knowledge, and make mistakes
cheap.** The user should never have to wonder where they are, what they can do next, what something
means, or whether an action is safe. Meet people where they are; do not make them meet the system. When
you must choose, favor clarity over cleverness and forgiveness over efficiency.

This is grounded in how people actually work, not taste. People use peripheral vision to get the gist of
a screen and scan based on past expectations; they do not read, they skim. Working memory holds only a
few items at once, so recognition beats recall. People cannot truly multitask, and attention is
selective and short. Design that ignores these facts fails no matter how it looks. The full catalogue of
these findings, all 100, each with its design takeaways, is in `references/weinschenk-100-things.md`;
reach for it when a specific decision needs a research-backed principle.

## The workflow

### Step 1: Design for the whole spectrum, universal and inclusive design

Read `references/universal-and-inclusive-design.md`. Before designing the flow, widen the target:

- Apply the **7 principles of universal design** (equitable use, flexibility in use, simple and
  intuitive, perceptible information, tolerance for error, low physical effort, size and space for
  approach and use).
- Use the **inclusive-design mindset**: solve for one, extend to many; account for permanent, temporary,
  and situational constraints (a one-armed person, a person with a broken arm, and a parent holding a
  baby all benefit from one-handed operation).
- Design across the **persona spectrum**, not one "average" user: different abilities, tech literacy,
  language levels, ages, devices, and contexts.

### Step 2: Apply the usability heuristics and the UX laws

Read `references/usability-heuristics.md`. Evaluate the design against the ten established usability
heuristics (visibility of system status, match to the real world, user control and freedom with undo and
exit, consistency and standards, error prevention, recognition over recall, flexibility, minimalist
design, good error messages, help). These are the fastest way to catch usability defects before a user
ever sees them.

Reach for the UX laws when they fit the decision in front of you:

- **Hick's Law**: more choices means slower decisions, so reduce and group options.
- **Fitts's Law**: a target is faster to hit when it is larger and closer, so make primary actions big
  and reachable.
- **Miller's Law** and chunking: working memory is small, so break information into a few meaningful
  groups.
- **Jakob's Law**: people expect your site to work like the ones they already know, so follow
  conventions instead of inventing new ones.
- **The Gestalt laws** (proximity, similarity, common region): group related things visually.
- **Serial Position Effect**: people remember the first and last items best, so place key actions there.
- **Peak-End Rule**: people judge an experience by its peak and its end, so design those moments.
- **Aesthetic-Usability Effect**: people perceive attractive design as more usable, which is real but
  can hide problems, so still test.
- **Tesler's Law**: some complexity is irreducible, so absorb it into the system rather than pushing it
  onto the user.

### Step 3: Cut cognitive load and make it obvious

Read `references/cognitive-load-and-clarity.md`. The interface should be understood at a glance:

- **Recognition over recall**: show options; do not make people remember commands, codes, or what they
  typed on a previous screen (working memory holds only about four items at once).
- **Clear affordances and signifiers**: things that are clickable look clickable; the primary action is
  obvious and singular.
- **Visual hierarchy, grouping, and whitespace** so the eye knows where to go (people scan with
  peripheral vision and past expectations).
- **Progressive disclosure**: show what is needed now; reveal advanced options on demand.
- **Consistency**: the same thing looks and behaves the same everywhere; follow platform conventions.
- **Sensible defaults** and **forgiving inputs** so the common case needs the least work.

### Step 4: Write content people actually understand

Read `references/content-and-plain-language.md`. Words are UI, and people skim rather than read:

- **Plain language**, about an 8th-grade reading level, active voice, short sentences; define or avoid
  jargon. This helps everyone, not just some: non-experts, non-native speakers, and cognitively loaded
  users.
- **Action-oriented, specific labels** ("Save changes," not "Submit"; "Delete 3 files," not "OK").
- **Helpful empty, loading, and success states**: tell people what is happening and what to do next,
  never a blank void or a dead spinner.
- **Scannable structure**: headings, short paragraphs, lists; front-load the important part.

### Step 5: Prevent errors and make recovery painless

Read `references/error-prevention-and-recovery.md`. The best error message is the one that never fires:

- **Prevent** with constraints, good defaults, inline validation, confirmations for destructive actions,
  and formatting that guides input.
- When errors happen, **fail forgivingly**: say what went wrong, why, and how to fix it, in plain
  language, next to the problem; never blame the user or show a raw error code.
- **Make actions reversible** (undo, drafts, soft-delete, confirmation for the irreversible) so
  exploration is safe. This is the tolerance-for-error principle in practice.

### Step 6: Validate with real people, research not opinions

Read `references/usability-testing-and-research.md`. Usability is measured, not asserted:

- **Lightweight usability testing**: even 5 users doing real tasks surfaces most major problems. Watch
  where they hesitate, misread, or get stuck.
- **Task-based testing** ("do X"), not "do you like it"; measure task success, time, and errors.
- **Include participants across the ability, literacy, and device spectrum**, not just power users or
  colleagues.
- Iterate: test, fix the top issues, retest.

## Mechanical gate

This skill ships **no bespoke mechanical gate**, and that is a deliberate, honest decision rather than an
omission. Usability is judgment: whether a label is clear, a flow is intuitive, or a design reduces
cognitive load cannot be decided by a regex or a linter, and a gate that claimed to would be theater.
What enforces this skill instead:

- The **plain-language rule** is partly held by the repo house-style gate (no em or en dashes, plain
  prose) and by review.
- The **shared foundations** (keyboard operability, target size, reduced motion, responsive layout) are
  gated by the sibling skills `universal-accessibility-wcag` (`check-a11y-checklist`, `check-axe-results`)
  and `universal-browser-device-support` (`check-no-ua-sniffing`). Do those first.
- Everything else is enforced by `judge-arch`, by a heuristic evaluation against Step 2, and by the
  Step 6 usability test. A skill that cannot be mechanically gated says so, rather than pretending.

## Before you call it done

- Designed for the spectrum (permanent, temporary, situational; varied literacy, age, device, context),
  not one "average" user.
- Passes a heuristic review against Step 2; no obvious violations (hidden status, dead ends, no undo,
  inconsistency, recall-heavy steps).
- The primary action on each screen is obvious and singular; clickable things look clickable.
- Cognitive load minimized: recognition over recall, sensible defaults, progressive disclosure,
  consistent patterns.
- Copy is plain-language, specific, and scannable; labels are action-oriented.
- Empty, loading, error, and success states are all designed and helpful.
- Errors are prevented where possible; messages are clear and actionable; destructive actions are
  confirmed or reversible.
- Validated with real users across the spectrum on real tasks; top issues fixed.
- The evidence ledger below is filled in: each usability claim has a state and a re-runnable source, and
  the central claim ("a first-time user can complete the core task") is at `observed`, not `inferred`.

## Reference files

| Topic | File |
|---|---|
| 7 universal-design principles, inclusive-design mindset, persona spectrum, situational constraints | `references/universal-and-inclusive-design.md` |
| The ten usability heuristics applied to real interfaces | `references/usability-heuristics.md` |
| Reducing cognitive load: recognition, affordances, hierarchy, defaults, progressive disclosure | `references/cognitive-load-and-clarity.md` |
| Plain-language content, labels, microcopy, empty/loading/success states, readability | `references/content-and-plain-language.md` |
| Error prevention, forgiving recovery, reversibility, safe destructive actions | `references/error-prevention-and-recovery.md` |
| Usability testing, task-based research, sample size, testing across the spectrum, iteration | `references/usability-testing-and-research.md` |
| All 100 Weinschenk findings, each with its design takeaways (the research behind the heuristics) | `references/weinschenk-100-things.md` |

## Evidence & skeptical assessment (required)

Every "this is usable / intuitive" statement is a factual claim, so it follows the repo's evidence
discipline (canonical contract:
[`skeptical-audit/references/evidence-discipline.md`](../skeptical-audit/references/evidence-discipline.md)).
A usability claim is an **evidence ledger**: each claim has a state and a re-runnable source, and
"usable" is the one word you may not assert from the designer's own chair. Hunt the disconfirming case
first (where does a first-time user get stuck?) before you call it intuitive.

| Claim | Reaches `observed` by | Becomes `proven` when |
|---|---|---|
| "A first-time user can complete the core task" | a task-based test with about 5 representative users succeeds | the test is repeated across the ability and literacy spectrum and the top issues are fixed |
| "The design has no obvious usability defects" | a heuristic evaluation against the ten heuristics finds none | the evaluation is done by someone who did not design it |
| "The copy is plain language" | a readability check puts it near an 8th-grade level | it is validated with non-expert and non-native readers |
| "Errors are preventable and recoverable" | destructive actions are confirmed or reversible, shown in a test | a user in testing recovers from a mistake without help |
| "It works for the spectrum, not one average user" | the test pool spans abilities, literacy, age, and device | findings are tracked per segment, not just in aggregate |

**Definition of done:** the ledger covers the usability claims the change needs with a verdict and a
re-runnable source; a claim that could be measured (task success, time, errors, readability) is
`observed` or `proven`, never `inferred`; and no "intuitive" or "usable" verdict is given from opinion
alone while the central first-time-task claim is below `observed`. A good-looking design is not evidence
(the Aesthetic-Usability Effect is real and misleading).

## Why this holds for every developer and every agent

It binds everyone because the discipline is carried by the always-on hook (this skill is listed in
`always-on/enterprise-skills-always-on.md`), by `judge-arch` review against the heuristics, and by the
sibling accessibility and browser gates that back its shared foundations. It is honest that no linter can
decide "intuitive," so the enforcement is the heuristic review plus the Step 6 usability test plus the
committed reference files, all of which live in the repo and survive any one person. The honest limit:
usability ultimately needs a human watching a real user, so the strongest evidence here is a recorded
task-based test, and an escaped usability failure becomes a new test task and a heuristic the next review
checks.

## Sources and attribution

Grounded in established HCI, cognitive-psychology, and inclusive-design work. The two quantitative claims
(about 5 users surfaces most issues; working memory holds only a few items) are widely cited research
findings; attribute them precisely when published externally.

- Susan Weinschenk, *100 Things Every Designer Needs to Know About People*, New Riders, 2011 (ISBN
  978-0-321-76753-0): the cognitive-psychology findings this skill builds on, including peripheral vision
  carrying the gist of a screen, people scanning by past expectation, reading and comprehending being
  different, short-term memory holding only about four items at once, recognition being easier than
  recall, processing information best in small chunks and in story form, the inability to truly
  multitask, and attention being selective and short. `[documented]`
- Jon Yablonski, "Laws of UX" (<https://lawsofux.com/>, retrieved 2026-10-12): the collection of UX
  laws, several of which Step 2 applies (Hick's Law, Fitts's Law, Miller's Law, Jakob's Law, the Gestalt laws,
  Serial Position Effect, Peak-End Rule, Aesthetic-Usability Effect, Doherty Threshold, Tesler's Law,
  Postel's Law). The underlying laws are public psychology and HCI principles; this site is cited as the
  collection, not reproduced. `[documented]`
- Jakob Nielsen, "10 Usability Heuristics for User Interface Design," Nielsen Norman Group
  (<https://www.nngroup.com/articles/ten-usability-heuristics/>): the ten heuristics in Step 2.
  `[documented]`
- Jakob Nielsen, "Why You Only Need to Test with 5 Users," Nielsen Norman Group
  (<https://www.nngroup.com/articles/why-you-only-need-to-test-with-5-users/>): the small-sample
  usability-testing guidance in Step 6. `[documented]`
- The Center for Universal Design, North Carolina State University, "The 7 Principles of Universal
  Design" (1997; authorized reproduction at <https://universaldesign.ie/about-universal-design/the-7-principles>):
  the seven principles in Step 1. `[documented]`
- Microsoft, "Inclusive Design" (<https://inclusive.microsoft.design/>): "solve for one, extend to many"
  and the permanent, temporary, and situational persona spectrum. `[documented]`
- Plain-language and content-design guidance: digital.gov
  (<https://digital.gov/guides/plain-language>) and the GOV.UK content design guidance
  (<https://www.gov.uk/guidance/content-design>). `[documented]`
- Pairs with WCAG 2.2 (the accessibility floor beneath usability); see `universal-accessibility-wcag`.
