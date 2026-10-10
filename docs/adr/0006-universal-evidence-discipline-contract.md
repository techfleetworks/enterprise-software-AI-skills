---
status: "accepted"
date: 2026-10-10
decision-makers: mdenner
---

# Make the evidence discipline a universal, gated contract across all skills

## Context and Problem Statement

The repo's `skeptical-audit` skill defines a strong evidence discipline (evidence states, a ledger, the
disconfirming-case-first loop) and its description says it "applies to every agent and subagent by
default" — but nothing enforced that. The other skills' "done / secure / tested / safe" verdicts
carried no required proof, and the one mechanical enforcer (`claim-lint`) was advisory and, until PR0,
broken (its `--strict` was a no-op). This is audit finding S0 ("no skill forces an evidence-tagged,
adversarial assessment of its own output, and nothing enforces it") and it is the headline gap:
without it, every other skill's guarantees are only as honest as the author chose to be. How do we make
the discipline universal and *impossible to skip, break, regress, or error past*?

## Decision Drivers

* The discipline must bind **every** skill and **every** agent/subagent, not be opt-in.
* It must be **mechanically enforced** (fail-closed), not just stated in prose that regresses under deadline.
* It must adopt without a flag day — existing skills can't all be retrofitted at once.
* It must bind to `verifiable-quality-gates`: a claim is only truly durable when a discriminating gate keeps it true.

## Considered Options

* A single canonical contract + a fail-closed CI gate requiring every skill to carry it, with a shrink-only allowlist.
* Leave `skeptical-audit` as an opt-in skill and rely on authors to apply it.
* Copy the evidence rules into each skill (no single owner).

## Decision Outcome

Chosen option: "canonical contract + fail-closed gate + shrink-only allowlist", because it makes the
discipline universal and enforced without a big-bang rewrite, and keeps one owner (no drift). Changes:
add a sixth, strongest evidence state **`proven`** (a committed discriminating gate keeps a claim true
on every change — binding the discipline to `verifiable-quality-gates`); create the canonical
`skeptical-audit/references/evidence-discipline.md` contract (taxonomy, required ledger, adversarial
loop, and the per-skill obligation) that skills **link to**, not copy; ship
`check-skill-evidence-contract` (fail-closed, with a discriminating test) requiring every `SKILL.md` to
carry a `## Evidence & skeptical assessment (required)` section that links the contract and requires the
ledger in its DoD; grandfather the not-yet-retrofitted skills on a **shrink-only allowlist** (today: 13
of 15; `bdd-comprehensive-testing` and `skeptical-audit` comply); and add the evidence mandate to the
always-on directive and the governance Definition of done.

### Consequences

* Good, because from now on every *new or edited* skill must carry the evidence contract (the gate blocks it), and the allowlist can only shrink — compliance tightens monotonically to 100%.
* Good, because `proven` gives the discipline a top state that ties honesty to a mechanical gate, not author diligence.
* Good, because the contract has one owner (`skeptical-audit`), so the rules can't drift across skills.
* Bad (tracked), because 13 skills are still allowlisted; each Track-B rewrite must remove its entry (the gate's note nudges this).
* Neutral, because `claim-lint --strict` as a blocking gate over findings docs is specified but not yet wired into CI — a follow-up.

### Confirmation

`node skeptical-audit/scripts/check-skill-evidence-contract.mjs .` exits 0 (15 skills: 2 compliant, 13
allowlisted). `test/skill-evidence-contract.test.mjs` proves the gate detects a non-compliant,
non-allowlisted skill, **fails when a compliant skill is grandfathered onto the allowlist** (shrink-only
enforced), fails closed on zero skills / missing allowlist, and runs the real repo as a passing case
that also asserts the compliant baseline is not on the allowlist. All run in CI via `npm test`.

Activation caveat (`documented`, not yet `observed`): the always-on evidence mandate binds subagents
only once `always-on/enterprise-skills-always-on.md` is installed at the hook path
(`$HOME/.claude/`). This repo edits the template; a consuming environment must (re-)install it — the
bootstrap installer (planned) does this. Until then, "binds every subagent" is `documented`.

## More Information

The per-skill `## Evidence & skeptical assessment (required)` section is defined in the contract's §5.
As each skill is retrofitted (Track B), its id comes off `skill-evidence-allowlist.json`.
