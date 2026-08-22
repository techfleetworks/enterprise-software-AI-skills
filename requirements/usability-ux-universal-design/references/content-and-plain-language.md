# Content & Plain Language

Words are interface. Labels, buttons, headings, help text, and error messages *are* the UX
for most users — get the words wrong and the best layout still fails. Clear content helps
everyone: non-experts, non-native speakers, people under stress, people with cognitive
differences, and experts skimming quickly.

## Write in plain language

- **Aim for ~8th-grade reading level.** Short words, short sentences, one idea per sentence.
  This isn't "dumbing down" — even experts read plain language faster and prefer it.
- **Active voice, present tense.** "We saved your changes," not "Your changes have been
  saved." "Enter your email," not "The email must be entered."
- **Avoid jargon and internal terms.** Use the words your users use. If a technical term is
  unavoidable, define it in place. No acronyms without expansion.
- **Be concise.** Cut filler ("please note that," "in order to," "at this time"). Users
  scan; every extra word is friction.
- **Second person, human tone.** Talk to the user ("you"), be respectful, never condescend
  or blame.

## Labels and microcopy that guide action

- **Action-oriented, specific button labels** that name the outcome: "Save changes,"
  "Delete 3 files," "Send invite" — not "OK," "Submit," "Yes." A user should predict what a
  button does from its label alone.
- **Descriptive links** ("View billing history"), never "click here" or a bare URL — this
  also helps screen-reader users navigating by link.
- **Headings and labels that describe content/purpose**, so people scanning know where they
  are and what a field wants.
- **Helpful hints** for inputs (format, why you're asking) placed *before* the field, not
  only as an after-the-fact error.

## Design the "in-between" states (don't leave voids)

These are the states developers forget and users hit constantly:

- **Empty states**: explain what goes here and give a clear first action ("No projects yet —
  create your first one"), not a blank screen.
- **Loading states**: show progress/skeletons; for long waits, say what's happening and
  roughly how long. Never an ambiguous frozen screen.
- **Success/confirmation**: confirm the action completed and, where useful, what to do next.
- **Error states**: see `error-prevention-and-recovery.md` — plain-language, specific,
  actionable.
- **Zero results**: suggest how to broaden/adjust, don't dead-end.

## Make content scannable

- **Front-load** the most important information (the point first, details after).
- Use **headings, short paragraphs, and lists**; break walls of text.
- **Chunk** related info; one topic per section.
- Highlight key actions/info visually — but don't emphasize everything (then nothing stands
  out).

## Inclusive, respectful language

- Use inclusive, people-first, neutral language; avoid idioms and cultural references that
  don't translate.
- Don't assume gender — use "they" where a person's pronouns are unknown.
- Localize/internationalize thoughtfully: allow for text expansion in other languages, don't
  hard-code concatenated sentences, format dates/numbers/currency per locale.
- Never blame or shame the user in copy, especially in errors ("That code didn't work,"
  not "You entered an invalid code").
