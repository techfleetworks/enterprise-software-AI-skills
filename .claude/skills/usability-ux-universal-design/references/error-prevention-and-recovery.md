# Error Prevention & Forgiving Recovery

Humans make mistakes — always. A usable, inclusive product assumes this and makes mistakes
*unlikely* and *cheap*, rather than punishing them. This is the "tolerance for error"
principle of universal design in practice, and it's what makes software feel safe to explore.

## Prevent errors before they happen (the best error is none)

- **Constrain the input** to what's valid: pickers instead of free-text where possible,
  correct input types, min/max, disabled invalid options, masks/format-as-you-type.
- **Good defaults** so the common, safe choice is already selected.
- **Inline, real-time validation** with clear, friendly guidance *as the user types* (and
  positive confirmation when a field is right) — not a wall of red only after submit.
- **Forgiving formats**: accept and normalize variations (spaces in card numbers, different
  phone/date formats, trailing whitespace) instead of rejecting them.
- **Confirm consequential actions** and guard against accidental activation (don't put
  "Delete" right next to "Save"; require a deliberate step for the destructive path).
- **Set expectations** before irreversible or slow actions ("This permanently deletes the
  project").

## When errors happen, recover gracefully

A good error message does three things, in plain language, right where the problem is:

1. **Says what went wrong** — specifically ("Your card was declined," not "Error 402").
2. **Says why** — enough context to understand it ("The expiry date is in the past").
3. **Says how to fix it** — a concrete next step ("Enter a card with a future expiry date")
   or a direct action (a "Retry" button, a link to the setting).

Rules:

- **Plain language, no codes or stack traces** in the user's face. Log the technical detail;
  show the human the actionable version.
- **Locate the message at the problem** — next to the field, not only in a banner far away.
- **Never blame the user** ("That didn't work, let's try again," not "You did X wrong").
- **Preserve their work** — never wipe a form on error; keep everything they entered.
- **Don't dead-end** — always offer a way forward (retry, alternative, contact, go back).

## Make actions reversible — the safety net

Reversibility turns anxiety into exploration. Prefer it to warnings wherever you can:

- **Undo** for most actions (including delete → "Deleted. Undo").
- **Soft-delete / trash** with a recovery window instead of immediate hard deletion.
- **Auto-save drafts** so nothing is lost to a crash, a mistake, or a back button.
- **Non-destructive by default**; require explicit, deliberate confirmation only for the
  genuinely irreversible.
- **Easy cancel/exit** from any flow without penalty (the "emergency exit").

## Special care: destructive and high-stakes actions

For deletion, payments, sending, publishing, or anything irreversible or consequential:

- Make the safe path the easy one and the destructive path deliberate.
- Confirm with a summary of *what exactly* will happen ("Delete 3 files? This can't be
  undone"), not a generic "Are you sure?".
- Where feasible, prefer a reversible mechanism (undo window, trash) over a confirmation
  dialog — confirmations get click-fatigued and ignored.
- (For permission/access/deletion changes in code, also apply the lockout / accidental-
  deletion safety check from the security skill if present.)
