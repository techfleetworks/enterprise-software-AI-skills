---
status: "accepted"
date: 2026-10-11
decision-makers: mdenner
---

# Keep CC-BY-SA verbatim runs out of the MIT per-sheet OWASP files, enforced mechanically

## Context and Problem Statement

The OWASP secure-coding skill carries the exact upstream cheat-sheet text as a gitignored vendored copy
(CC-BY-SA-4.0, fetched by `npm run vendor:owasp`) and writes its guidance as own-words per-sheet files under
`owasp-secure-coding-bdd/references/cheatsheets/`, which ship under the repo's MIT license (ADR-0017). That
split is only license-clean while the own-words files stay own-words. During the Wave 1 content batch, a
session-only QA tool found 10 per-sheet files that had copied runs of 10 or more consecutive words verbatim
from the CC-BY-SA source. That is a real license-hygiene defect: pasting CC-BY-SA prose into an MIT file
relicenses it, which ShareAlike forbids. The detector that caught it lived only in a scratchpad, so nothing
stopped the same mistake from returning across the remaining 12 content waves. We needed the detector to
become a committed, enforced gate.

## Decision Drivers

* Make the Wave 1 mistake impossible to merge again, not merely documented, across every future content wave.
* Prove the gate actually detects the violation, so it cannot silently go blind (verifiable-quality-gates).
* Do not false-flag the things that are legitimately shared: short header or directive strings, code samples,
  and the required attribution citations.
* Keep the gate dependency-free and offline, consistent with the other gate scripts, and fail closed when the
  vendored source it compares against is unavailable.

## Considered Options

* Commit the detector as a gate script, give it a discriminating test, and run it in CI after vendoring the
  source, with an ADR recording the decision.
* Leave the detector as a manual, run-it-yourself tool. Rejected: it stays skippable, which is exactly how the
  Wave 1 files slipped through, and it will not survive a reviewer forgetting to run it.
* Enforce the rule purely through an arch-gate forbid pattern. Rejected: "verbatim overlap with an external
  file" is not a single greppable string; it needs a two-document tokenized comparison, so it is a dedicated
  check, not a regex rule.

## Decision Outcome

Chosen option: "commit the detector as a tested, CI-run gate."

`owasp-secure-coding-bdd/scripts/check-verbatim.mjs` is the gate. For each `done` sheet in the manifest that
has a vendored source, it tokenizes the per-sheet file (minus its `## Sources` citations) and the vendored
source, after stripping fenced code, inline code, and URLs from both, and flags any run of 10 or more
consecutive shared words. It exits 0 when clean (printing how many sheets it compared), 1 when a file has a
long shared run (printing the offending runs), and 2 when it cannot do its job: a missing or empty manifest, a
vendored source directory that is absent or empty, or done sheets that have files but no vendored source to
compare against. That exit-2 fail-closed behavior is deliberate: without the source present the gate would
otherwise pass vacuously and hide the very defect it exists to catch.

Because the vendored source is CC-BY-SA and therefore gitignored, the gate cannot run on a bare checkout. CI
runs it in its own `owasp-verbatim` job that runs `npm run vendor:owasp` first, then `npm run check:verbatim`;
if the fetch is unavailable the vendored directory is absent and the gate exits 2, so the check fails rather
than passing on no data. The dependency-free engine is proven by `test/owasp-verbatim.test.mjs`, which runs in
`npm test` on every push and pull request and does not need the real vendored source (it builds its own
fixtures).

## Consequences

* Good, because a per-sheet file with copied CC-BY-SA prose cannot merge; the Wave 1 defect cannot regress.
* Good, because the gate is honest about what it does not know: no vendored source means fail closed, not a
  green check on nothing.
* Good, because short shared strings, shared code, and attribution citations do not false-flag, so the gate
  stays usable wave after wave rather than training reviewers to ignore it.
* Bad (honest limit), because a 10-word threshold is a heuristic. A copied 9-word run passes, and a long run
  of common technical words could in principle flag. The threshold matches the observed Wave 1 defect and is
  tunable; the boundary is covered by a test so a change to it is a deliberate, visible edit.
* Neutral, because the CI job adds a network fetch (the vendoring step) that the other, offline gates do not
  need, so it runs as its own job on a single Node version rather than in the dependency-free matrix.

### Confirmation

`test/owasp-verbatim.test.mjs` exercises the gate: an own-words sheet passes; a sheet with a 10-or-more-word
run copied from the source fails (exit 1); the 9-versus-10 boundary is asserted both ways, so the threshold is
provably real and not vacuous; a shared run that lives only in `## Sources` or inside a fenced code block does
not flag; a not-done sheet is ignored; a done sheet with no upstream source is skipped while others are still
checked; and every fail-closed path (missing or empty manifest, absent or empty vendor directory, zero
checkable done sheets) exits 2. The test was confirmed to discriminate by the mutation method from
verifiable-quality-gates: replacing the gate with a no-op turned 9 of the 12 tests red, and widening the
threshold by one word turned the boundary test red, both restored after. All of this runs in CI via `npm test`,
and the live gate runs in the `owasp-verbatim` job after vendoring.

## More Information

Builds on ADR-0017 (vendor OWASP text from source, aggregate it under CC-BY-SA, keep it out of the MIT
per-sheet files) and ADR-0016 (the per-cheat-sheet catalog). It is the mechanical enforcement of the license
boundary ADR-0017 established. The gate script lives under `owasp-secure-coding-bdd/scripts/`, so the existing
`no-outbound-web-in-gate-scripts` arch rule already holds it to being offline, and it is; the vendoring tool
that does reach the network stays in `tools/`, outside that rule.
