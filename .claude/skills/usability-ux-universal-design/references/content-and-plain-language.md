# Content & Plain Language

Words are interface. Labels, buttons, headings, help text, and error messages *are* the UX
for most users - get the words wrong and the best layout still fails. Clear content helps
everyone: non-experts, non-native speakers, people under stress, people with cognitive
differences, and experts skimming quickly.

## Write in plain language

- **Aim for ~8th-grade reading level.** Short words, short sentences, one idea per sentence.
  This isn't "dumbing down" - even experts read plain language faster and prefer it.
- **Active voice, present tense.** "We save your changes automatically," not "Your changes
  are saved automatically." "Enter your email," not "The email must be entered."
- **Avoid jargon and internal terms.** Use the words your users use. If a technical term is
  unavoidable, define it in place. No acronyms without expansion.
- **Be concise.** Cut filler ("please note that," "in order to," "at this time"). Users
  scan; every extra word is friction.
- **Second person, human tone.** Talk to the user ("you"), be respectful, never condescend
  or blame.

## Reports to people, not only UI copy

Plain language is not only for buttons and labels. An agent's own reports to the people it works for are
UI too, and they follow the same rules, with two that are measured:

- **Meet the reading grade the person asked for, measured before sending.** When someone sets a grade (for
  example, "explain this at a 7th-grade level"), measure the draft before you send it. `scripts/readability.mjs`
  reports the Flesch-Kincaid grade of the prose in a draft and, with `--max-grade N`, exits non-zero when the
  draft is above the target:

  ```
  node .claude/skills/usability-ux-universal-design/scripts/readability.mjs draft.md --max-grade 7.9  # link-check:ignore
  ```

  A draft above the target is rewritten into shorter sentences and simpler words, then measured again, not
  sent. Record the score. The script scores the prose only: it skips code blocks, tables, and file paths, so a
  report full of commands is graded on the sentences a person reads. It is a rule-of-thumb syllable estimate,
  so a low grade means short words and short sentences, not that the meaning is clear; the grade is a floor to
  clear, not a finish line.

- **Keep the evidence words when you make it simple.** Simplifying the wording must never change what the
  evidence says: keep the counts and their totals ("12 of 59", not "most"), keep "chosen" versus "random",
  and keep the evidence state. Never turn a fixed or chosen set into tries, odds, or a rate: a grid run once
  each, with no randomness, is "all of them failed", not a count of tries or a rate. That rule is owned by
  `skeptical-audit` (the evidence contract, section 8), which carries the worked example, because it is about
  evidence, not style; it is named here so a plainer rewrite does not quietly break it.

## Labels and microcopy that guide action

- **Action-oriented, specific button labels** that name the outcome: "Save changes,"
  "Delete 3 files," "Send invite" - not "OK," "Submit," "Yes." A user should predict what a
  button does from its label alone.
- **Descriptive links** ("View billing history"), never "click here" or a bare URL - this
  also helps screen-reader users navigating by link.
- **Headings and labels that describe content/purpose**, so people scanning know where they
  are and what a field wants.
- **Helpful hints** for inputs (format, why you're asking) placed *before* the field, not
  only as an after-the-fact error.

## Design the "in-between" states (don't leave voids)

These are the states developers forget and users hit constantly:

- **Empty states**: explain what goes here and give a clear first action ("No projects yet -
  create your first one"), not a blank screen.
- **Loading states**: show progress/skeletons; for long waits, say what's happening and
  roughly how long. Never an ambiguous frozen screen.
- **Success/confirmation**: confirm the action completed and, where useful, what to do next.
- **Error states**: see `error-prevention-and-recovery.md` - plain-language, specific,
  actionable.
- **Zero results**: suggest how to broaden/adjust, don't dead-end.

## Make content scannable

- **Front-load** the most important information (the point first, details after).
- Use **headings, short paragraphs, and lists**; break walls of text.
- **Chunk** related info; one topic per section.
- Highlight key actions/info visually - but don't emphasize everything (then nothing stands
  out).

## Inclusive, respectful language

- Use inclusive, people-first, neutral language; avoid idioms and cultural references that
  don't translate.
- Don't assume gender - use "they" where a person's pronouns are unknown.
- Localize/internationalize thoughtfully: allow for text expansion in other languages, don't
  hard-code concatenated sentences, format dates/numbers/currency per locale.
- Never blame or shame the user in copy, especially in errors ("That code didn't work,"
  not "You entered an invalid code").
