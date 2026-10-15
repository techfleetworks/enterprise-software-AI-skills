Feature: Multiple agents and repos on one machine
  One computer runs several Claude Code sessions across different repos. The deterministic,
  testable guarantee is that enforcement is a function of the REPO's pinned manifest, not of
  the machine or the session. (Session-start skill injection and agent warnings are agent
  behaviors; they live in agent-acceptance-evals.md, not here.)

  @multi-agent @version-resolution
  Scenario Outline: The effective version is read from the repo, not the machine
    Given the machine's installed skills are version "<machine>"
    And the working repo's "gate-manifest.json" pins "<repo>"
    When the effective enforcement version for that repo is resolved
    Then it equals "<repo>"

    Examples:
      | machine | repo  |
      | 1.3.0   | 1.2.0 |
      | 1.2.0   | 1.3.0 |

  @multi-agent @uniform-enforcement
  Scenario: A push is judged by the repo's committed gates regardless of session
    Given two separate sessions each push a branch to repo B pinned at "1.2.0"
    When CI runs on each pull request
    Then each pull request is evaluated by the "1.2.0" gates committed in repo B

  @multi-agent @worktrees @isolation
  Scenario: Two worktrees of one repo run parity independently
    Given two git worktrees of repo B
    And one worktree's committed gates drift from the manifest
    When CI runs on each worktree's pull request
    Then check-skill-gate-parity exits non-zero for the drifted worktree's PR only
    And exits zero for the other worktree's PR

  # OPEN QUESTION (not specified until verified): whether an ALREADY-RUNNING session picks up
  # skills re-mirrored mid-session, or only a newly spawned session does. This depends on Claude
  # Code session-hook behavior that has not been verified first-hand, so no scenario asserts it.
