---
status: "accepted"
date: 2026-10-13
decision-makers: mdenner
---

# Re-mirror a skill when its content changes at an unchanged version (installer fingerprint)

## Context and Problem Statement

ADR-0029 added the `esk-init --skills` phase that mirrors `.claude/skills/` into `~/.claude/skills` and keeps
it current on a re-run. Its change detection was version-coarse. `planSkills()` treated the mirror as current
unless the package `version` or the `--skills-target` changed, a mirrored skill was gone from the repo, or a
skill's top-level `SKILL.md` was missing from the target. None of those sees a change made INSIDE an installed
skill folder while the package version stays the same.

That gap is real and was hit in production. PR #72 added
`.claude/skills/judge-arch/scripts/check-skill-receipt.mjs` inside the already-installed `judge-arch` skill
while the version stayed `0.1.0`. After the pull, `esk-init --yes --skills` reported "already installed and
current. Nothing to change" and the new file never reached `~/.claude/skills`. The symptom was worked around by
deleting the `.esk-installed` marker to force a full re-mirror; this ADR is the root-cause fix. It defeats the
installer's stated job, "reconciles it after a git pull so the latest version is live" (bootstrap SKILL.md and
the project CLAUDE.md).

## Decision Drivers

* A content change inside an installed skill at the same version must be detected and re-mirrored, by both the
  `--check` drift gate (CI) and the `--yes` reconcile (the user's machine).
* Keep every safety property ADR-0029 established: never touch a skill the installer did not install, keep the
  aside-then-swap crash safety in `mirrorOneSkill`, and fail closed on a read error so a transient or
  dehydrated-OneDrive read is never mistaken for "no change."
* Keep the no-op fast path: a second `--yes --skills` with nothing changed must still say "nothing to change".
  Dropping the fast path (always re-mirror) is simpler but churns on every run and would break that guarantee.
* Detection must be stable across machines and OSes, and must not churn on files the mirror does not copy (the
  gitignored OWASP `vendor/` text some machines have fetched and others have not).

## Considered Options

* Store a per-skill content fingerprint in the marker and compare the source's current fingerprint to it.
* Compare per-file mtime and size between source and target.
* Always re-mirror whenever `--skills` is passed (drop the no-op fast path).

## Decision Outcome

Chosen option: a per-skill content fingerprint. `skillSignature(name)` computes a sha256 over the sorted
`(relative-path, sha256-of-contents)` pairs of every file the mirror would copy, using the SAME skip set as
`mirrorOneSkill` (`vendor`, `node_modules`, `.git`) so the signature reflects exactly what lands at the target.
Paths are joined with `/` so the digest is identical on every OS. The marker records a `signatures` map
(skill name to digest) at mirror time. `planSkills()` and `assess()` recompute the source signatures and flag
any skill whose current digest differs from the stored one, which feeds the existing `changed` drift path and
the existing re-mirror loop. No new code path mirrors; the fingerprint only decides WHEN the existing one runs.

This is not a Gang of Four pattern. It is content-addressed change detection (a fingerprint comparison): the
forces are a single installer with one consumer and no inheritance or polymorphism to abstract, so "no pattern,
a plain fingerprint function is correct" is the honest call. The guarantee that it actually re-mirrors lives in
a discriminating test, not in the shape of the code.

mtime and size were rejected: `cpSync` does not preserve mtime and a `git checkout` stamps files with the
checkout time, not the commit time, so an mtime compared against a stored value is unreliable across machines
and pulls, and size alone misses a same-size edit. Always-re-mirror was rejected because it removes the no-op
fast path and the "nothing to change" guarantee that several ADR-0029 tests assert and that users rely on.

### Consequences

* Good, because a same-version edit or added file inside an installed skill is now drift in `--check` and is
  re-mirrored by `--yes`, at root cause. The PR #72 scenario (a new `scripts/` file at an unchanged version) is
  covered by a discriminating test.
* Good, because every ADR-0029 safety property is kept: the mirror and removal code is unchanged (foreign
  skills are still never named or touched, the aside-then-swap is intact), and the fingerprint walk fails
  closed (`die`) on any read error, the same rule `sourceSkillNames()` follows.
* Good (migration), because a marker written before this fix has no `signatures`, so every present skill reads
  as drift once; the first reconcile re-mirrors and records the baseline. This is safe (a redundant re-mirror),
  and it matches the reported case, where a pull did change content.
* Bad (honest limit), because the fingerprint compares the SOURCE now against the source as of the last mirror.
  It detects "the repo changed since we mirrored," not "someone hand-edited the mirrored copy at the target."
  Target tampering at the same source version is still only caught at the top-level `SKILL.md` existence check,
  as before. Full target verification was out of scope to avoid churn and is noted here as the next gap to
  close if it is ever hit.
* Bad (cost), because `--check` and the plan now read every file of every in-scope skill to hash it. For this
  small repo that is a sub-second cost already paid once by the mirror copy; it is noted so a future large
  skill set can switch to per-skill caching if needed.

### Confirmation

`test/esk-init.test.mjs` adds two discriminating cases. The first installs a skill, then (a) ADDS a file and
(b) EDITS a file inside it with the version unchanged, and asserts `--check` reports drift, `--yes` lands the
change at the target, and the run settles back to "nothing to change"; it fails on the pre-fix code (proven by
stashing the fix and re-running `node --test test/esk-init.test.mjs`: the suite then reports 1 failing, the
`--check` drift assertion). The second adds a file under a skipped `vendor/` subdir and asserts it is NOT
drift, pinning the signature's skip set to the mirror's skip set.

Reproducible evidence on this change (re-runnable from the repo root): `node --test test/esk-init.test.mjs`
reports 31 of 31 passing (both new discriminating cases included); `npm run check:architecture` exits 0
(no violations); `npm run check:links` exits 0. Named limitation: the full `npm test` run also includes
`test/new-adr.test.mjs`, whose shell-based ADR-tool cases are flaky on Windows msys (a known fork-relocation
flakiness on this machine, unrelated to this change, touching none of its files); those cases run clean on the
Linux CI runner, which is the authoritative gate. The true end-to-end proof (a fresh session loads the
re-mirrored file) stays a stated human step, like the hook canary.

## More Information

Follows ADR-0029 (installer `--skills` mirror) and ADR-0026 (structural always-on, pull-current). See
`.claude/skills/bootstrap/scripts/esk-init.mjs` and `.claude/skills/bootstrap/SKILL.md`.
