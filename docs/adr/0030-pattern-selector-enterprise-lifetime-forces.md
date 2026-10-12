---
status: "accepted"
date: 2026-10-12
decision-makers: mdenner
---

# Rebalance pattern-selector toward enterprise lifetime forces, not a minimalist default

## Context and Problem Statement

The pattern-selector skill was written with a strong minimalist default: "the most common right answer to
'which pattern?' is 'none'," and a YAGNI gate that admitted a pattern "only when a named force calls for it,"
read as a force visible in the current code. Watching a fresh agent apply the skill surfaced the problem: for
enterprise systems this is short-sighted. These systems are built for where they are going, not only where
they are today, and under-building a system whose growth is known (more scale, more consumers, a team
boundary, an audit duty) costs far more to retrofit later than to design in. The skill weighed the current
diff, not the system's lifetime. mdenner: "this is not the best way to build enterprise apps, it is short
sighted. We need more than that."

This also sat in tension with the repo's own global rule, which allows complexity justified by a requirement
that exists now OR is "certain and imminent." The skill over-rotated on "now" and under-weighted "certain and
imminent," which at enterprise scale is a large class of real forces.

## Decision Drivers

* Enterprise architecture weighs the system's lifetime (scale, consumers, team, compliance, operability,
  platform longevity), not just the current change.
* Keep the anti-over-engineering guard: speculative generality is still rot, and over-engineering still fails
  the architecture gate.
* Stay honest and testable: the stance change is prose, so it is reviewed by judge-arch, not claimed as a
  gate it does not have.

## Considered Options

* Rebalance the stance: make lifetime forces first-class, narrow YAGNI to speculative-only, add retrofit-cost
  and force-likelihood to the decision record, and reframe the default.
* Flip to a pro-pattern default (rejected: over-engineering is a real failure the skill and the gate fight).
* Leave it (rejected: it under-architects enterprise systems, which is mdenner's named concern).

## Decision Outcome

Chosen option: rebalance the stance. The default changes from "the simplest thing that fits right now" to
"the structure that fits the forces this system will actually face over its lifetime, chosen on purpose."
"No pattern" stays a valid and common outcome, but only when the forces are genuinely small and will stay
small, not merely small today. The forces step now asks for the certain-and-imminent forces (scale,
consumers, team and ownership boundaries, compliance, operability) alongside the present ones. The YAGNI gate
is narrowed: it blocks SPECULATIVE structure (a factory for one use, an interface with one implementation and
no second consumer in sight), not deliberate design for growth you can already see, and it weighs the cost of
adding structure now against retrofitting it into a running system later. The pattern-decision record gains
two fields, "Lifetime forces" and "Cost of deferring," required by the Definition of done and the done
checklist. The same rebalance is applied to the chooser reference so the two cannot drift. The anti-pattern
and criticism references are unchanged: over-structure is still an anti-pattern, the counterweight that keeps
this from becoming a pro-pattern default.

### Consequences

* Good, because the skill now judges a design the way an enterprise team does: against the forces the system
  will actually face, so it stops under-architecting known growth while still rejecting speculative structure.
* Good, because it aligns with the repo's own "now OR certain and imminent" rule instead of over-rotating on
  "now."
* Neutral, because this is a stance and decision-record change, not a new gate; the catalog-completeness gate
  and the house-style gate are unchanged, and the full suite stays green.
* Bad (honest limit), because "is this force really certain and imminent, or am I inventing it to feel
  thorough?" is a judgment call, not a greppable rule. It is held by the decision record and a fresh-context
  judge-arch review, the same way the old "is this abstraction premature?" judgment was. The skill makes the
  question unavoidable; it does not make the answer automatic.

### Confirmation

The revised `pattern-selector/SKILL.md` and `references/choosing-a-pattern.md` carry the rebalanced default,
the certain-and-imminent forces, the narrowed YAGNI gate, and the two new record fields. `npm test` reports
350 tests, 0 failing; `npm run check:architecture` exits 0 (the house-style gate confirms no em dashes were
introduced in the pattern-selector files, and the catalog-completeness gate still passes). A fresh-context
judge-arch review checks that the new stance is internally consistent and does not quietly become a
pro-pattern default.

## More Information

Follows ADR-0014 (the pattern-selector skill). The stance is recorded durably in memory as mdenner feedback.
Aligns with the repo's global anti-over-engineering rule, which permits complexity for a requirement that is
now or certain and imminent.
