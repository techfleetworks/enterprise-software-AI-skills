# Bootstrap v2: behavioral spec (skill-to-CI sync)

The behavioral specification for bootstrap v2, the system that keeps a consumer repo's CI gates
matched to the skills a dev has installed, with no per-dev guesswork.

## Two kinds of artifact here, on purpose

A skeptical audit of the first draft caught that half of it described **agent behavior** (the agent
"proposes," "warns," "offers"), which is probabilistic and cannot be bound to a pass/fail step. Only
deterministic, observable outcomes (a gate's exit code, a PR's merge state, a file's presence or
hash) are real BDD. So the spec is split:

- **`features/*.feature`**: deterministic **system BDD**. Every scenario has a concrete input and a
  real red path. These are the ones that become gated tests. Actors are the CI gates, the manifest,
  the files, and branch protection, never "the agent."
- **`agent-acceptance-evals.md`**: the **agent-behavior** criteria (propose genesis, warn on skew,
  draft an invariant). These are validated by eval and human judgment, not by a green/red gate. They
  are listed honestly as evals, not disguised as tests.

## Status: built in v1.2 (release pending)

As of v1.2 the core of this spec is built and dogfooded in this repo (the 1.2.0 tag is not cut yet). The manifest, the aggregator, provenance, and the
genesis/reconcile flow all exist, and eight engineering gates plus three self-protection gates travel into a
consumer and run in its CI, surfaced as one check line per gate behind a single required summary check. See
the README section "The checks travel to any repo (v1.2)" and ADRs 0047 and 0056 through 0065.

These scenarios still live under `docs/design/` rather than the top-level gated `features/` directory. The
repo's BDD gates require scenarios in `features/` to actually run; a scenario graduates into the gated
`features/` directory, with real step definitions, as its executable coverage lands. The split below (system
BDD vs agent-behavior evals) still holds.

## The files

| File | Covers |
|------|--------|
| `features/genesis.feature` | one-time bootstrap: reconcile, machinery present, enforcement on only when required |
| `features/daily-development.feature` | a PR is judged by the committed gates; coupling and invariant violations go red |
| `features/sync-drift.feature` | weakening or drifting a gate from the manifest is red |
| `features/version-updates.feature` | a bump moves pin and scripts together; half-applied or orphaned is red |
| `features/multi-repo.feature` | each repo resolves its own pinned version; deterministic generation |
| `features/multi-agent-one-machine.feature` | effective version is read from the repo, not the machine |
| `features/malicious-actor.feature` | unsanctioned gate, smuggled edit, forged manifest, disabled step |
| `features/gate-discrimination.feature` | every gate detects its known-bad, passes its known-good, and its test flips when neutralized |
| `agent-acceptance-evals.md` | the non-deterministic agent behaviors, as evals not gates |

## Deferred (research spike, not here)

The invariant/oracle scenarios (AI-drafted invariants, oracle-binding, property-provenance) are a
labelled research spike per the skeptical audit, gated on first proving an AI-drafted, human-ratified
invariant catches a real bug the drafter did not already know. They land only when that spike opens.
One `daily-development` scenario references an invariant that already exists and was human-ratified;
that is in scope. The autonomous drafting of invariants is what is deferred.
