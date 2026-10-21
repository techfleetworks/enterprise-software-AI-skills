---
status: "accepted"
date: 2026-10-21
decision-makers: mdenner
---

# One source of truth for the repo's own gates, so the local pre-push and CI cannot silently diverge

## Context and Problem Statement

This repo's own pre-push hook (`.githooks/pre-push`, ADR-0053) ran a HARDCODED list of fast offline gates,
`const GATES = ["check:architecture", "check:links", "check:receipt"]`, and the reason two other `check:*`
scripts were excluded (`check:verbatim` needs the vendored OWASP source, `check:routing` needs the PR diff)
lived only in a code comment. Nothing guarded that list. Add a new `check:*` npm script and forget the hook,
and it silently never runs locally while CI runs it, so a developer gets a green local push and a red CI, or
worse, a gate that runs in neither. There was no single place that says which of the repo's own checks run
where, and no test that fails when that drifts. A consumer agent raised the same class of local-vs-CI parity
gap on its own side (Swerl-AI/swerl_desktop#9); this ADR addresses it for this repo.

## Decision

1. **`self-checks.json` is the single source of truth** for the repo's own `check:*` gates. Each is classified
   `local: true` (safe and complete to run on a fresh clone, so the pre-push runs it) or `local: false` (CI
   only), and every CI-only check states a `reason`.

2. **The pre-push hook reads `self-checks.json`** and runs the `local: true` gates, instead of a hardcoded
   list. It FAILS CLOSED: a missing or malformed `self-checks.json`, or zero local gates, exits non-zero
   rather than pushing with no local check, because a hollow pass is worse than no hook.

3. **`test/self-check-parity.test.mjs` (part of `npm test`, a required check)** asserts the invariant:
   the set of `check:*` scripts in `package.json` equals the set of keys in `self-checks.json` (so a new check
   cannot be added without classifying where it runs, and a classification cannot name a script that does not
   exist); each classification sets a boolean `local` and every CI-only check states a reason; and the
   pre-push hook sources its list from `self-checks.json` rather than a hardcoded `check:*` array. It is a
   discriminating test: adding an unclassified `check:*` turns it red (proven by adding a `check:dummy` script
   and seeing the test fail naming it, then reverting).

This is a repo-self change (the enterprise repo's own `check:*` topology), not a travelling manifest gate:
`gate-manifest.json`'s gate set is unchanged, and no new required check is installed into a consumer. It ships
as the **1.3.0** minor (a new parity capability, not a bugfix); the manifest `version`/`generatedFrom` bump in
lockstep and the 1.3.0 release carries the matching manifest asset for provenance.

## Consequences

* A new `check:*` script cannot be added without deciding and declaring where it runs, so the local pre-push
  and CI can never silently diverge. The exclusions that were a code comment are now committed, machine-read
  data with a stated reason each.
* The pre-push's local gate list is derived from the committed source every run, so it cannot rot out of sync
  with reality, and it fails closed if the source is unreadable.
* Honest limits. This guards the repo's own `check:*` gates (the npm-script layer); it does not by itself
  prove the full CI job graph wires each check (that the `owasp-verbatim` job actually runs `check:verbatim`),
  which stays covered by `required-checks.test.mjs` and the CI workflow. Traveling this parity to a consumer
  (so a consumer's own local hook and CI are held to one list) is future work and is the consumer-side concern
  tracked in Swerl-AI/swerl_desktop#9. The parity test is a repo-invariant guard in `npm test`, following the
  same pattern as `required-checks.test.mjs` and `coverage-map.test.mjs`, not a new registered gate under the
  coverage/discrimination meta-gates.
