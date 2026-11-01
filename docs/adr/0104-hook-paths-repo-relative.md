---
status: "accepted"
date: 2026-10-31
decision-makers: mdenner
---

# 0104 - Enforcement hooks match edited files by their repo-relative path

Finding: I10 of the v1.4 pattern-skill audit (the v1.4 design spec, section 7, on branch
`audit/poeaa-2026-11`). It is a defect in today's enforcement and does not depend on v1.4.

## Context

Claude Code hands a hook the edited file's ABSOLUTE path (`tool_input.file_path`, and the same in the
transcript). The edit-gate (`always-on/edit-gate.mjs`) passed that path straight to
`check-task-plan.mjs selection --changed-list`, only swapping `\` for `/`. The routing globs in
`always-on/routing-rules.config.json` are anchored to the repo root by `always-on/routing-lib.mjs`
(`globToRe` builds `^...$`). So `src/domain/orders/repository.ts` required two skills, but the same file as
`C:/Users/.../src/domain/orders/repository.ts` required none, and a new ADR file under `docs/adr/` named by its
absolute path passed with no ADR verdict. Every rule that starts `src/`, `lib/`, `app/`, `test/`, `tests/`, `docs/adr/`, `docs/decisions/`,
`prisma/`, or `db/migrations/` never fired at edit time; only `**/` rules did. A routing rule added later with a
root-anchored glob (for example making `pattern-selector` router-required for design paths) would never fire either.

The Stop-side checks had the same shape. `finish-check.mjs` and `subagent-check.mjs` take changed files from the
transcript (`always-on/transcript-files.mjs`), so they saw absolute paths too. That broke three things: the review
matrix in the task record is keyed the way `always-on/finish-check-records.md` shows it (`src/feature.ts`), so a
repo-relative row never matched; the per-task receipt had to list absolute paths to be accepted; and the
subagent ledger's per-file coverage only matched because both writers happened to use the same absolute form.

## Decision

1. **One owner for the conversion.** `always-on/esk-paths.mjs`, which already owns how every hook derives its
   paths, gains `projectRoot(payload)` and `toRepoPath(path, root)`. The root is `CLAUDE_PROJECT_DIR` (set by Claude
   Code for hooks), else the payload's `cwd`, else the hook's own cwd. `toRepoPath` returns the path relative to
   that root with forward slashes. It picks Windows or POSIX path rules from the path's own shape, so a Windows
   path compares case-insensitively and the result is the same on any OS the tests run on.
2. **The hook is the boundary.** The edit-gate converts the path before it calls the router and before it writes
   the subagent ledger. The router (`routing-lib.mjs`, `check-task-plan.mjs`) stays a pure string matcher over
   repo-relative paths and does not learn about payloads or roots.
3. **The Stop checks use the same spelling.** `changedFilesFromTranscript(tpath, root)` returns repo-relative paths
   when given a root. `finish-check` and `subagent-check` pass `projectRoot(payload)` and run the receipt checker
   with `cwd` set to that root (and absolute receipt and skills-dir paths), so it can hash a repo-relative file
   from any hook cwd. The review matrix, the receipt, and both ledger writers now key a file one way.
4. **A path outside the project root is passed through, not dropped and not denied.** It keeps its absolute
   form (forward slashes). So it still counts as a changed file for the finish-check and the receipt, and it still
   meets every `**/` rule, exactly as before this change. It cannot meet a root-anchored rule, which is correct: a
   rule like `src/**` is about this repo's `src/`, not some other folder's. The same holds for a path in a
   different path family than the root (a Windows path against a POSIX root).

## Why pass-through, not fail-closed, for outside paths

Denying every edit outside the project root would block legitimate work the gate has no rule for: memory files,
scratch notes, a sibling checkout. Dropping those paths would be worse: a wrong root would turn every file into
"outside" and the finish-check would treat a file-changing task as read-only, which fails open. Pass-through keeps
today's behavior for those paths (no weaker than before) while fixing every path inside the repo, and it never
removes a file from the set the Stop checks hold the turn on. The selection, load, and plan steps still apply to
an outside edit; only the root-anchored routing rules do not.

## Consequences

- Root-anchored routing rules now fire at edit time, so a session that marked a router-required skill
  `not-applicable` for a `src/`, `test/`, or `docs/adr/` edit is now held where before it passed. This is the
  intended tightening.
- Receipts and review matrices written by the gate's users must name files inside the repo by their
  repo-relative path. A receipt that listed absolute paths for in-repo files no longer covers them. The record
  docs already showed repo-relative keys, so the docs and the code now agree.
- Discriminating tests: `test/edit-gate.test.mjs` feeds absolute Windows-style (backslash, and mixed-case forward
  slash) and POSIX-style paths, with the root from `CLAUDE_PROJECT_DIR` and from the payload `cwd`, and expects a
  deny; `test/esk-paths.test.mjs`, `test/transcript-files.test.mjs`, `test/finish-check.test.mjs`, and
  `test/subagent-check.test.mjs` cover the helper and the Stop checks. Replacing `toRepoPath` with the old
  separator-only behavior fails 11 of those tests.
- Limits: the root is the project dir, not the git top level. A session started in a subfolder of the repo will
  match globs against paths relative to that subfolder, so a root-anchored rule can still miss there. Resolving
  the git root would add a process spawn to every edit and does not exist outside a git repo; this is left for a
  later change if it shows up. A symlinked root and a path through the link are compared as strings, not
  resolved.
- Limit: the edit-gate and the subagent-check agree on a file's spelling only when they resolve the same root.
  With `CLAUDE_PROJECT_DIR` set (Claude Code sets it for hooks) they do. Without it each falls back to its own
  payload's `cwd`, and a subagent in another folder could give the two events different roots. Then the parent's
  per-file coverage sees two spellings of one file and flags it. That over-blocks (fails closed), never opens.
- If the root does not exist, the receipt checker cannot start from it. The check then blocks and names the
  root and the spawn error, so a bad root is visible, not silent. `session-setup.mjs` now uses the same
  `projectRoot` rule to find the project settings, so there is one way to derive the root.

## Alternatives considered

- **Normalize inside `routing-lib.firedRules`.** Rejected: the router would need the project root, which only a
  hook knows from its payload and environment. Keeping the router pure over repo-relative strings keeps it
  testable without faking a hook.
- **Make every glob match anywhere (prefix each with `**/`).** Rejected: `src/**` would then also match
  `node_modules/x/src/a.ts` and any nested `src`, which changes what each rule means.
- **Resolve the root with `git rev-parse --show-toplevel`.** Deferred, see Limits.
