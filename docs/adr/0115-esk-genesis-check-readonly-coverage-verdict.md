---
status: "accepted"
date: 2026-11-04
decision-makers: mdenner
---

# 0115 - esk-genesis --check: a read-only coverage verdict, the committable half of gap 2

ADR-0109 made the upstream manifest complete (a gate cannot silently escape it). ADR-0110 designed an org-wide
reconciliation bot to close gap 2 (a repo nobody onboarded still gets the gates), named `esk-genesis --check`
as its one in-repo code dependency, and left it unbuilt. This ADR builds that `--check` mode. Issue #203 gap 2.

## Context and Problem Statement

- `[observed]` `esk-genesis` installs and reconciles a consumer's gates, is idempotent, and its dry run exits 0
  even when work is pending (it just prints the plan). So nothing could branch on "is this repo covered?": a
  reconciliation loop, or a consumer's own CI, had no predicate to read.
- `[observed]` `esk-init` already ships a `--check` drift gate (exits non-zero when the always-on hook is
  missing or behind), wireable into CI. The gates installer had no counterpart, so a repo could have the
  directive and never the gates, invisibly (the job-decoder case in ADR-0109/#203).
- `[inferred]` The predicate must not re-derive which gates belong in a repo; that fact is owned by the
  manifest and the installer's resolution logic (ADR-0046, ADR-0109). A second derivation would be the
  two-owners drift the architecture gate exists to stop.

## Considered Options

- **Option 1: add a `--check` mode to `esk-genesis` that reuses the installer's existing plan computation and
  exits by verdict without writing.**
- **Option 2: a separate `check-genesis-coverage.mjs` gate that re-reads the manifest and the consumer tree.**
- **Option 3: leave it to the bot (ADR-0110) and ship nothing in-repo.**

## Decision Outcome

Chosen: **option 1**. `--check` is one read-only branch over the plan the installer already computes.

- `[proven]` `--check` computes the same reconcile plan (copies, manifest, workflow, ruleset, hooks) and exits
  by **verdict**: `0` covered and current, `1` drifted or un-gated, `2` cannot assess (a broken source manifest
  or unreadable input, fail closed). It reuses the installer's `nothingToDo` predicate and hash verification, so
  there is one owner of "which gates belong and do they match" (`test/esk-genesis.test.mjs`, the CHECK cases).
- `[proven]` `--check` is **read-only**: it exits before the apply block, and `apply` is forced false under
  `checkMode` even if `--yes` is also passed, so it writes nothing (the "un-gated exits 1 and writes NOTHING"
  and "read-only wins" cases assert no `gate-manifest.json`/`scripts/ci` is created).
- `[proven]` The tests discriminate: forcing `checkMode = false` (the no-op mutation) reds all five CHECK
  cases (covered, drift, un-gated, bad-source, read-only-wins), so a `--check` that went blind cannot ship
  green (`verifiable-quality-gates`).
- It is wired two ways, both documented in `bootstrap/SKILL.md`: a consumer wires `esk-genesis --check` into
  its own CI next to `esk-init --check`, so an un-genesis'd or drifted repo is a red build; and it is the
  decision function the org-wide bot branches on (ADR-0110).

Option 2 was rejected because a separate gate would re-implement the manifest-to-tree reconciliation the
installer already owns, creating a second source of truth that drifts. Option 3 was rejected because the
`--check` predicate is committable here and is the lever that lets a consumer self-enforce coverage today,
without waiting on the governance-repo bot.

### Consequences

- Good, because `[proven]` a consumer can now make its own gate coverage a red CI state, and the bot has a
  predicate to branch on, with one owner of the coverage logic.
- Good, because the change is small (one flag, one verdict branch) and reuses every existing safeguard.
- Neutral: `--check` reports drift; it does not fix it. Reconciliation is still `esk-genesis --yes`, by design
  (read-only must stay read-only).
- Bad, because `--check` only tells a repo it is drifted once it is wired into that repo's CI; a repo that
  wires nothing is still unprotected. Closing that across an org is the bot (ADR-0110), which cannot live here.

### Confirmation

`test/esk-genesis.test.mjs` (the five CHECK cases, mutation-proven by forcing `checkMode=false`);
`features/repo-process/esk-genesis-check.feature` (executed by `npm run test:bdd`); and the fresh-context
judge-arch review recorded in `docs/arch-reviews/entries/`.

## What this does not fix, said plainly

- `[documented]` `--check` is a predicate, not enforcement: it makes drift observable and branchable, but a
  consumer must wire it into CI (or the bot must run it) for it to block anything. A repo that wires nothing is
  still un-gated. That cross-repo guarantee is the bot (ADR-0110), which is an org actor and cannot live in
  this repo.
- `[documented]` It reports coverage of the manifest's gates and the scaffolding (manifest, workflow, ruleset
  file, hooks); it does not verify the branch-protection ruleset is actually APPLIED on GitHub (that needs a
  `gh` API read and an org token), which stays the bot's and the admin's job.
- `[observed]` On a private repo on the free plan a required check cannot be enforced via a ruleset, so even a
  wired `--check` is advisory there until the org is on a plan that allows it (the same ceiling ADR-0110 states).
