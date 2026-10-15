---
status: "accepted"
date: 2026-10-15
decision-makers: mdenner
---

# A gate manifest is the single source of truth for skill-to-CI sync

## Context and Problem Statement

Bootstrap v2 (spec in `docs/design/bootstrap-v2/`) keeps a consumer repo's CI gates matched to the
skills it has installed, so that "skills are enforced" is a fact, not a hope. Its behavioral spec
(the `features/*.feature` files) repeatedly assumes a **manifest**: genesis reconciles against it,
`sync-drift` fails when a committed gate's hash diverges from it, `version-updates` moves its pin,
`multi-repo` resolves the pinned version from it, and `malicious-actor` rejects a forged one or an
unsanctioned gate not listed in it. None of that is buildable until the manifest's format is pinned
down. This ADR defines that contract; it does not build the gates that consume it (PR 1 onward).

The manifest must answer, mechanically: which gates must exist, what each one's trusted content is,
which skill each enforces, which file surfaces couple to it, and which single CI check is required. It
is the one artifact the parity gate, the manifest-driven aggregator, and `esk-init` genesis all read.

## Decision Drivers

* One owner for "what gates must exist," so nothing is enforced that the manifest does not name and
  nothing the manifest names can be silently dropped (the data-ownership rule from the four questions).
* Deterministic and diffable: a committed JSON file, content-addressed by per-gate `sha256`, so drift
  and tampering are detectable by comparison, not judgment.
* Versioned: a single pin per repo, so a repo resolves one effective version and upgrades are discrete.
* Minimal and dependency-free to validate, so the parity gate can check it with Node built-ins.

## Considered Options

* **A committed `gate-manifest.json` (chosen).** Declarative, diffable, content-hashed, one pin.
* **Derive the gate set at runtime by scanning `scripts/ci/`.** Rejected: no trusted baseline, so
  tampering or an unsanctioned gate could not be detected (there is nothing to compare against).
* **Encode the gate set in the aggregator workflow YAML.** Rejected: not content-addressed, and it
  conflates "what must run" with "how it runs"; every gate change would edit a central YAML (a
  conflict magnet — the central-list problem that a derived, per-item declaration avoids).

## Decision

Define **`gate-manifest.json`** as the single source of truth, specified by a committed JSON Schema
(`docs/design/bootstrap-v2/gate-manifest.schema.json`) with a worked example
(`gate-manifest.example.json`). The manifest carries:

* `version` — the skills version the consumer repo is pinned to (semver).
* `gates[]` — each with `id`, the `script` path, its `sha256` (trusted content), its discrimination
  `test`, its `lane` (`required` | `advisory`), an `origin` (`upstream` | `repo-local`), the `skill` it
  enforces (optional, since an adopted repo-local guard may enforce no installed skill), and the
  file-glob `couples` that must carry the gate (the coupling rule the receipt gate already uses).
  `origin` lets genesis record a guard the adopter **adopted** (e.g. an existing repo-local guard) as
  distinct from an **upstream**-governed one, so whole-manifest provenance hash-governs only the
  `upstream` entries and a sanctioned repo-local gate is not mistaken for a forged insertion. `id` must
  be unique and map to one `script`; that cross-item uniqueness is enforced by the parity gate, not by
  the schema (JSON Schema cannot express it cleanly).
* `aggregator.requiredCheck` — the one branch-protection status check all gates feed, so adding or
  removing a gate never changes the required-check set.

The schema is the contract; the artifacts that read it are deferred to later PRs: the parity gate
(PR 1), the manifest-driven aggregator (PR 1), `esk-init` genesis/reconcile (PR 2). This PR adds no
gate script, so it ships the schema, the example, and this ADR only. The example is validated against
the schema by a dependency-free shape test so the contract is proven, not merely asserted.

## Consequences

* Every later bootstrap-v2 PR reads this one format; the manifest is the seam between the skills and a
  consumer repo's CI.
* Because gates are content-addressed and allow-listed by the manifest, drift, tampering, and
  unsanctioned gates are all detectable by comparison (what the `sync-drift` and `malicious-actor`
  features require).
* The single `aggregator.requiredCheck` means branch protection is touched once (at genesis) and never
  again as gates come and go.
* Risk: the manifest can drift from reality if nothing enforces it. That enforcement is exactly the
  parity gate (PR 1); until it exists, the manifest is a documented contract, not a live guarantee, and
  this ADR says so plainly.
