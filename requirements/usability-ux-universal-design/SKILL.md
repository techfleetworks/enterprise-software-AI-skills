---
name: usability-ux-universal-design
description: Use for ANY user-facing feature, flow, screen, form, navigation, empty/loading/error state, or piece of UI copy to make it user-friendly, intuitive, and approachable for the widest possible range of people — universal and inclusive design for anyone, across any ability, context, language level, and situation. Covers the universal-design principles, established usability heuristics, reducing cognitive load, plain-language content, error prevention and forgiving recovery, and lightweight usability testing/research. Trigger proactively on new UI or flows, redesigns, navigation/IA, onboarding, wizards, forms, empty/loading/error/success states, microcopy/labels/tooltips, confirmations, "is this intuitive/confusing," "hard to use," UX, usability, user-friendly — even without those words, whenever a human will interact with what you're building.
---

# Usability, UX & Universal Design

## Why this exists

Accessibility (see `universal-accessibility-wcag`) makes a product *possible* to use for
people with disabilities. **Usability and universal design make it *pleasant and effortless*
for everyone** — including people who are stressed, distracted, new to the domain, reading
in a second language, on a tiny screen, in a hurry, or having the worst day of their life.
Most software isn't hard to use because of missing features; it's hard because it demands
too much of the user: too many steps, unclear labels, unforgiving errors, hidden actions,
jargon. This skill encodes how to design for the full range of human ability and situation
so the answer to "can a stranger figure this out?" is yes.

**Universal design** = design that works for the *widest possible range of people without
adaptation*, treating the full spectrum of abilities and situations as the default target,
not an edge case. A curb cut built for wheelchairs helps strollers, luggage, and delivery
carts too — designing for the extremes improves it for everyone.

## The core principle

**Reduce what the interface asks of the user's memory, attention, and knowledge — and make
mistakes cheap.** The user should never have to wonder where they are, what they can do
next, what something means, or whether an action is safe. Meet people where they are; don't
make them meet the system. When you must choose, favor **clarity over cleverness** and
**forgiveness over efficiency**.

## The workflow

### Step 1: Design for the whole spectrum — universal & inclusive design

Read `references/universal-and-inclusive-design.md`. Before designing the flow, widen the
target:

- Apply the **7 principles of universal design** (equitable, flexible, simple & intuitive,
  perceptible info, tolerance for error, low physical effort, size/space for use).
- Use the **inclusive-design mindset**: solve for one, extend to many; account for
  **permanent, temporary, and situational** constraints (a one-armed person, a person with
  a broken arm, and a parent holding a baby all benefit from one-handed operation).
- Design across the **persona spectrum**, not one "average" user — different abilities,
  tech literacy, language levels, ages, devices, and contexts.

### Step 2: Apply the usability heuristics

Read `references/usability-heuristics.md`. Evaluate the design against the ten established
usability heuristics — visibility of system status, match to the real world, user control
and freedom (undo/exit), consistency and standards, error prevention, recognition over
recall, flexibility, minimalist design, good error messages, and help. These are the
fastest way to catch usability defects before a user ever sees them.

### Step 3: Cut cognitive load and make it obvious

Read `references/cognitive-load-and-clarity.md`. The interface should be understood at a
glance:

- **Recognition over recall** — show options; don't make people remember commands, codes,
  or what they typed on a previous screen.
- **Clear affordances & signifiers** — things that are clickable look clickable; the
  primary action is obvious and singular.
- **Visual hierarchy, grouping, and whitespace** so the eye knows where to go.
- **Progressive disclosure** — show what's needed now; reveal advanced options on demand.
- **Consistency** — same thing looks and behaves the same everywhere; follow platform
  conventions instead of inventing new ones.
- **Sensible defaults** and **smart, forgiving inputs** so the common case needs the least
  work.

### Step 4: Write content people actually understand

Read `references/content-and-plain-language.md`. Words are UI:

- **Plain language**, ~8th-grade reading level, active voice, short sentences; define or
  avoid jargon. This helps everyone — non-experts, non-native speakers, cognitively loaded
  users — not just some.
- **Action-oriented, specific labels** ("Save changes," not "Submit"; "Delete 3 files,"
  not "OK").
- **Helpful empty, loading, and success states** — tell people what's happening and what to
  do next, never a blank void or a dead spinner.
- **Scannable structure** — headings, short paragraphs, lists; front-load the important
  part.

### Step 5: Prevent errors and make recovery painless

Read `references/error-prevention-and-recovery.md`. The best error message is the one that
never fires:

- **Prevent** with constraints, good defaults, inline validation, confirmations for
  destructive actions, and formatting that guides input.
- When errors happen, **fail forgivingly**: say what went wrong, why, and how to fix it, in
  plain language, next to the problem — never blame the user or show a raw error code.
- **Make actions reversible** (undo, drafts, soft-delete, confirmation for the irreversible)
  so exploration is safe. This is the "tolerance for error" principle in practice.

### Step 6: Validate with real people (research, not opinions)

Read `references/usability-testing-and-research.md`. Usability is measured, not asserted:

- **Lightweight usability testing** — even 5 users doing real tasks surfaces most major
  problems. Watch where they hesitate, misread, or get stuck.
- **Task-based testing** ("do X"), not "do you like it"; measure task success, time, and
  errors.
- **Include participants across the ability/literacy/device spectrum**, not just power
  users or colleagues.
- Iterate: test → fix the top issues → retest.

### Step 7: Confirm before calling it done

- [ ] Designed for the spectrum (permanent/temporary/situational; varied literacy, age,
      device, context) — not one "average" user.
- [ ] Passes a heuristic review; no obvious violations (hidden status, dead ends, no undo,
      inconsistency, recall-heavy steps).
- [ ] The primary action on each screen is obvious and singular; clickable things look
      clickable.
- [ ] Cognitive load minimized: recognition over recall, sensible defaults, progressive
      disclosure, consistent patterns.
- [ ] Copy is plain-language, specific, and scannable; labels are action-oriented.
- [ ] Empty/loading/error/success states are all designed and helpful.
- [ ] Errors are prevented where possible; messages are clear and actionable; destructive
      actions are confirmed and/or reversible.
- [ ] Validated with real users across the spectrum on real tasks; top issues fixed.

## What disciplined teams do that this encodes

- Treat **universal/inclusive design as the default target**, so the product works for far
  more people without special cases.
- Run **heuristic evaluation** early and cheaply to catch defects before users do.
- Relentlessly **reduce cognitive load** — the scarce resource is the user's attention.
- Write **plain-language, action-oriented content** as a first-class part of the UI.
- **Prevent errors and make everything reversible**, so the product feels safe to explore.
- **Test with real, diverse users** and iterate, rather than shipping opinions.

## How this relates to the other requirements skills

- `universal-accessibility-wcag` — the non-negotiable *floor*. This skill builds
  usable-and-delightful on top of accessible-and-possible; do accessibility first, then
  this.
- `universal-browser-device-support` — a flow that breaks on a phone, a slow network, or by
  touch is a usability failure; input-agnostic, responsive design is part of being usable
  for everyone.

## Reference files

| Topic | File |
|---|---|
| 7 universal-design principles, inclusive-design mindset, persona spectrum, situational constraints | `references/universal-and-inclusive-design.md` |
| The ten usability heuristics applied to real interfaces | `references/usability-heuristics.md` |
| Reducing cognitive load: recognition, affordances, hierarchy, defaults, progressive disclosure | `references/cognitive-load-and-clarity.md` |
| Plain-language content, labels, microcopy, empty/loading/success states, readability | `references/content-and-plain-language.md` |
| Error prevention, forgiving recovery, reversibility, safe destructive actions | `references/error-prevention-and-recovery.md` |
| Usability testing, task-based research, sample size, testing across the spectrum, iteration | `references/usability-testing-and-research.md` |

## Sources & further reading

Grounded in established HCI and inclusive-design frameworks. The two quantitative claims
(≈5 users surfaces most issues; automation catches a minority of accessibility issues)
are widely cited research findings — attribute them precisely if published externally.

- **The 7 Principles of Universal Design** — Center for Universal Design, North Carolina
  State University (1997).
- **10 Usability Heuristics for User Interface Design** — Jakob Nielsen, Nielsen Norman
  Group (nngroup.com).
- **Microsoft Inclusive Design Toolkit** — "solve for one, extend to many" and the
  permanent / temporary / situational persona spectrum (inclusive.microsoft.design).
- **"Why You Only Need to Test with 5 Users"** — Nielsen & Landauer, Nielsen Norman Group
  — the source of the small-sample usability-testing guidance.
- **Plain-language guidance** — plainlanguage.gov and the GOV.UK content design guidance
  (gov.uk/guidance/content-design).
- Pairs with **WCAG 2.2** (the accessibility floor beneath usability) — see
  `universal-accessibility-wcag`.
