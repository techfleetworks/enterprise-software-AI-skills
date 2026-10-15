# Agent acceptance evals (not gated BDD)

These are the behaviors the skeptical audit pulled OUT of the `.feature` files, because the actor is
the agent and the agent is probabilistic. You cannot write a pass/fail step that asserts "the agent
proposed X." These are validated by an eval harness and human judgment, not by a green/red CI gate.
Listing them here honestly, as evals, is the point: do not disguise agent behavior as a deterministic
test.

Each eval states the setup, the expected behavior, how it is judged, and the pass bar. None of these
block a merge; they measure whether the agent's assistance is good.

## E1. Genesis-first
- **Setup:** a fresh session spawns in a repo that has no bootstrap machinery.
- **Expected:** the agent flags that the repo is unbootstrapped and proposes a genesis PR before
  starting feature work.
- **Judged by:** eval harness runs the agent on a bare repo; a reviewer confirms it proposed genesis
  and did not proceed as if gates existed.
- **Pass bar:** proposes genesis in the large majority of runs; never silently builds features into an
  unprotected repo.

## E2. Skew warning
- **Setup:** a session spawns in a repo pinned to 1.3.0 while the machine's skills are 1.2.0.
- **Expected:** the agent warns the local skills are behind the repo and offers to update.
- **Judged by:** reviewer confirms the warning appeared.
- **Pass bar:** warns whenever local is behind the repo pin.

## E3. Invariant drafting quality
- **Setup:** a dev adds a new security-relevant function; the agent is asked to draft its invariant.
- **Expected:** the agent proposes a plain-English invariant that states intended correct behavior,
  not merely a restatement of the current (possibly buggy) code.
- **Judged by:** a reviewer scores whether the draft is a real specification, and whether it would
  catch a planted bug. This is the eval that gates the whole oracle research spike.
- **Pass bar:** TBD when the spike opens. The draft must catch a planted bug the drafter was not told
  about, or it fails.

## Open questions (not yet eval-able, needs first-hand verification)

- **Mid-session skill update:** does an already-running session pick up skills that were re-mirrored
  mid-session, or only a newly spawned session? This depends on Claude Code session-hook behavior
  that has not been verified. Verify empirically before writing an eval or a scenario for it.
- **Session-start injection reliability:** confirm the SessionStart hook injects the directive on
  every new session across the relevant session types (main, subagents). This is Claude Code behavior,
  measured, not assumed.

## Why these are not in the `.feature` files

A BDD scenario needs a deterministic, observable outcome so a step can bind to it. "The agent
proposed genesis" has no such binding; the agent might phrase it ten ways or, on an off run, not at
all. Putting it in `features/` would force a fake step that always passes, which is the vacuous-green
pattern the whole program exists to kill. So agent behavior is measured as an eval, and only the
deterministic system behavior (gate exit codes, file hashes, merge state) is gated BDD.
