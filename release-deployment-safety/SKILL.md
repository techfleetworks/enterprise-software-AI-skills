---
name: release-deployment-safety
description: 'Use whenever code will be deployed, released, rolled out, or migrated: new services, new versions, schema or data migrations, config or feature changes, or any change to what runs in production. Enforces how teams ship at scale without outages: zero-downtime deploys, progressive delivery (canary, blue-green, rolling), feature flags, instant rollback, and backward-compatible database migrations (expand and contract). Trigger proactively on "deploy," "release," "ship," "roll out," "migration," "cutover," "hotfix," "rollback," "feature flag," "blue-green," "canary," or any change that alters what runs in production, even without those words. Pairs with comprehensive-test-strategy (tests gate the release), sre-operational-readiness (the signals a rollout watches), and enterprise-architecture-standards (system shape).'
---

# Release and Deployment Safety

## Why this exists

Most production outages are not caused by bad code. They are caused by how good code was shipped: a
migration that locked a table, a deploy with no way back, a change that assumed the old and new
versions would never run at the same time. About 80 percent of outages follow a change, and about 80
percent of the time spent recovering is spent finding what changed (the Visible Ops finding quoted in
*The DevOps Handbook*). The difference between a hobby project and infrastructure that scales is not
the architecture. It is that every change can be released in small steps, watched, and undone in
seconds. This skill makes safe release the default, so "it works" becomes "it ships without anyone
noticing the seam."

This skill owns the delivery half of CI and CD. The `comprehensive-test-strategy` skill wires tests
into the pipeline (continuous integration). This skill governs what happens after the tests pass
(continuous delivery and deployment). Use them together.

## The non-negotiables

**Every change must be independently deployable, backward-compatible, observable while it rolls out,
and reversible within minutes.** If any one of those four is missing, the change is not ready to
ship, no matter how correct the code is. Treat a deploy with no rollback plan the way you treat code
with no tests.

One more rule sits under all four: **deployment is not release.** Deployment puts a version into an
environment. Release makes a feature available to users. Keep them separate so that turning a feature
on, or off, is a decision you can make without shipping code.

## The workflow

### Step 1: Classify the change and pick a rollout strategy

What kind of change this is decides the safe path:

- **Stateless app or service code** goes out as a rolling or canary deploy behind a load balancer.
- **Risky or user-visible behavior** goes behind a feature flag (dark launch), then a staged rollout.
- **Database schema change** uses an expand-and-contract migration, never a breaking change in one
  step. See `references/zero-downtime-db-migrations.md`.
- **Data backfill or large data migration** runs as a batched, resumable, throttled background job.
  Same reference.
- **Config or infrastructure change** is treated as a deploy: version it, roll it out gradually, be
  able to revert it.
- **Breaking API change** is versioned so old and new run in parallel. Never break existing clients.
  (See enterprise-architecture-standards `api-integration-design.md`.)

Read `references/deployment-strategies.md` for how to choose and set up blue-green, canary, or
rolling.

### Step 2: Guarantee backward compatibility (the rule that makes zero downtime possible)

During any rollout, **two versions of your code run at the same time**: old instances not yet
replaced, and new instances already live. Everything has to work in that mixed state.

- New code must read data written by old code, and old code must tolerate data written by new code.
- Never ship a schema change and the code that needs it in the same release. Expand first, deploy
  the code, then contract later. See `references/zero-downtime-db-migrations.md`.
- **Mechanical gate:** run `scripts/check-migration-safety.mjs <migrations-dir>` in CI. It fails the
  build on the unsafe patterns this skill forbids: a direct column or table rename,
  `DROP COLUMN`/`DROP TABLE`/`TRUNCATE`, `NOT NULL` with no default, an in-place type change, a bare
  `SET NOT NULL`, a `CHECK` or `FOREIGN KEY` added without `NOT VALID`, and a non-`CONCURRENTLY`
  index build. A deliberate, backed-up, announced contraction is suppressed only with an inline
  `-- migration-safety:ignore <reason>` on that statement (an unexplained ignore does not count).
- Message queues, caches, and API contracts must work both ways across one version step.

If a change cannot be made backward-compatible, split it into a sequence of releases that each are.
This is not optional, and it is the single most common thing teams get wrong.

### Step 3: Put risky changes behind a feature flag

Keep **deploy** (code is in production but dormant) apart from **release** (the feature is turned
on). Read `references/feature-flags.md`. Use flags to:

- Dark-launch: ship the code off, turn it on for internal users, then 1 percent, 10 percent, 100
  percent.
- Kill-switch: turn a misbehaving feature off at once, with no redeploy.
- Target a rollout: enable per tenant, region, or user group.

Flags are not free. Every flag is a branch in your code and a cleanup you now owe. Run the automated
acceptance tests with all flags on, and test the toggle itself. The reference file covers flag
hygiene: naming, ownership, an expiry date, and removing a flag once its feature is stable, so stale
flags do not pile up into their own risk.

### Step 4: Roll out in stages and watch the right signals

Never flip 100 percent at once for anything that matters. Stage the rollout and wire in automatic
guardrails:

1. Deploy to a canary (one instance, or a small share of traffic).
2. Watch the four golden signals (error rate, latency, saturation, traffic) plus business numbers,
   for the canary against the baseline. These are defined in the `sre-operational-readiness` skill.
3. Promote automatically if it stays healthy. Roll back automatically if the error budget starts to
   burn. Only then widen to 10 percent, 50 percent, 100 percent.

A canary wired to automatic rollback (the "cluster immune system" pattern) catches defects the tests
miss, such as a CSS change that hides a Buy button, and it shrinks the time from "broke" to "fixed."
Read `references/deployment-strategies.md` for canary criteria and bake times.

### Step 5: Have a rollback path BEFORE you deploy, and make it fast

Read `references/rollback-and-recovery.md`. Before shipping, answer plainly:

- How do I undo this in under five minutes? (Redeploy the previous artifact, flip a flag, route back
  to the old environment.)
- Is the rollback safe given any migration already applied? Expand-and-contract keeps rollback safe.
  A destructive migration does not, which is why contraction always comes last. A rollback that drops
  an object is not a rollback, because data written since is lost. Rename the object instead so the
  data stays recoverable, and test the rollback the same way you test a restore.
- What is the break-glass procedure if the automatic rollback fails?

A change with no rollback plan is not ready. If a change is truly irreversible (a destructive data
migration), say so loudly to the user, gate it behind extra confirmation, and run the
lockout and accidental-deletion check in the `owasp-secure-coding-bdd` skill.

### Step 6: Automate the pipeline from commit to production

Read `references/ci-cd-delivery-pipeline.md`. The delivery pipeline should:

- Build **once** and promote the **same immutable artifact** through every environment. Never rebuild
  per environment, because a rebuild can change a compiler flag, a library, or a config and make
  production different from what you tested.
- Deploy through environments in order (dev, staging, prod) with gates.
- Run database migrations as an explicit, ordered, idempotent, reversible pipeline step, never by
  hand.
- Smoke-test after each deploy: check the real connections and one real transaction, and fail the
  deploy if that fails.
- Tag and version every release and keep a deploy record (what shipped, when, by whom, which commit).
- Prefer GitOps (the desired state lives in git and is reconciled automatically) for infrastructure.

### Step 7: Design for the downtime you are allowed

An error budget is permission to take some risk. If the service may be down 10 minutes a week, a
short, announced, staged maintenance window can replace an elaborate zero-downtime dance that itself
risks data corruption. Decide this on purpose against the SLO, do not assume zero downtime is always
the cheaper or safer path (the point *Database Reliability Engineering* makes about designing for the
downtime you are allowed, not for zero).

Know the data-loss window you are signing up for. With asynchronous database replication, a failover
loses the writes that had not yet reached the replica. No data loss on failover is guaranteed only by
synchronous or semi-synchronous replication (which costs write latency) or by an external write path
such as an event log. State which one you have before you call a failover "safe."

### Step 8: Add release-safety scenarios to the test suite

Release safety is testable. Add scenarios (in the same `.feature` files the
`comprehensive-test-strategy` skill maintains) that prove the safety properties hold:

```gherkin
  @release-safety
  Scenario: New and old schema versions coexist during rollout
    Given the "expand" migration has been applied
    And instances running both the previous and new code version are live
    When each version reads and writes a user record
    Then both versions operate correctly with no errors

  @release-safety
  Scenario: Feature can be disabled instantly via kill switch
    Given the "new-checkout" feature flag is enabled
    When the flag is set to off
    Then subsequent requests use the previous checkout path without a redeploy

  @release-safety
  Scenario: Canary rollback triggers on elevated error rate
    Given a canary release is receiving 5% of traffic
    When the canary error rate exceeds the baseline by the configured threshold
    Then the canary is automatically rolled back and traffic returns to the stable version
```

### Step 9: Do not let a deploy become an outage or a lockout

If the release touches permissions, credentials, network rules, or deletes anything, run the lockout
and accidental-deletion check from `owasp-secure-coding-bdd` before shipping. A "successful" deploy
that cuts off legitimate access is a failed deploy.

## Mechanical gate

`scripts/check-migration-safety.mjs` is the structural half of the expand-and-contract rule (Step 2,
ADR-0009). Point it at your migrations directory in CI. It fails the build on a migration that would
break a running old instance or take a blocking lock, so the rule cannot be skipped by accident, and
a deliberate exception needs a written inline reason. It is a statement linter, not a full SQL
parser: it over-flags rather than hiding a real unsafe statement, and the inline ignore is the escape
hatch. Its discriminating test is `test/migration-safety.test.mjs`.

The rest of this skill (rollback plan, backward compatibility across the whole stack, flag hygiene)
is enforced by `judge-arch` review and by the release-safety scenarios in Step 8, not by a single
linter. Say honestly which properties are gated mechanically and which rest on review.

## Before you call it done

- The change is independently deployable, backward-compatible across one version step, watched while
  it rolls out, and reversible in minutes. If any of the four is missing, it is not done.
- Deploy and release are separate: risky behavior is behind a flag with an owner and an expiry.
- `check-migration-safety` is green on the migrations in this change (or a destructive step carries a
  written inline reason), and the rollback path has been tested, not just written down.
- The deploy builds once and promotes one artifact, records who shipped what, and smoke-tests after.
- The evidence ledger below is filled in: each safety claim has a state and a re-runnable source, and
  the central claim ("this is reversible within minutes") is at `observed`, not `inferred`.

## Reference files

| Topic | File |
|---|---|
| Choosing and setting up blue-green, canary, rolling, progressive delivery, GitOps | `references/deployment-strategies.md` |
| Feature flags: patterns, targeting, kill switches, flag hygiene and cleanup | `references/feature-flags.md` |
| Zero-downtime and reversible database schema and data migrations (expand and contract) | `references/zero-downtime-db-migrations.md` |
| Rollback strategies, break-glass, safe versus unsafe reverts, DORA recovery time | `references/rollback-and-recovery.md` |
| Build-once and promote pipelines, environment gates, GitOps, deploy records | `references/ci-cd-delivery-pipeline.md` |
| Mechanical gate: unsafe-migration linter (expand-and-contract enforcement) | `scripts/check-migration-safety.mjs` |

## Evidence & skeptical assessment (required)

Every "this is safe to ship / this can be rolled back" statement is a factual claim, so it follows
the repo's evidence discipline (canonical contract:
[`skeptical-audit/references/evidence-discipline.md`](../skeptical-audit/references/evidence-discipline.md)).
A release plan is an **evidence ledger**: each safety property is a claim with a state and a
re-runnable source, never a bare assertion. Hunt the disconfirming case first (what makes this
rollout fail?) before you call it ready.

| Claim | Reaches `observed` by | Becomes `proven` when |
|---|---|---|
| "The migration is backward-compatible" | `check-migration-safety` runs clean on the migration in CI | the expand-and-contract scenario runs old and new code against the same data and both pass |
| "This can be rolled back within minutes" | a rehearsal flips the flag or redeploys the prior artifact and the recovery time is recorded | rollback is exercised on every deploy (the canary immune system) and the recovery time is tracked |
| "Old and new versions coexist during rollout" | the `@release-safety` coexistence scenario passes in CI | it runs against a real mixed-version environment, not a fixture |
| "A failover will not lose data" | the replication mode is read from config (sync or semi-sync, or an external write path exists) | a failover drill measures the data-loss window and it is within the SLO |
| "The feature is off by default and reversible" | the kill-switch scenario turns the flag off with no redeploy | the flag has an owner and an expiry, and stale-flag cleanup is tracked |

**Definition of done:** the ledger covers every safety property the change needs with a verdict and a
re-runnable source; a claim that could be measured (recovery time, data-loss window) is `observed` or
`proven`, never `inferred`; and no "safe to ship" verdict is given while the central reversibility
claim is below `observed`. A green migration gate is necessary, not sufficient.

## Why this holds for every developer and every agent

It binds everyone because the gate and the scenarios live in CI and git, not in memory. Agents get
the discipline through the always-on hook, which lists this skill in
`always-on/enterprise-skills-always-on.md`. People and agents alike are held by `check-migration-safety`
(a blocking gate that fails an unsafe migration) and by the `@release-safety` scenarios in the shared
suite. It survives any one person because the gate script, the reference files, and the scenarios all
live in the repo. The honest limit: the migration gate proves the schema step is shaped safely, not
that the whole rollout is reversible. That is why the rollback rehearsal, the canary guardrail, and
`judge-arch` review sit alongside it, and why an escaped release incident is treated as a missing
scenario.

## Sources and attribution

- Gene Kim, Jez Humble, Patrick Debois, John Willis, *The DevOps Handbook*, 1st edition, IT
  Revolution Press, 2016 (ISBN 978-1942788003): decoupling deployment from release; blue-green,
  canary, and the cluster immune system; feature toggles and dark launching; build-once and promote
  the same artifact; smoke-tested self-service deploys; "about 80 percent of outages follow a change";
  optimize for time to restore, not time between failures; the DORA throughput and stability metrics.
  `[documented]`
- Laine Campbell and Charity Majors, *Database Reliability Engineering*, 1st edition, O'Reilly, 2017
  (copyright 2018; ISBN 978-1-491-92594-2): design for the downtime you are allowed, not for zero;
  expand-and-contract online schema change and rollback by rename, not drop; a rollback is a tested
  artifact checked in with the migration; asynchronous failover loses the in-flight write window, and
  only synchronous or semi-synchronous replication or an external write path avoids it; a tested
  restore, not a backup, is what makes data recoverable. `[documented]`
- Martin Fowler, "BlueGreenDeployment" (<https://martinfowler.com/bliki/BlueGreenDeployment.html>)
  and Danilo Sato, "CanaryRelease" (<https://martinfowler.com/bliki/CanaryRelease.html>): the two
  environment-based rollout patterns and how traffic is cut over or staged. `[documented]`
- Danilo Sato, "ParallelChange" (<https://martinfowler.com/bliki/ParallelChange.html>) and Pramod
  Sadalage and Martin Fowler, "Evolutionary Database Design"
  (<https://martinfowler.com/articles/evodb.html>): the expand, migrate, contract sequence for
  changing a schema without breaking running code. `[documented]`
- Pete Hodgson, "Feature Toggles (aka Feature Flags)"
  (<https://martinfowler.com/articles/feature-toggles.html>): the toggle categories (release,
  experiment, ops, permissioning) and flag hygiene, including keeping toggle inventory small and
  removing flags once stable. `[documented]`
- Martin Fowler, "DeploymentPipeline" (<https://martinfowler.com/bliki/DeploymentPipeline.html>):
  the build-once pipeline, promoting one artifact through staged environments with gates. `[documented]`
- PostgreSQL documentation, "CREATE INDEX" (<https://www.postgresql.org/docs/current/sql-createindex.html>)
  and "ALTER TABLE" (<https://www.postgresql.org/docs/current/sql-altertable.html>): `CONCURRENTLY`
  index builds, lock levels, and adding a constraint `NOT VALID` then `VALIDATE`, which the migration
  gate's rules are drawn from. `[documented]`
- DORA, "DORA's software delivery metrics: the four keys"
  (<https://dora.dev/guides/dora-metrics-four-keys/>) and the DORA metrics history
  (<https://dora.dev/insights/dora-metrics-history/>): the current four keys, including the 2023
  rename of time to restore to "failed deployment recovery time," which is why this skill does not
  equate that metric with a broad all-incident MTTR. `[documented]`
- Betsy Beyer, Chris Jones, Jennifer Petoff, Niall Murphy, editors, *Site Reliability Engineering*,
  O'Reilly, 2016, "Release Engineering" and "Deploying Code" in *Building Secure and Reliable Systems*,
  O'Reilly, 2020 (<https://google.github.io/building-secure-and-reliable-systems/raw/ch14.html>):
  hermetic, reproducible builds and designing a deploy process you can recover from. `[documented]`
