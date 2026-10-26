---
status: "accepted"
date: 2026-10-24
decision-makers: mdenner
---

# A vacuous gate pass is rendered distinctly from a real one

## Context and Problem Statement

Five gates run with `--allow-empty` (`no-ua-sniffing`, `owasp-lints`, `migration-safety`, `alert-hygiene`,
`untagged-pii`). When nothing in a gate's scope exists (no `.sql` files, no source files, no alert blocks), it
exits 0 and its own log line says so, for example `no .sql files to scan (--allow-empty; whole-repo scope)`. The
aggregate board and the required `enterprise-gates` check, however, printed `✓ <id> exit 0` for a vacuous pass and
a real pass alike (issue #150). So a consumer reading the green board could believe each gate examined their code
when it examined nothing. Two concrete cases: a Python ORM declaring `email`/`phone_number`/`date_of_birth`
passes `untagged-pii` (which reads `.sql` only) without reading anything; and in a genesis-only consumer the two
JS scan gates reported "1 source file scanned" because they counted the installer's own `.githooks/install-hooks.mjs`,
which reads like a scan of application code.

## Decision

1. **The aggregator renders a vacuous pass distinctly.** `run-manifest-gates` now captures each gate's output
   (instead of streaming it through), re-emits it verbatim, and detects the vacuous marker
   `--allow-empty; whole-repo scope` that those gates print on exactly the nothing-in-scope branch (and never on a
   real pass). A vacuous pass is shown as `○ <id> (required) exit 0 vacuous (nothing in scope)` instead of `✓`,
   and the run ends with a note listing the vacuous gates. In GitHub Actions it also emits a `::warning::`
   annotation and appends the note to the job summary, so it is visible in the required check's output, not only
   buried in a gate's own log. A vacuous pass is still a PASS: it does not fail the aggregator and its matrix job
   stays green; it is only reported apart.
2. **The JS scan gates ignore `.githooks`.** `no-ua-sniffing` and `owasp-lints` add `--ignore .githooks` to their
   manifest `invoke`, so the installer's own hook file is not counted as application code. A genesis-only consumer
   then correctly reads as vacuous (nothing of its own to scan) rather than "1 file scanned".

The vacuous signal is the gates' existing marker string, promoted to the documented contract. The contract is
guarded on BOTH sides by tests: `test/run-manifest-gates.test.mjs` pins the aggregator's RENDERING of the marker
(a gate that prints it renders `○ vacuous` with a note; a real pass renders `✓`; a FAILING gate that prints it is
still `✗`, never vacuous), and `test/vacuous-marker-contract.test.mjs` reads the aggregator's actual
`VACUOUS_MARKER` regex and asserts every real `--allow-empty` gate PRODUCES it on a nothing-in-scope pass, so a
reworded gate message (or a changed aggregator regex) that would silently stop the detection fails CI rather than
quietly un-fixing this. `run-manifest-gates` is machinery, so its `sha256` is recomputed in the manifest (parity,
provenance, and upstream-integrity re-verified). Changing the two gates' `invoke` is not a sha change (the script
content is unchanged; provenance pins invoke but passes in the origin/unreleased mode this version is in). No gate
script is edited.

## Consequences

* A reader of the aggregate board or the required check can now tell a gate that examined the code from one that
  found nothing in scope, so a green board is not mistaken for full coverage. The `.githooks` exclusion makes the
  vacuous case honest for a fresh consumer too.
* Honest limits: the aggregator keys on the gates' marker text, so if a gate ever changes that wording the
  aggregator would stop detecting its vacuous pass. That coupling is guarded on both sides:
  `vacuous-marker-contract.test.mjs` asserts every real `--allow-empty` gate still PRODUCES the aggregator's exact
  marker, and `run-manifest-gates.test.mjs` asserts the aggregator RENDERS a marked pass as `○ vacuous`, so a
  drift on either side fails CI rather than silently reverting this fix. The capture-then-reprint change means a
  gate's output appears after it finishes rather
  than streaming live, which is fine for these small, fast gates. This surfaces a vacuous pass; it does not change
  what any gate checks (that is each gate's scope, unchanged here), and it does not turn a vacuous pass into a
  failure (a repo with genuinely no `.sql`/alerts/source still legitimately passes). The related sixth gate,
  `retention-basis`, whose empty pass comes from a missing `--map` rather than `--allow-empty`, is a separate
  issue and is not covered here.
