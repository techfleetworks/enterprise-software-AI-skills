---
status: "accepted"
date: 2026-10-21
decision-makers: mdenner
---

# A consumer-lifecycle upgrade harness: install the previous release, upgrade, and converge

## Context and Problem Statement

ADR-0069 fixed the esk-genesis no-clobber upgrade bug and shipped a discrimination test
(`test/consumer-lifecycle.test.mjs`) that proves the hook and workflow refresh by staling them with junk
content. ADR-0069 named the fuller harness as the tracked follow-up, and noted the pattern behind every
consumer-install bug so far (the three in #112 and the no-clobber bug): each lives in the EXISTING-consumer
path that the repo's origin self-dogfood never exercises, because the origin has one real gate copy, its own
hook, and is never upgraded over itself. The gap is that CI tests the origin topology, not a real consumer
installed from a prior release and upgraded.

## Decision

Add `test/consumer-upgrade-harness.test.mjs`, wired into `npm test` (the required test job), with two checks:

1. **Converge a real prev-release install to a fresh install.** It materializes the previous release (v1.2.1)
   with `git worktree add <tag>`, installs it into a throwaway consumer, upgrades that consumer to HEAD, and
   asserts the upgraded consumer is byte-for-byte identical to a fresh HEAD install across EVERY travelling
   file (same file set, same contents, excluding the `.esk.bak` backup). Any file that fails to refresh, is
   orphaned, or drifts on upgrade is a mismatch here, so this catches the whole class, not only the two files
   we already fixed. It skips if git or the tag is unavailable (CI/ubuntu always has both).

2. **Run the real pre-push hook.** It runs the installed consumer's `.githooks/pre-push` against the manifest's
   real gate `invoke` args and asserts it passes on a clean consumer, the #112.1 path (a hook that lost its
   args would scan nothing or fail).

This is test-only infrastructure: no gate script, manifest, or installer behavior changed, so it carries no
version bump and rides the 1.2.2 release.

## Consequences

* A real release transition (install vN-1, upgrade to HEAD) is now exercised in CI, so a future travelling
  file that forgets to refresh on upgrade turns the suite red the first time that file's content changes
  across a release. The harness also catches an orphaned or drifted file, not only a stale one.
* Honest limit on discrimination (the key point). The convergence check detects a no-clobber or
  "forgot-to-refresh" regression only when a travelling file's CONTENT actually changed between the pair of
  releases. For the v1.2.1 -> v1.2.2 pair the hook and workflow content are unchanged (PR1 touched only the
  installer), so on this exact pair the convergence check is a passing consistency check, not a live
  demonstration of the bug. This was proven: injecting a real content difference into the hook and reverting
  esk-genesis to no-clobber makes the check fail, naming `.githooks/pre-push`. The content-agnostic
  discrimination guard is ADR-0069's `consumer-lifecycle.test.mjs`, which fails whenever the refresh is removed
  regardless of whether files changed. The two are complementary: one proves the refresh mechanism works, the
  other proves a real release transition converges.
* Not yet covered: a standing vendored-skills consumer run (install a consumer that vendors `.claude/skills`
  and assert `enterprise-gates` is green). The #112.2 and #112.3 self-flagging and wrong-copy bugs are already
  fixed and guarded by those gates' own tests; a standing vendored-consumer job remains a tracked follow-up.
  The harness pins the prior release to v1.2.1, so it proves N-1 -> N, not every historical path. CI is Linux;
  the worktree and hook spawning are covered there, and the test skips cleanly where git cannot materialize the
  tag.
