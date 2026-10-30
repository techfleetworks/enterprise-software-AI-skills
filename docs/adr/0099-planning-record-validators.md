---
status: "accepted"
date: 2026-10-30
decision-makers: mdenner
---

# Step-3 planning-record validators: a source edit needs its applicable skills' plans, complete

## Context and Problem Statement

Issue #175 asks that before the first source edit of a task, each applicable skill's planning record exists
(step 3 of the formula: select, load, plan). PR-A (ADR-0098) built the select and load steps and the edit-gate.
This ADR covers PR-B: the plan step. Each skill's "Definition of done" names a planning record it requires (a
pattern-decision record, a threat model, a BDD use-case by audience matrix, an ADR, a data-lifecycle record, a
reversibility record, a service-readiness record, UI verdicts, an architecture-standards record), and today
nothing checks those records exist and are complete before code changes. The audited session skipped them: it
wrote that it was "skipping the formal artifacts ... until asked", a helper's privacy test skipped the threat
model, and an ADR cited a measurement file that did not exist and kept a placeholder.

## Considered Options

- **One validator per skill (nine checkers).** Faithful to each skill, but nine near-duplicate scripts that
  drift, and a ninefold wiring cost into the edit-gate.
- **One `plan` mode in `check-task-plan.mjs` with a declarative schema per record type**, mapping each skill to
  its record and checking presence plus the required fields (and, where a skill's DoD demands it, that a claim's
  evidence state is `observed` or `proven`, not `inferred`). One place, one wiring point.
- **How to validate the ADR.** Shell to `check_adr` (the authoritative gate) from the plan check, or do a fast
  structural pre-check in the validator. Shelling to bash on every plan run (and in CI's BDD run) drags in the
  bash dependency and the Windows fork flake; `check_adr` remains the deep gate elsewhere.

## Decision

Add a `plan` mode to `check-task-plan.mjs` and wire it into the edit-gate as step 3:

1. **`plan` mode.** Given the selection and a plans file (record-type -> record), for every required/applies
   skill that defines a planning record (a fixed skill-to-record map), the record must exist and pass its schema,
   or the edit is held (exit 2). The schemas come from each skill's Definition of done: the pattern-decision's
   fourteen parts (including the simpler alternative and the verification status); the threat model's surface and
   each threat mapped to a category, an OWASP cheat sheet, a control, and a `@security` scenario (a control with
   no scenario is not-assessed, never a pass); the BDD matrix's audiences and use-case by audience cells; the ADR;
   the data-lifecycle record whose deletion claim must be `observed`/`proven`, not inferred; the reversibility
   record (no "safe to ship" below observed); the service-readiness record whose alert-fires claim must be
   observed/proven; the three UI verdicts, each with an observed/proven measurable claim; and the
   architecture-standards record whose load/resilience claims point to a measurement or a test.
2. **A fast structural ADR pre-check** in the validator (the ADR file exists, has the MADR sections, has no
   unfilled placeholder, and its cited confirmation files exist, catching the audit's dead-link case). `check_adr`
   stays the authoritative ADR gate, run separately; the validator does not shell to bash, so the plan check and
   the BDD run stay dependency-free.
3. **Wire it into the edit-gate** behind `ESK_PLANS`: for a source edit, after select and load, the plan records
   for the selected skills must exist and be complete, or the edit is denied.
4. **Proof.** `test/check-task-plan.test.mjs` gains eleven plan tests (a no-op validator flips every hold), the
   edit-gate test gains a step-3 deny, and sixteen scenarios (one `@audience:operator`) drive the real validator
   on the harness.

The per-skill-validator option is rejected as nine drifting near-duplicates; shelling to `check_adr` is rejected
to keep the plan check and the BDD run off bash (the structural pre-check plus the separate `check_adr` gate
cover it).

## Consequences

* Before a source edit, every applicable skill's planning record must exist and be complete, with the
  evidence-state bar where a skill's DoD demands it, or the edit is held. The audit's "skip the formal artifacts
  until asked", a threat without a control or a control without a `@security` scenario, an ADR with a placeholder
  or a dead link, and a deletion claim that is only inferred are each caught at the edit.
* One owner for the plan logic (the `plan` mode plus a declarative schema table); adding a skill's record is a map
  entry plus a schema case, not a new script.
* Honest limits. The schemas check that a record is present and structurally complete and that named claims reach
  an evidence state; they do not prove the plan is sound (a human still reviews), and the validator's ADR check is
  a fast pre-check, not a replacement for `check_adr`. A record may cite a measurement file (arch-standards) or a
  `@security` scenario (threat-model) by name; unlike the ADR's confirmation files, those references are not checked
  for existence here, so a cited-but-absent measurement or scenario is caught by review and the owning gate
  (comprehensive-test-strategy, owasp-secure-coding-bdd), not by this pre-check. The edit-gate holds edits; the Stop finish-check (issue
  #174) remains the backstop that holds the turn, and both must fail closed because Claude Code hooks fail open by
  default. `unsure-audience-asks` is modeled as a hold on an empty audience set (the agent cannot proceed without
  confirmed audiences), which is the enforceable shadow of "stop and ask"; the asking itself stays a human
  interaction.
* The sixteen scenarios include the first `@audience:operator` scenario in the always-on features;
  `operator` is already a declared audience, so no `bdd-config.json` change was needed.
