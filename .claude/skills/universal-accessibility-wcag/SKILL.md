---
name: universal-accessibility-wcag
description: 'Use for ANY UI change (every component, page, form, image, color choice, interaction, or content block) to make it conform to WCAG 2.2 Level AA (and AAA where feasible) so it is usable by people with visual, motor, auditory, cognitive, and speech disabilities, using a keyboard, screen reader, magnifier, or voice. One combined checklist covers WCAG 2.2, Section 508, and the ADA at once. Covers semantic HTML first, ARIA done correctly, keyboard and focus management, color and contrast, accessible forms and error handling, media alternatives, and automated plus manual accessibility testing wired into CI. Trigger proactively on forms, inputs, labels, images, alt text, icons, buttons, modals or dialogs, menus, tabs, color, contrast, focus, keyboard, tab order, ARIA, roles, screen reader, "a11y," accessible, WCAG, Section 508, ADA, even without those words, on any code that renders UI.'
---

# Universal Accessibility (WCAG Conformance)

## Why this exists

Roughly one in six people lives with a disability. Every UI you ship is used by people who are blind or
low-vision, who cannot use a mouse, who are deaf or hard of hearing, who have limited dexterity or
tremor, who have cognitive or attention differences, or who are simply in a hard situation (bright sun,
one hand full, a noisy room). Accessibility is not a feature for a minority. It is the difference between
"everyone can use this" and "some people are locked out." It is also, in most places, a legal
requirement (the ADA, Section 508, EN 301 549, the European Accessibility Act), and it is far cheaper to
build in than to retrofit.

This skill's bar is WCAG 2.2 Level AA conformance, verified, not "we tried to make it accessible."
Accessibility is a property you build and test, the same way you build and test correctness.

## The main idea

**Semantic HTML first; ARIA only to fill genuine gaps; then verify with automation, the keyboard, and a
screen reader.** Most accessibility comes free from using the right native element. ARIA is a supplement
for custom widgets, and bad ARIA is worse than none. Nothing is "accessible" until it has been operated
without a mouse and heard through a screen reader.

Organize everything around WCAG's four principles, POUR: Perceivable, Operable, Understandable, Robust.
If content fails any one, someone is excluded.

Two honest frames sit under that. First, **one combined checklist covers all the rules at once.** The
stable web standards nest: Section 508 of 2017 incorporates WCAG 2.0 A and AA by reference, the ADA (via
the US DOJ Title II rule of 2024) requires WCAG 2.1 AA, and WCAG 2.2 contains both. So meeting WCAG 2.2
A and AA satisfies 508 and the ADA web standard and exceeds them. Second, **automated tools catch only
part of accessibility** (roughly a third to a half of issues), so a green automated run is necessary,
never sufficient. The gates below enforce both points.

## The workflow

### Step 1: Know the target, WCAG 2.2 AA and POUR

Read `references/wcag-principles-and-conformance.md`. Understand the conformance target (Level AA is the
standard bar, A is the floor, AAA where feasible), the four POUR principles, and the success criteria
most changes touch. Every review below maps to specific success criteria, so cite them and "accessible"
is concrete, not a vibe.

### Step 2: Build on semantic HTML

Read `references/semantic-html-and-aria.md`. Before any ARIA:

- Use the **native element** for the job: `<button>` for actions, `<a href>` for navigation,
  `<input>` plus `<label>`, `<nav>`, `<main>`, `<header>`, `<footer>` landmarks, `<h1>` through `<h6>`
  in order, `<ul>` and `<ol>`, `<table>` with headers. Native elements bring keyboard behavior, focus,
  roles, and states for free.
- Use **ARIA only for genuine gaps** (custom widgets with no native equivalent). Follow the ARIA
  Authoring Practices patterns exactly, and honor the first rule of ARIA: do not use ARIA if a native
  element will do. Every custom widget must expose a correct name, role, value, and state.

### Step 3: Make everything Operable by keyboard

Read `references/keyboard-and-focus-management.md`. This is where custom UIs fail most:

- **Everything works with the keyboard alone**, no mouse required (2.1.1). Tab to every control,
  activate with Enter or Space, operate widgets with the expected arrow keys.
- **Visible focus** on every focusable element (2.4.7); never remove outlines without a stronger
  replacement.
- **Logical focus order** (2.4.3); **no keyboard traps** (2.1.2).
- **Manage focus** for dynamic UI: move focus into an opened dialog, keep it there, return it on close;
  move focus to newly revealed content; do not let it fall to a hidden element.
- **Skip link** to bypass repeated navigation (2.4.1).
- **Dragging movements** (2.5.7, AA, new in 2.2): any drag action has a single-pointer alternative.
- **Target size** (2.5.8, AA, new in 2.2): interactive targets are at least 24 by 24 CSS px, or have
  24px spacing (design toward about 44px for comfort).

### Step 4: Make it Perceivable, text alternatives, contrast, media

Read `references/color-contrast-and-visual-design.md` and `references/semantic-html-and-aria.md`:

- **Text alternatives** for non-text content (1.1.1): meaningful `alt` for informative images, empty
  `alt=""` for decorative ones, accessible names for icon buttons.
- **Color contrast** meets AA: 4.5:1 for normal text, 3:1 for large text and for UI components and
  graphical objects (1.4.3, 1.4.11).
- **Never rely on color alone** to convey meaning (1.4.1); pair it with text, icon, or shape.
- **Reflow and resize**: usable at 320px width and at 200% zoom with no loss (1.4.4, 1.4.10).
- **Media**: for video, captions (1.2.2, A) and audio description (1.2.5, AA); for audio-only, a
  transcript (1.2.1, A). No content that flashes more than three times per second (2.3.1).
- **Content on hover or focus** (1.4.13, AA): tooltips and popovers triggered by hover or focus are
  dismissable, hoverable, and persistent.

### Step 5: Make forms and errors Understandable

Read `references/accessible-forms-and-errors.md`. Forms are the highest-stakes surface:

- Every field has a **programmatically associated `<label>`** (1.3.1, 3.3.2).
- **Errors are identified in text** and linked to the field, not by color alone (3.3.1); provide
  **suggestions** for fixing them (3.3.3).
- Group related fields (`<fieldset>` and `<legend>`), use correct input types and `autocomplete`
  (1.3.5), and announce validation results to assistive tech.
- Consistent, predictable navigation and behavior (3.2); clear instructions; do not rely on placeholder
  text as the only label.
- **Label in Name** (2.5.3, A): a control's accessible name includes its visible label text, so
  voice-control users can activate it by speaking what they see.
- **Consistent Help** (3.2.6, A, new in 2.2): help mechanisms appear in the same relative order across
  pages.
- **Redundant Entry** (3.3.7, A, new in 2.2): do not make users re-enter information they already gave
  in the same session.
- **Accessible Authentication (Minimum)** (3.3.8, AA, new in 2.2): do not require a cognitive function
  test to log in with no accessible alternative; allow paste and password managers.

### Step 6: Make it Robust

Read `references/semantic-html-and-aria.md`. Robust means it works with current and future assistive
tech: valid, well-formed markup; a correct name, role, and value on every component (4.1.2); status
messages announced via live regions (4.1.3) without stealing focus. (The old 4.1.1 Parsing criterion was
removed in WCAG 2.2; clean markup still matters but it is no longer a scored criterion.)

### Step 7: Work the combined checklist, every criterion gets a verdict

Read `assets/combined-a11y-checklist.json`. This is the unique combined list: WCAG 2.2 Level A and AA,
annotated so each criterion shows whether Section 508 also requires it (`s508`) and whether the ADA
Title II web standard also requires it (`ada`), and whether it is automatable or needs a human. Because
it is the superset, meeting every item satisfies 508 and the ADA web standard and goes beyond them.

Keep a committed **conformance record** that gives every criterion a verdict: `pass-automated` (only for
a criterion the automated check fully covers), `pass-manual` (with a reviewer and a date), or
`not-applicable` (with a reason). That record is what the gate checks, so "we comply with all of them"
is proven item by item, not asserted.

### Step 8: Verify, automated plus keyboard plus screen reader, in CI

Read `references/accessibility-testing.md`. Automated tools catch only about a third to a half of issues;
the rest need human testing. Do all three:

- **Automated**: an axe-based check (`jest-axe` or `axe-playwright`) on components and key pages, plus
  `eslint-plugin-jsx-a11y` (or a framework equivalent) as a lint gate, run in CI and failing the build
  on violations. A ready pair is provided: `scripts/run-axe.mjs` (a Playwright and
  `@axe-core/playwright` scaffold) feeding `scripts/check-axe-results.mjs` (the dependency-free verdict).
- **Keyboard-only**: unplug the mouse and complete every flow.
- **Screen reader**: verify with at least one real screen reader (NVDA or JAWS on Windows, VoiceOver on
  macOS and iOS, TalkBack on Android) that names, roles, states, and updates are announced correctly.
  Record the keyboard and screen-reader passes as `pass-manual` verdicts in the conformance record.

## Mechanical gate

This skill ships two structural gates, each with a discriminating test.

- `scripts/check-axe-results.mjs` (ADR-0013) is the automated verdict: it reads an axe results file and
  fails CI on any critical or serious violation that is not covered by a time-boxed, WCAG-justified
  allowlist entry. Its scaffold is `scripts/run-axe.mjs` (needs the two devDependencies and a running
  app, so it lives in the e2e stage). Its test is `test/axe-results.test.mjs`.
- `scripts/check-a11y-checklist.mjs` (ADR-0022) is the coverage verdict: it reads the combined checklist
  (`assets/combined-a11y-checklist.json`, which is WCAG 2.2 A and AA, the superset of 508 and the ADA
  web standard) and a project conformance record, and fails unless every criterion has a valid verdict.
  A criterion that is not fully automatable cannot be closed with `pass-automated` alone, so a green axe
  run cannot be mistaken for full conformance. Its test is `test/a11y-checklist.test.mjs`.

The two compose: axe proves the automated subset is clean, and the checklist gate proves every criterion
in the superset has a verdict. Both gates prove a verdict is recorded, not that a manual review was
thorough. A dishonest `pass-manual` passes, so real keyboard and screen-reader testing and `judge-arch`
still sit on top. Say which is which.

## Before you call it done

- Native semantic elements used; ARIA only where necessary and per the APG patterns.
- Every function usable by keyboard alone; visible focus; logical order; no traps; focus managed for
  dialogs, menus, and dynamic content, returned on close.
- All non-text content has appropriate text alternatives; icon buttons are named.
- Contrast at least 4.5:1 text, 3:1 large text and UI; meaning never conveyed by color alone; usable at
  200% zoom and 320px reflow.
- Every form field labeled; errors in text, linked, with suggestions; correct input types and
  `autocomplete`; dynamic updates announced without hijacking focus.
- Media has captions and transcripts; nothing flashes more than three times per second.
- `check-axe-results` and the a11y lint run in CI and block merge; `check-a11y-checklist` is green, so
  every combined-checklist criterion has a verdict; keyboard and screen-reader passes are done and
  recorded.
- The evidence ledger below is filled in: each conformance claim has a state and a re-runnable source,
  and the central claim ("every combined-checklist criterion is met or justified") is at `observed`, not
  `inferred`.

## Reference files

| Topic | File |
|---|---|
| POUR principles, conformance levels A/AA/AAA, the WCAG 2.2 success criteria you hit most | `references/wcag-principles-and-conformance.md` |
| Semantic HTML, landmarks, headings, correct ARIA (name, role, value), APG patterns | `references/semantic-html-and-aria.md` |
| Keyboard operability, focus order, visible focus, focus management, no traps, skip links | `references/keyboard-and-focus-management.md` |
| Color contrast ratios, not-color-alone, reflow and zoom, motion, visual design for a11y | `references/color-contrast-and-visual-design.md` |
| Labels, error identification and suggestions, fieldsets, input types, live-region announcements | `references/accessible-forms-and-errors.md` |
| Automated (axe and lint) plus manual keyboard and screen-reader testing, CI gating, audit checklist | `references/accessibility-testing.md` |
| The combined checklist: WCAG 2.2 A and AA with 508 and ADA Title II flags per criterion | `assets/combined-a11y-checklist.json` |
| Mechanical gate: axe runner scaffold plus the dependency-free pass/fail verdict | `scripts/run-axe.mjs`, `scripts/check-axe-results.mjs` |
| Mechanical gate: combined-checklist coverage verdict (every criterion has a verdict) | `scripts/check-a11y-checklist.mjs` |

## Evidence & skeptical assessment (required)

Every "this is accessible / we meet WCAG, 508, and the ADA" statement is a factual claim, so it follows
the repo's evidence discipline (canonical contract:
[`skeptical-audit/references/evidence-discipline.md`](../skeptical-audit/references/evidence-discipline.md)).
A conformance claim is an **evidence ledger**: each criterion is a claim with a state and a re-runnable
source, never a bare assertion. Hunt the disconfirming case first (which criterion is only assumed to
pass?) before you sign off.

| Claim | Reaches `observed` by | Becomes `proven` when |
|---|---|---|
| "The automated checks are clean" | `check-axe-results` runs clean on the axe output in CI | it is a blocking CI check with an allowlist that is time-boxed and WCAG-justified |
| "Every combined-checklist criterion has a verdict" | `check-a11y-checklist` runs clean on the committed record | it is a blocking CI check and the manual verdicts carry a reviewer and date |
| "It works by keyboard alone" | a keyboard-only pass of every flow is recorded as `pass-manual` | the keyboard pass is repeated on each release and tracked |
| "A screen reader announces names, roles, states, updates" | a screen-reader pass is recorded with the tool and date | the screen-reader pass covers the supported readers and is repeated |
| "We satisfy Section 508 and the ADA web standard" | the combined checklist (a superset of both) is fully verdicted | the WCAG 2.2 A and AA conformance it encodes is independently audited |

**Definition of done:** the ledger covers every criterion the change touches with a verdict and a
re-runnable source; a criterion that could be measured (contrast, missing label, page title, lang) is
`observed` or `proven`, never `inferred`; and no "accessible" or "conformant" verdict is given while the
central "every combined-checklist criterion is met or justified" claim is below `observed`. A green axe
run is necessary, not sufficient, and WCAG 3.0 is draft direction, not a conformance target.

## Why this holds for every developer and every agent

It binds everyone because the gates, the combined checklist, and the conformance record live in CI and
git, not in memory. Agents get the discipline through the always-on hook, which lists this skill in
`always-on/enterprise-skills-always-on.md`. People and agents alike are held by `check-axe-results` (a
blocking gate on automated violations) and `check-a11y-checklist` (a blocking gate that fails an
un-verdicted criterion). It survives any one person because the gate scripts, the checklist, the
reference files, and the record all live in the repo. The honest limit: the gates prove a verdict is
recorded and the automated subset is clean, not that a manual review was thorough or that a `pass-manual`
is truthful. That is why real keyboard and screen-reader testing and `judge-arch` sit on top, and why an
escaped accessibility bug becomes a new or corrected verdict so the gap closes next time.

## Sources and attribution

Grounded in the W3C accessibility standards and read this session; confirm exact success-criterion
numbers and wording against the normative spec before relying on them.

- WCAG 2.2, Web Content Accessibility Guidelines, the normative standard and the source of every success
  criterion cited here (<https://www.w3.org/TR/WCAG22/>), with the companion Understanding and
  Techniques documents. `[documented]`
- WebAIM, "WCAG 2 Checklist" (<https://webaim.org/standards/wcag/checklist>, last updated 2024-06-20,
  retrieved 2026-10-12): the plain-language summary of each WCAG 2.2 A and AA success criterion used to
  build the combined checklist, and WebAIM's widely cited finding that automated tools detect only a
  minority of issues. `[documented]`
- W3C, "Requirements for WCAG 3.0" (<https://www.w3.org/TR/wcag-3.0-requirements/>, Group Note Draft,
  retrieved 2026-10-12): confirmation that WCAG 3.0 is a draft, not a ratified standard, so no
  conformance can be claimed to it today; tracked here as direction only. `[documented]`
- U.S. Access Board, Section 508 standards (the 2017 refresh) incorporate WCAG 2.0 Level A and AA by
  reference; this is the basis for the `s508` flag in the combined checklist. The WebAIM Section 508
  checklist page (<https://webaim.org/standards/508/checklist>) was consulted but is self-marked out of
  date (it maps the pre-2017 provisions), so it is not used as the mapping source. `[reported]`
- U.S. Department of Justice, ADA Title II web rule (2024), which adopts WCAG 2.1 Level AA for state and
  local government web content; this is the basis for the `ada` flag. The ADA Checklist for Existing
  Facilities (<https://adata.org/project/ada-checklist>) was consulted but covers physical buildings,
  not the web, so it is out of scope for this website gate. `[reported]`
- WAI-ARIA and the ARIA Authoring Practices Guide (<https://www.w3.org/WAI/ARIA/apg/>): roles, states,
  properties, and the required keyboard patterns for custom widgets. `[documented]`
- axe-core and Deque, the accessibility test engine behind jest-axe and axe-playwright
  (<https://github.com/dequelabs/axe-core>), and `eslint-plugin-jsx-a11y` for lint-time checks.
  `[documented]`
- Legal and regulatory context: the ADA, Section 508 (US), EN 301 549 and the European Accessibility Act
  (EU), all of which reference WCAG. `[documented]`
