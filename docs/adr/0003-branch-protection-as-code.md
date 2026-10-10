---
status: "accepted"
date: 2026-10-10
decision-makers: mdenner
---

# Manage main-branch protection as a versioned ruleset (governance-as-code)

## Context and Problem Statement

GitHub flagged that `main` was unprotected — it could be force-pushed, deleted, or have unreviewed
code merged with no passing CI. Branch protection is a repository setting, not a file, so the common
fix (toggling it in the UI) leaves no record in the repo of what the policy is, and it silently
drifts or gets switched off. This repo's whole premise is that guarantees must be visible,
reviewable, and reproducible. How should it protect `main` in a way consistent with that premise?

## Decision Drivers

* The policy must be visible and reviewable in the repo, not hidden in GitHub settings.
* It must be reproducible — re-appliable after drift, and portable to a fork or a re-created repo.
* It must not lock out the solo maintainer, who authors and merges their own PRs.
* It must require the gate-script tests (and, later, the architecture gate) to pass before merge.

## Considered Options

* A versioned GitHub **ruleset** (`.github/rulesets/*.json`) plus an idempotent apply script.
* Classic branch protection set in the GitHub UI (or via a one-off API call), undocumented in the repo.
* A third-party IaC tool (Terraform GitHub provider) to manage repo settings.

## Decision Outcome

Chosen option: "a versioned ruleset plus an apply script", because it keeps the policy in the repo
(reviewable via PR, with history), re-appliable with one command, and adds no new tooling beyond the
`gh` CLI the project already assumes. Terraform was rejected as disproportionate for a single repo's
settings; UI-only protection was rejected because it is invisible and drift-prone — the exact
failure this repo argues against.

The policy (Standard level): block deletion and force-push, require a PR for every change (0 required
approvals so the solo maintainer can still merge), require conversation resolution, and require the
`test (20)` / `test (24)` status checks with the branch up to date. The repository admin role may
bypass in an emergency.

### Consequences

* Good, because `main` can no longer be force-pushed, deleted, or merged with failing/again absent CI, and the policy is auditable in the repo.
* Good, because re-applying or evolving the policy is a reviewed PR plus one script run, not tribal knowledge.
* Bad, because a required status check must already exist on `main` before it is listed, or it blocks every PR — so new gates are added to the ruleset only after their workflow is live (noted in the governance doc).
* Neutral, because `required_approving_review_count` is 0 today; a growing team should raise it, which is a one-line change to the JSON.

### Confirmation

`scripts/apply-ruleset.sh` applied the ruleset; `gh api repos/<owner>/<repo>/rulesets` shows
`main-protection` active, and GitHub's "your main branch isn't protected" warning is cleared. The
policy file (`.github/rulesets/main-protection.json`) is the reviewed source of truth, and the apply
script makes the live repo match it on demand.

## More Information

See [`docs/repository-governance.md`](../repository-governance.md) for the operator-facing summary
and commands.
