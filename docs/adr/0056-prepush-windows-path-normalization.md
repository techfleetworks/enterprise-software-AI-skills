---
status: "accepted"
date: 2026-10-17
decision-makers: mdenner
---

# The consumer pre-push hook normalizes the repo root so it does not hollow-pass on Windows

## Context and Problem Statement

A greenfield adoption QA on Windows found that the bootstrap-v2 consumer pre-push template
(`.claude/skills/bootstrap/templates/pre-push`, ADR-0048) **ran no gates and exited 0** — a hollow pass that
looks like success while enforcing nothing.

Root cause: the hook resolves the repo root with `git rev-parse --show-toplevel`, which returns **forward
slashes even on Windows** (`C:/Users/...`). It then builds each gate's absolute path with `resolve(root,
gate.script)`, which on Windows returns **backslashes** (`C:\Users\...`). The containment guard
`abs.startsWith(root + sep)` therefore compared mismatched separators, failed for **every** gate, skipped
each one via `continue`, and reached the end with nothing run — exit 0. CI never caught it because CI runs on
Ubuntu, where both forms are forward slashes and the mismatch does not occur. It only surfaces on Windows, the
machine where a developer's local pre-flight actually runs.

## Decision

Normalize the repo root through `resolve()` as soon as it is read, so it is in the same separator convention
as the `abs` paths it is compared against:

```js
root = resolve(execSync("git rev-parse --show-toplevel", ...).trim());   // was: the raw git output
// fallback:
root = resolve(process.cwd());
```

`resolve()` converts `C:/Users/...` to `C:\Users\...` on Windows (and is a no-op on POSIX), so
`abs.startsWith(root + sep)` compares like-for-like on every platform and the containment guard works as
intended. No other logic changes; the guard still rejects a path that genuinely escapes the repo.

It is pinned by a test in `test/pre-push-hook.test.mjs`: a failing gate in a **real git repo** (so the hook
takes the `git rev-parse` path, not the cwd fallback) must block the push. On Windows this reproduces the bug
(the old code exits 0, the test goes red); on POSIX the two separator forms already agree, so it is a valid
regression check. Verified live on Windows: before the fix the reproduction exited 0 with a gate that exits 1;
after the fix it exits 1 (blocks), and a passing gate still exits 0.

## Consequences

* The consumer pre-push pre-flight actually runs its gates on Windows instead of silently passing. The
  "local check bites, and a `--no-verify` bypass is still caught by CI" story is now true on Windows too, not
  just POSIX.
* The fix is a one-call normalization with no behavior change on POSIX, so no existing install is affected.
* Known limitation of the test: it is discriminating on Windows (the affected platform) and a regression
  check on POSIX, because the separator mismatch cannot occur on POSIX. The CI leg (Ubuntu) therefore cannot
  catch a future reintroduction of this exact bug; the Windows developer run is the guard. This matches the
  precedent set for the win32 drive-letter casing check (ADR-0051).
* The self-dogfood hook (`.githooks/pre-push`, ADR-0053) is unaffected: it runs the repo's gates via
  `npm run` and never used this containment check.
