---
status: "accepted"
date: 2026-10-12
decision-makers: mdenner
---

# Make the fresh-context judge-arch review and the required checks a binding part of every PR

## Context and Problem Statement

The repo has the pieces of a review discipline (the `judge-arch` skill, the mechanical gates, the append-only
review log, the routing gate from ADR-0031), but nothing tied them into a workflow that binds every
contributor, human or agent, on every pull request. Two gaps remained. First, the fresh-context judge-arch
review and the review-log record were a convention the maintainer followed, not a stated, discoverable
requirement a new contributor would find and a PR would prompt for. Second, the `routing` gate ran on every
PR but was not a branch-protection required check, so a routing gap did not actually block merge. A standard
that depends on remembering it is not a standard.

## Decision Drivers

* Bind every contributor the same way: committed artifacts, not memory or maintainer habit.
* Separate what can be made structural (required checks) from what cannot (the quality of a review), and be
  honest about the line.
* Keep governance as code: branch protection changes go through the committed ruleset and its apply script,
  never hand-clicked.

## Considered Options

* **A committed PR template plus a CONTRIBUTING section plus an always-on directive line, and add `routing` to
  the required status checks with a test that guards the required-check set.**
* A CONTRIBUTING note alone. Rejected: advisory, easy to miss, and leaves `routing` non-blocking.
* An automated judge-arch bot that posts the review on every PR. Deferred: it needs a model-running CI job and
  a key; it would supplement, not replace, the structural checks, and the honest limit (a bot cannot certify
  its own judgment) would remain.

## Decision Outcome

Chosen option: the committed-artifacts bundle. `.github/pull_request_template.md` carries the required
checklist (mechanical gates green, fresh-context judge-arch run and logged, discriminating tests, evidence
ledger, ADR for decisions, routed artifacts present). `CONTRIBUTING.md` and the always-on directive state the
same workflow so an agent in-session and a human on GitHub both get it. `routing` is added to
`required_status_checks` in `.github/rulesets/main-protection.json`, so a routing gap blocks merge once the
ruleset is applied with `scripts/apply-ruleset.sh`. `test/required-checks.test.mjs` (in `npm test`, itself a
required check) guards the committed ruleset: the required set can grow but can never silently shrink, and the
ruleset must stay actively enforced and block deletion, force-push, and direct push.

### Consequences

* Good, because the fresh-context review and the required checks are now discoverable, prompted, and binding,
  not a habit. A new contributor is told exactly what a mergeable PR needs.
* Good, because `routing` blocking merge closes the ADR-0031 caveat where it ran but did not enforce.
* Good, because the required-check set is itself defended by a test, so a future PR cannot quietly weaken the
  protection in the committed source without a red check.
* Bad (honest limit), because this forces the review to HAVE HAPPENED and the artifacts to EXIST; it cannot
  certify the review was good or the artifacts sufficient. Judgment stays human, backed by the fresh-context
  review. And the test guards the committed source of truth, not the live GitHub state; `apply-ruleset.sh`
  keeps live in sync, and running it is a post-merge admin step. The ruleset also keeps an admin bypass
  (RepositoryRole, `bypass_mode: always`) so the solo maintainer can self-merge, so "bind every contributor
  the same way" holds for non-admins; an admin, or an agent using admin credentials, can still merge past a
  red check.
* Neutral, because the always-on directive grows by one short section, well within the emitter's size budget.

### Confirmation

`test/required-checks.test.mjs` asserts `required_status_checks` includes `test (20)`, `test (24)`, and
`routing`, that the policy is strict, and that the ruleset is active and blocks deletion, force-push, and
direct push; dropping `routing` from the committed ruleset turns it red. `npm test` passes with the new test;
`npm run check:architecture` exits 0. The `routing` gate passes on this PR (it adds no new skill or gate
script, so no routing rule fires). Applying the ruleset to live protection is done after merge with
`scripts/apply-ruleset.sh`, which upserts the committed JSON through the GitHub API.

Evidence ledger:

| Claim | State | Source | Limitation |
|------|-------|--------|-----------|
| The required-check set cannot silently shrink in the committed source | proven | `test/required-checks.test.mjs`; `npm test` | Guards the committed JSON, not live GitHub state |
| `routing` is in the committed required-status-checks | proven | `.github/rulesets/main-protection.json` diff | Blocks merge only after `apply-ruleset.sh` syncs it live |
| The workflow is stated to agents and humans alike | observed | PR template, `CONTRIBUTING.md`, always-on directive all carry it | Stating is not obeying; the checks, not the text, enforce |
| The mechanical gates block a non-conforming PR | inferred | required checks `test (20)/(24)` and `routing` in CI | The judge-arch review quality is not mechanically verifiable |

## More Information

Builds on ADR-0031 (the routing gate) and ADR-0003 (the governance ruleset applied as code). The optional
automated judge-arch CI job remains a possible later addition; it would not change the honest limit that a
review's quality cannot be mechanically certified.
