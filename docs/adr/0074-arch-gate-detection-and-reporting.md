---
status: "accepted"
date: 2026-10-23
decision-makers: mdenner
---

# arch-gate: report what it evaluated, fail closed on an unreadable path, and cover Python and arrow catches

## Context and Problem Statement

Four issues showed arch-gate reporting PASS when it had not actually checked what a reader would assume:

- **#124:** the `emptyCatch` built-in matched `catch (e) {}` but not an empty promise handler `.catch(() => {})`
  / `.catch(e => {})`, so a swallowed async error passed.
- **#127:** the summary printed `scanned N file(s)` counting every file WALKED, including non-code it skipped,
  so a run that evaluated zero code files still printed a reassuring count and PASS.
- **#146:** the built-ins ran only on JS/TS, so a Python-only tree (`except: pass`) passed with nothing saying
  no code was evaluated, though the docs claim "per stack."
- **#149:** an unreadable directory or file was swallowed (`readdir` catch returned silently; a read error
  warned but continued exit 0), so arch-gate reported PASS on a tree it could not fully read (fail OPEN).

## Decision

1. **emptyCatch also flags an empty `.catch()` arrow handler (#124),** via a second alternation that reuses the
   same linear-time empty-body sub-pattern, so a non-empty handler still fails fast (ReDoS-safe).
2. **The summary reports `evaluated X of Y file(s) (Z with code checks)` (#127),** counting files that actually
   reached a rule or built-in, not the walked total.
3. **Built-ins cover Python (#146):** a `PY_BUILTIN_CHECKS` set runs on `.py` files (`except: pass`), and when a
   tree has files but evaluated zero code files, the gate prints a loud warning instead of a silent PASS.
4. **Fail closed on an incomplete scan (#149):** an unreadable directory (non-ENOENT `readdir`), an unreadable
   file (read error), or a non-ENOENT `stat` error is recorded as a scan error, and arch-gate exits 2 before any
   verdict - it never reports PASS on a tree it could not fully read.

Each is pinned by a discriminating test. arch-gate's manifest `sha256` is recomputed (the script changed); no
`invoke` change, so the only travelling delta is the gate content. Ships in 1.3.1.

## Consequences

* A swallowed async error, a Python `except: pass`, an all-non-code tree, and an unreadable path are all now
  caught or surfaced rather than passing silently. The `evaluated` count makes a vacuous run visible.
* The Python built-in is intentionally minimal (empty `except`); it is a floor, not a full Python linter, and
  the warning on zero code files evaluated keeps the JS/TS-plus-Python scope honest rather than implying total
  language coverage.
* Fail-closed is strict: a genuinely unreadable path (a permissions issue, a broken mount) now blocks with
  exit 2. That is the correct posture for a gate (an incomplete scan must not read as clean); the message names
  each unreadable path so it is actionable.
