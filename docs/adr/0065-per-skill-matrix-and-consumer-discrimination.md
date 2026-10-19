---
status: "accepted"
date: 2026-10-18
decision-makers: mdenner
---

# One CI check per skill (a manifest-driven matrix), and the consumer runs the discrimination tests

## Context and Problem Statement

The scaffolded consumer workflow ran every gate in one job, which created two gaps:

1. **No per-skill visibility.** A reviewer saw a single `enterprise-gates` check; to learn which gate failed
   they had to open the log. The original intent for this program was "one CI check per skill," generated
   automatically so it cannot drift from the gate set.
2. **The consumer ran the gates, but not the gate TESTS.** Each gate ships a discrimination test that proves
   it actually detects (fails when the gate is neutralized). Those tests run in the upstream repo's CI and, via
   the CONSUMER-TESTS meta-test, are proven to pass in a bootstrapped consumer here. But the consumer's own CI
   never ran them, so a copied gate that was quietly made vacuous in a consumer would pass its own check with
   nothing to catch it.

The constraint: the single required status check must stay **drift-proof**. The aggregator already is (it runs
whatever the manifest lists), and we must not replace it with N per-gate required checks that would need a
branch-protection edit every time the gate set changes.

## Decision

Rework the scaffolded workflow into a manifest-driven matrix with one required summary check, and run each
gate's discrimination test in the consumer.

1. **`gate-matrix.mjs`** (new machinery) reads the manifest and prints the gate ids as a JSON array. It fails
   closed on a bad or empty manifest, so a broken manifest errors rather than emitting an empty matrix that
   would run zero checks and look green. The matrix is derived from the manifest, never hand-listed, so it
   cannot drift from the gate set.
2. **`run-manifest-gates.mjs --only <id>`** runs a single gate, reusing every per-gate safeguard the aggregator
   already has (within-repo path check, strict invoke validation, lane handling, fail-closed). An unknown id
   fails closed (the matrix is out of sync with the manifest).
3. **The workflow** is three jobs: `setup` emits the matrix; `gate` runs once per gate (a matrix over the
   emitted ids) and in each run executes that gate via `--only` AND its discrimination test
   (`node --test test/<id>.test.mjs`) in the consumer; `enterprise-gates` `needs` every matrix job and is green
   only if they all succeeded. Each gate becomes its own check line (visibility), and because the matrix is
   generated from the manifest, every gate the manifest lists gets a check line automatically on every run.
4. **`enterprise-gates` (the summary job) stays the single required status check**, not the per-gate jobs.
   It is green iff every manifest gate passed, and it stays correct as the gate set changes, so no
   branch-protection edit is ever needed when a gate is added or removed. The per-gate jobs are visibility;
   the summary is enforcement.

## Consequences

* A reviewer now sees one check per skill (`gate (owasp-lints)`, `gate (arch-gate)`, …) and can tell at a
  glance which failed, while the single required check stays drift-proof. Verified end to end: genesis a
  consumer, and `gate-matrix.mjs` emits all eleven gate ids there, `run-manifest-gates.mjs --only <id>` runs a
  single gate, and the workflow carries the matrix, the `--only` run, the per-gate test step, and the
  `needs`-all summary.
* The consumer's own CI now runs each gate's discrimination test, so a copied gate that was neutralized in a
  consumer is caught there, not only upstream. The manifest guarantees each gate ships a test and genesis
  copies it, so a missing test file in the consumer is treated as a real problem (the step fails), not skipped.
* Cost: the matrix runs N jobs instead of one, each doing its own checkout and setup. Each gate still runs
  exactly once (no double execution), and `fail-fast: false` lets every gate report rather than stopping at the
  first failure. This is more CI minutes for clearer per-skill signal; acceptable for the "unskippable and
  visible" goal.
* Honest limitation: the per-gate check lines are informational. The enforcement is the one required summary
  check. Making each per-gate job a required check would literally satisfy "one required check per skill" but
  would reintroduce exactly the drift this design avoids (every gate added or removed would need a
  branch-protection change), so it is deliberately not done. Whether `enterprise-gates` is actually marked
  required in branch protection is a separate, still-unenforced step; closing that is the next change (a
  ruleset self-check).
