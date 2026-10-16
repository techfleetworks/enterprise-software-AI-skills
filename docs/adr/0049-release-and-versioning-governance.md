---
status: "accepted"
date: 2026-10-16
decision-makers: mdenner
---

# How releases are cut, versioned, and retired, and who may do it

## Context and Problem Statement

Bootstrap-v2 makes a published version the trusted anchor: provenance compares a consumer's manifest
against the published release, and immutable releases (ADR-0046 / ADR-0044, approved) freeze a version so
it cannot be rewritten. Freezing the past is only safe if there is a clear, deliberate way to evolve the
present: who may cut a release, how versions are numbered, how a bad one is retired, and how an emergency
fix ships. Without that written down, "who cuts a release" defaults to "whoever has admin," and "what
counts as a breaking change" is a guess, which is dangerous here because a consumer's parity and provenance
checks react to the manifest, so tightening a gate can turn a currently-green consumer red.

## Decision Drivers

* Keep improving continuously, in controlled steps, the way the repo already works (contributor merges);
  immutability must not become a reason not to ship.
* Match the trust model the team already uses: if you are trusted to merge, you are trusted to release.
* Make "does this change force consumers to act?" a rule, not a judgment call, since the gates make that
  consequence real.
* A frozen release cannot be erased, so retiring a bad one needs an explicit, standard path.

## Decision

**Who may cut a release.** Any contributor with repository write permission, not admins alone. Same trust
model as merging. There is no mandatory second reviewer; the automated gates (parity, provenance,
upstream-integrity) are the mechanical backstop and catch a weakened, drifted, or removed gate regardless
of who merges. Requiring code-owner review (ADR-0044 Decision 4) is available but off by default; the
adoption flow offers it per repo with its tradeoffs explained.

**Versioning: standard semver, with one rule specific to this system.** A change that would turn a
currently-green consumer red is consumer-affecting and must be released as at least a minor, with the
consequence called out loudly in the release notes; it is never a quiet patch.

* **Patch** (1.1.0 to 1.1.1): a fix that does not change what a consumer must do. Consumers upgrade when
  they like.
* **Minor** (1.1.0 to 1.2.0): a new gate or capability, backward compatible. Consumers get it when they
  bump.
* **Major** (1.x to 2.0.0): a breaking change, such as tightening a gate so existing consumer code goes
  red, or changing the manifest shape. The release notes say so plainly.

**Retiring a bad version.** A frozen release cannot be edited or erased, so it is superseded, not removed:
ship the fix as a new version, edit the bad release's notes to say "deprecated, use X.Y.Z," and for a
security problem publish a GitHub security advisory. Consumers on the bad version move forward by bumping.

**Emergency and security fixes.** The path is "ship a new version fast." The release process stays light
enough to be a real hotfix path: a contributor can cut it with no multi-reviewer wait.

**Upgrade path for consumers.** Forward-only. `esk-genesis` reconcile moves a consumer to a newer pinned
version and deliberately cannot move it backward. The system therefore evolves as a steady forward march
of frozen, reviewed versions.

**Staying current is not left to memory.** At the start of an agent session in a bootstrapped repo, a
drift check runs automatically, with no human initiation (the always-on layer fires it). If the repo is
behind the installed skills version, the agent surfaces it loudly at the top of the session and strongly
encourages updating, before coding starts, so standards are set at the first step of work as well as the
last (the pre-push hook and the required check). Applying the update stays deliberate: a human confirms,
then reconcile runs, so a stricter new gate never turns a green repo red mid-work by surprise. This is
detect-and-loudly-encourage, never silent-force. The mechanism (an `esk-genesis --check` drift mode, a
session-start notice, and the encouragement as an agent-acceptance eval since it is agent behavior, not a
gate) ships as its own change.

The operational how-to (the steps a contributor follows) lives in `CONTRIBUTING.md` under "Releasing and
versioning," next to the existing contribution rules, so contributors find it where they already look.

## Consequences

* Improvement is continuous and contributor-driven; immutability freezes only the published snapshots, not
  the repo or anyone's ability to ship the next version.
* "Breaking for consumers" has a definition (turns a green consumer red), so the version number carries a
  real promise and consumers can trust that a patch is safe to take.
* Because a bad release cannot be erased, the deprecation-and-advisory path is the only way to retire one;
  this ADR makes that the standard, not an improvisation.
* Known limitation: trusting any write-permission contributor to cut a release means a trusted contributor
  could ship a genuinely weaker gate in a new version; only trust-in-contributors stops that, by choice.
  A repo that wants a human gate on the enforcement files turns on code-owner review (ADR-0044 Decision 4).
* Known limitation: this is process, not a mechanical gate. Nothing in CI forces semver to be applied
  correctly; the "consumer-affecting equals at least minor" rule is enforced by contributors following
  this ADR and by the gates turning a mis-shipped consumer red, not by a check that reads intent.
