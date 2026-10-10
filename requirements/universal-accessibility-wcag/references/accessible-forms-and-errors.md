# Accessible Forms, Errors & Announcements

Forms are where users commit — sign in, pay, submit. An inaccessible form doesn't
frustrate; it blocks the task entirely.

## Labels — every field, programmatically associated (WCAG 1.3.1 / 3.3.2)

- Use `<label for="id">` (or wrap the input) so clicking the label focuses the field and
  AT announces it. `aria-labelledby`/`aria-label` are fallbacks when a visible `<label>`
  isn't possible.
- **Placeholder is not a label.** It vanishes on input, usually fails contrast, and isn't
  a reliable accessible name. Use a real, persistent label.
- Provide **instructions/format hints** before they're needed ("Password must be 12+
  characters"), associated via `aria-describedby`.
- **Group related controls**: `<fieldset>` + `<legend>` for radio/checkbox groups and
  logical sections, so the group's purpose is announced.

## Correct input types & autofill (1.3.5)

- Use the right `type` (`email`, `tel`, `url`, `number`, `date`) — better mobile keyboards
  and built-in validation semantics.
- Set `autocomplete` tokens (`name`, `email`, `street-address`, `one-time-code`, …) so
  browsers and password managers can fill fields — directly helps people with cognitive
  and motor disabilities (and satisfies 1.3.5 Identify Input Purpose).
- Mark required fields with the `required` attribute **and** a visible indicator explained
  in a legend (not color alone).

## Error handling (WCAG 3.3.1 / 3.3.3)

- **Identify errors in text** (3.3.1): state which field and what's wrong in words
  ("Enter a valid email address"), not just a red border/color.
- **Associate the error with the field** via `aria-describedby`, and set
  `aria-invalid="true"` on the field so AT ties the message to the input.
- **Suggest a correction** (3.3.3) when you can ("Dates must be MM/DD/YYYY").
- **On submit failure**: summarize errors at the top (with in-page links to each field),
  and/or **move focus to the first invalid field**, so keyboard/AT users aren't left
  guessing why nothing happened.
- **Don't clear the user's input** on error. For high-stakes actions (legal, financial,
  data deletion), make them reversible, checked, or confirmed (3.3.4 / 3.3.6).
- **Accessible authentication** (3.3.8): don't require solving a puzzle or transcribing a
  code with no accessible alternative; allow paste and password managers.

```html
<!-- ❌ never — placeholder as label, error shown by color only, nothing linked to the input -->
<input type="email" placeholder="Email">
<span style="color:red">Invalid</span>

<!-- ✅ always — persistent label, aria-invalid on the field, error linked via aria-describedby -->
<label for="email">Email address</label>
<input
  id="email"
  type="email"
  autocomplete="email"
  aria-invalid="true"
  aria-describedby="email-error">
<p id="email-error" class="error">Enter a valid email address, e.g. name@example.com.</p>
```

## Announcing dynamic changes — live regions (WCAG 4.1.3)

When content changes without a page load, sighted users see it but AT users won't unless
you announce it:

- Use `role="status"` / `aria-live="polite"` for non-urgent updates ("Saved", "3 results
  found"), and `role="alert"` / `aria-live="assertive"` sparingly for urgent ones
  (validation errors, failures).
- The live region must **exist in the DOM before** its content changes; then update its
  text. Don't dump huge content into a live region, and **don't move focus** to announce —
  that's disruptive; live regions announce *without* stealing focus.
- Reflect state changes (`aria-expanded`, `aria-selected`, `aria-checked`, `aria-busy`) as
  they happen so the widget's state is always accurate to AT.

```html
<!-- The live region exists in the DOM up front, empty; you fill it when errors occur. -->
<div role="alert" aria-live="assertive" id="form-errors"></div>
```

```js
// ❌ never — innerHTML with text that may echo user input is an XSS footgun
formErrors.innerHTML = `We couldn't save: ${userMessage}`;

// ✅ always — set textContent; it announces via the live region and can't inject markup
formErrors.textContent = `We couldn't save: ${userMessage}`;
```

When an error/live-region message may include user-supplied text, write it with
**`textContent`, not `innerHTML`** — `innerHTML` would execute injected markup (XSS).

## Form accessibility checklist

- [ ] Every field has a persistent, associated label; placeholders aren't the label.
- [ ] Related fields grouped with fieldset/legend; correct input types + `autocomplete`.
- [ ] Instructions/format hints provided and associated via `aria-describedby`.
- [ ] Errors are in text, linked to the field, with `aria-invalid` and a suggested fix.
- [ ] On submit failure, focus moves to the first error / an error summary is announced.
- [ ] Input is preserved on error; destructive/critical actions are confirmed/reversible.
- [ ] Dynamic status/results/errors announced via appropriate live regions.
