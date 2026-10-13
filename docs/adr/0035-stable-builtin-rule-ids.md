---
status: "accepted"
date: 2026-10-12
decision-makers: mdenner
---

# Builtin arch-gate rules match on a stable short id, not their prose label

## Context and Problem Statement

During the dash sweep (ADR-0033) the `arch-gate` built-in check labels were de-dashed, for example "report -
pick one". Those prose labels were also the rule NAME that waivers match on and that the report groups by, so
changing the label silently changed the match key. A waiver (and a hardcoded test waiver) keyed on the old
label stopped matching, which turned a waiver test red. The test suite caught it, but the underlying fragility
remained: a long prose string, edited for wording or style, was load-bearing as a match key, duplicated by
exact text in tests and in any adopter's waivers. Rewording a label should never be able to break a waiver.

## Decision Drivers

* Make the waiver-key regression class structurally impossible, not just caught after the fact.
* Keep the human-readable label in the report (it is good fix guidance).
* Minimize churn: config rules already use a short `name` as their key; only the built-ins used prose.

## Considered Options

* **Use the built-in's existing short key (`emptyCatch` / `swallowReturn` / `keepInSync`) as the rule name**,
  and surface the prose label as the fix message.
* Export the labels as constants so tests import them (single source). Rejected: it fixes the test
  duplication but not adopter waivers, which still key on the prose string.
* Leave it; rely on the test to catch a broken key. Rejected: that is catching the failure, not preventing it,
  and it does not help an adopter whose waiver breaks on a pull.

## Decision Outcome

Chosen option: the stable short id. A built-in violation now records under its short key (the same key used in
`config.builtins` to toggle it), and the prose label is registered in `ruleMessages` so the report prints it as
the `->` fix guidance under the rule id. Waivers for a built-in now key on the short id, for example
`"rule": "emptyCatch"`. Config rules are unchanged (their `name` was already a short, stable id). A label can
now be reworded or de-dashed freely without touching any match key.

### Consequences

* Good, because a label edit can never again break a waiver or a test key; the match key is a short, stable
  token with no prose and no punctuation to drift.
* Good, because the report is actually clearer: it shows the stable id as the heading and the full label as the
  fix guidance, the same shape config rules already use.
* Bad (minor, pre-v1.0.0), because an existing waiver that keyed a built-in on its prose label must change to
  the short id (`emptyCatch` / `swallowReturn` / `keepInSync`). This repo's root config has the built-ins off
  and no such waiver; the change is documented here for any adopter who had one.
* Neutral, because it is a two-line change in the gate plus the test waiver keys.

### Confirmation

`npm test` is 365 pass, 0 fail, 11 skip. A new test asserts a built-in violation groups under the stable id
(`emptyCatch`) while the prose label still appears as the fix message, which is discriminating: against the
old code (record under the label) the output has no `emptyCatch` heading and the assertion fails. The three S6
waiver tests now key on `emptyCatch` and still pass (valid waiver suppresses, expired does not, missing fields
fail closed). `npm run check:architecture` exits 0.

Evidence ledger:

| Claim | State | Source | Limitation |
|------|-------|--------|-----------|
| A built-in's match key is now the stable short id, not the label | proven | new test in `test/arch-gate.test.mjs`; `npm test` | Applies to the three built-ins; config rules already used a short name |
| A waiver on the short id suppresses; expired does not | proven | the S6 waiver tests, now keyed on `emptyCatch` | - |
| The label still reaches the user as fix guidance | observed | the report prints `-> <label>` from `ruleMessages` | - |
| An adopter waiver on the old prose label must update | documented | the change itself; stated above | No such waiver exists in this repo to migrate |

## More Information

Prevents the regression class from ADR-0033. Follows ADR-0015 (the gate) and ADR-0002 (the test harness).
