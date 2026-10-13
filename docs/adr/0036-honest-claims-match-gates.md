---
status: "accepted"
date: 2026-10-12
decision-makers: mdenner
---

# Make every claim match what the gate actually does, and strengthen one gate to match its claim

## Context and Problem Statement

The post-rewrite re-audit found several places where the repo committed its own cardinal sin: a claim that a
gate enforces more than it does. This matters disproportionately for a repo whose thesis is honest,
evidence-bound coverage. The specific overclaims:

* The always-on directive, `CONTRIBUTING.md`, and ADR-0032 said the required checks "prove the review
  happened." They do not: no required check reads the review log, and required approvals are zero.
* The root `README.md` scope note still said skills load "not from this repo's root layout, so a pull does not
  by itself make the skills loadable" (pre-2A; contradicts ADR-0028 and the README's own text).
* `evidence-discipline.md` §5 said the contract gate enforces the claim-to-proof map; it enforces the section,
  a resolving link, and the ledger phrase, not the map's substance.
* The `check-bdd-coverage` docs enumerated conditions the self-contained gate does not enforce (tag validity is
  a different gate; "a changed behavior must have a scenario / a new log entry" needs the PR diff).
* The `verifiable-quality-gates` docs said a code check "rejects any diff that adds a name" to the allowlist,
  but `check-has-test` only printed a note and exited 0 on a stale entry.
* Smaller: `routing` was shown as "add it to branch protection to block" though ADR-0032 made it a required
  check; the judge-arch output template said "6 questions" where the gate requires 4; the bootstrap `--check`
  claim said it verifies the hook is "not pointing at this repo," which `assess()` does not check.

## Decision Drivers

* Where a machine can enforce the claim, strengthen the gate; where it cannot, state the honest limit.

## Decision Outcome

Corrected each claim to the truth, and strengthened the one gate where strengthening was the right fix:

* **Review:** the directive and CONTRIBUTING now say the required checks prove the routed artifact is present
  and the repo passes its gates, and that the fresh-context review is required by the directive and PR
  checklist but not verified by a gate (no required check reads the review log). ADR-0032 gets a correction
  addendum.
* **README scope note:** rewritten to say the committed `.claude/skills/` makes skills load on a pull for an
  in-repo (and cloud single-repo) session; only an outside-repo session needs the installer.
* **evidence §5:** now says the gate enforces presence, a resolving link, and the ledger phrase, and that the
  claim-to-proof map's substance is a judge-arch and human review.
* **check-bdd-coverage docs:** rewritten to the conditions the self-contained gate actually enforces, with tag
  validity attributed to `check-bdd-tags` and the diff-dependent rules attributed to the author and the PR
  checklist.
* **check-has-test (strengthened):** a stale allowlist entry (a check that now has a test, or whose check is
  gone) is now a hard FAILURE, not a note, matching the shrink-only claim and the sibling evidence-contract
  gate. The docs are corrected to describe this, and a discriminating test asserts it.
* **Smaller:** routing described as a required check (ADR-0032); the judge-arch template says 4 questions; the
  bootstrap `--check` claim drops "not pointing at this repo."

### Consequences

* Good, because the repo no longer overstates its own enforcement; each claim is either true or carries its
  honest limit, which is the discipline the repo exists to enforce.
* Good, because `check-has-test` now mechanically enforces shrink-only instead of only advising it.
* Bad (minor), because the strengthened `check-has-test` will fail an adopter who left a tested or dead check
  on their allowlist; that is the intended tightening (remove the stale entry).
* Neutral, because the rest is documentation brought in line with the code.

### Confirmation

`npm test` and `npm run check:architecture` are green. A new test asserts `check-has-test` fails on a stale
allowlist entry (discriminating: the old code exited 0 with a note). The claim corrections are verifiable by
reading the gates they describe: no required workflow reads the review log; the evidence-contract gate checks
presence and resolution (ADR-0034); `check-bdd-coverage` reads the feature files, not a diff.

Evidence ledger:

| Claim | State | Source | Limitation |
|------|-------|--------|-----------|
| No required check verifies a review happened | observed | `.github/workflows/*` run only `npm test`, `check:architecture`, `routing`; approvals = 0 | Live GitHub not probed; reads the committed source of truth |
| check-has-test now fails on a stale allowlist entry | proven | new test in `test/verifiable-gates.test.mjs`; `npm test` | Enforces shrink-only (tested/gone), not "no new untested entry" |
| The corrected docs match the gates | observed | each gate read against its doc | Prose accuracy, not a mechanical cross-check |

## More Information

Follows the post-rewrite re-audit and ADR-0028/0031/0032/0033/0034. Wiring `check-arch-review-coverage` as a
required check (to make the review itself gate-enforced) is deferred to the techfleetnetwork CI/CD release.
