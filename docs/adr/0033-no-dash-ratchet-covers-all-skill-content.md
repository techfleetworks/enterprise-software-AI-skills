---
status: "accepted"
date: 2026-10-12
decision-makers: mdenner
---

# Extend the no-dash gate to all skill content, and remove the dashes it was not watching

## Context and Problem Statement

The house style is "no em or en dashes anywhere," enforced by the `house-style-no-em-dash` rule in
`arch-gate.config.json`. But that rule's `include` list was a per-file ratchet that, for most skills, listed
only the skill's `SKILL.md`. The post-rewrite re-audit found the consequence: the `SKILL.md` files were clean
while their reference docs, scripts, scenarios, and some assets were not. The sweep that followed removed 1,338
em, en, figure, horizontal-bar, and minus characters across 113 files, plus a mojibake-corrupted gate script
(`check-alert-hygiene.mjs`, whose dashes were double-encoded and printed garbage to CI logs) and a generator
(`bdd-lib.mjs` `renderIndexMd`) that emitted a dash into every downstream index. CI stayed green through all of
it because the gate was not looking. A rule that depends on remembering to add each file to a list is not a
rule; it is a habit.

## Decision Drivers

* Make the no-dash standard structurally enforced, not a per-file ratchet someone has to extend by hand.
* Remove the dashes that already shipped, at the root, including the mojibake and the generator.
* Do not break the tests or gates that legitimately need a dash character as a detection fixture.

## Considered Options

* **Replace the per-file include list with globs covering all skill content and the front-door files**, and
  sweep every dash out of that scope.
* Keep the per-file ratchet and just add the missing files. Rejected: it is the same fragile pattern that
  caused the gap, and the next new file would slip through again.

## Decision Outcome

Chosen option: globs. `house-style-no-em-dash`'s `include` is now `.claude/skills/**/*.md`,
`.claude/skills/**/*.mjs`, `.claude/skills/**/*.feature`, `.claude/skills/**/*.json`, `always-on/**/*.md`,
`always-on/**/*.mjs`, `README.md`, `CONTRIBUTING.md`, `CLAUDE.md`, and the two `docs/*/README.md` front-door
files. A dash anywhere in that scope now fails the gate. All 1,338 existing dashes in scope were replaced with
ASCII (em and horizontal-bar to a spaced hyphen, numeric en-dash ranges to a hyphen, minus to a hyphen), the
mojibake was fixed, and the `renderIndexMd` generator no longer emits one.

De-dashing the `BUILTIN_CHECKS` rule-name labels in `arch-gate.mjs` (for example "report - pick one") changed
the strings that waivers match on. That is the correct direction (an em dash in a match key is fragile, which
the test suite proved by failing), and the three hardcoded references in `test/arch-gate.test.mjs` were updated
to the ASCII labels. This is a minor rule-name change recorded here for anyone whose waivers referenced the old
label.

Deliberately out of scope, each for a reason: `vendor/` (CC-BY-SA upstream text, kept verbatim),
`discriminate-fixtures/` (intentionally bad code for the mutation test), app-managed `worktrees/`, `test/**`
(some tests deliberately contain a dash character as a detection fixture, for example `arch-gate-wired` plants
one to prove the gate catches it; the one test that hardcoded a rule-name label was fixed), and `docs/adr/**`
plus `docs/arch-reviews/log.jsonl` (historical records whose evidence ledgers quote tool output where a dash
can be real data). New ADRs are written dash-free by hand.

### Consequences

* Good, because the no-dash guarantee is now real across all skill content instead of just the `SKILL.md`
  line, and a future dash in a reference file, script, scenario, or config fails the gate.
* Good, because the mojibake and the dash-emitting generator are fixed, so CI logs and downstream indexes are
  clean.
* Bad (minor), because the built-in rule-name labels changed (dash to hyphen); a pre-existing waiver that
  referenced the old label text must update the label. This is pre-v1.0.0 and the labels are internal.
* Neutral, because the sweep is large (113 files) but almost entirely comments, human-facing output strings,
  and prose; the full test suite is the proof it changed no behavior.

### Confirmation

The sweep's own verifier reports zero dashes remaining in scope and every JSON still parses.
`npm run check:architecture` scans 407 files and exits 0 under the expanded ratchet. `npm test` is 360 pass, 0
fail, 11 skipped (the skipped are the bash-only ADR tests). `test/arch-gate-wired.test.mjs` was updated so its
`REQUIRED_INCLUDE` guard matches the new globs; its per-entry test plants an em dash under every include glob
and asserts the live gate fails, so the expanded coverage is itself discriminating-tested and cannot be
silently gutted. The one behavioral change the sweep caused (the rule-name labels) was caught by the existing
waiver test and fixed, which is the test suite doing its job.

Evidence ledger:

| Claim | State | Source | Limitation |
|------|-------|--------|-----------|
| Zero dashes remain in the swept scope | proven | sweep verifier output; `check:architecture` exit 0 over 407 files | Scope excludes test/, docs/adr, log.jsonl, vendor, fixtures by design |
| The sweep changed no behavior except the rule-name labels | observed | `npm test` 360 pass 0 fail after the one label-reference fix | Tests cover what they cover; a string used in logic with no test could still differ |
| The expanded ratchet is enforced and cannot be gutted | proven | `arch-gate-wired.test.mjs` per-entry planted-dash test over every include glob | Guards the committed config, not live CI runners |
| The mojibake and generator dash are fixed | proven | sweep replaced them; `check-alert-hygiene` and bdd gates pass | - |

## More Information

Follows ADR-0015 (the house-style gate) and the post-rewrite re-audit. The remaining re-audit findings (real
bugs, honesty corrections, content cleanup) ship in the following PRs.
