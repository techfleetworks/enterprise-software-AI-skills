Feature: The arch-review coverage gate is keyed on a stable ref, never a commit SHA
  check-arch-review-coverage matches a review-log entry on the --change value by exact equality. A review
  entry is committed IN the change, so it can never carry that commit's own SHA; keying --change on a commit
  SHA (git rev-parse HEAD, github.sha, the PR merge commit) is permanently unsatisfiable. The gate now rejects
  a 40/64-hex SHA-shaped --change fail-closed with a self-explaining diagnostic, so the footgun can never
  silently block a real pull request, and the branch/PR ref is the one satisfiable key. Source: ADR-0114, #213.

  @audience:agent @usecase:sha-change-rejected @category:error @quality:reliability @severity:critical
  Scenario Outline: A commit-SHA --change is rejected with a self-explaining diagnostic
    Given a review log whose entry is keyed on branch "feat/x" and fully reviews "a.ts"
    When the coverage gate is run for "a.ts" with --change set to a <shape> commit SHA
    Then the coverage gate fails and names the commit-SHA footgun

    Examples:
      | shape  |
      | 40-hex |
      | 64-hex |

  @audience:agent @usecase:branch-change-passes @category:happy @quality:functional @severity:high
  Scenario: A branch-named --change that matches the entry passes
    Given a review log whose entry is keyed on branch "feat/x" and fully reviews "a.ts"
    When the coverage gate is run for "a.ts" with --change set to the branch "feat/x"
    Then the coverage gate passes

  @audience:operator @usecase:no-sha-keyed-entry-in-repo @category:negative @quality:reliability @severity:high
  Scenario: No committed arch-review entry in this repo is keyed on a commit SHA
    Given this repository's docs/arch-reviews/entries folder
    When every entry's change key is inspected
    Then none is a 40-hex or 64-hex commit SHA
