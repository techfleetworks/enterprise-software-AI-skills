---
status: "accepted"
date: 2026-10-23
decision-makers: mdenner
---

# Scan gates fail closed, and match what they claim to match

## Context and Problem Statement

Four content-scanning gates reported a clean result for a scan they did not actually perform, or matched so
loosely that a real defect slipped through. A gate that prints a green line without having checked anything is
worse than no gate: a consumer reads it as evidence.

- **#145 (retention-basis):** the data map named by `--map` was treated as optional with an empty default, so
  no `--map` at all, an explicit `--map` to a mistyped or wrong path, and a map kept one directory away ALL
  printed the same `OK` line and exited 0. A required compliance gate "passed" having inventoried nothing.
- **#153 (no-ua-sniffing):** the comment stripper worked one line at a time, so `navigator.userAgent` named in
  multi-line JSDoc prose was scanned as code and flagged, and the documented line-above ignore did not work in
  the usual JSDoc layout (every line begins with ` * `). This is the root cause of the earlier #112 item 2,
  which 1.2.1 had only papered over by excluding `.claude/skills` from the scan.
- **#147 (reference-links):** a `.md` link target was matched only by lowercased basename, with the directory
  part ignored, so a dangling link to `docs/missing/README.md` passed as soon as ANY `readme.md` existed
  anywhere in the tree. Upstream's own tree carried four such broken links that the gate passed.
- **#121 (reference-links):** the gate ignored `GATE_REPO_ROOT` (so an arg-less run from a consumer's
  `scripts/ci` copy scanned two levels above the repo), and a `.md` it could not read was skipped silently yet
  still counted in "Scanned N", so a dangling reference in an unreadable file passed as clean.

## Decision

Make each gate fail closed and match precisely, and pin each behavior with a discrimination test.

1. **retention-basis: `--map` is required; a missing map is only a pass when explicitly opted into.** No
   `--map` at all, or an explicit `--map` to a file that does not exist, fails closed (exit 2) - the same way
   arch-gate fails closed on an explicit missing `--config`. The published CI `invoke` adds `--map-optional`,
   which turns a genuinely-absent map into a DISTINCT vacuous pass (`OK [vacuous] - no data map at …`) so a
   consumer without a declared inventory stays green while a run that checked nothing no longer looks like a
   run that checked something. A present-but-malformed map still fails closed. Changing the `invoke` changes
   the gate's provenance, so it ships with the manifest (1.3.1 line).

2. **no-ua-sniffing: track multi-line block-comment state.** Comment prose inside `/* … */` (including JSDoc
   `/** … */`) is never scanned as code, so only a brand token in ACTUAL code is a hit; code after a block
   close on the same line is still scanned. The ignore directive additionally accepts the JSDoc continuation
   forms ` * ua-sniff:ignore …` and ` * // ua-sniff:ignore …` so the documented line-above suppression works
   inside a block. It remains a line/regex linter, not a JS parser (strings are not tracked), stated honestly
   in the header.

3. **reference-links: resolve link targets, keep basename for prose.** A Markdown inline-link target (the path
   inside an inline `](…)`) is resolved RELATIVE TO THE CITING FILE and case-sensitively against the set of real
   paths, so a dangling link is caught even when another file shares its basename. A prose mention keeps the
   documented basename-existence rule, because cross-skill prose pointers are not resolvable from the citer. A
   link target shown as an example inside backticks is treated as example text, not a live link (so a doc about
   link hygiene can show one), falling back to the lenient basename rule. The four broken upstream links are
   repointed to their correct same-directory targets in the same change.

4. **reference-links: honour `GATE_REPO_ROOT` and fail closed on an unreadable path.** ROOT precedence is
   `--root`, then `GATE_REPO_ROOT` (as check-bootstrap-presence already does), then the script-relative root.
   An unreadable directory (other than a benign `ENOENT` race) or an unreadable `.md` is collected and fails
   the gate closed (exit 2): an incomplete scan cannot report green.

## Consequences

* A green `retention-basis` now means a map was actually read, or a map was explicitly declared optional and is
  absent (and says so distinctly). A mistyped `--map` path can no longer read as a completed check.
* `no-ua-sniffing` stops flagging documentation and stops hiding real sniffs; the earlier #112 item 2 is fixed
  at its root (comment handling) rather than by excluding a directory.
* `reference-links` catches a dangling link to a common basename (`README.md`, `index.md`, `CHANGELOG.md`) that
  it used to pass, and no longer reports coverage it did not have. The four repointed upstream links now
  resolve; the self-check (`check:links`, whole-repo) and the consumer invoke (`--ignore .claude/skills`) are
  both green.
* Honest limits: `no-ua-sniffing` is still a regex linter and does not parse strings; `reference-links`
  resolves only `](…)` link targets, not prose paths (116 prose `/`-tokens upstream do not resolve from the
  citer and would be false positives under a blanket `/`-rule, so prose keeps the basename rule); the
  unreadable-file path is proven on Linux CI (chmod 000) and honestly skipped on a filesystem that will not
  make a file unreadable (Windows / root).
* Three gate scripts change content, so their manifest `sha256` is recomputed in the same commit;
  `retention-basis` also changes its `invoke`. Provenance passes in origin/unreleased-version mode for 1.3.1.
