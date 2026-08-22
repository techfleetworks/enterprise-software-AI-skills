# Accessibility Testing (Automated + Manual, Gated in CI)

Automated tools reliably catch only about **30–40%** of WCAG issues — missing alt text,
contrast, missing labels, invalid ARIA. The rest (Is the alt text *meaningful*? Is the
focus order logical? Does the screen reader announce this widget sensibly?) require human
testing. Do all three layers; none alone is sufficient.

## Layer 1 — Automated (fast, in CI, blocks merge)

- **axe-core** is the industry-standard engine. Wire it in at two levels:
  - **Component/unit**: `jest-axe` (or `@axe-core/react` in dev) asserts a component has no
    violations.
  - **Page/e2e**: `axe-playwright` / `cypress-axe` scans rendered pages in the e2e suite.
- **Lint gate**: `eslint-plugin-jsx-a11y` (React) or the framework equivalent
  (`@angular-eslint`, Vue a11y rules) catches many issues *before* runtime — missing alt,
  labels, invalid ARIA, non-interactive elements with handlers.
- **CI**: both the a11y assertions and the a11y lint rules run on every PR and **fail the
  build on violations**, exactly like any other test. Optionally track a Lighthouse
  accessibility score as a trend, but treat axe violations as the hard gate.

Automated tools have false negatives *and* occasional false positives — investigate, don't
blindly suppress. A clean axe run means "no *detectable* issues," not "accessible."

## Layer 2 — Keyboard-only testing (manual, every feature)

Put the mouse away and complete the whole flow using **Tab / Shift+Tab / Enter / Space /
arrow keys / Escape**. Check:

- Can you reach every interactive element, in a logical order?
- Is focus always visible, and never hidden behind sticky UI?
- Do widgets operate with the expected keys (per APG)?
- Can you open **and escape** every dialog/menu; does focus return correctly?
- No traps; no lost focus after actions (delete, close, navigate).

This is the fastest high-value manual test and catches the most common serious failures.

## Layer 3 — Screen-reader testing (manual, key flows)

Test with at least one real screen reader, ideally more than one across platforms:

- **NVDA** (free) or **JAWS** with Firefox/Chrome on Windows.
- **VoiceOver** with Safari on macOS and iOS.
- **TalkBack** with Chrome on Android (for mobile).

Verify that every control announces a sensible **name, role, and state**; that headings and
landmarks let you navigate; that images convey the right information (or are silent when
decorative); that form errors are announced and associated; and that dynamic updates
(live regions) are spoken without hijacking focus. Bad ARIA reveals itself instantly here —
a "button" announced as plain text, a toggle with no state, a dialog that never traps.

## Layer 4 — Human & assistive-tech diversity (higher assurance)

For high-stakes or public-facing products, add **usability testing with people with
disabilities** and other AT (voice control like Dragon/Voice Control, screen magnifiers,
switch access). Real users surface issues no checklist predicts.

## What "done" looks like

- axe assertions + a11y lint run in CI and block merge; zero known violations on changed UI.
- Keyboard-only pass completed for the feature.
- Screen-reader pass completed on key flows, on at least one real screen reader.
- Findings tracked against **specific WCAG success criteria**, so conformance is
  demonstrable (useful for an accessibility statement / VPAT and for legal defensibility).
- Regression guard: new components ship with an a11y test so they can't silently regress.
