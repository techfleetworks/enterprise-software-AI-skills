---
status: "accepted"
date: 2026-10-16
decision-makers: mdenner
---

# The skills repo arms its own pre-push hook and runs its own gates locally

## Context and Problem Statement

bootstrap-v2 gives a consumer repo a local pre-push pre-flight (ADR-0048) that is armed with zero steps on
`npm install` (ADR-0050). The enterprise-skills repo itself did not use any of that: a developer working on
the skills repo got no local pre-flight, so the first signal that a change broke a gate was a red CI run. The
repo preached a local-mirror-plus-zero-step-arming story it did not practice. We want the repo to dogfood it,
so the whole adoption loop is demonstrated on one machine: clone, `npm install`, and the next push runs the
repo's gates locally.

A complication: the bootstrap-v2 pre-push template is manifest-driven and resolves each gate at
`scripts/ci/<name>`, the **consumer** layout. The skills repo is the **upstream**; it has no `scripts/ci/`
(its gate scripts live under `.claude/skills/<skill>/scripts`), and its real gates are npm scripts
(`check:architecture`, `check:links`, and so on). If we armed the template here, it would find no gate scripts
at `scripts/ci/` and pass hollow, which is worse than having no hook because it looks like coverage.

## Decision

Arm a **repo-specific** pre-push hook on the skills repo, reusing the generic arming helper but not the
manifest-driven template.

1. **The hook** (`.githooks/pre-push`) runs the repo's own fast, full-scan offline gates by npm script name:
   `check:architecture`, `check:links`, `check:receipt`. It is CommonJS (invoked by name, and the repo is not
   `type=module`, so it must parse on Node 20 which has no automatic ESM detection). `check:verbatim` is
   deliberately excluded: it needs the gitignored `vendor/cheatsheets-src/` that only `npm run vendor:owasp`
   fetches over the network, so on a fresh clone it fails closed and would block every push. It is a
   license/provenance gate with a network prerequisite, not an offline gate, so it stays CI's job (the
   `owasp-verbatim` job vendors first). A fresh-context review caught this: the author's first version
   included it and "verified" clean on a machine that already had the vendored source, the exact
   primed-machine blind spot self-dogfooding is meant to close.
2. **Zero-step arming** reuses `.githooks/install-hooks.mjs` (ADR-0050, copied from the template, unchanged):
   it points `core.hooksPath` at `.githooks`, never clobbers an existing `core.hooksPath`, and never fails the
   install. A `prepare` script in `package.json` runs it on `npm install`.
3. **Honest scope.** The hook runs only the fast offline gates. The heavy comprehensive test suite
   (`npm test`), the routing gate (which needs the changed-file list a local pre-push does not have), and the
   network provenance concern stay CI's job. CI is the authority; the hook is an early-catch convenience, and
   `git push --no-verify` bypasses it (CI still runs everything, so a bypass does not escape the gates).
4. **The `.githooks/` scripts check out with LF** (`.gitattributes`), like the template, so git's shell can
   run them on Windows.

It is pinned by `test/self-dogfood-prepush.test.mjs`: the hook passes when stubbed gates pass, blocks when a
stubbed gate fails (two cases), and the arming is wired (`prepare` points at `install-hooks.mjs`, both hook
files exist). Verified end to end on a developer machine: `install-hooks` set `core.hooksPath=.githooks`, and
running the hook ran its gates and exited 0.

## Consequences

* A developer on the skills repo gets the same early-catch pre-flight the repo ships to consumers, armed with
  no extra steps, so the repo practices what it preaches.
* The hook is deliberately not the manifest-driven template, because the upstream repo's layout is not the
  consumer layout; the ADR records why, so a future change does not "simplify" it back to the template and
  silently make it hollow.
* Known limitation: the local hook covers the fast offline gates only, not the full test suite or routing or
  provenance. It is a convenience, not the authority; CI remains the gate that blocks merge. This is stated in
  the hook itself and here so the coverage is not overread.
* Known limitation: arming is per clone (git will not auto-run a cloned repo's hooks) and npm-only (the
  trigger is the `prepare` lifecycle). A non-npm checkout, or one that never runs `npm install`, is not armed;
  the committed hook is still there to turn on with one `git config core.hooksPath .githooks`.
