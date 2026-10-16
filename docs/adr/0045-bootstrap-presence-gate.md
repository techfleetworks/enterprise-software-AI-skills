---
status: "accepted"
date: 2026-10-16
decision-makers: mdenner
---

# A presence gate keeps the genesis machinery skeleton from being silently removed

## Context and Problem Statement

Bootstrap-v2 genesis installs a machinery skeleton into a consumer repo: `gate-manifest.json` (the
source of truth), `.github/workflows/enterprise-gates.yml` (how the gates run under one required check),
and the parity gate (the drift enforcer). The enforcement-core gates (parity ADR-0042, aggregator
ADR-0043, provenance ADR-0044) all assume that skeleton exists. But genesis is a one-time bootstrap, and
nothing stops a later PR from deleting the manifest, the workflow, or the parity gate and quietly
turning enforcement off. Parity cannot catch this: with no manifest it fails closed with a confusing
message, and if the workflow is deleted the gates do not run at all, so there is no red check to see.
This is the `@genesis @presence-check` red path in `features/genesis.feature`, which names
`check-bootstrap-presence` but does not build it.

## Decision Drivers

* The skeleton's continued presence must itself be a gate, so de-bootstrapping a repo is a visible red
  state rather than a silent hole.
* It must complement parity, not duplicate it: parity already checks that every gate the manifest lists
  is present and unmodified; this gate checks the smaller skeleton that must exist before parity can run
  at all.
* Dependency-free and offline (a presence check), consistent with the sibling gates.
* Fail closed: if the repo cannot be read, that is "cannot verify," never a pass.

## Considered Options

* **A dedicated presence gate for the three skeleton files (chosen).** Minimal, deterministic, and it
  runs even when the manifest is gone (so it catches exactly the case parity cannot).
* **Fold the check into the parity gate.** Rejected: parity's first act is to read the manifest, so a
  deleted manifest makes parity fail closed with a message about a missing manifest rather than a clear
  "the repo is no longer bootstrapped." The two checks answer different questions and should stay
  separate.
* **Check every gate the manifest lists here too.** Rejected as duplication: that is precisely parity's
  job. This gate deliberately checks only the skeleton; the other gates are verified present by parity.

## Decision

Add **`check-bootstrap-presence.mjs`** (BOOTSTRAP-PRESENCE-001, in the `judge-arch` skill). It verifies
three paths exist as regular files in the consumer repo: `gate-manifest.json`,
`.github/workflows/enterprise-gates.yml`, and `scripts/ci/check-skill-gate-parity.mjs`. It reads no
content and executes nothing. Exit 0 = all present; exit 1 = one or more missing; exit 2 = fail closed
(the repo root does not exist or cannot be read). The repo root is the `GATE_REPO_ROOT` seam (a fixture
dir in tests, the real root in CI).

The three files are the minimum skeleton: without the manifest there is nothing to enforce, without the
workflow nothing runs, without the parity gate drift is not caught. The other gates (aggregator,
provenance, and the domain gates) are verified present by the parity gate itself, which checks every
script the manifest lists, so this gate does not re-check them.

It is pinned by `test/bootstrap-presence.test.mjs` (7 cases), which builds fixture repos with and
without each skeleton file and asserts every exit path; it was confirmed to fail on a neutralized gate
(5 of 7 cases go red when the gate is forced never to report a missing file).

## Consequences

* De-bootstrapping a repo (removing the manifest, the workflow, or the parity gate) is now a red check
  rather than a silent loss of enforcement.
* This gate runs even when the manifest is absent, covering the one case parity structurally cannot.
* Known limitation: presence is not integrity. This gate proves the three files exist; it does not prove
  the workflow actually wires the aggregator as a required check (that is branch protection, a repo
  setting) or that the manifest is faithful (that is provenance). It is the skeleton check, one layer
  among the four, not a whole-system guarantee.
* The genesis/reconcile generator that produces this skeleton is a separate change; this PR ships the
  gate that enforces the skeleton's presence, which is independently useful and testable.
