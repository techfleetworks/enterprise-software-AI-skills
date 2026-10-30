---
status: "accepted"
date: 2026-10-29
decision-makers: mdenner
---

# Per-task skill receipts outside a repo, tied to file hashes

## Context and Problem Statement

Issue #177 (one of ten from an agent-session audit) found that the skill-application receipt is one entry per
pull request (`docs/specs/skill-application-receipt.md:54`, "One receipt per change (per PR)"). Work done in a
folder that is not a git repo never has a PR, so it never gets a checked receipt. In the audited session a
receipt file from the day before (`sha256` starting `444017604976`) was copied unchanged into all three builds
checked; 595 of 615 copies in the searched folders were that same byte-identical file. The receipts that were
written came only after the operator said "prove it to me," and they were free-form Markdown the repo's checker
could not read. So a reader cannot tell whether the skills were applied to this task's actual files.

Two environment facts matter. Temp folders are cleaned on their own, so a receipt in the work folder can vanish;
and any folder under the user profile can read as "inside a git repo" with no commits, so a checker must not
depend on repo detection. The receipt store therefore lives outside the work folder, and the checker keys off
the hashes of the files the task changed, not off git.

## Considered Options

- **Extend the PR receipt to also work per task:** one checker, one format. But the PR receipt is keyed on a
  branch/PR and an append-only committed log in the repo; a task outside a repo has neither, and overloading one
  entry shape for both blurs "one PR" and "one task."
- **A separate per-task receipt (JSONL) in a per-session store outside the work folder, with its own checker
  that reuses the PR gate's grounding logic:** a task-scoped record tied to file hashes, refusing stale, copied,
  or empty receipts, with an export to the PR format when the work becomes a pull request.
- **Where the grounding logic lives:** copy it into the new checker (fast, but two copies drift), or extract it
  into a shared module both checkers import (one owner of "grounded").

## Decision

Ship a per-task receipt system under `.claude/skills/judge-arch/scripts/`, next to the PR receipt it mirrors:

1. **A shared grounding module, `receipt-grounding.mjs`.** The pure logic of "grounded" (section-by-heading
   extraction, whitespace-insensitive match, the >= 8 exact-words rule, `quoteUnderHeading`) is extracted here,
   and `check-skill-receipt.mjs` is refactored to import it. One owner, so the PR gate and the per-task gate can
   never drift on what a valid quote is. The PR gate's existing tests still pass unchanged.
2. **A per-task receipt schema (JSONL)** with `task_id`, `session_id`, `created_at`, `changed_files`
   (`[{path, sha256}]`), `skills` (`[{name, verdict, heading, quote, skill_file_sha256, files, waiver}]`), and
   `checkers`. Documented in `skill-application-receipt.md` section 11.
3. **A store outside the work folder:** `~/.claude/esk/receipts/<session_id>.jsonl`, append-only, one file per
   session so two sessions in the same folder never overwrite each other, written atomically (O_APPEND).
4. **One CLI, `task-receipt.mjs`, with `write`, `check`, and `export`.** `check` reuses the grounding module and
   refuses a receipt (exit 2, which blocks a task from ending) when it is empty; when a changed file is not
   covered (full check, never a sample); when a recorded file hash differs from the file's current hash (stale
   or copied); when an `applied` quote is not verbatim under its cited heading of the installed skill; when the
   recorded `skill_file_sha256` does not match the installed `SKILL.md`; when an `applied` entry points at a file
   outside the change; when a required skill in the selection is not `applied`; or when a waiver is missing or
   expired. `export` turns the per-task entries into the section-4 PR format for when the work becomes a PR.
5. **Proof:** `test/task-receipt.test.mjs` is the discriminating test (a no-op `check` flips every refusal), and
   seven `@audience:agent` scenarios drive the real CLI on the executable BDD harness.

The extend-the-PR-receipt option is rejected because a task outside a repo has no PR and no committed log; the
copy-the-grounding option is rejected because the repo's own rule is one way to do one thing.

## Consequences

* Work done in any folder, repo or not, now gets a grounded, task-scoped receipt that is refused if it is empty,
  stale, copied, incomplete, or ungrounded, and the refusal blocks the task from ending. A copied or day-old
  receipt (the audit's failure) no longer passes, because its recorded hashes do not match the files this task
  changed.
* The grounding logic has a single owner (`receipt-grounding.mjs`); the PR gate and the per-task gate stay in
  step by construction.
* Honest limits. A grounded receipt proves real quotes, the right files, and current hashes; it does not prove
  the work was good, so a human still reviews (the banner rule). The per-task `check` reports a refusal with
  exit 2; turning that into "the task cannot end" is the finish-check hook (issue #174), which must itself fail
  closed because Claude Code hooks fail open by default. Atomic append is per-session-file, so the no-overwrite
  guarantee holds across sessions; it does not add cross-host locking, which is out of scope for a local store.
* The seven scenarios (`receipt-files-in-change`, `receipt-matches-selection`, `receipt-quote-must-be-verbatim`,
  `stale-receipt-refused`, `parallel-sessions-separate-receipts`, `empty-receipt-refused`,
  `large-change-fully-checked`) are `@audience:agent` and run on the harness (ADR-0091); `operator` audience
  coverage stays satisfied globally, so no `bdd-config.json` change was needed.
