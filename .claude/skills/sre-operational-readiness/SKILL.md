---
name: sre-operational-readiness
description: 'Use whenever building, launching, or operating a service that runs in production: new services, new endpoints, or any system that must stay up and be debuggable. Applies Site Reliability Engineering: define SLIs and SLOs and error budgets, instrument the four golden signals, write symptom-based alerts that do not page on noise, and prepare incident response, blameless postmortems, runbooks, and a production-readiness review before launch. Trigger proactively on "SLO," "SLA," "uptime," "reliability," "monitoring," "alerting," "on-call," "incident," "postmortem," "runbook," "observability," "metrics," "dashboards," "goes down," "how do we know if it breaks," or any production launch, even without those words. Pairs with release-deployment-safety (the signals a canary watches), enterprise-architecture-standards (observability), and comprehensive-test-strategy.'
---

# SRE and Operational Readiness

## Why this exists

Software that "works" and software that "runs reliably at scale" are different disciplines. The gap is
operational: knowing the service is healthy from the user's point of view, being paged only when it
matters, resolving incidents fast, and learning from failure without blame. Teams that run large
systems treat reliability as a measured, budgeted engineering property, not a hope. This skill makes a
service operable before it launches, not after the first 2 a.m. page.

It works with the `enterprise-architecture-standards` observability reference (which covers the
instrumentation mechanics) by adding the SRE practices around it: what to measure, when to page, how
to respond, and how to learn.

## The main idea

**100 percent reliability is the wrong target.** The right target is an explicit SLO (say 99.9
percent) with an **error budget**, which is the amount of unreliability you are allowed. That budget
turns reliability into a shared, measurable decision: if you are inside the budget, ship features
fast; if you have burned it, slow down and fix reliability. Everything below serves that loop: measure
user-facing health, alert on it, respond, learn, adjust.

Two honest corollaries sit under that idea. First, **optimize for how fast you recover, not for never
failing.** A system that almost never fails is fragile, because nobody knows how to repair it and the
automation has rotted (the point *Database Reliability Engineering* makes as "why MTTR over MTBF").
Second, **an SLO is a social choice, not a math problem.** Any single availability number can be
gamed, so pick one that reflects real user experience and say who measures it and over what window.

## The workflow

### Step 1: Define SLIs and SLOs before launch

Read `references/slis-slos-error-budgets.md`. For each user-facing service:

- Pick **SLIs** (the measured indicators) that reflect user experience: availability (good requests
  over total requests), latency (share of requests under a threshold), correctness, freshness. Measure
  as close to the user as you can. Keep it to three or fewer; more than that usually means you are
  tracking symptoms of one real indicator.
- Set **SLOs** (the targets) that are realistic and tied to user need, not a vanity 99.999 percent.
- Express latency as a distribution, never an average. Latency is multimodal, so a mean hides the slow
  tail. State a percentile over a window (for example, 99 percent of requests between 25 and 100 ms
  over one minute), and store raw values, not pre-averaged ones.
- State availability with its window, a cap on a single incident, and the share of users affected
  before you call it downtime.
- Derive the **error budget** (100 percent minus the SLO) and the policy for what happens when it is
  spent.
- Keep the SLO (your internal target) apart from the **SLA** (the external contractual promise, always
  looser than the SLO).

### Step 2: Instrument the four golden signals

Read `references/observability-golden-signals.md`. Every service emits at least:

- **Latency** (split successful from failed requests, and track p50, p95, p99, not just an average).
- **Traffic** (requests per second, throughput).
- **Errors** (rate and type).
- **Saturation** (how full the system is: CPU, memory, queue depth, connection pools).

Plus the three pillars: **metrics** (aggregate health), **logs** (structured and correlated, see the
`owasp` and `comprehensive-test-strategy` logging guidance), and **traces** (a request's path across
services). Add a correlation ID so one request can be followed end to end. Store and reason about
these by role (a pool, a tier), not by host, so continuity survives a failover or a rebuild.

### Step 3: Alert on symptoms, not causes, and do not page on noise

Read `references/alerting-and-oncall.md`. The discipline:

- Page a human only for a user-impacting problem that needs action now (SLO burn, hard-down).
  Everything else is a ticket or a dashboard, not a page.
- Alert on **symptoms** ("checkout error rate above the SLO burn rate"), not **causes** ("CPU high").
  CPU can be high while users are fine, or fine while users are broken.
- Use **error-budget burn-rate alerts**: a fast burn pages now, a slow burn opens a ticket. Alert
  before the budget is gone, not after the breach (know the rapids are downstream while you are still
  in calm water).
- Every alert must be **actionable** and link to a runbook. An alert nobody acts on trains people to
  ignore alerts, and alert fatigue is itself a reliability risk.
- **Mechanical gate:** run `scripts/check-alert-hygiene.mjs <alerts-dir>` in CI so these rules cannot
  be skipped by accident. See the Mechanical gate section below.

### Step 4: Prepare incident response before you need it

Read `references/incident-response-and-postmortems.md`. Have these ready in advance:

- **Severity levels** (SEV1 through SEV3 or SEV4) with clear definitions and response expectations.
- **Roles**: an Incident Commander (coordinates), a Communications Lead, and Operations or subject
  experts. One person does not do all three.
- A **comms plan**: a status page, a cadence for stakeholder updates, and where the team coordinates.
- **Mitigate first, diagnose later.** Restore service (roll back, flip a flag, fail over) before you
  root-cause. This ties directly to `release-deployment-safety` rollback.

### Step 5: Run a blameless postmortem for every significant incident

Same reference. After a SEV, write a **blameless postmortem**: a timeline built from logs and
telemetry (not from memory), the impact, the contributing factors, what went well, what did not, and
concrete action items with an owner and a due date. Blameless means focusing on the system and the
contributing factors, never on individual blame. People act reasonably given what they knew, so fix
the system that let a mistake become an outage. Human error is a symptom of a fragile system, not a
root cause, so prefer a prioritized list of contributing factors over a single "root cause." Track the
action items to completion, or the postmortem is theater.

### Step 6: Write runbooks and pass a production-readiness review

Read `references/runbooks-and-production-readiness.md`. Before launch:

- Write **runbooks**: how to deploy, how to roll back, the common failure modes and their fixes, the
  key dashboards, and the escalation contacts. A runbook is what lets a tired on-call engineer who did
  not write the code recover it at 3 a.m.
- Pass a **Production Readiness Review**: SLOs defined, monitoring and alerting in place, runbooks
  written, rollback tested, capacity planned, dependencies and failure modes understood, on-call
  staffed. Do not launch a service nobody can operate. (Google runs two such gates, a Launch Readiness
  Review before public traffic and a stricter Handoff Readiness Review before a team takes over an
  operational burden.)

### Step 7: Confirm the data is safe, not just the service

For any stateful service, add three checks the operational-visibility work in *Database Reliability
Engineering* calls the floor: is the data safe, is the service up, are consumers in pain?

- Keep enough live copies that losing one still leaves you redundant (for mission-critical data, a
  primary plus two replicas).
- Monitor backups for success **and** for restorability. A backup you have never restored is not
  known to be safe. Replication is not a backup and RAID is not a backup, because both cascade a bad
  write or a corruption to every copy.
- Monitor replication for lag, for a stopped thread, and for silent drift (divergence between copies),
  which is the most dangerous because nothing obvious breaks.

### Step 8: Encode operational guarantees as tests where you can

Some reliability properties are testable. Add them to the suite (an `@reliability` tag) so they do not
silently regress:

```gherkin
  @reliability
  Scenario: Health check reflects dependency failure
    Given the database is unreachable
    When the readiness endpoint is polled
    Then it reports "not ready" so the load balancer stops sending traffic

  @reliability
  Scenario: Requests carry a correlation ID through the call chain
    When a request enters the system without a correlation ID
    Then one is generated and propagated to all downstream service calls and logs

  @reliability
  Scenario: Graceful degradation when a non-critical dependency is down
    Given the recommendations service is unavailable
    When a user loads the product page
    Then the page renders without recommendations rather than failing
```

## Mechanical gate

`scripts/check-alert-hygiene.mjs` is the structural half of the alerting discipline in Step 3
(ADR-0020). Point it at your alerting-rule directory (the Prometheus-style YAML used by Prometheus,
Alertmanager, Grafana-managed alerts, Mimir, and Thanos) in CI. It fails the build when an alert is
missing a severity, a summary or description, or a runbook link, and when a paging alert watches only
a resource cause (CPU, memory, disk, load) with no user-facing symptom in its expression. A deliberate
exception, such as a genuine capacity page, is suppressed only with an inline
`# alert-hygiene:ignore <reason>` inside that alert block; a bare ignore with no reason does not
suppress. It is a block linter, not a YAML parser: it over-flags rather than hiding a real gap, and
the cause-based-page rule reads only the `expr:` value so a symptom word in a summary cannot wrongly
clear it. Its discriminating test is `test/alert-hygiene.test.mjs`.

The rest of this skill (SLOs that reflect real user experience, incident roles, blameless postmortems,
tested restores) is enforced by `judge-arch` review, by the production-readiness review, and by the
`@reliability` scenarios, not by a linter. Say honestly which properties are gated mechanically and
which rest on review.

## Before you call it done

- Each user-facing service has SLIs that reflect user experience, an SLO with a window, an error
  budget, and a policy for when the budget is spent.
- The four golden signals are instrumented, with a correlation ID threaded through, stored by role.
- `check-alert-hygiene` is green on the alerting rules in this change (or an exception carries a
  written inline reason): every alert has a severity, a summary, and a runbook, and nothing pages on a
  bare cause.
- Incident severities, roles, and a comms plan exist, and the service has runbooks and passes a
  production-readiness review before launch.
- For a stateful service, backups are monitored for a tested restore, and replication is monitored for
  lag, breakage, and drift.
- The evidence ledger below is filled in: each reliability claim has a state and a re-runnable source,
  and the central claim ("we will know, and be paged correctly, when this breaks") is at `observed`,
  not `inferred`.

## Reference files

| Topic | File |
|---|---|
| SLIs, SLOs, SLAs, error budgets, burn-rate policy | `references/slis-slos-error-budgets.md` |
| Golden signals, metrics, logs, traces, correlation, dashboards | `references/observability-golden-signals.md` |
| Symptom-based alerting, burn-rate alerts, on-call, alert fatigue | `references/alerting-and-oncall.md` |
| Incident severities, roles, comms, mitigation, blameless postmortems | `references/incident-response-and-postmortems.md` |
| Runbooks, production-readiness review checklist, capacity, toil | `references/runbooks-and-production-readiness.md` |
| Mechanical gate: alert-hygiene linter (severity, summary, runbook, symptom-not-cause) | `scripts/check-alert-hygiene.mjs` |

## Evidence & skeptical assessment (required)

Every "the service is reliable / we will know when it breaks" statement is a factual claim, so it
follows the repo's evidence discipline (canonical contract:
[`skeptical-audit/references/evidence-discipline.md`](../skeptical-audit/references/evidence-discipline.md)).
A production-readiness review is an **evidence ledger**: each reliability property is a claim with a
state and a re-runnable source, never a bare assertion. Hunt the disconfirming case first (what fails
silently, with no page?) before you sign off.

| Claim | Reaches `observed` by | Becomes `proven` when |
|---|---|---|
| "We alert on symptoms, and every alert is actionable" | `check-alert-hygiene` runs clean on the alerting rules in CI | a burn-rate alert fires in a game day and a human follows its runbook to resolution |
| "We will be paged when users are affected" | a fault injected in staging trips the SLO-based alert | an error-budget burn-rate alert has caught a real incident before users reported it |
| "The service degrades gracefully, it does not fall over" | the `@reliability` degradation scenario passes in CI | a dependency is failed in production (a drill) and the service still serves |
| "Backups are safe" | a monitor shows the most recent backup succeeded | a scheduled restore of that backup is validated on a loop, not just taken |
| "We can operate this at 3 a.m." | runbooks exist and the production-readiness review is complete | the on-call rotation has recovered the service from its runbook without the author |

**Definition of done:** the ledger covers every reliability property the service needs with a verdict
and a re-runnable source; a claim that could be measured (does the alert fire, does the restore work)
is `observed` or `proven`, never `inferred`; and no "ready to launch" verdict is given while the
central "we will know when it breaks" claim is below `observed`. A green alert-hygiene gate is
necessary, not sufficient.

## Why this holds for every developer and every agent

It binds everyone because the gate, the scenarios, and the runbooks live in CI and git, not in memory.
Agents get the discipline through the always-on hook, which lists this skill in
`always-on/enterprise-skills-always-on.md`. People and agents alike are held by `check-alert-hygiene`
(a blocking gate that fails an un-actionable alert) and by the `@reliability` scenarios in the shared
suite. It survives any one person because the gate script, the reference files, and the scenarios all
live in the repo. The honest limit: the alert gate proves an alert is shaped to be actionable, not that
the SLO reflects real user experience or that the postmortem culture is blameless. Those rest on the
production-readiness review and `judge-arch`, and a missed page or a silent failure is treated as a
missing alert or a missing signal, to be added the way Rob Ewaschuk's alerting philosophy describes.

## Sources and attribution

- Betsy Beyer, Chris Jones, Jennifer Petoff, Niall Richard Murphy, editors, *Site Reliability
  Engineering*, O'Reilly, 2016: service level objectives and indicators
  (<https://sre.google/sre-book/service-level-objectives/>), embracing risk and error budgets
  (<https://sre.google/sre-book/embracing-risk/>), the four golden signals and symptom-based
  monitoring (<https://sre.google/sre-book/monitoring-distributed-systems/>), managing incidents
  (<https://sre.google/sre-book/managing-incidents/>), and blameless postmortem culture
  (<https://sre.google/sre-book/postmortem-culture/>). `[documented]`
- Betsy Beyer, Niall Richard Murphy, David K. Rensin, Kent Kawahara, Stephen Thorne, editors, *The
  Site Reliability Workbook*, O'Reilly, 2018: implementing SLOs
  (<https://sre.google/workbook/implementing-slos/>) and alerting on SLOs with multi-window,
  multi-burn-rate alerts (<https://sre.google/workbook/alerting-on-slos/>). `[documented]`
- Rob Ewaschuk, "My Philosophy on Alerting," Google
  (<https://docs.google.com/document/d/199PqyG3UsyXlwieHaqbGiWVa8eMWi8zzAn0YfcApr8Q/edit>): page on
  symptoms, make every page actionable, and add only the alerts that would have caught a real outage.
  `[documented]`
- Laine Campbell and Charity Majors, *Database Reliability Engineering*, 1st edition, O'Reilly, 2017
  (copyright 2018; ISBN 978-1-491-92594-2): why MTTR over MTBF; an SLO is a social choice and any
  number will be gamed; latency as a distribution, store raw values; keep SLIs to three or fewer;
  store and reason by role, not host; alert before the budget is spent; is-the-data-safe (enough live
  copies, backups monitored for restorability, replication lag and breakage and drift); replication
  and RAID are not backups. `[documented]`
- Gene Kim, Jez Humble, Patrick Debois, John Willis, *The DevOps Handbook*, 1st edition, IT Revolution
  Press, 2016 (ISBN 978-1942788003): alert fatigue and deleting noisy alerts; overlaying deploys on
  metric graphs because most outages follow a change; developers sharing the on-call rotation; the
  Launch Readiness and Handoff Readiness reviews; blameless postmortems and injecting production
  failure (game days, chaos) to build resilience. `[documented]`
