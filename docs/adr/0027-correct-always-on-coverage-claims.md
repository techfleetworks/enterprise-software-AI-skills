---
status: "accepted"
date: 2026-10-12
decision-makers: mdenner
---

# Correct the always-on coverage claims, and make a truncated directive visible

## Context and Problem Statement

ADR-0026 shipped two committed, repo-relative layers (a `CLAUDE.md` import and a `.claude/settings.json`
hook) and described the result as the directive loading "on every session two ways." A review of the
always-on failure modes, checked against the Claude Code docs, found that phrasing overstates coverage, in a
way that matters because people rely on it:

* A local session rooted ABOVE or OUTSIDE the repo (the common case when one session spans several sibling
  repos from a parent folder) does not auto-load the project `CLAUDE.md` at launch, and the committed hook is
  a project hook, so neither committed layer fires. Only a per-machine user-level hook carries the directive
  there. This review's own session is an example: it started in the parent folder and received the directive
  from the user-level hook alone.
* A cloud session does not read a local `~/.claude/settings.json`, so the per-machine hook never runs in the
  cloud (documented, cloud-environments doc). The committed layers reach a cloud single-repo session per that
  same doc (the repo's `.claude/settings.json` hooks and `CLAUDE.md` are in the clone), but a cloud multi-repo
  or no-repo session is reached by none of the repo-committed paths. These cloud facts are documented, not
  verified by launching a cloud session.
* The emitter already truncates a directive over the 10,000-character hook cap, but it announced the
  truncation only on stderr, and the docs confirm Claude never sees stderr from a hook that exits 0. So a
  future over-cap directive would be silently clipped from the agent's point of view.
* The README and ADR-0026 claimed "only a change to the hook command re-prompts" for workspace trust. The
  docs document no content-based re-prompt at all; trust is keyed to the repo root and stored once.

A separate, larger gap the review surfaced: the committed layers deliver the directive TEXT, but the skill
files live at the repo root, which is not a Claude Code skill-discovery location, so a pull does not make the
skills themselves loadable. That relocation is tracked as its own decision, not resolved here.

## Decision Drivers

* State the real coverage, so no one trusts a guarantee that is not there (the repo's own skeptical-audit rule).
* Make any silent degradation visible in the agent's context, not only in logs the agent cannot see.
* Do not overstate platform behavior the docs do not document.

## Considered Options

* Correct the claims to a documented coverage matrix, add an in-context truncation notice, and soften the
  unsourced trust claim.
* Leave the wording and rely on readers to infer the limits.
* Try to force full coverage (for example pin machine-specific paths into the committed hook), rejected
  because it breaks portability and still cannot reach a machine that never approved the hook or a cloud
  session.

## Decision Outcome

Chosen option: correct the claims and harden the emitter. The directive file, `CLAUDE.md`, and
`always-on/README.md` now describe coverage per session type (local in-repo, local outside-repo, cloud
single-repo, cloud multi-repo) instead of "every session two ways," and they separate three things that were
blurred together: the directive is **loaded**, the skill is **obeyed** (the gates prove that, not the
directive text), and the skill files are **discoverable** (a per-machine install or a future relocation, not
a pull of the root layout). `emit-directive.mjs` now prepends a short in-context NOTICE when it truncates,
sized so the notice plus the clipped directive stay within the 10,000-character cap, and still warns on
stderr for logs. The "only a command change re-prompts" claim is replaced with what the docs actually say:
trust is keyed to the repo root and stored once, with no documented re-prompt on later content changes.

### Consequences

* Good, because the documentation now matches the documented platform behavior, so a reader can see exactly which
  sessions are covered and which need the per-machine install.
* Good, because a future over-cap directive announces its own truncation to the agent instead of being
  silently clipped.
* Neutral, because this is a documentation-and-emitter correction; it does not change which layers exist or
  add a new delivery path.
* Bad (honest limit), because the real coverage is narrower than the old wording implied: a machine that
  never opened and approved the repo, and a cloud multi-repo session, are reached by nothing the repo
  commits. Closing the skill-discoverability half of that gap is a separate decision.

### Confirmation

`test/always-on-emit.test.mjs` adds a discriminating case: an over-limit directive is truncated with a
visible `TRUNCATED` notice in `additionalContext` and the result stays within the 10,000-character cap;
removing the notice fails the test. The coverage-matrix wording is **documented** from the Claude Code docs
(memory, hooks, settings, cloud-environments, permissions; URLs in `always-on/README.md`), not verified by
launching each session type; the cloud rows are documented, not probed by a live cloud session, and are
labeled as such in the matrix. All tests run in CI via `npm test`.

## More Information

Refines ADR-0024 (the emitter) and ADR-0026 (the two committed layers), correcting 0026's coverage wording
rather than reversing its decision. The skill-discoverability relocation (moving skills under
`.claude/skills/` so a pull makes them loadable) is left to a later ADR. Docs basis: the Claude Code docs at
<https://code.claude.com/docs/en/hooks>, `/skills`, `/settings`, `/cloud-environments`, `/permissions`, and
`/memory` (the cloud and exit-0-stderr facts are documented, several via a summarizing fetch, and the cloud
rows were not verified by launching a cloud session).
