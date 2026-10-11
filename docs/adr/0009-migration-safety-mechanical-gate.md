---
status: "accepted"
date: 2026-10-10
decision-makers: mdenner
---

# Enforce expand/contract migrations with a mechanical gate

## Context and Problem Statement

`release-deployment-safety` teaches the expand/contract (parallel-change) pattern and lists the
specific SQL changes that break a running old instance or take a blocking lock: `NOT NULL` with no
default, a direct column/table rename, an in-place type change, a bare `SET NOT NULL`, a
non-`CONCURRENTLY` index build, and the destructive contractions (`DROP`/`TRUNCATE`). Until now this
was prose only — an agent or a human could write exactly the migration the skill warns against and
nothing would stop the merge. The repo's thesis is that a skill's guidance must be structurally
enforced, not advisory, with a discriminating test so the gate can't rot.

## Decision Drivers

* Enforce the mechanically-detectable, lock-taking / break-old-instance subset of the skill's
  "Rules for specific changes" / "Never" list at merge time (a one-shot `UPDATE` backfill has no
  text signal and stays out of scope — tracked, not claimed).
* Dependency-free and vendor-neutral (it ships and is copied with the skill).
* Allow a *deliberate*, reviewed exception without weakening the default (fail-closed) posture.
* A false-red trains people to disable the gate, so minimize false positives and make the one
  unavoidable context-dependent case (a brand-new table's non-concurrent index) suppressible.

## Considered Options

* A bespoke `check-migration-safety.mjs` SQL linter in the skill, with per-statement rules.
* Express the rules as `arch-gate` config (forbidden regex in globs).
* Leave it as prose and rely on review.

## Decision Outcome

Chosen option: "a bespoke linter in the skill." `arch-gate`'s forbidden-regex engine can't express
the two rules that need an *absence* condition — `NOT NULL` is safe **with** a `DEFAULT`, and
`CREATE INDEX` is safe **with** `CONCURRENTLY` — so a plain pattern engine would false-positive on
the safe forms. The gate splits each file into statements, strips comments, and applies a rule table
where each rule may carry an `unless` clause (e.g. a CHECK/FOREIGN KEY added `NOT VALID`, or a column
`NOT NULL` with a `DEFAULT`, is safe and passes). A deliberate exception is suppressed only by an inline
`-- migration-safety:ignore <reason>` (or `=rule`) on the statement; a bare `ignore` with no reason
does **not** suppress — an unexplained waiver is not a waiver, mirroring the `arch-gate` waiver
discipline.

### Consequences

* Good, because the unsafe patterns the skill forbids now fail CI instead of relying on a reviewer to notice them.
* Good, because the `unless` clauses keep the safe expand-phase forms (nullable+default, CONCURRENTLY) green, so the gate doesn't punish correct migrations.
* Good, because a reviewed destructive contraction stays possible, but only with a written, in-diff reason.
* Bad (honest limit), because it is a regex/statement linter, not a SQL parser: unusual formatting or a dialect quirk can miss or over-match. The inline-ignore escape hatch and the test fixtures bound this, and a future version could swap in a real parser.
* Neutral, because it is a reference gate an adopting repo points at its own migrations directory in CI.

### Confirmation

`test/migration-safety.test.mjs` (22 tests): a safe expand migration, `NOT NULL DEFAULT`, a
`CHECK … NOT VALID`, a `FOREIGN KEY … NOT VALID`, and a column named `type` all pass; each of the
nine unsafe patterns fails with its rule named; a reasoned ignore (bare and `=rule`) suppresses while
a reason-less or 1-char-reason ignore does not; a trailing ignore binds to its own statement and does
not leak to the next; a commented-out `DROP` is not flagged; an empty directory fails closed (exit 2).
All run in CI via `npm test`.

## More Information

Rules trace to `release-deployment-safety/references/zero-downtime-db-migrations.md`. This is the
first of the Phase-3 structural starter gates (untagged-PII, OWASP lints, axe, check-test-shape
follow, each in its owning skill with its own discriminating test).
