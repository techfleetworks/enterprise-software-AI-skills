---
status: "accepted"
date: 2026-10-15
decision-makers: mdenner
---

# One manifest-driven aggregator runs the gates under a single required check

## Context and Problem Statement

ADR-0041 made `gate-manifest.json` the source of truth for which gates must exist, and ADR-0042 added
the parity gate that proves a repo's committed gates match it. What is still missing is the thing that
actually RUNS those gates in CI under one status check. Without it, a consumer repo would have to wire a
separate required status check per gate (the central-list problem: branch protection edited on every
gate change), or run gates in an ad-hoc script that drifts from the manifest.

## Decision Drivers

* One required status check, so adding or removing a gate in the manifest never changes branch
  protection (it is touched once, at genesis).
* Manifest-driven: the aggregator runs exactly the gates the manifest lists, nothing more or less.
* Required gates block; advisory gates report without blocking, so a repo can adopt a gate in observe
  mode before it gates.
* Fail closed: if the aggregator cannot run what the manifest promises, it must not report green.

## Considered Options

* **One manifest-driven aggregator (chosen).** A single required check runs every listed gate.
* **A required status check per gate.** Rejected: branch protection must be edited for every gate
  added or removed, the exact central-list churn the manifest design avoids.
* **A hand-written aggregator workflow listing each gate.** Rejected: it drifts from the manifest and
  is a second source of truth for "what runs."

## Decision

Add **`run-manifest-gates.mjs`** (AGGREGATOR-001, in the `judge-arch` skill). It reads the manifest and
runs each gate script (node for mjs/cjs/js, bash for sh), resolving each relative to the manifest and
refusing a path that escapes the repo. A `required` gate that exits non-zero fails the aggregator
(exit 1); an `advisory` gate that fails is reported but does not block. It fails closed (exit 2) when
the manifest is missing or malformed, or when a listed gate's script is missing or escapes the repo
(it cannot run what the manifest promised). A consumer wires this one script as the single
`aggregator.requiredCheck` from the manifest. It is pinned by `test/run-manifest-gates.test.mjs`, which
builds fixture repos with passing and failing gates and asserts every exit path.

This PR ships the aggregator and its test. The **provenance** gate (the committed manifest matches the
published upstream release) is the remaining enforcement-core piece; it needs an upstream-truth design
(where the canonical upstream manifest for a version lives), so it is a separate ADR and PR.

## Consequences

* The manifest becomes executable: the parity gate proves the committed gates match it, and this
  aggregator runs them under one required check.
* Advisory lane enables progressive adoption: a new gate can run and report before it blocks.
* Known limit: gates are run with no runtime arguments. A gate needing inputs (such as a changed-file
  list) is not yet expressible in the manifest; an `args`/`requires` field is a future schema addition,
  and that limit is stated rather than hidden.
