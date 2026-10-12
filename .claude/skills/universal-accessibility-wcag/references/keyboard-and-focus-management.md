# Keyboard Operability & Focus Management

Many people can't use a mouse: blind users on a screen reader, people with motor or
dexterity disabilities, switch-device users, and power users. If it doesn't work by
keyboard, it doesn't work. This is where custom UIs fail most often.

## Everything works by keyboard (WCAG 2.1.1)

- **Reachable**: every interactive element is in the tab order. Native controls are
  focusable by default; custom widgets need `tabindex="0"` on the single element that
  represents the control (use roving `tabindex`/arrow keys *inside* composite widgets, not
  a tab stop per item).
- **Operable**: activate with the expected keys — Enter/Space for buttons, arrow keys for
  radio groups / tabs / menus / sliders, Escape to close dialogs/menus, per the APG
  pattern for the widget.
- **Never** use `tabindex` values greater than 0 — they hijack the natural order and create
  confusing jumps. Use `0` (in order) or `-1` (focusable only via script).

## Visible focus (WCAG 2.4.7 / 2.4.11)

- Every focusable element shows a **clearly visible focus indicator**. Prefer
  `:focus-visible` so keyboard users get a ring without mouse-clicks showing one.
- **Never** `outline: none` without a stronger replacement (a ring, border, or background
  change with sufficient contrast). Removing focus styles is one of the most common — and
  most damaging — accessibility bugs.
- The focused element must not be **hidden behind sticky headers/footers** (2.4.11) —
  ensure it scrolls into a visible position.

## Logical focus order & no traps (2.4.3 / 2.1.2)

- Tab order follows the visual/reading order. If DOM order and visual order diverge (via
  CSS ordering), fix the DOM — don't paper over it.
- **No keyboard traps**: the user can always move focus *away* from any component with the
  keyboard alone. (Modal dialogs are the *intentional* exception — see below — but must be
  escapable via Escape/close.)
- Provide a **skip link** ("Skip to main content") as the first focusable element so
  keyboard/AT users can bypass repeated navigation (2.4.1).

## Managing focus for dynamic UI (the part scripts must handle)

Single-page apps and rich widgets change the DOM under the user; focus must be moved
deliberately or it gets lost (dumped to `<body>`, or stuck on a now-hidden element):

- **Dialogs/modals**: on open, move focus to the dialog (its first control or heading);
  **trap** focus within it (Tab cycles inside); on close, **return focus to the element
  that opened it**. Set `aria-modal="true"` and hide the background from AT.
- **Menus/popovers/comboboxes**: move focus per the APG pattern; Escape closes and returns
  focus to the trigger.
- **Revealed content** (accordion, "load more", wizard step): move focus to the new content
  or announce it, so keyboard/AT users know it appeared.
- **Route changes** (SPA navigation): move focus to the new page's heading/main and update
  the document title so it's clear the page changed.
- **Deletions/closures**: after removing the focused item, move focus to a sensible
  neighbor, not into the void.

## Other operable requirements

- **Pointer/gesture alternatives** (2.5.x): any drag or path/multipoint gesture needs a
  simple single-pointer + keyboard alternative; actions fire on *up*, not *down*, and are
  cancelable (2.5.2).
- **Target size** (2.5.8): interactive targets at least 24×24 px (design toward ~44 px).
- **Enough time** (2.2.1): if there's a time limit, let users extend/turn it off (except
  real-time/essential cases).

## Quick test

Put the mouse away and complete every flow with Tab, Shift+Tab, Enter, Space, arrows, and
Escape. If you can't reach it, can't tell where focus is, get stuck, or lose focus after an
action — it's a bug.
