# Semantic HTML & Correct ARIA

The single highest-leverage accessibility decision is using the right native element. Most
accessibility is *free* if you do; most accessibility bugs come from re-implementing
native behavior badly with `<div>`s.

## Semantic HTML first (the "floor" that's usually enough)

- **Actions vs navigation.** `<button>` for actions (submits, toggles, opens); `<a href>`
  for navigation to a URL. A clickable `<div>` has no role, no keyboard behavior, and no
  focusability — you'd have to rebuild all three (and you'll get it subtly wrong).
- **Landmarks.** Wrap regions in `<header>`, `<nav>`, `<main>` (one per page), `<aside>`,
  `<footer>`. Screen-reader users jump between landmarks; a page of `<div>`s has none.
- **Headings in order.** One `<h1>`, then `<h2>`…`<h6>` without skipping levels. Headings
  are the primary way screen-reader users skim a page (1.3.1).
- **Lists, tables, and structure.** Real `<ul>/<ol>/<li>`; `<table>` with `<th scope>` and
  `<caption>` for tabular data (never for layout). Structure in markup = structure exposed
  to AT.
- **Native form controls.** `<input>`, `<select>`, `<textarea>`, `<label>` — they bring
  labels, focus, keyboard, and platform behaviors you can't fully replicate.

Native elements also inherit correct behavior on mobile, with voice control, and with
future AT — robustness you don't have to maintain.

## ARIA — only to fill genuine gaps

ARIA (Accessible Rich Internet Applications) adds roles/states/properties where HTML has
no native equivalent (e.g. tabs, comboboxes, tree views, custom sliders). The rules:

1. **First rule of ARIA: don't use ARIA if a native element/attribute will do.** A
   `role="button"` on a div is strictly worse than a `<button>`.
2. **No ARIA is better than bad ARIA.** Incorrect roles/states actively mislead screen
   readers — they'll announce a broken widget confidently. Broken ARIA causes more harm
   than plain semantic HTML with none.
3. **Don't change native semantics** needlessly (`<h2 role="tab">` — now it's not a
   heading).
4. **Every custom interactive widget needs correct Name, Role, Value, and State**
   (WCAG 4.1.2), plus full keyboard support.

## Follow the APG patterns exactly

For custom widgets, implement the **ARIA Authoring Practices Guide (APG)** pattern for that
component — dialog, disclosure, tabs, menu, combobox, accordion, tooltip, etc. Each pattern
specifies the required roles, states, and **keyboard interaction** (which arrow keys,
Home/End, Escape, etc.). Don't invent your own; the patterns encode what AT users expect.

A modal dialog, per the APG, is labelled, marked modal, and manages focus:

```html
<!-- ❌ never — a "dialog" that's just a div; no role, no label, focus not trapped -->
<div class="modal"><h2>Delete file?</h2> … </div>

<!-- ✅ always — APG dialog: role, aria-modal, and an accessible name via the heading -->
<div role="dialog" aria-modal="true" aria-labelledby="dlg-title">
  <h2 id="dlg-title">Delete file?</h2>
  <p>This can't be undone.</p>
  <button type="button">Cancel</button>
  <button type="button">Delete</button>
</div>
```

Focus-trap note: on open, move focus into the dialog (usually the first control or the
heading); keep Tab/Shift+Tab cycling *within* it while open; close on Escape; and return
focus to the element that opened it. (The native `<dialog>` element with `.showModal()`
gives you modality, the Escape key, and focus return for free — prefer it where supported.)

## Accessible names — how AT identifies things

Every control needs an **accessible name**. In priority order, prefer:

1. A visible, associated `<label>` (forms) or the element's text content (buttons/links).
2. `aria-labelledby` pointing at visible text.
3. `aria-label` (a string with no visible counterpart — use sparingly; visible text is
   better for everyone, including voice-control users who speak the label).

Icon-only buttons **must** have a name (`aria-label` or visually-hidden text). Don't rely
on `title` for naming — it's inconsistent across AT and hidden on touch.

```html
<!-- ❌ never — icon button with no accessible name; AT announces just "button" -->
<button><svg aria-hidden="true">…</svg></button>

<!-- ✅ always — name it; mark the decorative glyph aria-hidden so it isn't double-read -->
<button type="button" aria-label="Close dialog">
  <svg aria-hidden="true" focusable="false">…</svg>
</button>
<!-- or keep visible text for everyone and visually hide it:
<button type="button"><svg aria-hidden="true">…</svg><span class="sr-only">Close dialog</span></button> -->
```

## Common structure mistakes

- Clickable `<div>`/`<span>` instead of `<button>`/`<a>`.
- Skipped or purely visual heading levels (styling a `<div>` big instead of using `<h2>`).
- Placeholder used as the only label (disappears on input; poor contrast; not a name).
- `aria-hidden="true"` on something focusable (creates a "phantom" focus stop AT can't
  describe).
- Duplicate `id`s breaking `for`/`aria-labelledby`/`aria-describedby` associations.
- Layout tables, or data tables without header cells.
