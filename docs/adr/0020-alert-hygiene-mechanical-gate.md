---
status: "accepted"
date: 2026-10-11
decision-makers: mdenner
---

# Enforce SRE alert hygiene with a mechanical gate

## Context and Problem Statement

`sre-operational-readiness` teaches that an alert is only safe to page on when it is actionable:
it must carry a severity (so a page can be told from a ticket), a summary or description (so the
responder learns something), and a link to a runbook (so there is an action attached), and it must
alert on a user-facing symptom rather than a bare resource cause like high CPU. Until now this was
prose only. An agent or a human could ship an alert that pages at 2 a.m. on a CPU spike with no
runbook and nothing would stop the merge. Of the thirteen always-on skills, `sre-operational-readiness`
was one of the few with no mechanical gate at all, so its most load-bearing rule rested entirely on
a reviewer noticing. The repo's thesis is that a skill's guidance must be structurally enforced,
not advisory, with a discriminating test so the gate cannot rot.

## Decision Drivers

* Enforce the mechanically-detectable subset of the skill's alerting discipline at merge time: a
  severity label, a summary or description, a runbook link, and symptom-not-cause for paging alerts.
* Dependency-free and vendor-neutral, so it ships and is copied with the skill (no YAML library).
* Allow a deliberate, reviewed exception (a genuine capacity page) without weakening the default.
* A false red trains people to disable the gate, so the one heuristic rule (cause-based paging)
  reads only the alert expression and is suppressible with a written reason.

## Considered Options

* A bespoke `check-alert-hygiene.mjs` block linter in the skill, keyed on the Prometheus-style
  alerting-rule format shared by Prometheus, Alertmanager, Grafana-managed alerts, Mimir and Thanos.
* Express the rules as `arch-gate` config (forbidden regex in globs).
* Leave it as prose and rely on review.

## Decision Outcome

Chosen option: "a bespoke linter in the skill," mirroring the `check-migration-safety` precedent
(ADR-0009). The `arch-gate` forbidden-regex engine cannot express a presence requirement (an alert
must *contain* a runbook annotation) or the conditional cause-based-page rule (paging, on a resource
cause, with no symptom in the expression). The gate splits a file into alert blocks on the
`- alert:` and `- record:` markers, lints only the alert blocks, and for each one checks the three
presence rules plus the cause-based-page rule, which reads only the `expr:` value and strips the
label-matcher blocks and quoted strings before testing, so a symptom word in a summary, a label
value, or a string literal cannot wrongly clear a real cause page, and `saturat` is treated as a
cause, not a symptom. A deliberate exception is suppressed only by an inline
`# alert-hygiene:ignore <reason>` (or `=rule`) inside the block; a bare `ignore` with no reason does
not suppress, matching the arch-gate and migration-safety waiver discipline. The gate is a reference
tool an adopting repo points at its own alerting rules in CI, not a step in this repo's own
`check:architecture` (this repo ships no alerting rules).

### Consequences

* Good, because the alert gaps the skill warns against now fail CI instead of relying on a reviewer.
* Good, because the cause-based-page rule reads only the expression, so it over-flags rather than
  silently clearing a real cause page, and the inline ignore keeps a real capacity page possible.
* Good, because the skill now carries the Mechanical gate section the Track-B template expects.
* Bad (honest limit), because it is a block/regex linter, not a YAML parser: an unusual layout can
  mis-split, and the symptom-versus-cause token lists are heuristic. The inline-ignore escape hatch
  and the test fixtures bound this, and a future version could parse real YAML.
* Neutral, because it fails closed (exit 2) when pointed at files with no alert blocks, so a
  misconfigured path cannot pass vacuously.

### Confirmation

`test/alert-hygiene.test.mjs` (18 tests): a complete symptom paging alert passes; a cause expression
passes when it is a ticket or when it also carries a symptom; each of the four rules fails on its
violation with the rule named; `description` satisfies the summary rule; the cause-based-page rule is
not cleared by a symptom word in the summary, in a label matcher, or by `saturat` in a metric name; a reasoned ignore (bare and `=rule`) suppresses while a
reason-less or wrong-rule ignore does not; a `- record:` block is not folded into an alert; a
record-only file and an empty directory both fail closed (exit 2). All run in CI via `npm test`, and
the discrimination gate (`verify-check-discrimination`) confirms the tests fail when the check is
stubbed to a no-op.

## More Information

Rules trace to `sre-operational-readiness/references/alerting-and-oncall.md` and the sources the
skill cites (Google SRE Book chapter 6, the SRE Workbook chapter on alerting, and Rob Ewaschuk's
alerting philosophy). This is the gate added in the Track-B deep rewrite of
`release-deployment-safety` and `sre-operational-readiness`.
