---
status: "accepted"
date: 2026-10-17
decision-makers: mdenner
---

# Copied gate tests locate their gate in either layout, so they pass in a consumer

## Context and Problem Statement

`esk-genesis` copies each gate's **test** into a consumer alongside the gate script (the gate lands at
`scripts/ci/check-<id>.mjs`, its test at `test/<id>.test.mjs`). But every gate test hardcoded the **upstream**
path to the script it exercises:

```js
const GUARD = resolve(process.cwd(), ".claude/skills/judge-arch/scripts/check-skill-gate-parity.mjs");
```

In the upstream repo the gate lives there, so the test passes. In a **consumer** the gate lives at
`scripts/ci/check-skill-gate-parity.mjs`, and `.claude/skills/judge-arch/scripts/...` does not exist — so the
copied test fails to find the gate and errors. The result: a freshly-bootstrapped consumer has a **red**
`node --test`, and the gates' own discrimination tests (the thing that proves the gates can detect) never run
there. A greenfield adoption QA surfaced this.

## Decision

Make each gate test **self-contained and layout-agnostic**: it looks for its gate in the upstream location
**or** the consumer `scripts/ci` location, whichever exists.

```js
const UPSTREAM = resolve(process.cwd(), ".claude/skills/judge-arch/scripts/check-skill-gate-parity.mjs");
const GUARD = [UPSTREAM, resolve(process.cwd(), "scripts/ci/check-skill-gate-parity.mjs")].find((p) => existsSync(p)) ?? UPSTREAM;
```

A shared helper was deliberately **not** used: `esk-genesis` copies each test file on its own, so a test that
imported a helper from the skills repo would break in a consumer that never received the helper. The two-path
resolution is inlined in the three **gate** tests that actually travel to a consumer (`skill-gate-parity`,
`manifest-provenance`, `bootstrap-presence`). If neither path exists it falls back to the upstream path so the
failure message is sensible. The aggregator test (`run-manifest-gates`) is **machinery**, and `esk-genesis`
copies machinery scripts but **not** machinery tests, so that test never lands in a consumer and stays
upstream-only (no consumer-layout branch).

It is pinned by a test in `test/esk-genesis.test.mjs`: genesis the **real** skills repo into a fresh consumer,
then run the copied gate tests with `node --test` **in the consumer** and require exit 0. Before this fix those
copied tests resolved the gate at the upstream path, which does not exist in a consumer, so they failed; now
they resolve it at `scripts/ci`. The copied tests use only Node builtins, so they run without `npm install`.

## Consequences

* A freshly-bootstrapped consumer has a green `node --test`, and the gates' discrimination tests actually run
  there, so a consumer can prove its gates detect (not just that they are present).
* The gate tests stay self-contained (no cross-repo import), which is required because they travel one file at
  a time into consumers.
* No behavior change upstream: the upstream path still resolves first in this repo, so these tests run exactly
  as before here.
* Known limitation: the resolution is by filename at two fixed locations. A consumer that placed a gate
  somewhere other than `scripts/ci` (not what `esk-genesis` does) would still not be found; that is out of
  scope, since the consumer layout is fixed by the generator.
