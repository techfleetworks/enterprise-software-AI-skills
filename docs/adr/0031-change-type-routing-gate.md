---
status: "accepted"
date: 2026-10-12
decision-makers: mdenner
---

# A change-type to required-artifact routing gate

## Context and Problem Statement

The always-on directive names the skills, and the per-skill gates each prove their own discipline when they
are run. What nothing enforced was the ROUTING between them: that a given KIND of change must carry the
artifact its discipline produces. A new skill could land with no ADR recording why it exists. A new gate
script could land with no discriminating test. In an adopter app, a schema change could land with no ADR and
no migration-safety record, an auth change with no @security scenario, a UI change with no accessibility
verdict. Each specialized gate answers "is this artifact correct?" but only if the artifact is there to check.
Nothing answered "for this kind of change, does the artifact exist at all?" That gap is exactly where "loaded
is not obeyed" bites: an agent can read every skill and still ship a change that skips a discipline, and no
check catches it.

## Decision Drivers

* Make skipping a discipline's OUTPUT catchable at the change, not a matter of what an agent read.
* Compose with the existing gates, do not duplicate them: route to the artifact, let the owning gate judge its
  correctness (the one-owner rule).
* Dependency-free, offline, deterministic, and testable without a live repo, like the sibling coverage gates.
* Honest about its limit: it enforces PRESENCE, not the correctness of the artifact, and choosing the right
  artifact for a novel surface stays a judgment call.

## Considered Options

* **A config-driven routing gate** that maps the change's added/changed files to required artifacts and fails
  when a required artifact is not part of the same change (or is waived).
* Extend each specialized coverage gate to also assert its own trigger. Rejected: no single place would own the
  cross-cutting "this change needs ADR and test and a11y" decision, and the rules would drift apart.
* A directive-only instruction ("remember to add an ADR"). Rejected: advisory, not structural; this is the
  precise failure mode the gate exists to close.

## Decision Outcome

Chosen option: "a config-driven routing gate." `check-change-routing.mjs` (under `judge-arch/scripts/`, the
architecture-gate family) reads the change's file lists (`--changed-list`, and `--added-list` for rules keyed
on newly added files, both computed by CI from the git diff), matches each rule's `when` globs, and requires
each `requires` artifact to be part of the same change. It checks presence only; each requirement names the
`ownerGate` that verifies correctness. A rule can be waived with a reason, approver, and expiry; a waiver with
an unparseable date fails closed, so it can never become permanent. The gate fails closed on a missing or
malformed config, an empty changed-list, or a rule that keys on added files when the added list was not passed.

The active config at `judge-arch/assets/routing-rules.config.json` carries the two rules that are real for this
repo: a new `SKILL.md` requires an ADR, and a new `scripts/check-*.mjs` requires a test under `test/`. The
broader adopter set (schema, auth, UI, source) ships as a tunable starting map at
`judge-arch/assets/example/routing-rules.config.json`. A new `routing` workflow runs the gate on every pull
request; adding it to the branch-protection required checks (tracked with the mandatory-review workflow) makes
a routing gap block merge.

### Consequences

* Good, because the one gap where an agent can skip a discipline and have nothing notice is now closed for the
  routed surfaces, at the outcome, regardless of what was read.
* Good, because it composes rather than duplicates: it routes, the owning gate judges correctness.
* Good, because every rule is data in a config an adopter tunes to their stack, and the gate is dependency-free.
* Bad (honest limit), because it proves an artifact is PRESENT, not that it is right or sufficient, and it can
  only route the surfaces someone has encoded; a novel surface with no rule passes until a rule is added. Each
  gap found becomes one more rule, so the judgment shrinks over time but never reaches zero.
* Neutral, because on this skills repo the two active rules fire only when a skill or a gate is added, so most
  PRs pass without a routed surface; the discriminating test, not routine firing, is what proves it detects.

### Confirmation

`test/change-routing.test.mjs` (16 tests, in `npm test`) exercises every path: a rule firing with its artifact
present passes, firing with the artifact missing fails with exit 1, a valid waiver passes, an expired waiver
fails, an unparseable waiver date fails closed with exit 2, no rule firing passes, and missing or malformed
config or changed-list fails closed. One test runs the SHIPPED active config and proves a new `SKILL.md`
without an ADR fails while one with an ADR passes. The tests were confirmed to discriminate out of band: a
throwaway copy of the gate whose requirement comparison was altered returns 0 on the missing-artifact input
where the real gate returns 1, so the "missing -> exit 1" test distinguishes a correct gate from a broken one.
`npm run check:architecture` stays green (house style and script hygiene). The gate's own change satisfies its
own active rule: this PR adds `check-change-routing.mjs` (a new gate) and `test/change-routing.test.mjs`.

Evidence ledger:

| Claim | State | Source | Limitation |
|------|-------|--------|-----------|
| The gate fails a firing rule whose artifact is absent, and passes when present | proven | `test/change-routing.test.mjs` cases 1-2; `npm test` | Globs and rules are the repo's; an adopter's stack needs its own config |
| Every fail-closed path exits 2 (bad config, empty list, added-not-provided, bad waiver date) | proven | `test/change-routing.test.mjs` fail-closed cases | Covers the paths enumerated; not a proof of total input space |
| The shipped active config detects a missing ADR for a new skill | proven | `test/change-routing.test.mjs` "active config has teeth" | Only the two active rules; schema/auth/UI live in the example config |
| The tests discriminate (catch a gate that stopped requiring the artifact) | proven | out-of-band copy run: real exit 1, altered copy exit 0 | Two altered copies checked; not exhaustive coverage |
| The CI job blocks a routing gap on a PR | inferred | `.github/workflows/routing.yml` runs the gate on pull_request | Not yet a branch-protection REQUIRED check; blocks only once added there |

## More Information

Follows the sibling coverage gates `check-security-coverage.mjs` (owasp-secure-coding-bdd) and
`check-arch-review-coverage.mjs` (judge-arch), whose explicit-changed-list, waiver, and fail-closed conventions
this gate mirrors. The branch-protection wiring that makes `routing` a required check is tracked with the
mandatory-review workflow.
