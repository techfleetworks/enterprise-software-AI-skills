---
status: "accepted"
date: 2026-10-13
decision-makers: mdenner
---

# Make every change carry a grounded, complete receipt of how the skills were applied

## Context and Problem Statement

Selection (a skill's `description` triggers it) and the always-on directive (relevant skills must be
considered) raise the odds the right skill fires, but neither makes an agent SHOW, per skill, what it pulled,
why, and where it applied it. So "did it actually apply the usability skill on this feature?" stays unknowable,
and a reviewer has nothing structured to audit against the diff. mdenner asked for more than "a human must
review": the agents must PROVE they applied the skills, and it must be structurally hard to fake. The honest
constraint is that a gate can prove a receipt is grounded, never that the work was truly or well done.

## Decision Drivers

* Per change, a required, structured, reviewable declaration for every skill, not a vague "skills considered."
* Make a hollow or fabricated receipt mechanically detectable (anti-hallucination by grounding), so the claim
  is expensive to fake and cheap to audit.
* State the irreducible limit plainly and keep the human review mandatory; never let the gate imply it proved
  the work.
* Reuse the repo's existing gate shape (routing, verbatim, arch-review-coverage) so it composes and stays
  dependency-free and offline.

## Considered Options

* **A Specification/Validator (`check-skill-receipt`) over an append-only receipt log, driven by a
  policy-as-data coupling map** (chosen).
* A bespoke per-skill checker (16 near-duplicate checks). Rejected: duplication and drift.
* A database or service keyed off runtime. Rejected: no runtime here, breaks the offline rule, overkill.
* Embedding the record in commit messages. Rejected: not structured, not queryable, not groundable.

## Decision Outcome

Chosen: the validator over an append-only JSONL log. `docs/skill-receipts/log.jsonl` holds one entry per
change (keyed by branch); `check-skill-receipt.mjs` (`npm run check:receipt`) enforces GROUNDING, and
`judge-arch/assets/skill-receipt.config.json` is the single owner of the surface-to-skill coupling map. The
gate verifies, for a change:

* **Completeness** - every skill (derived from `.claude/skills/`, minus `bootstrap`) has an entry with a valid
  status (`applied` or `not-applicable`). A missing skill fails.
* **Anchor existence** - every `applied` entry's anchors resolve to a real heading in a real skill file, and
  the path is rejected if it normalizes outside the skills directory (path-traversal defense).
* **Quote match** - every `applied` entry carries a quote of at least eight exact words that appears verbatim
  UNDER the cited heading (the text from that heading to the next heading of equal-or-higher level, never the
  YAML frontmatter and never a different section). The OWASP verbatim gate in reverse: prove you read THAT
  guidance, not a description an agent sees without opening the body.
* **Diff binding** - every `applied` entry's `where` files are in the actual change diff (when the changed
  list is passed, as CI does, like routing).
* **Routing coupling** - a fired surface rule (a UI change, a new ADR) forces the coupled skill to be
  `applied`, not `not-applicable`.
* **Human-review attestation present** - the receipts directory carries the verbatim banner, and every entry
  has a `humanReviewed` field a human fills. The gate checks presence, never truth.

It fails closed on missing, malformed, or incomplete input, an unknown skill, an invalid status, or an empty
required field, and verifies the log is a clean append to the base revision when `--base` is passed (disclosing
when it was not checked, like `check-arch-review-coverage`).

### Consequences

* Good, because a receipt that passes must name real skill sections, quote them accurately, point at files
  really in the change, and mark every triggered surface `applied`. You cannot fabricate it without doing the
  reading; a silent skip becomes a failing empty cell.
* Good, because it composes with the existing gates: routing says which artifact a change must ship, the
  receipt says what each skill contributed, and the coupling map ties them together.
* Bad (irreducible limit, stated in the banner the gate requires and prints), because grounding is not truth:
  the gate cannot prove the guidance was genuinely or well applied. A grounded-but-shallow receipt can still
  pass, which is exactly why the human review stays mandatory.
* Neutral, because the merge-blocking CI job is deferred to the techfleetnetwork CI/CD release (per the "no new
  CI checks right now" decision); the engine is enforced in-repo via `npm test` now, and the always-on
  directive, `CONTRIBUTING.md`, and the PR template require the receipt.

### Confirmation

`test/skill-receipt.test.mjs` proves the gate DISCRIMINATES: it passes a complete, grounded receipt and fails
each specific way one can be hollow (missing skill, non-existent anchor, fabricated or too-short quote, a file
not in the diff, a fired coupling surface marked not-applicable, a non-append-only edit) and fails closed on
unsafe or malformed input (a traversal anchor, an unknown skill, an invalid status, an empty field, a missing
banner, a malformed log). `npm test` includes it and validates this change's own receipt against the real skill
files. `npm run check:architecture` exits 0.

Evidence ledger:

| Claim | State | Source | Limitation |
|------|-------|--------|-----------|
| The gate detects a fabricated quote, a bad anchor, an incomplete receipt, and a diff-unbound file | proven | discriminating cases in `test/skill-receipt.test.mjs`; `npm test` | Proves the engine on fixtures |
| A quote from the frontmatter or a different section is rejected (the quote is bound to the cited heading) | proven | the frontmatter-quote and wrong-section-quote cases in `test/skill-receipt.test.mjs` | Section is heading-to-next-heading; a quote still only proves the text was read, not applied well |
| A traversal anchor, and a symlink anchor escaping the skills dir, are rejected and never read as grounding | proven | the traversal case (exit 2) + the lexical and `realpathSync` containment checks; the symlink case runs where the OS permits symlink creation | The symlink test skips on a platform that forbids unprivileged symlinks (for example Windows) |
| This change's own receipt is complete and grounded | observed | `node check-skill-receipt.mjs` against the real `.claude/skills` passes | Grounding, not proof the work was well done |
| The gate cannot prove the receipt is true or the work good | documented | the irreducible judgment limit, stated in the banner and printed by the gate | which is why human review is mandatory |

## More Information

Follows ADR-0031 (routing), ADR-0032/0036 (the review workflow and its honest limits), and ADR-0037 (the
dangling-reference gate). The full design, with the dogfooded receipt for its own spec, a pattern selection,
the four questions, and a threat model, is in `docs/specs/skill-application-receipt.md`. The diff-driven
merge-blocking CI job is deferred to the techfleetnetwork CI/CD release.
