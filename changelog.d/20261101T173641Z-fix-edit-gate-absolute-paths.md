### Fixed (edit-time routing never fired for root-anchored globs, ADR-0104)

- The edit-gate passed Claude Code's absolute file path to the router, whose globs are anchored to the repo
  root, so every `src/`, `lib/`, `app/`, `test/`, `tests/`, `docs/adr/`, `docs/decisions/`, `prisma/`, and
  `db/migrations/` rule never fired at edit time. The hooks now make each edited path repo-relative first
  (`toRepoPath` and `projectRoot` in `always-on/esk-paths.mjs`). The finish-check and subagent-check take the
  same repo-relative spelling from the transcript, so the review matrix, the receipt, and the subagent ledger
  key a file one way. A path outside the project root is passed through unchanged. Discriminating tests feed
  absolute Windows-style and POSIX-style paths.
