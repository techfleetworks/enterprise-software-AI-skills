---
status: "accepted"
date: 2026-10-24
decision-makers: mdenner
---

# The generated CI workflow can't be hollowed by a no-op runner, and one upstream fetch error can't red it

## Context and Problem Statement

`esk-genesis` scaffolds `.github/workflows/enterprise-gates.yml` into a consumer: a `setup` job emits the gate
ids, a `gate` matrix job runs each gate (and its discrimination test), and a required `enterprise-gates` summary
job is green only if every matrix job passed. Two consumer-filed issues showed the generated workflow had an
enforcement hole and a reliability flaw.

- **#120 (enforcement hole).** Every gate, including `skill-gate-parity`, ran as
  `node scripts/ci/run-manifest-gates.mjs --only <gate>`. Parity is the gate that pins the runner's own sha256 and
  reports a mismatch as drift/tamper, but it only ever executed THROUGH that runner. Replacing
  `run-manifest-gates.mjs` with `process.exit(0)` makes every "Run gate" step — parity included — exit 0 with no
  output, so a one-file change defeats, in CI, the very tamper detection parity advertises. (The same PR could
  also edit the presence-only-checked workflow, so this adds no new capability; what it defeats is the advertised
  guarantee.)
- **#125 (reliability).** The "Fetch upstream manifest for provenance" step ran in EVERY one of the matrix jobs,
  but only `manifest-provenance` reads the downloaded file. A transient github.com error (429/5xx/refused) failed
  whichever jobs were fetching, and with them the required `enterprise-gates` check — for a file those jobs never
  read — and cost one unauthenticated download per gate where one is needed.

## Decision

Both fixes are to the generated workflow template in `esk-genesis.mjs`; no gate, machinery, or manifest content
changes, so there is no sha/provenance change.

1. **Self-verifying gates run directly, not through the runner (#120).** The "Run gate" step now branches on the
   gate id: `skill-gate-parity` and `manifest-provenance` run their own script
   (`node scripts/ci/check-<gate>.mjs`) directly; every other gate still runs via the aggregator with `--only`
   (keeping its within-repo / invoke / lane / fail-closed safeguards). So a neutered runner no longer makes the
   parity job pass — parity executes its real script and catches the runner's sha drift. The matrix isolates one
   gate per job, so "run parity directly, before any runner use" holds without ordering gymnastics.

2. **Only the provenance job fetches the upstream manifest (#125).** The fetch step gains
   `if: matrix.gate == 'manifest-provenance'`, so a transient fetch error can red at most that one job, and the
   other gate jobs neither depend on nor pay for the download. `curl` gains `--retry 3 --retry-all-errors` to ride
   out a transient error. A 404 still leaves the file absent (provenance fails closed, as designed).

Each is pinned by a discrimination test: the generated-workflow content is asserted (parity/provenance run their
own script; the fetch step is gated and retries), and the vendored-consumer harness proves behaviorally that a
no-op runner is caught by the direct parity invocation while it passes through the runner.

Amends ADR-0065 §3: that record describes the `gate` job as running every gate via `--only` through the
aggregator; from here, the two self-verifying gates (`skill-gate-parity`, `manifest-provenance`) run their own
script directly instead, for the reason above. Every other gate is unchanged.

## Consequences

* A no-op or weakened `run-manifest-gates.mjs` now turns the parity job red in CI, as parity does when run
  directly, so the tamper detection parity advertises actually holds in a consumer's CI.
* A transient upstream outage can fail at most the single provenance job (and retries first), not the whole
  required check, and a run makes one upstream download instead of one per gate.
* Honest limits: this does not close the separate, acknowledged route of editing the workflow file itself — the
  workflow is presence-checked, not content-pinned, in a consumer, so the ultimate backstop remains branch
  protection / CODEOWNERS on the workflow and ruleset paths (a repo-settings step the installer prints but cannot
  make). The direct-run list is the two self-verifying gates by id; a future self-verifying gate must be added to
  that case, which the discrimination test will force by staying specific. Provenance still needs its one network
  fetch, which remains a (now single, retried, fail-closed) external dependency of that job.
