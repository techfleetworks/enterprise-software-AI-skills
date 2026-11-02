### Fixed (merges silently dropped append-only log lines, ADR-0107)

- Merging main into a branch dropped main's new lines from `docs/arch-reviews/log.jsonl` and
  `docs/skill-receipts/log.jsonl` with no conflict. Cause: a hand-set `merge.union.driver = true` in the clone's
  `.git/config` replaced git's built-in `union` driver with "keep ours". Even when working, `union` put the
  branch's lines before main's, which fails the checkers' prefix check. The logs and `features/bdd-coverage-log.md`
  now use a committed `append-log` driver (`scripts/merge-append-log.mjs`) that keeps both sides with the upstream
  side first (merge either way, rebase, cherry-pick), keeps a shared entry once, and refuses a side that edited
  history with conflict markers. `npm install` registers it and warns about a shadowed built-in driver.
  `test/union-merge.test.mjs` merges ~21,000-character lines and fails if a line is lost, duplicated, or out of
  order. Run `npm install` after pulling this. On a branch opened before it, run
  `git checkout origin/main -- .gitattributes` before the next `git merge origin/main`.

- Superseded before release by ADR-0108: the logs and the changelog are now folders of one file per change, so
  nothing needs a merge driver, and the `append-log` driver, its `npm install` step, and `merge=union` are removed.
