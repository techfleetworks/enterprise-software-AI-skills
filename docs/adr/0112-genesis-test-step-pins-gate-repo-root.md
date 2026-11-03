---
status: "accepted"
date: 2026-11-02
decision-makers: mdenner
---

# 0112 - The generated discrimination-test step pins GATE_REPO_ROOT

The enterprise gate scripts resolve their default repo root by walking **four levels up** from the
script. That is correct for a gate's *upstream* home (`.claude/skills/<skill>/scripts/`), but in a
consumer the gate is vendored at `scripts/ci/`, where four levels up overshoots the repo and lands on
the runner's parent work directory, which holds `_actions/` (GitHub's downloaded-action cache). The
`esk-genesis`-generated workflow already sets `GATE_REPO_ROOT` on the **gate-run** step to pin the root
to the checkout, but it omitted that env on the **discrimination-test** step. A gate spawned by its test
with no `--root` (the `reference-links` "real repository has no dangling references" case) then fell back
to the four-levels-up default, scanned `_actions/`, and failed CI on dangling links inside a downloaded
action's own README.

Every consumer had to hand-patch this after each genesis (job-decoder tracked it as its own ADR-0034).
The fix belongs in the generator template, not in each consumer.

## Context and Problem Statement

- `[observed]` `check-reference-links.mjs` resolves its root as `--root > GATE_REPO_ROOT > REPO_ROOT`
  (the four-levels-up default). The default is right upstream, wrong in a consumer.
- `[observed]` In the generated `enterprise-gates.yml`, the gate-run step set `GATE_REPO_ROOT`; the
  discrimination-test step set only `GATE_DIR`.
- `[observed]` The `reference-links` discrimination suite includes a real-repo case that spawns the gate
  with no `--root`, so it inherited the test step's env and fell back to the overshooting default.
- `[observed]` The planted-violation discrimination cases each pass their own `--root` or set
  `GATE_REPO_ROOT` per spawn, so they are unaffected by the test-step env.

## Considered Options

- **Option 1: set `GATE_REPO_ROOT` on the generated discrimination-test step**, matching the gate-run
  step. One template line; the real-repo case then scans the consumer checkout only.
- **Option 2: make each gate's root resolution layout-robust** (walk up to the nearest `.git`).
  Stronger, but it changes every vendored, hash-and-provenance-bound gate script and is a larger, riskier
  surface; the env pin is sufficient and localized to the generator.
- **Option 3: leave it to consumers to hand-patch** (the status quo). Rejected: it re-reds CI on every
  consumer that forgets, and it must be re-applied after every re-genesis (exactly the burden ADR-0034
  documents).

## Decision Outcome

Chosen: **Option 1.** Add `GATE_REPO_ROOT: ${{ github.workspace }}` to the generated
discrimination-test step's env, beside `GATE_DIR`, so a gate spawned by its test with no `--root`
resolves the repo root to the checkout. This retires the per-consumer hand-patch (ADR-0034 in job-decoder
becomes historical once that repo re-genesis's from a release carrying this fix).

### Confirmation

- `test/esk-genesis.test.mjs` gains **GENESIS ADR-0112**: it asserts `GATE_REPO_ROOT` appears inside the
  generated discrimination-test step's own `env:` block (not merely somewhere in the file, which the
  gate-run step already satisfies).
- Mutation-proven non-vacuous: with the template line removed, the test fails with "the
  discrimination-test step must set GATE_REPO_ROOT in its own env block"; restored, the suite is 50/50.

## Consequences

- A freshly genesis'd or reconciled consumer gets a workflow whose discrimination-test step scans the
  consumer repo only, with no hand-patch.
- **Honest limits:**
  - This pins the env rather than making the gate's root resolution layout-robust (Option 2). A gate run
    by some *other* path that still relies on the four-levels-up default remains the deeper, untouched
    issue; the generated workflow no longer triggers it.
  - Consumers already genesis'd before this fix still carry their own hand-patch (or lack it); they pick
    up the template fix only by re-genesis from a release that includes it.

## More Information

- Builds on ADR-0069 (v1.2.1 added `GATE_DIR` to this same step) and ADR-0047 (genesis).
- Retires the consumer-side hand-patch documented in job-decoder's ADR-0034.
