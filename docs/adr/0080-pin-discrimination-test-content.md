---
status: "accepted"
date: 2026-10-24
decision-makers: mdenner
---

# A gate pins its discrimination test's content (testSha256), not just the test's path

## Context and Problem Statement

Every gate ships a discrimination test (verifiable-quality-gates: a test that fails when the gate is
neutralized), and the CI workflow runs it in the consumer. But nothing pinned the test's *content*:

- `check-skill-gate-parity` only checked that each gate's `test` file EXISTS (`existsSync`), reading none of it.
- `check-manifest-provenance` compared each gate's `sha256`, `lane` and `invoke` with the release, but not the
  test; the manifest recorded no hash for test files at all.

So (issue #123, observed against the real v1.2.1 release) a consumer PR could replace a gate's discrimination
test with a one-line always-pass test and parity, provenance, and the discrimination-test step all stayed green.
The gate script itself stays hash-pinned, so this alone opens no enforcement hole, but the consumer's
"discrimination test" step then proves nothing, which is exactly the "a green check you can't trust" failure
verifiable-quality-gates exists to prevent.

## Decision

Pin the test's content the same way the gate script's content is pinned, with a `testSha256` per gate, hashed
LF-normalized (ADR-0058) so it verifies on a CRLF or LF checkout alike.

1. **Schema:** add `testSha256` (lowercase-hex) to the gate definition. It is an optional *property* (so the
   schema allows it; its presence is enforced at the source, below), documented as pinning the test content.
2. **Manifest:** every upstream gate carries `testSha256` = the LF-normalized sha256 of its discrimination test.
3. **`check-upstream-manifest-integrity` (the source of truth):** requires `testSha256` on every upstream gate
   and verifies it against the real test file. So the origin cannot ship a gate without a correct test hash, and
   the published release always carries one.
4. **`check-manifest-provenance` (consumer vs release):** compares `testSha256` with the published release, like
   `sha256`. A consumer that hollowed a copied test (and dropped or rewrote `testSha256` to match its hollow
   copy) diverges from the release here; `undefined` vs a present value counts as a mismatch, so it cannot be
   dropped.
5. **`check-skill-gate-parity` (committed scripts vs committed manifest):** when a gate has `testSha256`, hashes
   the committed test file and fails on drift, the same way it fails on a drifted gate script.

Each is pinned by a discrimination test (a hollowed test is flagged by parity, provenance, and integrity; a
missing or wrong `testSha256` is flagged at the source).

## Consequences

* Replacing or hollowing a copied discrimination test is now caught, by the source integrity gate (it must
  match the real test), by provenance (it must match the release), and by parity (the committed test must match
  the pinned hash). The discrimination-test CI step can again be trusted as evidence the copied gates still
  detect.
* Editing a gate's test legitimately now requires recomputing its `testSha256` in the same commit, exactly as
  editing a gate script requires recomputing its `sha256`. The integrity gate enforces this at the source.
* Honest limits: `testSha256` pins that the committed test is byte-for-byte the released one; it does not re-prove
  the test is itself discriminating (that is the test author's job, caught upstream by the mutation gate, not by a
  hash). Scope is gate discrimination tests; machinery `test` entries are not hashed here (machinery is not a gate
  that claims to discriminate, and its script is already hash-pinned), a possible future tightening. The schema
  leaves `testSha256` optional so the contract does not hard-break a pre-existing manifest on parse; presence is
  enforced where it matters, at the origin and against the release.
