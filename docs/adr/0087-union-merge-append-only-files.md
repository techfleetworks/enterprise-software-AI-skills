---
status: "accepted"
date: 2026-10-24
decision-makers: mdenner
---

# The changelog joins the append-only logs under the union merge driver

## Context and Problem Statement

Every pull request in this repo, by the always-on directive, edits three shared accumulating files: it appends a
skill-application receipt to `docs/skill-receipts/log.jsonl`, appends an architecture-review entry to
`docs/arch-reviews/log.jsonl`, and adds a `### Fixed (...)` block near the top of `CHANGELOG.md`. Because PRs run
as a serial chain off `main`, the second PR to merge collides on these files: both branches changed the same
region since their common base, so git raises a textual conflict even though the two additions do not disagree.

The committed `.gitattributes` already resolves the two logs with git's built-in `union` merge driver
(`log.jsonl merge=union`, a bare pattern that matches both by name). `CHANGELOG.md` was NOT covered, so it was the
one of the three that still conflicted on every merge after the first, needing a hand (or auto-fix) resolution
each time. That recurring churn is what this fixes.

## Decision

Add `CHANGELOG.md merge=union` to the existing `.gitattributes`, next to the `log.jsonl merge=union` rule, so all
three files every PR touches resolve the same way.

The `union` driver resolves a conflicting hunk by keeping the lines from BOTH sides instead of failing. The
changelog only ever GAINS new blocks (existing entries are not rewritten), so keeping both sides is the correct
resolution: both PRs' new entries survive, no human step, no conflict. GitHub honors the base branch's
`.gitattributes` when it merges, so once this is on `main` the open PRs stop conflicting on the changelog.

`union` stays scoped to these genuinely append-only / accumulating text files. It is never applied to source
code, where blindly concatenating both sides of a conflicting hunk can produce code that compiles but is wrong;
a conflict in `esk-genesis.mjs` or any other code file still gets a normal three-way merge.

This is a repository-configuration change, not a manifest gate, so there is no sha/provenance change. It is
proven by a discrimination test: two branches each appending to a `merge=union` log merge cleanly with both lines
and no conflict markers, the same merge WITHOUT the attribute conflicts, and `git check-attr` confirms all three
real paths resolve to `merge=union`.

## Consequences

* The serial PR chain no longer conflicts on any of the three shared files (the two logs were already covered;
  the changelog now is). The recurring post-merge conflict that prompted this is gone.
* Honest limits: `union` keeps both sides verbatim, so two byte-identical added lines would appear twice; in this
  repo each PR's changelog block and log lines are distinct, so that does not arise. The order of the two
  combined blocks within a merged hunk is not guaranteed, which is fine for order-insensitive logs and acceptable
  for a changelog (both entries are present under the same version heading). `union` resolves the listed files
  only; a conflict in source code, or in a file not listed, still needs a normal merge. `union` is a built-in git
  driver, so no per-clone `git config` is required for it to take effect.
