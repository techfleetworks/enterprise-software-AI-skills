---
status: "accepted"
date: 2026-11-02
decision-makers: mdenner
---

# 0108 - Each change records itself in its own new file, so two open pull requests cannot conflict

Supersedes ADR-0087 (the `merge=union` driver for the logs and the changelog) and ADR-0107 (the `append-log`
merge driver, PR 201, which merged while this change was in review). With no shared append file left, neither
driver has anything to merge, so the `append-log` script, its `npm install` step, and its tests are removed.
The operator asked on 2026-11-02:
"there keeps being new merge conflicts. fix the root of the issue. make it structurally impossible to break fail
error or have merge conflicts again."

## Context and Problem Statement

Every pull request in this repo appended to the same few files. Measured over the last 80 merge commits on
`main` (`git log origin/main --merges -n 80`, counting files changed on both sides of each merge), the files
changed on both sides were:

- `[observed]` `docs/skill-receipts/log.jsonl` 35 times, `docs/arch-reviews/log.jsonl` 35 times, and
  `CHANGELOG.md` 30 times.
- `[observed]` `package.json` 4 times (each new test was added to one long `test` line), and
  `features/bdd-coverage-log.md`, `features/bdd-index.json`, and `features/INDEX.md` 3 times each.
- `[observed]` `.gitattributes` 5 times and `esk-genesis.mjs` 3 times. These were real edits to the same code
  or config, not records.

ADR-0087 tried to fix the first group with git's `merge=union` driver. That cannot work where it matters:

- `[observed]` GitHub marked PRs 198 and 201 `CONFLICTING` (`gh pr view <n> --json mergeable`) on 2026-11-02,
  with `merge=union` committed for both logs. So GitHub's conflict check did not apply the driver, and the
  `.gitattributes` comment that said "GitHub honors this driver when it merges" was wrong.
- `[observed]` Locally, a clone's `.git/config` can override a driver by name. This clone had
  `merge.union.driver = true`, which kept only one side and silently dropped log lines during merges.

So every merge to `main` made every other open PR conflict, and the fix for that could lose history. What layout
makes the conflict impossible instead of resolvable?

## Considered Options

- **Option 1: one new file per change for every record, and stop committing generated files.**
- **Option 2: a custom merge driver (`append-log`, PR 201).**
- **Option 3: keep the shared files and resolve conflicts by hand or by agent after each merge.**
- **Option 4: a bot that writes the records to `main` after merge.**

## Decision Outcome

Chosen: option 1. A conflict needs two branches to change the same file. If every change only adds new files with
unique names, `[proven]` two changes merge with no conflict and no driver (`test/no-shared-append-files.test.mjs`
runs that merge for real, with the shared-file layout as its failing control).

- Each review is a new file in `docs/arch-reviews/entries/`, each receipt in `docs/skill-receipts/entries/`,
  each BDD coverage entry in `features/bdd-coverage-log/`, and each unreleased changelog note in `changelog.d/`.
  Each is named `<YYYYMMDDTHHMMSSZ>-<slug>`: the UTC time, then a slug of the change. The stamp keeps names
  unique and makes name order the entry order, so "the latest entry for a change" stays defined.
- One reader owns the review and receipt logs: `judge-arch/scripts/entry-log.mjs`. The coverage gate, the receipt
  gate, and the open-HIGH gate all call it. The BDD skill installs on its own, so `bdd-lib.mjs` keeps its own
  copy of the same rules for the coverage log. Both still read a legacy single file, so a consumer that has not
  moved keeps working.
- Append-only is now a file rule against a git ref (`[proven]` by `test/entry-log.test.mjs` and the
  `one-file-per-change` scenarios): every entry file the base ref has must still exist,
  unchanged apart from line endings, found with one `git diff` whatever the history size. `--base origin/main` for
  the judge-arch gates; `BDD_LOG_BASE_REF` for the BDD coverage gate, which CI now sets with
  `BDD_REQUIRE_LOG_BASE=1`, to origin/main on a pull request and to the commit before the push on a push to main.
- Any file in an entry folder other than a README that is not in the stamped form fails closed, whatever its
  extension, so a misnamed entry is never silently skipped.
- The receipt test checks every receipt file the change adds against origin/main, not the newest name, which may
  belong to another PR that merged first. The test job now fetches full history for that.
- `CHANGELOG.md` is never edited in a pull request. `scripts/changelog-release.mjs` folds `changelog.d/` into a
  new version section at release time and deletes the folded files.
- The BDD datastore (`features/bdd-index.json`, `features/INDEX.md`) is generated, so it is gitignored here. The
  gates derive it from the feature files when it is absent and still fail on a present stale copy, so a consumer
  that commits it is unaffected. `npm run test:bdd` regenerates it first.
- `npm test` runs `scripts/run-tests.mjs`, which finds every `test/*.test.mjs` itself and fails closed on none.
  Adding a test no longer edits `package.json`.
- The `merge=union` lines are removed from `.gitattributes`, and `test/union-merge.test.mjs` is replaced by
  `test/no-shared-append-files.test.mjs`. That test runs a real two-branch merge with every merge driver off. The
  new layout merges cleanly, and the old shared-file layout conflicts, as the control.
- `[observed]` The history moved byte for byte: the 99 review lines and 73 receipt lines became one file each,
  and the one-time migration compared the files joined in name order with the old log and found them equal
  ("round-trip exact"). The 15 coverage-log entries became one file each with the same events in the same order.
  Limit: the migration script was a one-off and is not committed; `git show HEAD~1:<old log>` against the joined
  files re-runs the comparison.

### Consequences

- Good, because the records behind 100 of the counted both-sides changes (35 + 35 + 30) stop being shared files,
  so `[proven]` they merge with no driver and no per-clone setup (the merge test above). Limit: the test merges
  locally; that GitHub then shows no conflict is `[inferred]` from the same fact, since GitHub's check also needs
  two branches to change one file.
- Good, because a merge never has to combine two versions of a log file, so a driver override like this clone's
  `merge.union.driver = true` has nothing to drop.
- Good, because `[proven]` the append-only error names the exact entry file that was edited or removed
  (`test/entry-log.test.mjs`).
- Bad, because the history is spread over many small files instead of one. `ls` in name order, or `cat` over the
  folder, gives the same view as before.
- Bad, because a release now needs one extra command (`changelog-release.mjs`).
- Bad, because the BDD index is no longer browsable on GitHub without running `npm run bdd:index` locally.

### Confirmation

`test/no-shared-append-files.test.mjs` (the structural pins and the real merge, with its control),
`test/entry-log.test.mjs` (the reader, append-only against a ref, and each gate end to end on a directory log),
`test/changelog-release.test.mjs`, and `test/all-tests-wired.test.mjs` (the discovering runner, including the
passing control and a failing-test-file case).

## Pros and Cons of the Options

### Option 2: a custom merge driver

- Bad, because GitHub does not run it, so a PR still shows as conflicting, and a person or agent still resolves
  it locally after every merge to `main`.
- Bad, because it needs per-clone setup (`npm install`) and can be overridden by a clone's config, which is how
  lines were lost.

### Option 3: resolve by hand after each merge

- Bad, because it is the cost the operator asked to end. With N open PRs, each merge makes N minus 1 PRs stale.

### Option 4: a bot writes records after merge

- Bad, because the record is no longer in the PR it describes, so it cannot be reviewed with the change, and
  the bot needs write access to `main`.

## What this does not fix, said plainly

- Two pull requests that change the same lines of the same code file will still conflict. No layout removes
  that. It is a real disagreement a person has to decide. The measured case is `esk-genesis.mjs`, 3 times in 80
  merges.
- Two pull requests that each pass on their own can still break `main` together. A GitHub merge queue would
  catch that by testing each PR on top of the latest `main` before it merges, and it would also end the
  "update branch" step that the strict up-to-date rule forces after every merge. Turning it on changes branch
  protection (`.github/rulesets/main-protection.json` and every workflow's triggers), so it is left to the
  operator as a separate decision.
- One entry in the review history (`feat/scan-scope-code-gates`) stores a finding as text, not an object, so
  `check-open-high-findings` with no `--change` fails closed on it. That is true on `main` before this change
  too. History is append-only, so it is not edited here.
