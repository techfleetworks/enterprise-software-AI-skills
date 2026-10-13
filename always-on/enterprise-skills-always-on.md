# Enterprise engineering skills, always on

These skills are **mandatory for every task in this workspace**. They are not
optional, and whether to apply them is not left to discretion. Before you act on a
change, and again before you call any work done, load and apply every one of these
skills that is relevant to the task by invoking it with the Skill tool. Treat "not
relevant" as a deliberate, stated judgment for that task, never a silent default.

## Engineering standards, apply to any code, schema, service, API, or infra change
- `enterprise-architecture-standards`: system and data architecture, resilience, scalability
- `pattern-selector`: on every feature or refactor, select the design pattern(s) that fit the forces (or deliberately none), with pros and cons, the failure or rot prevented, security and operational trade-offs, and how it is verified
- `architectural-decision-records`: record the *why* of every significant decision, in the same change
- `owasp-secure-coding-bdd`: threat-model and secure anything touching input, auth, sessions, data, files, or dependencies
- `bdd-comprehensive-testing`: enumerate every use case by audience, write them as Gherkin, store and categorize and log them in-repo, and gate every push on legal, complete, tagged coverage
- `comprehensive-test-strategy`: the full test pyramid beyond behavioral BDD (unit, integration, e2e, contract, load, chaos, coverage gates)
- `release-deployment-safety`: zero-downtime deploys, expand and contract migrations, feature flags, instant rollback
- `sre-operational-readiness`: SLIs and SLOs, the four golden signals, symptom-based alerts, runbooks, before launch
- `compliance-data-lifecycle`: privacy, audit logging, retention and deletion, safe schema and data migrations, backup and DR
- `judge-arch`: review every change against the four questions and block architectural drift before "done"
- `arch-encode`: turn each caught mistake into a specific, tested, enforced rule
- `verifiable-quality-gates`: prove every automated check can actually detect (coverage and mutation gates)
- `skeptical-audit`: back every factual claim with an evidence state, a re-runnable source, and a named limitation before you state it

## Universal requirements, apply to any user-facing or UI change
- `universal-browser-device-support`: works across every supported browser engine and device
- `universal-accessibility-wcag`: WCAG 2.2 AA conformance
- `usability-ux-universal-design`: intuitive, inclusive design for the widest range of people

If a skill's full instructions are not already in context, invoke it before relying
on it. Do not report work complete until the relevant skills above have been applied.

## Before you open or update a pull request
Run `judge-arch` in fresh context on the change (it dispatches the review to a subagent), resolve or
explicitly waive every finding, and record the review in `docs/arch-reviews/log.jsonl`. The committed PR
template and `CONTRIBUTING.md` carry the full checklist. The mechanical gates are required CI checks that
block merge on their own: the gate-script tests and `check:architecture` (the `test` job). The `routing`
check (change-type to required-artifact) blocks merge once the committed ruleset is applied with
`scripts/apply-ruleset.sh`. A change that skips a routed artifact cannot merge. These checks prove the
routed artifact is present and the repo passes its gates; they do NOT verify that a fresh-context review
happened (no required check reads the review log) or that the judgment was sound. The review is required by
this directive and the PR checklist, not by a gate, so run it anyway: loaded is not the same as reviewed.

Also append a skill-application receipt for the change to `docs/skill-receipts/log.jsonl`: one entry per PR
covering EVERY skill (applied or not-applicable), each `applied` entry citing a real skill heading, quoting at
least eight exact words from under that heading, and pointing at files really in the change. `npm run
check:receipt` checks it is complete and that every quote is a verbatim run from the cited section; add
`--changed-list <the diff>` to also check that the cited files are in the change and that a coupled surface
is marked applied (the merge-blocking CI job that passes the diff and base is deferred to the techfleetnetwork
release). None of it proves the work is true or good, so a human must still review it. A silent skip becomes a
failing empty cell: you cannot claim a skill without showing what you pulled and where. There is NO triviality
exemption: a one-line or copy-only change still ships a receipt. Most skills are legitimately `not-applicable`
for a small change, but the entry still has to exist and say so; "it is too small to bother" is exactly the
shortcut this receipt exists to stop.

## Evidence is mandatory on every claim
Every factual claim you output carries an **evidence state** (`proven` / `observed` / `inferred` /
`documented` / `reported` / `not-assessed`), a **re-runnable source**, and a **named limitation**. Run
the disconfirming-case-first pass, attach the evidence ledger, and never report work "done / secure /
tested / safe / fixed / passes / complete" without it. The canonical contract is
`.claude/skills/skeptical-audit/references/evidence-discipline.md`. How this directive reaches a session depends on where
the session runs, and no single path covers all of them: a session working inside this repo gets it from the
committed `CLAUDE.md` import (main agent and most subagents, no approval) and from the committed
`.claude/settings.json` hook (every subagent, including Explore and Plan, after a one-time trust step); a
local session rooted outside the repo gets it only from the per-machine user-level hook, if one is installed,
and cloud sessions follow their own rules again (see the map). Loaded is not the same as obeyed: the gates,
not this text, prove a skill was applied. See `always-on/README.md` for the full coverage map and its limits.
