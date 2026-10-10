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
- `bdd-comprehensive-testing` — enumerate every use case × audience, write them as Gherkin, store + categorize + log them in-repo, and gate every push on legal, complete, tagged coverage
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

## Evidence is mandatory on every claim
Every factual claim you output carries an **evidence state** (`proven` / `observed` / `inferred` /
`documented` / `reported` / `not-assessed`), a **re-runnable source**, and a **named limitation**. Run
the disconfirming-case-first pass, attach the evidence ledger, and never report work "done / secure /
tested / safe / fixed / passes / complete" without it. The canonical contract is
`skeptical-audit/references/evidence-discipline.md`. Installed via the always-on hook (which reads
`$HOME/.claude/enterprise-skills-always-on.md`), this directive binds the main agent and every
subagent; it takes effect once this file is copied to that hook path.
