---
status: "accepted"
date: 2026-10-25
decision-makers: mdenner
---

# Text files, including the vendored skills, check out as LF on every platform

## Context and Problem Statement

On Windows, a checkout of the repo had CRLF line endings in 322 of the 326 files under `.claude/skills/`, both
with `core.autocrlf=true` and with `core.autocrlf=false` when `core.eol` is unset (issue #129). Only an explicit
`core.eol=lf` or `core.autocrlf=input` gave LF. The committed blobs are already LF (the index is `i/lf` for all
326 files); the problem is purely the working-tree checkout. `.gitattributes` set `* text=auto` (and `*.mjs
text`) WITHOUT `eol=lf`, and git's default `core.eol` is `native`, which is CRLF on Windows. So git wrote CRLF
on checkout for those files.

This lands on a consumer that vendors the skills by copying a Windows checkout into its own repo: with
`core.autocrlf=false` and no `.gitattributes` of its own, it commits 322 CRLF files. The parity and genesis
hashes LF-normalize, so nothing broke, but the consumer's tree is needlessly CRLF and inconsistent across
platforms.

## Decision

Set `* text=auto eol=lf` in `.gitattributes`, so git writes LF on checkout for every text file on every
platform, regardless of a clone's `core.autocrlf` / `core.eol`. `text=auto` keeps auto-detection (binary files
are untouched); `eol=lf` fixes the checkout ending for the text files. The existing explicit `eol=lf` rules for
shell scripts and hooks remain (redundant now, but harmless and self-documenting).

This changes only what a working-tree checkout receives, not the stored blobs (already LF), so the commit is the
`.gitattributes` line plus this record and a test; there is no 322-file content diff, and `git status` shows no
spurious modifications (git's clean filter maps a CRLF working tree back to the LF blob). It is not a manifest
gate, so there is no sha/provenance change. The behavior is pinned by a discrimination test that asks
`git check-attr eol` for representative files and asserts each resolves to `lf` (dropping `eol=lf` makes git
report `unspecified` / native and fails it).

## Consequences

* A fresh checkout on any platform, including Windows, gets LF for the skills and every other text file, so a
  consumer that vendors the skills by copying a checkout no longer imports CRLF, and the tree is consistent
  across platforms.
* Honest limits: this governs clones that honor the committed `.gitattributes` (git applies a repo's own
  attributes on checkout, so a normal clone is covered); it cannot reach a consumer that already committed CRLF
  files before adopting it (that consumer runs `git add --renormalize .` once, or adopts the same attribute).
  A developer whose working tree currently holds CRLF copies sees them normalize to LF on the next checkout or
  `git add --renormalize .`; the blobs are already LF, so nothing is rewritten. Forcing LF repo-wide is the
  intended cross-platform norm for this toolkit; a file that genuinely needed CRLF would have to be exempted
  explicitly, and none does.
