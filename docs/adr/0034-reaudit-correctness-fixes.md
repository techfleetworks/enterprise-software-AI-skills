---
status: "accepted"
date: 2026-10-12
decision-makers: mdenner
---

# Re-audit correctness fixes: make each gate and tool give the right verdict, with a guard

## Context and Problem Statement

The post-rewrite re-audit found four correctness defects where a gate or tool gave the wrong verdict, each
of which had shipped because no test tied the behavior to reality:

* The OWASP `check-security-coverage` config required three `@security` tag strings
  (`@owasp:command-injection`, `@owasp:deserialization`, `@owasp:session`) that do not match the skill's own
  canonical scenarios (`@owasp:os-command-injection`, `@owasp:insecure-deserialization`,
  `@owasp:session-management`). An adopter using the shipped scenarios got a FALSE gate failure on three of
  nine surfaces. No test bound the config's `requireTags` to the shipped scenarios.
* `claim-lint` omitted `proven`, the sixth and strongest evidence state, from its `STATE` regex, so a line
  correctly tagged `proven` was flagged as untagged and the fix message told the author to downgrade it.
* `check-skill-evidence-contract` only checked that the substring `evidence-discipline.md` was present, not
  that the link RESOLVED, so a relative path with one `../` too many (left over from the skills move) passed
  while the link was dead.
* The BDD datastore sync compared bytes including line endings, so a Windows checkout with
  `core.autocrlf=true` read as spurious drift.

## Decision Drivers

* Fix each at the root and add a guard so it cannot recur, not a one-off patch.
* Prefer strengthening the gate over softening the claim where a machine can check it.

## Decision Outcome

* **OWASP tags:** corrected the three `requireTags` to the canonical scenario tags, and added a test that
  asserts every shipped `requireTag` appears on a scenario in the example features, so the config can never
  again drift from the scenarios it points at.
* **claim-lint:** added `proven` to the `STATE` regex, the fix message, and the header, with a discriminating
  test (a `proven`-tagged claim must pass `--strict`).
* **evidence-contract gate:** it now extracts every candidate path ending in `evidence-discipline.md` and
  requires at least one to RESOLVE on disk relative to the skill, not merely appear as a substring. Running
  the hardened gate found a fourth broken reference the manual audit missed (`bdd-comprehensive-testing`, a
  bare inline-code path with no `../`); all four were fixed (three requirements skills, bdd, and ADR-0015). A
  new test proves a non-resolving link fails.
* **EOL:** the datastore sync in `bdd-index-generate` and `check-bdd-coverage` normalizes line endings before
  comparing, so a CRLF checkout no longer reads as drift and the append-only check is EOL-robust.

### Consequences

* Good, because the flagship security gate no longer false-fails a third of its surfaces, the evidence
  discipline recognizes its own strongest state, broken contract links now fail the gate instead of passing,
  and the BDD gates work on Windows adopters.
* Good, because each fix ships with a guard test, so the defect class is caught by CI from now on. The
  hardened link gate already earned this by catching a link the human review missed.
* Bad (minor), because the evidence-contract gate is now stricter: any skill whose contract link does not
  resolve fails, where before a dead link passed. That is the intended tightening; all current skills resolve.
* Neutral, because these are localized bug fixes; the suite is the proof nothing else moved.

### Confirmation

`npm test` is 375 pass, 0 fail, 11 skip (3 new guard tests). `check-skill-evidence-contract` reports 17 of 17
skills compliant with resolving links. `npm run check:architecture` exits 0. Each guard test is
discriminating: it fails against the pre-fix code (the OWASP guard against the old tag strings, the claim-lint
guard against the old regex, the contract guard against the old substring check).

Evidence ledger:

| Claim | State | Source | Limitation |
|------|-------|--------|-----------|
| The OWASP config's requireTags now all match a shipped scenario | proven | new guard test in `test/owasp-security-coverage.test.mjs`; `npm test` | Checks the example features; an adopter tunes their own |
| `proven` is now recognized by claim-lint | proven | new test in `test/claim-lint.test.mjs` | - |
| A non-resolving contract link now fails the gate | proven | new test + the gate catching bdd on the real repo | Resolves on disk; does not verify the target's content |
| The BDD sync is EOL-robust | observed | normalized compare; reasoning about CRLF vs LF | Not run on a live Windows CI runner this session |

## More Information

Follows the post-rewrite re-audit and ADR-0033. The arch-gate stable rule-name IDs (so a label reword can
never again break a waiver key) ship in the next PR; the honesty corrections and content cleanup follow.
