---
status: "accepted"
date: 2026-10-18
decision-makers: mdenner
---

# A coverage map of what enforces each skill, and a guard that every test actually runs

## Context and Problem Statement

The travelling-gates program made it easy to assume a green board means every skill is enforced. It does not,
and the honest picture was not written down anywhere: some skills travel as CI gates, some have a local gate
that needs consumer input, and some are human judgment with no mechanical check at all (the audit's point C7:
roughly half the skills cannot be gated). Without a stated map, a reader cannot tell which is which, and a new
skill or gate could be added with no record of how it is enforced.

While building the map, a second, concrete problem surfaced: `npm test` lists its test files explicitly, and
three test files added in recent work (`gate-matrix.test.mjs`, `enforcement-nudge.test.mjs`, and the new
`coverage-map.test.mjs`) were never added to that list. They existed and passed when run by hand, but the
required CI `test` job did not run them. That is the exact "a check exists but silently does not run" failure
`verifiable-quality-gates` exists to catch, applied to the tests themselves.

## Decision

Write the coverage map, keep it honest with a test, and guard the test-wiring gap so it cannot recur.

- **`docs/coverage-map.md`** classifies all 16 skills into three tiers: *Travels* (a `gate-manifest.json` gate
  that installs into a consumer), *Local gate* (a real gate that needs consumer input or governs this repo's
  own gate authoring), and *Human review and directive* (judgment no computer can grade). It names the gate(s)
  per skill, lists the 11 travelling gates, and states the honest total: six skills travel, four more have a
  local gate, two more have repo-self gates, and four are human judgment. It says plainly that the judgment
  tier is not a gap to close later.
- **`test/coverage-map.test.mjs`** fails if any skill under `.claude/skills` (other than the bootstrap
  installer) or any manifest gate is missing from the map, so the record cannot drift from reality.
- **`test/all-tests-wired.test.mjs`** fails if any `test/*.test.mjs` on disk is not listed in `package.json`'s
  `test` script, so a test file can never again exist without running in CI. The three missing files are now
  wired in.

## Consequences

* The repo now has a single, honest answer to "what enforces this skill?", and it cannot silently drift: adding
  a skill or a manifest gate without updating the map fails `coverage-map.test.mjs`.
* The test-wiring guard closes a gap that had already bitten: three test files, including the discrimination
  tests for the per-gate matrix and the enforcement nudge, were not running in the required `test` job. They
  run now, and `all-tests-wired.test.mjs` prevents it from recurring. (The `test` job count rose accordingly.)
* Honest limit, stated in the map itself: the gates prove the floors a computer can check; the human-judgment
  tier stays with the directive and the `judge-arch` review. A green board means the floors held, not that the
  work is good. The map does not try to make the judgment skills look automated.
* The map is a record for this repo; it is not a travelling gate. Its accuracy is enforced by the two tests
  above, which run in this repo's required `test` job.
