---
status: "accepted"
date: 2026-10-16
decision-makers: mdenner
---

# A pre-push hook runs the offline gates locally, with CI as the authoritative backstop

## Context and Problem Statement

The enterprise gates run in CI under one required check (ADR-0043), which is the authority on whether a
change may merge. But waiting for CI to learn that a change drifted from the manifest is a slow feedback
loop: a developer pushes, waits minutes, sees red, fixes, pushes again. Bootstrap-v2's design calls for a
local **pre-push hook** so that the cheap, offline gates run on the developer's machine before the push,
turning a minutes-long round trip into a few seconds. The `sync-drift` feature already pins the trust
boundary: a developer may bypass the hook with `git push --no-verify`, and CI still catches the drift, so
the hook is a convenience, never the enforcement.

## Decision Drivers

* Fast local feedback: catch a drifted or missing gate before the push, not after CI.
* Honest about authority: the hook is a pre-flight; CI under the required check is the backstop, and a
  `--no-verify` bypass must not escape CI.
* Offline only: the hook must not depend on the network. The provenance gate needs the published upstream
  release asset, so it stays a CI concern; the hook runs only the gates that are checkable locally.
* Installed by the same tool that bootstraps a repo, so there is no separate manual setup.

## Decision

Add a committed hook template, `.claude/skills/bootstrap/templates/pre-push`, a Node script (not shell, so
it runs the same on every platform and is directly testable). It resolves the repo root, then runs the
**offline** gates it finds in the consumer layout: the parity gate (committed scripts match the manifest)
and the bootstrap-presence gate (the skeleton exists). A gate whose script is absent is skipped, so the
hook never blocks over a gate the repo does not carry. If any offline gate fails, the hook exits non-zero
and blocks the push, printing how to bypass it (`--no-verify`) and that CI runs the same gates anyway. The
provenance gate is deliberately not run here (it needs the network and the published release asset).

`esk-genesis` installs it: when the source ships the template, genesis writes it to the consumer's
`.githooks/pre-push` (the file write participates in the normal rollback) and then, best-effort, marks it
executable and points `core.hooksPath` at `.githooks`. It **never overwrites an existing `core.hooksPath`**:
if the consumer already routes hooks somewhere (husky, another `.githooks`), genesis leaves that setting
alone and prints how to enable the pre-push hook manually, so it cannot silently disable a consumer's
other hooks. A source without the template, or a target that is not a git repo, still bootstraps cleanly,
and the committed hook can be turned on later with one `git config core.hooksPath .githooks`. If genesis
set `core.hooksPath` (only when it had no prior value) and the run then fails, rollback unsets it.

It is pinned by two tests. `test/pre-push-hook.test.mjs` runs the real template against stub gates and
asserts it passes when all pass, blocks when any offline gate fails, and skips an absent gate.
`test/esk-genesis.test.mjs` asserts genesis installs the hook from the template and stays idempotent. The
hook was also confirmed end to end: a genesis'd consumer passes the hook when in sync and is blocked by it
when a gate script is tampered.

## Consequences

* Developers get the gates' verdict in seconds, before the push, which shortens the fix loop.
* The hook is a convenience, not a gate: it can be bypassed, and CI remains the authority. The ADR and the
  hook's own output say so, so no one mistakes a green hook for a green build.
* Known limitation: git hooks are per-clone by design (a clone never auto-runs a committed hook for
  security reasons). `core.hooksPath` is set by `esk-genesis` on the machine that runs it; every other
  clone must set it once (or re-run the bootstrap). The hook file itself travels in the repo.
* Known limitation: the hook runs only the offline gates. A provenance problem (the committed manifest not
  matching the published release) is caught by CI, not locally, because verifying it needs the network.
* Executable-bit handling is best-effort from `esk-genesis`; on a platform that does not preserve it, the
  consumer sets it (or git on the consumer does) when the hook is committed.
