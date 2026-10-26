---
status: "accepted"
date: 2026-10-24
decision-makers: mdenner
---

# The always-on directive splits into a universal part and this repo's own contributor process

## Context and Problem Statement

The always-on hook delivers `always-on/enterprise-skills-always-on.md` to sessions OUTSIDE this repository on
purpose (the user-level hook runs in every project). That file, however, was written partly for the authoring
repository itself: one section ("Before you open or update a pull request") and part of the evidence section
named a review log (`docs/arch-reviews/log.jsonl`), a skill-receipt log (`docs/skill-receipts/log.jsonl`), a PR
template, `CONTRIBUTING.md`, the npm scripts `check:receipt` and `check:architecture`, a CI `test` job, a
`routing` check, and `scripts/apply-ruleset.sh` (issue #132). In a consumer bootstrapped with `esk-genesis`,
almost all of those artifacts are absent, and `npm run check:receipt` fails. So a consumer session was pointed
at files and checks that do not exist there.

The emitter cannot fix this by detecting context: its `repoRoot` is wherever the hook points (the upstream clone
or a `~/.claude` mirror), not the consumer project the session is actually working in, so it has no reliable
signal for "am I in a consumer." The fix has to be in WHAT is delivered, not a runtime branch.

## Decision

Split the directive by audience:

1. **`enterprise-skills-always-on.md` becomes universal.** It keeps only what is true in every repository the
   skills are installed in: the skills are mandatory, the 16-skill list, and the evidence rule. It names no
   repo-specific file, npm script, or CI check. This is the file the emitter prints, so every consumer session
   gets a directive that points only at things it has.
2. **`upstream-contributor-process.md` is new and holds the repo-specific process** (the fresh-context review
   log, the skill receipt, the named CI checks, `CONTRIBUTING.md`, `apply-ruleset.sh`, and how the directive
   reaches a session in this repo). It is imported by THIS repo's `CLAUDE.md`, which Claude Code loads only for a
   session rooted in this repo, so it never reaches a consumer. The always-on hook does not deliver it.
3. **The emitter is unchanged.** It prints its sibling `enterprise-skills-always-on.md`, which is now the
   universal (consumer-safe) directive by construction. No context detection is needed or attempted.

The folded-in point about the skill list omitting `bootstrap` is intentional and left as is: `bootstrap` is the
installer, run at setup to turn the skills on, not a per-change engineering discipline to apply to every task, so
it is correctly absent from the "apply the relevant ones" list (the directive names the other 16 skills).

This is documentation and configuration, not a manifest gate, so there is no sha/provenance change. The split is
pinned by a discrimination test: the universal directive (and the emitter's actual output) names none of the
upstream-only artifacts, the moved artifacts still live in `upstream-contributor-process.md`, and this repo's
`CLAUDE.md` imports both.

## Consequences

* A consumer session, or any session on a machine where the user-level hook is installed, gets a directive that
  names only the skills and the evidence rule, so it is no longer told to use a review log, a receipt, or CI
  checks that the project does not have.
* This repo's own sessions are unchanged in substance: the main agent loads both files via `CLAUDE.md`, so the
  full contributor process is still in force when working here. Subagents started by the committed hook get the
  universal directive; the PR process is the main agent's job (a subagent does not open PRs), so nothing needed
  by a subagent is lost.
* Honest limits: the split is by delivery path (hook = universal; this repo's `CLAUDE.md` = universal + process),
  not by a runtime check, so it depends on the upstream process staying in `upstream-contributor-process.md` and
  out of the universal file; the discrimination test enforces exactly that by failing if an upstream-only token
  reappears in the universal directive or its emitted output. A consumer that happens to adopt the same CI
  artifacts could still use the process, but it is no longer pushed on one that has not.
