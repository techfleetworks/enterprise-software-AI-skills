### Fixed (every two open pull requests conflicted on the shared logs, ADR-0108)

- Each change now records itself in its own new file: reviews in `docs/arch-reviews/entries/`, receipts in
  `docs/skill-receipts/entries/`, BDD coverage entries in `features/bdd-coverage-log/`, and changelog notes in
  `changelog.d/`, each named `<YYYYMMDDTHHMMSSZ>-<slug>`. Two open pull requests add two different files, so they
  cannot conflict on them, on GitHub or locally, with no merge driver. The old logs were split byte for byte.
- Append-only is checked per file against a git ref (`--base origin/main`, `BDD_LOG_BASE_REF`), and names the
  entry that was edited or removed. A legacy single-file log still reads.
- `CHANGELOG.md` is no longer edited in pull requests; `scripts/changelog-release.mjs` folds `changelog.d/` in at
  release time.
- The generated BDD datastore is no longer committed; the gates derive it when it is absent and still fail on a
  stale copy. `npm test` finds test files itself (`scripts/run-tests.mjs`), so adding a test no longer edits
  `package.json`.
- The `merge=union` rules are removed: GitHub never applied them, and a clone's config override of that driver
  silently dropped log lines.
