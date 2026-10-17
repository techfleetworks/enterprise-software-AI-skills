---
status: "accepted"
date: 2026-10-16
decision-makers: mdenner
---

# esk-genesis offers code-owner review at setup, as an opt-in the user is asked about

## Context and Problem Statement

The gates are the first line of defense: a change cannot merge unless the required check passes. But a green
check does not stop someone from weakening the gates themselves (editing a gate script, the manifest, or the
CI workflow) as long as the weakened version still passes. The second line of defense is code-owner review: a
named owner must approve a change to those paths. This repo already uses that pattern (`.github/CODEOWNERS`,
ADR-0044), but a repo adopting the gates via `esk-genesis` got no help setting it up, and nothing asked the
adopter whether they wanted it.

The sign-off decision (D4) was that code-owner review is **optional** and the user should be **asked** when
they set up a repo, with enough context to decide, rather than it being forced on or silently skipped.

## Decision

Add an opt-in `--code-owners` flow to `esk-genesis`, and make the `bootstrap` skill ask about it.

1. **Opt-in flag.** `esk-genesis --code-owners "<@user ...>"` scaffolds `.github/CODEOWNERS` in the consumer,
   with the enforcement paths (`scripts/ci/`, `gate-manifest.json`, `.github/workflows/`, `.github/CODEOWNERS`)
   owned by the given handles. It is opt-in because the owner is something the installer cannot guess.
2. **No-clobber, fail-closed.** An existing `CODEOWNERS` is never overwritten (a note tells the user to cover
   the enforcement paths themselves). Each owner handle is validated against `@user` / `@org/team`; an invalid
   handle is a blocker that writes nothing, so a malformed owner never lands in `CODEOWNERS`.
3. **Honest about what it does not do.** Committing `CODEOWNERS` is necessary but not sufficient: the repo must
   also **require** code-owner review on those paths, a one-time repo-settings change the installer cannot
   make. `esk-genesis` prints the exact setting to enable; the plan and the success output both say the file is
   inert until that rule is on.
4. **The skill asks.** The `bootstrap` skill instructs the agent to ask the user, when setting up the gates,
   whether they want code-owner review, and to explain the benefit (a human sign-off behind the gates) and the
   cost (a named owner plus one settings change plus a review step), so the user makes an informed call. It is
   safe to skip and add later; recommended for a shared or regulated repo.

It is pinned by tests in `test/esk-genesis.test.mjs`: `--code-owners` scaffolds `CODEOWNERS` over the
enforcement paths owned by the given handles, the absent flag writes nothing (opt-in), an existing file is not
clobbered, and an invalid owner blocks the whole apply with nothing written.

## Consequences

* A repo adopting the gates can set up the human backstop in the same step, owned by whoever they choose, with
  the enforcement paths covered correctly, instead of hand-writing `CODEOWNERS` and guessing the paths.
* The decision stays the user's: the installer never turns it on by itself, and the skill asks rather than
  assumes. A user who skips it still has the gates; they just do not have the human second line yet.
* Known limitation: the installer cannot enable the "require code-owner review" ruleset rule (a repo-settings
  change). It scaffolds the file and prints the setting, but a human must turn the rule on, and until they do
  the file documents owners without enforcing review. This is stated in the plan, the output, and the skill so
  it is not overread as "review is now enforced."
