---
status: "accepted"
date: 2026-10-16
decision-makers: mdenner
---

# The skills repo's own gate-manifest.json is the single upstream source of truth, kept drift-proof

## Context and Problem Statement

Genesis installs the bootstrap-v2 gates into a consumer repo. It needs a source of truth for *which*
gates exist, what each one's trusted content is, and which skill each belongs to. ADR-0041 defined the
`gate-manifest.json` format; ADR-0044 made provenance compare a consumer's manifest against the
published upstream release. But there was no committed upstream manifest in this repo for genesis to copy
from, for the release to publish, or for provenance to compare against. The open question was where that
upstream truth lives.

Two shapes were possible. Either one manifest is the single owner of "what gates exist" (and everything
derives from it), or a second artifact (a prebuilt genesis bundle) carries the gate list alongside the
manifest. The latter is two lists that must be kept in sync, which is the exact drift this whole program
exists to kill. But a single manifest is only fail-proof if it cannot silently diverge from the actual
gate code it names: a `sha256` in a JSON file is only as trustworthy as whatever checks it.

## Decision Drivers

* One owner for "what gates exist" (the data-ownership rule): the manifest provenance checks, the release
  publishes, and genesis copies from must be the same artifact, so there is nothing to keep in sync.
* Structurally impossible to drift: adding a shipped gate without manifesting it, or letting the manifest
  name content the code does not actually have, must be a red state, not a latent hole.
* Bidirectional: catch both "the manifest lists a gate the code does not declare" and "the code declares
  a gate the manifest does not list."
* Dogfooded and dependency-free, consistent with the sibling gates.

## Considered Options

* **One committed `gate-manifest.json` as the single truth, guarded by an integrity gate (chosen).**
* **A prebuilt genesis bundle beside the manifest.** Rejected: a second copy of the gate list, so the
  bundle and the manifest drift; it reintroduces the two-sources-of-truth failure mode.
* **Trust the manifest's `sha256` with no source-side check.** Rejected: the manifest could then name
  content the shipped code does not have, and nothing at the source would notice.

## Decision

Commit a root **`gate-manifest.json`** that lists the three shipped gates (parity, provenance, presence)
as `upstream`-origin gates and the aggregator as `machinery`, each with the `sha256` of its real source
script and the test that pins it. This is the one upstream truth: provenance compares a consumer's copy
against it, the release will publish it, and genesis will copy from it.

Make it impossible to drift with two mechanisms:

1. **Self-declaring markers.** Each shipped script carries a comment marker, `bootstrap-v2-gate: <id>` or
   `bootstrap-v2-machinery: <id>`. The marker is the code declaring, in the code, that it is a shipped
   gate and under which id.
2. **`check-upstream-manifest-integrity.mjs`** (UPSTREAM-INTEGRITY-001), which proves the manifest and
   the marked source agree bidirectionally: every manifest upstream gate and machinery entry has a source
   that exists, carries the matching marker, hashes to the recorded `sha256`, and names a test that
   exists; and every marked source script is listed in the manifest under that id. A mismatch in either
   direction exits 1; a missing/unparseable manifest or unreadable skills dir fails closed (exit 2).

This also extends the manifest schema (ADR-0041) with an optional `machinery` array, so the aggregator's
integrity is covered at all three layers, not only the gates: the upstream-integrity gate hash-checks it
here at the source, and the parity gate (script versus manifest) and the provenance gate (manifest versus
the published release) hash-check it in a consumer. A neutered aggregator is therefore a red check on
both sides, not a silent hole. repo-local gates (adopted by a consumer, not shipped from here) are skipped
by the integrity gate, since they have no upstream source in this repo.

The integrity gate is pinned by `test/upstream-manifest-integrity.test.mjs` (15 cases), and the schema
test now validates the committed root manifest and the `machinery` shape. The integrity gate was
confirmed to discriminate (8 of 15 cases go red when it is neutralized to never report drift).

## Consequences

* There is now one upstream manifest, and it cannot silently diverge from the gate code: a hash change, a
  new shipped gate, a removed marker, or a missing test is a red check at the source of truth.
* Genesis (a later PR) reads this manifest and copies the marked scripts into a consumer's `scripts/ci/`,
  verifying the `sha256` on copy. Provenance already compares a consumer's manifest against it.
* Known limitation: the integrity gate proves the manifest matches the source *content*; it does not
  prove the gates are well-designed or that a consumer wired the aggregator as a required check (that is
  provenance, presence, and branch protection). It is the source-side drift guard, one layer among the
  set.
* Known limitation: this repo is the upstream author, so its gates live under `.claude/skills/.../scripts/`
  while the manifest records the consumer layout (`scripts/ci/...`). The integrity gate maps between them
  by the manifest's `skill` field and the script basename; a gate whose source basename is renamed must
  update the manifest in the same change (the gate catches it if not).
* The release-publish of this manifest as an immutable asset, and wiring the gates into this repo's own
  CI, remain their own changes (gated on the repo-settings sign-off noted in ADR-0044).
