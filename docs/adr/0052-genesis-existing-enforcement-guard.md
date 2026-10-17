---
status: "accepted"
date: 2026-10-16
decision-makers: mdenner
---

# esk-genesis refuses a foreign gate-manifest.json instead of reconciling against it

## Context and Problem Statement

`esk-genesis` bootstraps and then reconciles a consumer repo against the upstream `gate-manifest.json`.
Reconcile treats every prior gate whose `origin` is not `repo-local` as "an upstream gate we installed,"
and it **deletes** any such gate the new upstream set no longer ships (script and test). That is correct
when the prior manifest is one `esk-genesis` wrote.

It is dangerous when the consumer's `gate-manifest.json` is **foreign**: a file that pre-dates this tool, or
belongs to a different enforcement system that happens to use the same filename. A foreign manifest's gate
entries have no `origin` field, so they default to `upstream`, and reconcile would schedule every one of them
for deletion. The run would silently stomp the consumer's own enforcement. This is exactly the risk in a
repo that already runs its own conformance system (the swerl adoption case): pointing `esk-genesis` at it
without care could delete its gates.

## Decision Drivers

* Make the dangerous case structurally impossible, not merely warned: `esk-genesis` must never delete a
  consumer's own gates by mistake.
* Still allow a deliberate takeover, so a team that wants to adopt the bootstrap-v2 gates on top of (or in
  place of) an existing system can, with explicit consent.
* Keep the common paths (a fresh consumer, and a repo we already manage) frictionless.

## Decision

Reconcile only against a manifest `esk-genesis` recognizes as **its own**, by its bootstrap-v2 provenance:
a `generatedFrom` of the shape `owner/repo@x.y.z` **and** an `aggregator.requiredCheck`. A prior manifest
without both is treated as foreign.

1. **Refuse a foreign manifest by default.** If the consumer's `gate-manifest.json` exists but is not ours,
   `esk-genesis` exits 1 and writes nothing, explaining that reconciling could delete the gates it lists and
   pointing at the two safe choices: adopt it deliberately, or move/rename the file first.
2. **Only our own manifest drives deletions.** Removals are computed from `priorForReconcile`, which is the
   prior manifest only when it is ours and `null` otherwise. A foreign manifest therefore never contributes a
   single removal.
3. **`--adopt-existing` takes it over, safely.** With the flag, the run proceeds: the foreign
   `gate-manifest.json` is backed up to `.esk.bak` and replaced with ours, and because `priorForReconcile` is
   `null` nothing is deleted. The foreign gate scripts still on disk under `scripts/ci` are picked up by the
   normal repo-local scan and recorded as `origin: repo-local`, so parity will not flag them and future
   reconciles will never delete them. Adoption is additive: our gates are layered on, theirs are preserved.

It is pinned by tests in `test/esk-genesis.test.mjs`: a foreign manifest is refused (exit 1) with nothing
written and the foreign gate script intact; `--adopt-existing` backs up the foreign manifest, keeps the
foreign gate script, records it as repo-local, and layers our gate on; and a manifest we generated still
reconciles normally (a dropped gate is still removed), proving the guard keys on provenance rather than
walling off our own reconcile.

## Consequences

* `esk-genesis` can no longer silently delete a consumer's own enforcement; the destructive path requires a
  manifest it actually wrote, and taking over anything else is an explicit, consented, non-deleting action.
* A team adopting the gates over an existing system gets a deliberate, reversible takeover (the prior file is
  backed up) rather than a surprise.
* Known limitation: provenance is inferred from the manifest's own fields (`generatedFrom` + `aggregator`),
  not a signature. A foreign file that deliberately mimics both fields would be treated as ours; this is a
  convenience check against accidental stomping, not an authentication boundary. Hand-editing those fields
  out of a manifest we wrote will make the next run refuse until `--adopt-existing` is passed, which is the
  safe direction to fail.
