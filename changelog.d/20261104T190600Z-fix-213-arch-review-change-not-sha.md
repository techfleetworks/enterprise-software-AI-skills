### Fixed (judge-arch)

- `check-arch-review-coverage` is now keyed on a stable ref (branch name or PR ref), never a commit SHA. The
  gate rejects a 40/64-hex SHA-shaped `--change` fail-closed with a self-explaining diagnostic, so keying it on
  `git rev-parse HEAD` / `github.sha` can no longer silently block a pull request with an unsatisfiable check (a
  review entry is committed in the change, so it can never carry that commit's own SHA). The contract docs are
  corrected, a branch-keyed consumer CI recipe is shipped, and a real-repo invariant plus a mutation-proven test
  make the footgun impossible to regress here. ADR-0114, #213.
