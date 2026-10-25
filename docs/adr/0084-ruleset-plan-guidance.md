---
status: "accepted"
date: 2026-10-24
decision-makers: mdenner
---

# Applying a ruleset explains a plan refusal instead of aborting on a raw 403

## Context and Problem Statement

The last install step is applying the scaffolded ruleset with `scripts/apply-ruleset.sh`, so that the
`enterprise-gates` check blocks merges (issue #152). On a PRIVATE consumer repository whose plan does not include
repository rulesets, the GitHub API refuses with HTTP 403 ("Upgrade to GitHub Pro or make this repository
public"). Two problems made that failure opaque:

- No install surface said a plan or repository visibility could be required. The README, `SKILL.md`, the genesis
  next-step message, and `docs/repository-governance.md` all described applying the ruleset with no plan note.
- `apply-ruleset.sh` ended its lookup of existing rulesets with `| head -n1 || true`, so a failed lookup (for
  example a plan 403, not "none found") was ignored and the script marched on to the create call. Under
  `set -euo pipefail`, that call then aborted the script with gh's raw error and no explanation of the cause or
  the options.

A consumer on a private repository whose plan does not include rulesets hit the final install step failing with
no reason given and no path forward.

## Decision

1. **A failed lookup is not swallowed.** The lookup's exit status is checked; a non-zero result (an API error) is
   reported through the shared handler rather than ignored with `|| true`. "none found" (exit 0, empty) still
   takes the create path, so the idempotent upsert is unchanged.
2. **A refusal is turned into actionable guidance.** The lookup, update, and create calls each route a failure to
   one `explain_ruleset_failure` handler. When the captured gh output looks like a plan/visibility 403, it prints
   what GitHub returned plus the options: upgrade the repository's plan, make the repository public, or require
   the check via classic branch protection. It states that the committed ruleset JSON stays in place and the
   script can be re-run once the plan allows it, and that the gates still run in CI on every PR regardless; only
   the merge-blocking enforcement waits. Any other failure prints gh's error verbatim. The handler can neither
   recover nor retry the refusal, so it reports it and exits non-zero (the error-handling contract: recover,
   retry, or report).
3. **The plan requirement is documented before the last step.** The genesis next-step output and
   `docs/repository-governance.md` now state that applying a ruleset to a private repository can need a plan that
   includes rulesets, and point at GitHub's plans page.

`apply-ruleset.sh` is an installer script, not a manifest gate, so there is no sha/provenance change; this ships
in the 1.3.1 line. The behavior is pinned by discrimination tests: a refused lookup and a refused create each
exit non-zero with the guidance, and the happy path still applies and records the marker.

## Consequences

* A consumer on a private repository whose plan does not include rulesets now gets a clear message with the
  options at the exact step that fails, instead of an unexplained 403, and knows the gates still run in CI while
  enforcement waits.
* The lookup no longer hides an API error behind `|| true`, so a transient or auth failure during lookup stops
  the run with a reason rather than silently proceeding to a create call that then fails for a different-looking
  reason.
* Honest limits: the handler classifies a refusal by matching gh's message text (403 / "upgrade to github pro" /
  "make this repository public" / "not available on your plan"); if GitHub changes that wording, a plan refusal
  falls back to the verbatim-error branch (still reported, just without the tailored options). The script still
  cannot apply a ruleset the plan forbids; it only explains why and what to do. The discrimination test shells
  out to a fake `gh`, so it runs where bash can reach it (CI/ubuntu) and skips otherwise.
