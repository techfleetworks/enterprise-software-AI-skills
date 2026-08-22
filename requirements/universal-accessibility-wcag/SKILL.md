---
name: universal-accessibility-wcag
description: Use for ANY UI change — every component, page, form, image, color choice, interaction, or content block — to make it conform to WCAG 2.2 Level AA (and AAA where feasible) so it is usable by people with visual, motor, auditory, cognitive, and speech disabilities, using a keyboard, screen reader, magnifier, or voice. Covers semantic HTML first, ARIA done correctly, keyboard and focus management, color/contrast, accessible forms and error handling, media alternatives, and automated + manual accessibility testing wired into CI. Trigger proactively on forms, inputs, labels, images, alt text, icons, buttons, modals/dialogs, menus, tabs, color, contrast, focus, keyboard, tab order, ARIA, roles, screen reader, "a11y," accessible, WCAG, Section 508, ADA — even without those words, on any code that renders UI.
---

# Universal Accessibility (WCAG Conformance)

## Why this exists

Roughly one in six people lives with a disability. Every UI you ship is used by people
who are blind or low-vision, who can't use a mouse, who are deaf or hard of hearing, who
have limited dexterity or tremor, who have cognitive or attention differences, or who are
simply in a hard situation (bright sun, one hand full, a noisy room). Accessibility isn't
a feature for a minority — it's the difference between "everyone can use this" and
"some people are locked out." It is also, in most jurisdictions, a **legal requirement**
(ADA, Section 508, EN 301 549, the European Accessibility Act), and it is far cheaper to
build in than to retrofit.

This skill's bar is **WCAG 2.2 Level AA conformance, verified** — not "we tried to make
it accessible." Accessibility is a property you *build and test*, the same way you build
and test correctness.

## The core principle

**Semantic HTML first; ARIA only to fill genuine gaps; then verify with automation, the
keyboard, and a screen reader.** The vast majority of accessibility comes free from using
the right native element. ARIA is a supplement for custom widgets, and *bad ARIA is worse
than none*. Nothing is "accessible" until it has been operated without a mouse and heard
through a screen reader.

Organize everything around WCAG's four principles — **POUR**: Perceivable, Operable,
Understandable, Robust. If content fails any one, someone is excluded.

## The workflow

### Step 1: Know the target — WCAG 2.2 AA and POUR

Read `references/wcag-principles-and-conformance.md`. Understand the conformance target
(Level **AA** is the standard bar; **A** is the floor; **AAA** where feasible), the four
POUR principles, and the success criteria most changes touch. Every review below maps to
specific success criteria — cite them so "accessible" is concrete, not vibes.

### Step 2: Build on semantic HTML

Read `references/semantic-html-and-aria.md`. Before any ARIA:

- Use the **native element** for the job: `<button>` for actions, `<a href>` for
  navigation, `<input>`+`<label>`, `<nav>/<main>/<header>/<footer>` landmarks, `<h1>–<h6>`
  in order, `<ul>/<ol>`, `<table>` with headers. Native elements bring keyboard behavior,
  focus, roles, and states for free.
- Use **ARIA only for genuine gaps** (custom widgets with no native equivalent). Follow
  the ARIA Authoring Practices patterns exactly, and honor the first rule of ARIA: *don't
  use ARIA if a native element will do.* Every custom widget must expose correct
  **name, role, value, and state**.

### Step 3: Make everything Operable by keyboard

Read `references/keyboard-and-focus-management.md`. This is where custom UIs fail most:

- **Everything works with the keyboard alone** — no mouse required (WCAG 2.1.1). Tab to
  every control, activate with Enter/Space, operate widgets with the expected arrow keys.
- **Visible focus** on every focusable element (2.4.7); never remove outlines without a
  stronger replacement.
- **Logical focus order** (2.4.3); **no keyboard traps** (2.1.2).
- **Manage focus** for dynamic UI: move focus into an opened dialog, trap it there, return
  it on close; move focus to newly revealed content; don't let it fall to a hidden element.
- **Skip link** to bypass repeated navigation (2.4.1).

### Step 4: Make it Perceivable — text alternatives, contrast, media

Read `references/color-contrast-and-visual-design.md` and
`references/semantic-html-and-aria.md`. Cover:

- **Text alternatives** for non-text content (1.1.1): meaningful `alt` for informative
  images, empty `alt=""` for decorative ones, accessible names for icon buttons.
- **Color contrast** meets AA: **4.5:1** for normal text, **3:1** for large text and for
  UI components/graphical objects (1.4.3, 1.4.11).
- **Never rely on color alone** to convey meaning (1.4.1) — pair it with text/icon/shape.
- **Reflow & resize**: usable at 320px width and at 200% zoom without loss (1.4.4, 1.4.10).
- **Media**: captions for video, transcripts for audio, no content that flashes more than
  three times per second (2.3.1).

### Step 5: Make forms and errors Understandable

Read `references/accessible-forms-and-errors.md`. Forms are the highest-stakes surface:

- Every field has a **programmatically associated `<label>`** (1.3.1, 3.3.2).
- **Errors are identified in text** and linked to the field, not by color alone (3.3.1);
  provide **suggestions** for fixing them (3.3.3).
- Group related fields (`<fieldset>/<legend>`), use correct input types and `autocomplete`
  (1.3.5), and announce validation results to assistive tech.
- Consistent, predictable navigation and behavior (3.2); clear instructions; don't rely
  on placeholder text as the only label.

### Step 6: Make it Robust

Read `references/semantic-html-and-aria.md`. Robust = works with current and future
assistive tech: **valid, well-formed markup**; correct name/role/value on every component
(4.1.2); status messages announced via live regions (4.1.3) without stealing focus.

### Step 7: Verify — automated + keyboard + screen reader, in CI

Read `references/accessibility-testing.md`. Automated tools catch only ~30–40% of issues;
the rest need human testing. Do all three:

- **Automated**: an axe-based check (`jest-axe` / `axe-playwright`) on components and key
  pages, plus `eslint-plugin-jsx-a11y` (or framework equivalent) as a lint gate — **run
  in CI, failing the build on violations.**
- **Keyboard-only**: unplug the mouse and complete every flow.
- **Screen reader**: verify with at least one real screen reader (NVDA/JAWS on Windows,
  VoiceOver on macOS/iOS, TalkBack on Android) that names, roles, states, and updates are
  announced correctly.

### Step 8: Confirm before calling it done

- [ ] Native semantic elements used; ARIA only where necessary and per the APG patterns.
- [ ] Every function usable by keyboard alone; visible focus; logical order; no traps.
- [ ] Focus managed for dialogs/menus/dynamic content; return focus on close.
- [ ] All non-text content has appropriate text alternatives; icon buttons are named.
- [ ] Contrast ≥ 4.5:1 text / 3:1 large text & UI; meaning never conveyed by color alone.
- [ ] Usable at 200% zoom and 320px reflow; content reflows without loss.
- [ ] Every form field labeled; errors in text, linked, with suggestions; correct
      input types/`autocomplete`.
- [ ] Dynamic updates announced (live regions) without hijacking focus.
- [ ] Media has captions/transcripts; nothing flashes > 3×/sec; reduced-motion honored.
- [ ] Automated a11y check + a11y lint run in CI and block merge; keyboard + screen-reader
      pass completed and documented.

## What disciplined teams do that this encodes

- **Semantic HTML as the default**, ARIA as the rare exception — the cheapest and most
  robust accessibility there is.
- Treat **keyboard operability and focus management** as core functionality, not polish.
- **Design for contrast and non-color cues** from the start, not as a post-hoc audit fix.
- **Automated a11y tests + lint gate in CI**, backed by real keyboard and screen-reader
  testing — because automation alone misses most issues.
- Cite **specific WCAG success criteria**, so conformance is verifiable, not asserted.

## How this relates to the other requirements skills

- `universal-browser-device-support` — semantic HTML, keyboard operability, target size,
  reduced-motion, and zoom/reflow are shared; do both on any UI change.
- `usability-ux-universal-design` — accessibility is the non-negotiable floor of inclusive
  design; usable-for-everyone builds on top of accessible-for-everyone.

## Reference files

| Topic | File |
|---|---|
| POUR principles, conformance levels A/AA/AAA, WCAG 2.2 success criteria you'll hit most | `references/wcag-principles-and-conformance.md` |
| Semantic HTML, landmarks, headings, correct ARIA (name/role/value), APG patterns | `references/semantic-html-and-aria.md` |
| Keyboard operability, focus order, visible focus, focus management, no traps, skip links | `references/keyboard-and-focus-management.md` |
| Color contrast ratios, not-color-alone, reflow/zoom, motion, visual design for a11y | `references/color-contrast-and-visual-design.md` |
| Labels, error identification & suggestions, fieldsets, input types, live-region announcements | `references/accessible-forms-and-errors.md` |
| Automated (axe/lint) + manual keyboard + screen-reader testing, CI gating, audit checklist | `references/accessibility-testing.md` |

## Sources & further reading

Grounded in the W3C accessibility standards. Confirm exact success-criterion numbers and
wording against the published normative spec before relying on them.

- **WCAG 2.2** — Web Content Accessibility Guidelines, the normative standard and the
  source of every success criterion cited here (w3.org/TR/WCAG22/), plus the companion
  *Understanding WCAG 2.2* and *Techniques* documents.
- **WAI-ARIA** and the **ARIA Authoring Practices Guide (APG)** — roles/states/properties
  and the required keyboard patterns for custom widgets (w3.org/WAI/ARIA/apg/).
- **W3C Web Accessibility Initiative (WAI)** — tutorials and how-to guidance
  (w3.org/WAI/).
- **MDN Accessibility** — practical, code-level reference (developer.mozilla.org).
- **WebAIM** — guidance and research, including the widely cited estimate that automated
  tools detect only a minority of issues (webaim.org).
- **axe-core / Deque** — the accessibility test engine behind jest-axe and axe-playwright
  (deque.com), and **eslint-plugin-jsx-a11y** for lint-time checks.
- Legal/regulatory context: **ADA**, **Section 508** (US), **EN 301 549** and the
  **European Accessibility Act** (EU) — all reference WCAG.
