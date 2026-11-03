---
status: "accepted"
date: 2026-11-02
decision-makers: mdenner
---

# 0111 - esk-genesis carries testSha256 through to the consumer manifest

`manifest-provenance` (ADR-0085 and its predecessors) verifies a consumer's committed
`gate-manifest.json` against the published upstream release manifest, and it requires **both** the gate
script's `sha256` **and** the discrimination test's `testSha256` to match. `esk-genesis` generates that
consumer manifest by projecting the upstream source gates, but the projection omitted `testSha256`. So
the manifest produced by the official generator failed the official provenance gate on every gate, with
`testSha256 undefined != published ...`. v1.3.2 shipped this defect: a repo genesis'd with v1.3.2 cannot
pass its own provenance check.

## Context and Problem Statement

- `[observed]` The source `gate-manifest.json` pins `testSha256` on all 11 upstream gates (for example
  `reference-links` → `498932b9...`). The field is authoritative and per-gate.
- `[observed]` `check-manifest-provenance.mjs` compares the committed manifest to the fetched release
  asset and fails when `testSha256` differs, including when the committed value is `undefined`.
- `[observed]` In `esk-genesis.mjs`, the `consumerManifest.gates` projection copied
  `id, origin, skill, script, sha256, test, lane, invoke?, couples?` but not `testSha256`. The generated
  consumer manifest therefore had `sha256` present and `testSha256` absent on every upstream gate.
- `[observed]` The vendored discrimination test files copied by genesis are byte-identical to the
  release (job-decoder's `test/reference-links.test.mjs` hashes, CRLF→LF normalized, to the release's
  pinned `testSha256`). So the failure was purely the missing manifest **field**, not tampered tests.

## Considered Options

- **Option 1: project `testSha256` verbatim from the source gate, guarded by an optional spread.**
  One line, mirrors how `sha256` and the already-optional `invoke`/`couples` are projected. A gate that
  legitimately predates `testSha256` simply omits it, matching the source.
- **Option 2: project `testSha256` unconditionally and hard-fail genesis if a source gate lacks it.**
  Stronger (a missing `testSha256` upstream becomes a loud genesis error rather than a later provenance
  failure), but it couples genesis to an invariant that `skill-gate-parity` and the release process
  already own upstream, and it would block genesis from an older source that is otherwise valid.
- **Option 3: hand-add `testSha256` to each consumer manifest after genesis.**
  Rejected: it diverges every consumer from the generator output, must be re-applied on every
  re-genesis, and leaves the generator itself broken for the next repo.

## Decision Outcome

Chosen: **Option 1.** Add `...(g.testSha256 ? { testSha256: g.testSha256 } : {})` to the upstream-gate
projection, immediately after `sha256`, so the consumer manifest is provenance-complete and the field
tracks the source. The optional spread keeps genesis working against a source gate that has no
`testSha256` yet (an older gate), which `invoke` and `couples` already do.

The source manifest remains the single owner of `testSha256`; the consumer manifest is a generated
projection of it, never an independently maintained copy — re-running genesis re-derives it.

### Confirmation

- `test/esk-genesis.test.mjs` gains **GENESIS ADR-0111**: after genesis, every upstream gate in the
  generated consumer manifest has a 64-char `testSha256` equal to the source's. The synthetic fixture
  now pins `testSha256` on gate entries so this is checkable.
- Mutation-proven non-vacuous: with the projection reverted, the new test fails with
  `testSha256 must be carried through, got undefined`; restored, the full suite is 49/49.
- End-to-end: a repo re-genesis'd with the fixed generator produces a manifest whose `testSha256`
  values match the published release, so `manifest-provenance` passes (verified on the job-decoder
  consumer as the first adopter).

## Consequences

- A repo genesis'd (or reconciled) with the fixed generator passes `manifest-provenance` without any
  hand-editing of its manifest.
- **Honest limits:**
  - The optional spread means a source gate that is *missing* `testSha256` yields a consumer gate with
    no `testSha256`, which would then fail provenance in CI rather than at genesis time. That trade-off
    is deliberate (Option 2 rejected): the completeness of the source manifest is owned upstream by the
    release process and `skill-gate-parity`, not by the consumer generator. If source-completeness
    regresses, it should be caught there, not papered over here.
  - Consumers already genesis'd with v1.3.2 (before this fix) still carry a `testSha256`-less manifest;
    they are corrected by re-running the fixed generator, not automatically.

## More Information

- Builds on ADR-0085 (provenance pins the required check / manifest verification) and ADR-0047 (genesis).
- First adopter: the `job-decoder` consumer (its PR #15), which surfaced the defect.
