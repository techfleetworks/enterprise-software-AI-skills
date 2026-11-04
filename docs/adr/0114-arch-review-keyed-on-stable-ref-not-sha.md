---
status: "accepted"
date: 2026-11-04
decision-makers: mdenner
---

# 0114 - The arch-review coverage gate is keyed on a stable ref, never a commit SHA, so it cannot be unsatisfiable

`check-arch-review-coverage` matches a review-log entry to the change under review by exact equality on the
`--change` value against the entry's `change` field. The documented contract invited keying that value on a
**commit SHA**, which is permanently unsatisfiable, and the gate failed with a generic "no record" that gave
the author no way to understand why. Filed as issue #213, observed on a real consumer PR
(`techfleetworks/trackpoli-platform` PR #9).

## Context and Problem Statement

- `[observed]` The schema doc said `"change": "PR #417", // commit SHA or PR ref the review covers`
  (`review-log-and-coverage.md`), and `SKILL.md` said `change ref (commit or PR)`. Both invited a commit SHA.
- `[observed]` A review entry is committed **in** the change it reviews, so the entry can never carry the SHA
  of the commit that contains it. Keying `--change` on `git rev-parse HEAD`, `github.sha`, or the
  `pull_request` merge commit therefore has no author-side way to pass: there is no entry whose `change`
  equals that SHA.
- `[observed]` The failure was silent-in-meaning: `FAIL - no review record whose change == "<sha>"` sent the
  author hunting for a review that could not exist, instead of naming the footgun.
- `[observed]` This stayed latent because earlier consumer PRs changed no `src/`/`supabase/functions/` code and
  took the workflow's "no application code changed" branch; the first code-bearing PR hit it.
- `[observed]` The upstream repo already keys every entry on the **branch name** (for example
  `"change": "fix/no-shared-append-files"`), so the satisfiable convention already existed; only the contract
  text and the gate's defense were missing.

## Considered Options

- **Option 1: reject a SHA-shaped `--change` fail-closed with a self-explaining diagnostic, fix the contract
  text to require a stable ref, and ship the correct consumer CI recipe.**
- **Option 2: only fix the documentation, leaving the gate to fail generically on a SHA.**
- **Option 3: change matching to be fuzzy (accept a SHA by resolving it to a branch), so a SHA "works".**

## Decision Outcome

Chosen: **option 1**. The gate is keyed on a stable identifier the author writes into the log, the fix is
enforced in the gate itself, and a SHA can never again silently block a real PR.

- The `change` field, and `--change`, must be a **stable identifier**: the **branch name** (CI:
  `github.head_ref`) or a **PR ref** (`pr-123`), matched by exact equality. Never the change's own commit SHA.
- `[proven]` The gate rejects a SHA-shaped `--change` (a 40-hex SHA-1 or 64-hex SHA-256 string) **fail-closed**
  (exit 1) with a diagnostic that names the footgun and the fix. A 40/64-hex all-hex string is unmistakably a
  git SHA, so the rule has no false positives on real branch or PR refs (two tests prove a 7-hex branch name
  and a real `fix/...` branch both pass).
- `[proven]` The fix is mutation-verified. The two SHA tests in `test/arch-review-gates.test.mjs` assert the
  diagnostic **message**, not just the exit code, because no-opping the guard still yields exit 1 via the
  generic no-match path; with the guard removed those two tests go red (recorded in the review entry). An
  exit-only assertion would have been vacuous (`verifiable-quality-gates`).
- `[proven]` A real-repo invariant test scans `docs/arch-reviews/entries/` and fails if any committed entry's
  `change` is a 40/64-hex SHA, and reports (does not silently skip) a corrupt entry. `npm test` runs it as a
  blocking CI gate, so a SHA-keyed entry can never be merged here.
- `[documented]` The contract text is corrected in `review-log-and-coverage.md` (schema comment, a new "Keying
  the review to the change" section, and the gate's fail-closed condition list) and in `SKILL.md`, and a
  canonical consumer CI recipe keyed on `github.head_ref` is shipped so a consumer does not invent
  `--change "$SHA"`.

Option 2 was rejected because documentation alone leaves the footgun armed: the next author who wires
`github.sha` gets the same silent, unsatisfiable failure. Option 3 was rejected because resolving a SHA to a
branch makes the gate's key ambiguous and couples it to git history lookups; the stable ref is already the one
satisfiable, human-writable key, and narrowing to it is simpler and stronger.

### Consequences

- Good, because `[proven]` an unsatisfiable SHA key is now a loud, self-explaining failure at the gate, and a
  SHA-keyed entry is a red CI state in this repo. The footgun cannot silently block a PR or silently enter the
  log.
- Good, because the satisfiable wiring is documented once (the branch-keyed recipe), so consumers copy a
  working gate instead of improvising.
- Neutral: the gate's hash and its test's hash change in `gate-manifest.json`, the same discipline every gate
  edit carries (ADR-0109).

### Confirmation

`test/arch-review-gates.test.mjs` (the five #213 cases: 40-hex and 64-hex rejected on the message, a branch
ref and a short hex-shaped branch accepted, and the real-repo no-SHA-keyed-entry invariant), proven to
discriminate by no-opping the guard; `features/repo-process/arch-review-change-key.feature` (executed by
`npm run test:bdd`); and the fresh-context judge-arch review recorded in `docs/arch-reviews/entries/`.

## What this does not fix, said plainly

- `[documented]` The gate proves a review FOR the change was recorded and keyed satisfiably; it does not judge
  whether the review's verdicts are correct (the honest ceiling stated in SKILL.md).
- `[documented]` The rule rejects only full-length (40/64-hex) SHAs. A contributor could still key an entry on
  an arbitrary non-SHA string unrelated to the change; that is a visible, reviewable value in the diff, caught
  by the judge-arch review, not a silent gap.
- `[documented]` The consumer's own workflow wiring lives in the consumer repo; this change ships the correct
  recipe and the fail-closed guard, but cannot edit a consumer's already-committed workflow. The guard makes a
  wrong wiring fail loudly instead of silently, which is the enforceable half.
