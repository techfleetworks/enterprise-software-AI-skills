Feature: Each change records itself in its own new file, so two open pull requests cannot conflict
  Every pull request used to append to the same review log, receipt log, BDD coverage log, and changelog, so
  any two open pull requests conflicted, and GitHub does not run merge drivers when it checks for conflicts.
  Now each record is a new file named <UTC stamp>-<slug>. Append-only still holds: no past entry may be edited
  or removed, checked against a git ref. Source: ADR-0108.

  @audience:operator @usecase:parallel-records-merge-clean @category:happy @quality:reliability @severity:critical
  Scenario: Two changes that each add their own records merge with no conflict and no merge driver
    Given a repository whose main branch has one review, one receipt, one coverage entry, and one changelog note
    And a branch that adds its own review, receipt, coverage entry, and changelog note
    And main gains a different change's review, receipt, coverage entry, and changelog note
    When the branch is merged into main with every merge driver off
    Then the merge has no conflict
    And every record from both changes is kept

  @audience:operator @usecase:shared-file-control @category:negative @quality:reliability @severity:high
  Scenario: The old shared-file layout conflicts on the same merge
    Given a repository whose main branch has one line in a shared review log
    And a branch that appends its own line to the shared review log
    And main appends a different line to the shared review log
    When the branch is merged into main with every merge driver off
    Then the merge conflicts

  @audience:agent @usecase:edited-review-entry-caught @category:negative @quality:reliability @severity:critical
  Scenario Outline: Editing or removing a past entry is caught against the base ref
    Given a committed <log> with one entry
    When that past entry is <action> and the log is checked against the base ref
    Then the check fails and names the entry as <action>

    Examples:
      | log             | action  |
      | review log      | edited  |
      | review log      | removed |
      | coverage log    | edited  |
      | coverage log    | removed |

  @audience:agent @usecase:new-entry-passes @category:happy @quality:functional @severity:high
  Scenario Outline: Adding a new entry file passes the append-only check
    Given a committed <log> with one entry
    When a new entry file is added and the log is checked against the base ref
    Then the append-only check passes

    Examples:
      | log          |
      | review log   |
      | coverage log |

  @audience:agent @usecase:bad-entry-name-fails-closed @category:error @quality:reliability @severity:high
  Scenario: An entry file not named with a UTC stamp fails closed
    Given a review log folder holding an entry named "review.json"
    When the review log is read
    Then the read fails and names "review.json"

  @audience:agent @usecase:missing-base-ref-fails-closed @category:error @quality:reliability @severity:high
  Scenario: A base ref that does not exist fails closed instead of passing
    Given a committed review log with one entry
    When the log is checked against the base ref "no-such-ref"
    Then the check fails closed

  @audience:operator @usecase:release-folds-changelog @category:happy @quality:functional @severity:medium
  Scenario: The release step folds the unreleased notes into the changelog, oldest first
    Given a changelog whose newest section is 1.3.1
    And unreleased notes "20261101T000000Z-a.md" and "20261102T000000Z-b.md"
    When version 1.4.0 is released on 2026-11-03
    Then the changelog has a 1.4.0 section above 1.3.1 holding note a before note b
    And the unreleased notes are gone

  @audience:operator @usecase:release-refuses-existing-version @category:edge @quality:reliability @severity:medium
  Scenario: The release step refuses a version that is already released and writes nothing
    Given a changelog whose newest section is 1.3.1
    And unreleased notes "20261101T000000Z-a.md" and "20261102T000000Z-b.md"
    When version 1.3.1 is released on 2026-11-03
    Then the release fails closed and the changelog is unchanged
