---
status: "accepted"
date: 2026-10-12
decision-makers: mdenner
---

# Move the skills under `.claude/skills/` so a pull makes them discoverable

## Context and Problem Statement

The repo stored its 17 skills at the repo root (`judge-arch/`, `owasp-secure-coding-bdd/`,
`requirements/universal-accessibility-wcag/`, and so on). Claude Code discovers skills only from
`~/.claude/skills/`, a project's `.claude/skills/` (walking up from the start directory to the repo root),
an `--add-dir` directory, enterprise settings, or an installed plugin. A skill folder at the repo root is in
none of those, so a `git clone` or `git pull` delivered the skill files but not in a location any session
could load. The only way the skills worked was a manual copy into `~/.claude/skills/`, per machine. The
always-on directive could be present (naming `judge-arch`) while the Skill tool could not find it. The repo
even documented "commit a skill into `.claude/skills/` to share it with your team," but did not do that for
its own skills.

## Decision Drivers

* A `git pull` should make the skills loadable with zero commands for anyone working in the repo (and for a
  cloud single-repo session, which loads a repo's committed files).
* Keep the mechanical gate honest through the move: nothing may regress to a vacuous pass.
* Prefer prevent-by-construction: a committed test should fail if a skill ever leaves the discovery location.

## Considered Options

* **Move all skills to `<repo>/.claude/skills/<name>/`** (the project discovery location), rewire every path
  reference, and keep the gate green.
* Keep skills at the root and rely on the installer to copy them into `~/.claude/skills/` (an install step,
  not a pull; deferred to a separate change for the global, any-folder case).
* Ship the repo as a plugin (one install per machine, skills namespaced `<plugin>:name`). Deferred as a
  later, separate distribution track.

## Decision Outcome

Chosen option: "move all skills to `.claude/skills/`." All 17 skill folders now live at
`.claude/skills/<name>/`, flattened (the `requirements/` wrapper is gone, because a project skill must sit
exactly one level under `.claude/skills/` to be discovered). The architecture-gate config and waivers, the
test files, and `package.json` stay at the repo root. Gate and tool scripts that resolve their paths from
`import.meta.url` (the owasp vendor and verbatim tools, and the per-skill checkers) moved correctly with
their skill and needed no change; the only breakage was cwd-relative references, which were all rewired:
`package.json` script paths, the `arch-gate.config.json` house-style include list, the evidence-contract
gate's default allowlist path, the `.gitignore` OWASP vendor paths, the injected directive's contract path,
the doc cross-links, and the test files' script paths. The README install story is rewritten to the new
reality: clone and work in the repo and the skills auto-load, or copy a folder out for all your projects.

A new gate, `test/skills-location.test.mjs`, enforces the location by construction: every skill must be a
`SKILL.md` exactly one level under `.claude/skills/`, and no `SKILL.md` may live outside it. If a skill is
moved back to the root or nested too deep, discovery silently breaks but this test fails loudly.

### Consequences

* Good, because a `git pull` now delivers skills that load with no install for in-repo sessions and for
  cloud single-repo sessions. The gap where the directive named a skill the Skill tool could not find is
  closed for in-repo use.
* Good, because the repo now follows its own advice (commit skills to `.claude/skills/`), and a new teammate
  needs no copy step to use them in the repo.
* Bad (honest limit), because global, any-folder coverage still needs a per-machine install: git cannot
  write another machine's `~/.claude/`. That installer change is the next step (it mirrors `.claude/skills/`
  into `~/.claude/skills/`).
* Bad (honest limit), because a machine that already copied the skills into `~/.claude/skills/` (a
  maintainer's) will see both a personal and a project copy of each skill while working in the repo, until
  that per-machine copy is reconciled to the managed mirror.
* Neutral, because the move is large (360 changed paths) but almost entirely mechanical renames; the full
  gate is the proof it is correct.

### Confirmation

The move broke 229 of 337 tests (every test that invoked a gate script at its old path); all were rewired and
the suite is green again: `npm test` reports 339 tests, 0 failing (328 passing, 11 skipped), the 337
pre-existing plus the two new location tests. That count is from a clean run; on a Windows machine a known
msys `bash` fork flake can intermittently fail the one bash-shelling ADR test, unrelated to this move, and
Linux CI is unaffected.
`npm run check:architecture` exits 0 (the house-style include list was reprefixed, and
`test/arch-gate-wired.test.mjs` confirms every include still catches a planted em dash at the new path).
`npm run check:verbatim` PASSES at the new vendor path (136 sheets compared), confirming the owasp CI job's
wiring. A repo-wide sweep shows no bare skill-path references remain outside the append-only arch-review log
and historical ADRs. The true end-to-end proof, that a fresh session discovers the skills from
`.claude/skills/` with no `~/.claude` install, is a stated human step (open a fresh clone and ask an agent to
invoke a skill), the same division of proof used for the always-on hook canary.

## More Information

Follows ADR-0026 and ADR-0027 (the always-on directive coverage). The per-machine global install (mirror
`.claude/skills/` into `~/.claude/skills/`) and the optional plugin distribution are tracked as later
changes. Skill-discovery locations per the Claude Code skills docs
(<https://code.claude.com/docs/en/skills>).
