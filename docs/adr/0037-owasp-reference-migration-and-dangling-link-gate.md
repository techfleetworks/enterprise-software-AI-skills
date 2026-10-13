---
status: "accepted"
date: 2026-10-12
decision-makers: mdenner
---

# Finish the OWASP per-sheet migration, and make an orphaned reference structurally impossible

## Context and Problem Statement

The `owasp-secure-coding-bdd` skill once held its deep content in 15 "interim" cluster reference files (for
example the authentication-and-session cluster and the file-upload/SSRF cluster). That content was migrated into one
file per OWASP cheat sheet under `references/cheatsheets/` (137 sheets, all `done`), after which the SKILL text
still described the interim files as "being migrated" and "to be removed." The post-rewrite re-audit flagged
that stale claim. Removing the interim files turned out not to be a clean delete:

* Some interim files were not fully redundant. `lockout-prevention-safe-changes.md` is synthesized
  cross-cutting safe-change guidance with no OWASP cheat-sheet equivalent, and the api/web-security-headers
  cluster file carried two CORS rules (credentials-plus-wildcard, origin reflection) that no per-sheet file stated.
* The interim files were referenced from outside the skill: about ten inbound links from four other skills
  (`pattern-selector`, `release-deployment-safety`, `enterprise-architecture-standards`) and an ADR. A plain
  delete would have left those links dangling, pointing a reader into nothing. Nothing in the repo would have
  caught that: there was no gate for reference-link integrity.

## Decision Drivers

* Delete the redundant files without losing the content that was not actually redundant.
* Repoint every inbound reference so no link is orphaned.
* Make this class of rot impossible to reintroduce, not just fixed once: a future delete or rename that orphans
  a reference must fail a gate, the same way every other guarantee in this repo is gated.

## Decision Outcome

A fresh-context subagent assessed all 15 interim files against the 137 per-sheet files and the inbound links.
On that assessment:

* **Preserve first.** The two CORS rules were appended to `references/cheatsheets/HTTP_Headers.md`; the
  `-D_FORTIFY_SOURCE=3` toolchain nuance was ported into `references/cheatsheets/C-Based_Toolchain_Hardening.md`;
  and `lockout-prevention-safe-changes.md` is kept as a standing cross-cutting companion (it already carries its
  own permanent framing and `@lockout-prevention` scenarios) and is now documented as such in the SKILL's
  Reference-files table.
* **Delete the redundant 14.** The 13 fully-redundant cluster files plus the api/web-security-headers cluster
  file (after its CORS rules were preserved) and the stale flat full-index file (superseded by the SKILL catalog
  and `cheatsheets-manifest.json`, and demonstrably out of date) were removed.
* **Repoint every inbound link** to the correct per-sheet file (for example GraphQL guidance now points at
  `references/cheatsheets/GraphQL.md`, the SSRF/webhook pointer at `Server_Side_Request_Forgery_Prevention.md`
  and `Webhook_Security.md`), including a correcting note in ADR-0011.
* **Add the gate.** `check-reference-links.mjs` (`npm run check:links`) walks every Markdown file, collects the
  set of `.md` files that exist, and fails if any doc references a `.md` basename that is not in the tree. It
  checks EXISTENCE by basename, because the repo's cross-skill references are prose pointers, not paths
  resolvable from the citer. Built-in ignores (adopter-created filenames like `AGENTS.md`, the `NNNN-*.md`
  template placeholder), an optional `reference-links.config.json`, and an inline `link-check:ignore` keep it
  free of false positives without going blind to a real dangling link.

### Consequences

* Good, because the skill's reference set is now exactly the per-sheet files plus the one companion that has no
  per-sheet home; the stale "being migrated" claim is gone and the duplication is gone.
* Good, because no inbound link is orphaned, and the gate proves it: deleting the 14 files produced zero
  dangling references on the full tree.
* Good, because the whole class of rot is now gated. A future change that deletes or renames a reference file
  and leaves a link behind fails `npm test` (the gate's test asserts the real repo is clean) before it can
  merge.
* Bad (minor), because the gate's basename-existence check cannot detect a reference that resolves to the wrong
  directory when two files share a basename, nor that the linked content still says what the citer claims;
  those stay a judge-arch and human-review concern. Stated as the honest limit in the script header.
* Neutral, because the gate runs through the existing required `test` check; no new CI workflow is added, in
  line with deferring CI wiring to the techfleetnetwork release.

### Confirmation

`npm test` passes, including `test/reference-links.test.mjs`, which proves the gate DISCRIMINATES (it fails a
tree with a dangling reference and passes one where all references resolve, and it honors the built-in,
config, and inline ignores without missing a real dangling link) and asserts the real repository is clean.
`npm run check:architecture` exits 0 and `npm run check:links` reports zero dangling references across 289
Markdown files (this ADR included). The content-preservation decisions rest on a fresh-context assessment of all 15 interim files
against the per-sheet files.

Evidence ledger:

| Claim | State | Source | Limitation |
|------|-------|--------|-----------|
| Deleting the 14 files left zero dangling references | proven | `npm run check:links` after the deletion; `test/reference-links.test.mjs` real-repo case | Basename existence, not per-directory resolution |
| The gate fails on a dangling reference and passes clean | proven | discriminating cases in `test/reference-links.test.mjs`; `npm test` | Proves the engine, on fixtures |
| The two CORS rules and the FORTIFY_SOURCE=3 nuance were preserved | observed | diff of `HTTP_Headers.md` and `C-Based_Toolchain_Hardening.md` | Prose match, not a mechanical cross-check |
| The 13 cluster files were redundant with per-sheet files | inferred | fresh-context subagent read all 15 against the per-sheet files | A sampled read of some per-sheet files, not every one end to end |
| All 137 per-sheet files are complete | proven | `check-cheatsheet-catalog` PASS, 137/137 | Completeness and shape, not control correctness |

## More Information

Follows the post-rewrite re-audit and ADR-0028/0031/0032/0033/0034/0036. The dangling-link gate is a new
mechanical gate; like `check-change-routing` it lives under `judge-arch/scripts/` with the other repo-health
gates. Wiring it as its own required status check (rather than only through `test`) is deferred to the
techfleetnetwork CI/CD release.
