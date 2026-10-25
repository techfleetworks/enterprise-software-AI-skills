---
status: "accepted"
date: 2026-10-24
decision-makers: mdenner
---

# The local pre-push hook scans only what CI scans, by respecting .gitignore

## Context and Problem Statement

The pre-push hook that `esk-genesis` installs runs the offline gates over the working tree. CI, by contrast,
only ever sees committed files, because gitignored paths are not in the repository. Issue #134 showed the gap: a
third-party `.js` inside a gitignored `.venv/` made `no-ua-sniffing` fail and the hook block the push, for a file
CI would never scan. The result is a local-only false failure that a developer can only get past with
`git push --no-verify`.

The issue also raised a feature request: a consumer-owned path-level waiver for a false positive in content it
cannot annotate. That path deliberately relaxes the ADR-0061 `invoke`-lock (a consumer could narrow what a gate
scans and still pass provenance). The decision for this change is to fix the bug by respecting `.gitignore` and to
NOT add a path-level waiver, so the invoke-lock stays intact.

## Decision

Make the pre-push hook match CI's file set, by excluding git's own ignore set from what the gates scan locally.

1. **The hook collects git's ignored paths** (`git ls-files --others --ignored --exclude-standard --directory`,
   run at the repo root). If the repo is not a git checkout or git is unavailable, it collects nothing and scans
   everything as before (fail-safe toward scanning MORE, not less).
2. **For each gate whose `invoke` already uses `--ignore`** (the broad tree scanners: reference-links,
   no-ua-sniffing, owasp-lints, migration-safety, alert-hygiene, untagged-pii, arch-gate), the hook appends an
   `--ignore <path>` for each ignored path when it spawns the gate. A gate with no `--ignore` in its invoke
   (parity, provenance, bootstrap-presence, retention-basis) does not scan the tree for product code and is left
   untouched.
3. **No path-level waiver is added** (the deferred feature). The invoke-lock of ADR-0061 is unchanged.

This is a LOCAL, hook-only adjustment: it changes nothing in `gate-manifest.json`, so the gates' provenance and
parity are unaffected, and it narrows the local run to exactly what git ignores (not an arbitrary consumer-chosen
set), so it is not a sanctioned-waiver bypass of the lock. Only the consumer pre-push template changes; the gate
scripts are untouched (no sha change). Pinned by a discrimination test: a gitignored sniffing file passes the
hook, and the same file once tracked blocks it.

## Consequences

* The local pre-push now agrees with CI: an uncommitted local directory (a Python `.venv`, a build cache, a tool
  dir) can no longer fail the hook on files CI never sees, so a developer is not pushed toward `--no-verify`.
* The fix follows git's own ignore rules, so it covers the `.venv` case and any other ignored path without a
  hard-coded name list, and it cannot be used to hide committed product code (committed files are never in git's
  ignore set).
* Scope and honest limits: this is the consumer pre-push template that `esk-genesis` installs; the upstream
  repo's own `.githooks/pre-push` is a different mechanism (it runs the repo's `check:*` npm scripts from
  `self-checks.json`) and is out of scope here. CI is unchanged (it already scanned only committed files). The
  path-level-waiver feature is deliberately NOT built; if a consumer needs to exclude a COMMITTED path from a
  gate, that remains a separate decision that would relax the invoke-lock and would need its own ADR. A gate that
  does not accept `--ignore` is not adjusted, which is correct because those gates do not broad-scan the tree.
