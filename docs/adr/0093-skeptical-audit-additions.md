---
status: "accepted"
date: 2026-10-29
decision-makers: mdenner
---

# skeptical-audit catches mistakes before and around a claim, not only in the claim

## Context and Problem Statement

Issue #180 (one of ten from an agent-session audit) found that several failures happened before a claim was
written, or in how a claim was framed, so the existing `skeptical-audit` (which checks a stated claim of fact)
did not reach them: code was built on a guess about which module owned a behavior; the most favorable cut was
headlined (3.0%) while the clean measure was 6.2%; work rows were marked "Done" while most of their evidence
was inferred, not re-checked; a downgrade was the last word, with no next step to raise it; and one approach
was called "the primary control" and "safer" than another with no measurement. None of these is caught by a
rule that only inspects a finished claim for an evidence state.

## Considered Options

- **Documentation and review only**: state the five rules in `skeptical-audit` and rely on the fresh-context
  review and habit to apply them.
- **Document AND raise each as a `claim-lint` smoke alarm** (plus add comparison claims to the generic
  evidence-state patterns), so the loose word or framing is flagged mechanically.
- For "observe the owner before building" specifically: **a `claim-lint` smoke alarm on the report** vs
  **blocking the edit at the edit-time hook** (issue #175).

## Decision

Add the five rules to the evidence contract (`skeptical-audit/references/evidence-discipline.md`, section 7)
and raise each as a `claim-lint` smoke alarm, matching the pattern set by issues #178 and #179:

1. **Observe the owner before building.** An ownership assumption ("module A owns Y") with no observed-owner
   record (`file:line` plus the run output) and no evidence state is flagged. The edit-time hook (#175) will
   be the blocking enforcement; this ships the rule and the smoke alarm.
2. **Declare the headline first.** Headlining the most favorable cut (or admitting a cherry-pick) is flagged;
   the fix is to name the headline metric before measuring and report every cut with what each counts.
3. **Every downgrade names its next step.** A downgrade with no next step is flagged, and the one-rule line in
   the SKILL now says a downgrade names the measurement that would raise it and is not the last line.
4. **"Done" needs a mostly-observed majority.** A "done" claim is flagged when the report's tallied "N
   observed" is below its "N inferred"; show "N of M observed" instead.
5. **Comparison claims need a measurement.** "A is safer/better/more reliable than B", and "the primary/main
   control", are added to the generic claim patterns, so they need an evidence state like any other claim.

The documentation-only option is rejected for the same reason as #179: the audit shows the discipline was not
applied without a mechanical nudge. For the ownership rule, the edit-time block (#175) is the real
enforcement, but it is not built yet, so #180 ships the documented rule plus the `claim-lint` smoke alarm now
and the hook will call the same discipline later. Each rule ships a discriminating test (bad flags, good
passes) and an executable scenario on the BDD harness.

## Consequences

* The five classes of before-and-around-the-claim mistakes are now caught by `claim-lint --strict` and
  documented in the one canonical contract, so a report that commits them is flagged before it is sent.
* Honest limits: `claim-lint` is a smoke alarm, not a judge. These rules are heuristics with deliberately
  tight triggers, tightened after a fresh-context review hunted their false positives: the ownership rule is
  scoped to a code-ownership context (a code noun or an "assume") and is flagged only without an owner record
  and without a state, so ordinary domain facts ("the user owns their data") are not flagged; the downgrade
  rule requires an explicit downgrade verb, so "now reported to the vendor" is not read as a downgrade; the
  headline rule is scoped to the reporting sense, so git "cherry-pick" is not flagged; and the comparison
  rule matches a curated adjective set ("safer/better/faster/... than", "more reliable/secure/... than", "the
  primary/main/real control"), not a bare "more <anything> than". They catch the loose word or framing, not
  the subtle gap, which the skeptic's loop and the fresh-context review still own. The ownership rule's
  blocking enforcement (holding the edit) lands with the edit-time hook in #175; this change ships the rule,
  not that hook. The "done needs observed majority" rule tallies "N observed" and "N inferred" counts local
  to the done claim's own line and its adjacent evidence row (not document-wide) and only in an
  evidence/records context, so it depends on those counts being stated near the claim.
* The scenarios run on the executable BDD harness (ADR-0091) and reuse the shared "the mark is refused" step.
