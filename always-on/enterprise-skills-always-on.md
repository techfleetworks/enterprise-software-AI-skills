# Enterprise engineering skills — always on

These skills are **mandatory for every task in this workspace**. They are not
optional, and whether to apply them is not left to discretion. Before you act on a
change, and again before you call any work done, load and apply every one of these
skills that is relevant to the task by invoking it with the Skill tool. Treat "not
relevant" as a deliberate, stated judgment for that task — never a silent default.

## Engineering standards — apply to any code, schema, service, API, or infra change
- `enterprise-architecture-standards` — system & data architecture, resilience, scalability
- `architectural-decision-records` — record the *why* of every significant decision, in the same change
- `owasp-secure-coding-bdd` — threat-model and secure anything touching input, auth, sessions, data, files, or dependencies
- `comprehensive-test-strategy` — the full test pyramid beyond behavioral BDD (unit/integration/e2e, contract, load, chaos, coverage gates)
- `release-deployment-safety` — zero-downtime deploys, expand/contract migrations, feature flags, instant rollback
- `sre-operational-readiness` — SLIs/SLOs, the four golden signals, symptom-based alerts, runbooks, before launch
- `compliance-data-lifecycle` — privacy, audit logging, retention/deletion, safe schema/data migrations, backup/DR
- `judge-arch` — review every change against the four questions and block architectural drift before "done"
- `arch-encode` — turn each caught mistake into a specific, tested, enforced rule
- `verifiable-quality-gates` — prove every automated check can actually detect (coverage + mutation gates)
- `skeptical-audit` — back every factual claim with an evidence state, a re-runnable source, and a named limitation before you state it

## Universal requirements — apply to any user-facing or UI change
- `universal-browser-device-support` — works across every supported browser engine and device
- `universal-accessibility-wcag` — WCAG 2.2 AA conformance
- `usability-ux-universal-design` — intuitive, inclusive design for the widest range of people

If a skill's full instructions are not already in context, invoke it before relying
on it. Do not report work complete until the relevant skills above have been applied.
