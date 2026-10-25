---
status: "accepted"
date: 2026-10-24
decision-makers: mdenner
---

# The --changed-list checks do not treat vendored skills as the consumer's product code

## Context and Problem Statement

Two judge-arch scripts take the change's file list and treat every path as the consumer's own product code
(issue #151):

- `check-skill-receipt.mjs` matches its coupling rules' `when` globs (`**/*.mjs`, `**/*.tsx`, ...) against every
  changed path. So re-vendoring the skills (which touches `.claude/skills/**/*.mjs`) fires the behavior-change
  rule, and the initial vendor (which adds `discriminate-fixtures/.../Calc.tsx`) fires the ui-change rules,
  forcing those skills to `applied`. An honest "re-vendor, no product change" receipt that marks everything
  `not-applicable` cannot pass.
- `check-arch-review-coverage.mjs` requires four verdicted, evidenced review cells for every listed path. A
  re-vendor needs cells for vendored files; the initial 326-file vendor would need 1,304 cells.

The always-on directive runs the receipt check with `--changed-list <the diff>`. The directive-facing
merge-blocking job is deferred, but contributors and consumers run these by hand, and for them an honest
re-vendor cannot pass.

## Decision

A path under the vendored skills tree (`.claude/skills`) or the discrimination fixtures is not the consumer's own
product surface, so it is excluded from these two change-driven checks.

1. **`check-skill-receipt` coupling:** the coupling firing check runs over the changed list with vendored paths
   removed, so re-vendoring the skills does not fire the behavior/ui rules. The diff-binding check is UNCHANGED
   (it still uses the full list), so a receipt that legitimately cites a vendored file it changed still binds.
2. **`check-arch-review-coverage`:** the files that need a review cell are the changed list with vendored paths
   removed; a pure re-vendor then needs no cells.
3. **The exclusion is narrow and anchored:** it matches the conventional repo-relative `.claude/skills` tree by
   path prefix (`f === p` or `f` starts with `p + "/"`), never a substring, so `src/.claude/skills/x` is not
   excluded. A real product path is still coupled and still needs review.
4. **The in-tree fixtures ride the same prefix (review N2).** The discrimination fixtures live under
   `.claude/skills`, so the single tree prefix already excludes them. There is no separate, un-anchored
   `discriminate-fixtures` match: an earlier draft matched that segment anywhere, which would also have excluded a
   real product path such as `src/discriminate-fixtures/Calc.tsx`. Dropping it keeps the narrowing anchored to the
   vendored tree and nothing else.
5. **An escape for the upstream repo itself (review N1).** This repo's OWN product IS `.claude/skills`, so an
   unconditional exclusion would blind these two checks to its real skill changes if the deferred `--changed-list`
   CI job lands here. Both scripts take `--no-default-skills-exclude`, which drops the default `.claude/skills`
   prefix so the upstream repo still couples and still reviews its own skill changes. A consumer leaves the flag
   off (the default) and the vendored tree stays excluded. A `--exclude <prefixes>` option adds further prefixes
   on either script.

Neither script is a manifest gate, so there is no sha/provenance change. Each behavior is pinned by a
discrimination test: a vendored path does not fire coupling and needs no review cell; a real path still does;
`--no-default-skills-exclude` re-couples and re-requires review of a `.claude/skills` path; and a
`discriminate-fixtures` path OUTSIDE the tree is still coupled and still reviewed.

## Consequences

* A change that only re-vendors the skills can now carry an honest receipt (everything `not-applicable`) and an
  honest review entry (no cells for vendored files), instead of being forced to claim testing or UI work.
* The exclusion cannot hide the consumer's own code: it is anchored to `.claude/skills` and the fixtures, so a
  product path (`src/**`, `app/**`, anything outside the vendored tree) still fires coupling and still requires a
  review cell. The diff-binding half of the receipt is untouched, so a receipt can still only cite files actually
  in the change.
* The upstream repo (this one) is not self-blinded: it runs these checks with `--no-default-skills-exclude`, so
  its own skill changes are still coupled and still reviewed. The exclusion is for a CONSUMER that has vendored the
  skills, where `.claude/skills` is imported code, not the consumer's own product.
* Honest limits: a consumer who deliberately keeps hand-authored code UNDER `.claude/skills` would have it
  excluded too, but that is an unusual layout (the tree is the vendored upstream skills by convention) and
  `--no-default-skills-exclude` / `--exclude` make the scope explicit. These scripts still do not run in a
  consumer's CI (a separate gap); this fixes the by-hand and contributor path the directive points at.
