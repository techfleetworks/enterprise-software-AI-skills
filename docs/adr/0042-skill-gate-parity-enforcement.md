---
status: "accepted"
date: 2026-10-15
decision-makers: mdenner
---

# The parity gate enforces the gate manifest against a repo's committed gates

## Context and Problem Statement

ADR-0041 defined `gate-manifest.json` as the single source of truth for bootstrap-v2 skill-to-CI sync,
but a source of truth with no enforcer is a suggestion. The merged feature files require that drift is a
red CI state: `sync-drift` fails when a committed gate's hash diverges from the manifest, and
`malicious-actor` rejects an unsanctioned gate not listed in the manifest. This ADR adds the first
artifact that **reads** the manifest and makes those failures real.

## Decision Drivers

* Make drift, tampering, missing gates, and unsanctioned gates detectable by comparison, not judgment.
* Fail closed: a missing or malformed manifest must never pass as "in parity."
* Dependency-free and runnable in any consumer repo (the gate ships from here, runs in the consumer).
* Prove it detects, per verifiable-quality-gates: a committed discrimination test for every exit path.

## Decision

Add **`check-skill-gate-parity.mjs`** (PARITY-001), in the `judge-arch` skill (the enforcement hub,
alongside the receipt, routing, and reference-link gates). It reads `gate-manifest.json` and fails when:

* a manifest gate's `script` is missing,
* a committed gate's `sha256` (computed with `node:crypto`) differs from the manifest's recorded hash,
* a manifest gate names no discrimination `test`, or names one whose file is missing,
* a committed script matching the gate-naming convention (`check-*`, extensions mjs/cjs/js/ts/sh) in the
  gate directory is **not** listed in the manifest (the allow-list),
* a malformed gate entry (id/script/sha256 not strings) fails closed.

Manifest invariants the gate relies on (enforced by the ADR-0041 schema, not re-checked here): `sha256`
is lowercase hex and `script`/`test` paths use exact case. The allow-list scopes to the `check-*`
convention so repo-local helper files in the gate directory are not false-flagged; the deferred
manifest-driven aggregator is what additionally guarantees only manifest-listed gates are ever executed
(defense in depth), so an inert non-convention file is caught by neither running nor passing as a gate.

Exit codes: `0` in parity, `1` drift/missing/unsanctioned, `2` fail-closed (manifest absent, unparseable,
or not shaped like a manifest). Paths are read; nothing is executed. Config is via env seams
(`GATE_MANIFEST_FILE`, `GATE_DIR`, `GATE_GLOB_PREFIX`) so the discrimination test can point it at
fixtures. It is pinned by `test/skill-gate-parity.test.mjs`, which builds throwaway fixture repos with
real and tampered hashes and asserts every exit path.

This PR ships the gate and its test. The manifest-driven **aggregator** (one required check that runs
the manifest's gates) and the **provenance** gate (the committed manifest matches the pinned upstream
release) are the remaining enforcement-core pieces, deferred to a follow-up.

## Consequences

* The manifest becomes a live guarantee in any repo that runs this gate: committed gates cannot drift
  from it, be weakened in place, or have a convention-named gate slipped into the gate directory
  unsanctioned, without a red check.
* The parity gate enforces that every manifest gate names a discrimination test (reinforcing
  verifiable-quality-gates at the manifest layer).
* `id`/`script` cross-item uniqueness (which JSON Schema cannot express, per ADR-0041) is the one parity
  property this gate is positioned to add next; it is not yet enforced here, and that limit is stated.
