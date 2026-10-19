---
status: "accepted"
date: 2026-10-18
decision-makers: mdenner
---

# An always-on enforcement nudge for consumers whose gates run but do not block merges

## Context and Problem Statement

A consumer repo that adopts the travelling gates with `esk-genesis` gets a workflow that **runs** every gate
on each pull request. But the gates only **block a merge** once an admin requires the `enterprise-gates` check
in the repo's branch protection. Until then the repo is in an advisory state: the gates show red, yet a change
can still be merged. That is the whole enforcement story quietly not being enforced.

Nothing in a repo can turn branch protection on. GitHub makes it an admin-only setting on purpose (so a
malicious pull request cannot grant itself enforcement), and a committed file does not auto-apply; it is set
through the API or UI. So we cannot *guarantee* a consumer is enforcing anything, and no check can *block* a
merge when protection is off, because a check can only block when it is itself a required check (the
chicken-and-egg: if nothing is required, nothing blocks). The strongest honest move is to make the gap
impossible to be unaware of.

## Decision

Add an **enforcement nudge**, the sibling of the existing sync nudge (ADR-0054), delivered by the same
always-on emitter so it reaches every session that loads the skills, injected by the harness rather than left
to the model to remember, on a fresh pull or an update alike.

- **`always-on/enforcement-nudge.mjs`** is the pure decision (mirrors `sync-nudge.mjs`); `emit-directive.mjs`
  gathers the local signals and prepends the text on a `SessionStart` (never on a subagent). The enforcement
  nudge is prepended after the sync nudge so it appears first (a security gap outranks a version gap, and being
  first survives the length-truncation that trims the end).
- **It fires** only when the repo is a consumer in the advisory state: the `enterprise-gates` workflow is
  present (so the origin repo and a directive-only repo never see it) and enforcement is not yet confirmed.
  Loud for a capped number of sessions, then a persistent quiet one-liner, so it is never fully silent but
  never infinite noise.
- **It clears** on a local **intent + confirm** signal: a committed ruleset under `.github/rulesets/` that
  requires the check **and** the `.github/.esk-enforcement-applied` marker that `apply-ruleset.sh` writes on
  success. Intent alone (a committed ruleset) does not clear it; the applied marker is required too.
- **`esk-genesis` scaffolds** a consumer ruleset (`.github/rulesets/enterprise-gates.json`) that requires the
  check (no-clobber) and travels `scripts/apply-ruleset.sh`, so turning enforcement on is one admin command.
  `apply-ruleset.sh` now applies every committed ruleset and writes the applied marker.

## Consequences

* A consumer whose gates are advisory gets a loud, every-session message telling the agent to tell the human to
  turn enforcement on, with the one command to do it, until it is wired. This turns "they forgot" into "they
  are repeatedly, deliberately choosing not to," which is the most any tooling can do against an admin-only
  switch. Verified end to end through the emitter: it fires in an advisory consumer, distinguishes
  no-ruleset from committed-but-not-applied, clears once the ruleset requires the check and the marker is
  present, and stays silent in the origin and for subagents.
* Honest ceiling, stated not hidden: the nudge drives the human hard but cannot force them, and it clears on a
  local signal that proves the ruleset was committed and applied, not that GitHub is live-enforcing it this
  second. Live verification needs an admin API call and is deliberately out of scope, the same stance
  `test/required-checks.test.mjs` already takes for this repo's own ruleset.
* Advisory mode is still useful, not nothing: the gates run and show red, and the local pre-push hook still
  catches problems at push time, neither of which needs branch protection. The nudge is about closing the one
  layer that does.
* The nudge rides the always-on directive channel, so it reaches a repo that ran `esk-init` (the directive). A
  repo that ran only `esk-genesis` (gates, no directive) would not get it; a fully protected repo runs both,
  and that is the documented pairing.
