---
status: "accepted"
date: 2026-11-01
decision-makers: mdenner
---

# 0107 - Append-only logs merge with an order-aware driver, not git's union

Supersedes the `log.jsonl` part of ADR-0087. `CHANGELOG.md` stays on `union`.

## Context and Problem Statement

Every PR appends to `docs/arch-reviews/log.jsonl` and `docs/skill-receipts/log.jsonl`, and behavior changes append
to `features/bdd-coverage-log.md`. Their checkers (`check-arch-review-coverage --base`, `check-skill-receipt
--base`, `check-bdd-coverage` with `BDD_LOG_BASE`) all require the base branch's log to be an exact prefix of the
PR's log (`log.startsWith(base)`).

On 2026-11-01, merging `origin/main` (with PR 197's entries) into `feat/poeaa-wp2-citation-gate` reported no
conflict and dropped PR 197's line from both logs. A trial merge of `fix/stale-mirror-signature-nudge` lost that
branch's line the same way. The root cause, reproduced:

1. The shared clone's `.git/config` had `merge.union.driver = true`. A config entry with a built-in driver's name
   REPLACES the built-in. `true` exits 0 and leaves "ours" untouched, so git kept the branch's file and threw away
   "theirs". Nothing in the repo sets it; it was set by hand in that clone. The same merge in a fresh clone of the
   same commits kept both lines (98 and 72 lines instead of 97 and 71). Line length, hunk alignment, and the ort
   strategy are not involved: `git merge-file --union` on the same three blobs kept both lines.
2. Even with the built-in working, `union` always puts "ours" first. Merging main into a branch therefore writes
   base, then the branch's lines, then main's lines, so main's log is no longer a prefix and the `--base` check
   fails. The manual workaround (rebuild the log as main's lines, then the branch's) is what the driver now does.

`features/bdd-coverage-log.md` had no merge attribute, so it conflicted on every concurrent merge. It has the same
prefix invariant.

## Considered Options

* Keep `union` and remove the stray config. Fixes the loss on this machine only; the order still breaks the prefix
  check on every main-into-branch merge, and any clone can be shadowed again.
* Keep `union` and teach the checkers to accept a reordered log (a set check instead of a prefix check). Weakens
  the append-only proof the checkers exist for: a reordered log could hide an edited or removed line.
* A committed custom merge driver that keeps both sides and puts the upstream side first (chosen).
* No driver at all: resolve every log conflict by hand. Correct but recurs on every PR, which is the churn
  ADR-0087 removed.

## Decision Outcome

Chosen option: the committed driver `scripts/merge-append-log.mjs`, named `append-log`, applied to
`log.jsonl` and `features/bdd-coverage-log.md` in `.gitattributes`.

* Both sides appended to the base (a merge, or a single-commit cherry-pick): the side already published upstream
  (its log is a prefix of `origin/main`'s, else `origin/HEAD`'s) goes first. When neither is, "theirs" goes first,
  which is the `git merge origin/main` case; with no upstream ref the driver says so on stderr. When both are, both
  are prefixes of one log, so the longer one is kept. In a `.jsonl` log, where each line is one whole entry, a
  leading entry of the second side that the first side also added (a cherry-picked or squash-merged entry) is
  kept once, one copy per copy; byte-identical `.jsonl` lines are treated as the same entry (every real entry
  carries its change ref, date, and long prose, and neither log has a duplicate line today). Markdown is never
  deduplicated.
* One side appended and the other still holds every base line in order: keep the other side and append the new
  lines. This is a rebase or a stash apply, where the base is the replayed commit's parent and "ours" is already
  reorganized. A rebase of a branch with several log commits onto main keeps main first.
* Anything else (a side edited or removed a past entry) is refused: the driver writes whole-file conflict markers
  (ours, then theirs) and exits 1, so the file cannot pass for resolved. It does not use `git merge-file` for
  this, because a 3-way merge can apply a deletion cleanly and leave no markers. The same happens if the driver
  itself throws or cannot read an input (the readable sides stay inside the markers). A cherry-pick of a later commit without its log-appending parent lands here, because the driver
  cannot tell a skipped entry from a deleted one.
* Additions are otherwise concatenated verbatim. The driver never skips text because it already appears
  somewhere: markdown entries repeat lines, and one entry's text can be a substring of another's.
* `npm install` registers the driver (`prepare` runs `merge-append-log.mjs --install`, which writes
  `merge.append-log.driver` to the clone's local config and warns, naming the scope and the exact unset command,
  when any config scope defines a `merge.union`, `merge.text`, or `merge.binary` driver). It is chained in
  `prepare` rather than added to `.githooks/install-hooks.mjs`, because that file must stay byte-identical to the
  template shipped to consumers, and consumers do not have these logs.
* A clone without the driver registered falls back to git's normal 3-way merge: a conflict with markers.

### Transition for branches opened before this lands

git reads `.gitattributes` from the working tree, so a branch that still has the old `merge=union` line merges
main with `union` the first time: no line is lost (once the stray config is gone) but main's lines land after the
branch's, failing the prefix check. Before the first merge of main into such a branch, take main's attributes:
`git checkout origin/main -- .gitattributes`, then `git merge origin/main`.

## Consequences

* Good: no line is lost and main's log stays an exact prefix after a local merge in either direction, a rebase,
  a cherry-pick, or a stash apply, proven by `test/union-merge.test.mjs` with ~21,000-character lines and the real
  `--install` command, plus the BDD log (including a rebased entry that repeats a past line), duplicate and
  substring entries, a history edit and a far-away deletion (markers present in both), a stale `origin/HEAD`, the
  unregistered fallback, the installer warning (local and environment scope), and the shadowed-union root cause.
  Each merge rule and the installer hint were mutation-checked: breaking one fails a named test.
* Bad: if node or the script is missing (an older branch's working tree), git reports a conflict but leaves the
  file as "ours" with no markers. Check `git diff` on the log before `git add` in that case.
* Bad: when origin/main is stale or absent, the order falls back to "theirs" first, which can be wrong for a local
  merge of a branch into main. Fetch first.
* Bad: the replay rule checks only that no base line was removed, so a merge in which one side inserted a line
  into past history (and the other only appended) is accepted. The `--base` prefix checkers catch that case;
  the driver does not.
* Bad: Git for Windows starts a merge driver through its bundled `sh`. On a machine where that shell's process
  start fails intermittently, the driver does not run and git reports a plain conflict with the file left as
  "ours". This was seen while testing here (a scenario test failed once with no driver output, then passed).
  It is loud, not silent, but check `git diff` on the log before `git add`.
* Bad: GitHub does not run custom merge drivers, so a PR that is behind main shows a log conflict on GitHub. The fix
  is a local `git merge origin/main`, which the driver resolves. (Whether GitHub ever honored the built-in `union`
  for these files, as ADR-0087 states, is not verified here.)
* Bad: a clone that never ran `npm install` gets conflicts on these files until it does.
* Neutral: CI still runs the receipt check without `--base`, so a lost line would still pass CI. Closing that gap is
  a separate change.
