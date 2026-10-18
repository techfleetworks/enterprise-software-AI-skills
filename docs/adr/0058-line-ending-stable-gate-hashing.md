---
status: "accepted"
date: 2026-10-17
decision-makers: mdenner
---

# Gate content hashes are line-ending-stable (normalized before hashing)

## Context and Problem Statement

The bootstrap-v2 gate system verifies each gate script against a `sha256` recorded in `gate-manifest.json`
(parity, provenance, upstream-integrity, and `esk-genesis` all rely on it). The hashes were computed over the
file's **raw bytes**. A greenfield adoption QA on Linux CI, and a new consumer test, exposed that this is
line-ending-fragile:

- The committed manifest `sha256` values were produced on Windows, where `.mjs` working-tree files are **CRLF**.
- On Linux/CI the same scripts are **LF**, so `sha256(rawBytes)` differs from the manifest value.
- Result: on any LF platform, parity / `esk-genesis` hash-verification **fails for every gate**. Verified:
  `check-skill-gate-parity.mjs` hashed to `8b77…` over CRLF but `9691…` over LF, while the manifest recorded
  `8b77…`.

This had been invisible because this repo ships **no `enterprise-gates` workflow of its own**, so the real
manifest was never hash-checked against the real scripts in CI. The first thing to exercise it (a consumer
test that runs `esk-genesis` from the real repo on CI) failed. The impact is systemic: it breaks the entire
"gates travel to consumers" premise, because consumers run their gates on ordinary (LF) CI runners.

## Decision

Make the content hash **line-ending-stable by construction**: normalize `\r\n` to `\n` before hashing,
everywhere a gate script is hashed. The hash then no longer depends on the checkout's line endings.

```js
const sha256 = (file) => createHash("sha256").update(readFileSync(file, "utf8").replace(/\r\n/g, "\n")).digest("hex");
```

Applied at all three file-hashing sites — `check-skill-gate-parity.mjs`, `esk-genesis.mjs`, and
`check-manifest-provenance`'s sibling `check-upstream-manifest-integrity.mjs` (its marker match still uses the
raw bytes; only the hash is normalized). `check-manifest-provenance` compares stored manifest values to stored
manifest values, so it hashes no files and needs no change. The manifest's four `sha256` values were
regenerated with the normalized hash (the LF value), so they now match on every platform.

Normalize-in-hash was chosen over forcing `eol=lf` via `.gitattributes`: the former is immune by construction,
the latter only works if every clone and tool honors the attribute. A normalized hash is identical for the
CRLF and LF forms of the same content, so it cannot drift by platform.

It is pinned by a discrimination test in `test/skill-gate-parity.test.mjs`: a gate script written with CRLF
line endings must verify against the LF-normalized manifest sha, and so must its LF form against the same sha.
Reverting to a raw-byte hash fails the CRLF case. Verified: all four regenerated manifest hashes match the
normalized hash of their source, and the consumer test that failed on CI now passes.

## Consequences

* The gate system works on Linux/CI and Windows alike; a consumer's gates stop failing on a normal CI runner.
  This unblocks "engineering gates travel to consumers" (the hashes consumers inherit are now platform-stable).
* The published **v1.1.0 release asset** (`gate-manifest.json`) was produced with the old CRLF hashes, so it
  must be **re-cut** with this normalized manifest, or consumer provenance pinned at 1.1.0 would compare a
  normalized committed manifest against a CRLF published one and mismatch. (Follow-up after this merges.)
* Known limitation: normalization handles `\r\n`. A file with lone `\r` (classic-Mac, not produced by any
  tool here) would still hash differently; this is out of scope, as no source uses it.
* The hashes are now computed over text decoded as UTF-8; all hashed files are UTF-8 `.mjs` scripts, so this is
  safe. The system does not hash binary files.
