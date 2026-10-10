# Repository governance

How this repo protects its `main` branch — and why it's done as code, not clicks.

## Why governance-as-code

Branch protection is a GitHub *setting*, so the usual failure mode is: someone turns it on once in
the UI, nobody can see the policy in the repo, and when it drifts or gets switched off there is no
record of what it was supposed to be. This repo keeps the policy in version control instead:

- **`.github/rulesets/main-protection.json`** is the single source of truth for how `main` is protected.
- **`scripts/apply-ruleset.sh`** applies that JSON to the live repo (idempotently), so the live
  state can always be made to match the reviewed file.
- Changes to the policy go through a normal PR, like any other change — reviewable, with history.

This mirrors the whole repo's thesis: a guarantee you can't see, review, and re-apply isn't a
guarantee.

## What `main` protection enforces

| Rule | Effect |
|------|--------|
| **Block deletion** | `main` cannot be deleted. |
| **Block force-push** (non-fast-forward) | History on `main` cannot be rewritten. |
| **Require a pull request** | No direct pushes to `main`; every change lands via a PR. (0 required approvals — a solo maintainer can still merge their own PRs; raise this if the team grows.) |
| **Require conversation resolution** | All PR review threads must be resolved before merge. |
| **Require status checks** | `test (20)` and `test (24)` (the gate-script test suite) must pass, and the branch must be up to date with `main`, before a PR can merge. |
| **Admin bypass** | The repository admin role can bypass in a genuine emergency, so the owner is never locked out. |

The required-status-checks list names the CI checks exactly as GitHub reports them. When a new
blocking workflow is added (e.g. the `architecture-gate` once it is wired into CI), add its check
name to the JSON and re-run the apply script — do not add it before the workflow exists on `main`,
or every PR will block on a check that never runs.

## Applying or changing the policy

```bash
# From a clone with gh authenticated as a repo admin:
scripts/apply-ruleset.sh                 # applies to the current checkout's origin
scripts/apply-ruleset.sh owner/repo      # or target a specific repo

# Verify what's live:
gh api repos/<owner>/<repo>/rulesets --jq '.[].name'
```

To change the policy, edit `.github/rulesets/main-protection.json`, open a PR, and run the apply
script once it merges. The decision and its rationale are recorded in
[`docs/adr/0003-branch-protection-as-code.md`](adr/0003-branch-protection-as-code.md).
