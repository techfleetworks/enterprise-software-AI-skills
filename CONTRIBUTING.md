# Contributing

These are portable, vendor-neutral agent skills. Contributions and forks are welcome.

## Ground rules

- **Stay vendor-neutral.** No model, company, or product names in skill content, so
  a skill works with any LLM or agent framework.
- **Keep the format.** Each skill is a folder with a `SKILL.md` (YAML frontmatter:
  `name` + `description`, then Markdown instructions) and optional `references/*.md`
  files the agent reads on demand. Folder name is kebab-case and matches the
  frontmatter `name`.
- **Valid YAML frontmatter.** Quote any `description` containing a `:` so strict
  parsers don't choke.
- **Actionable over exhaustive.** Skills are condensed working standards, not
  textbooks. Put deep material in `references/` and keep `SKILL.md` scannable.

## How to propose a change

1. Fork the repo and create a branch.
2. Add or edit a skill folder following the format above.
3. Open a pull request describing what the skill helps an agent do and when it
   should trigger (the `description` is what tools use for automatic selection).

## Before you open a pull request

This repo holds its own changes to the standards it ships. Before you open or update a PR:

1. **Run the mechanical gates locally.** `npm test` must pass and `npm run check:architecture` must exit 0.
2. **Run a fresh-context `judge-arch` review** of the change, resolve or explicitly waive every finding, and
   append the review to `docs/arch-reviews/log.jsonl`.
3. **Append a skill-application receipt** to `docs/skill-receipts/log.jsonl`: one entry for the change covering
   every skill (applied or not-applicable), each `applied` entry citing a real skill heading, quoting at least
   eight exact words from under that heading, and naming files in the change. Run `npm run check:receipt` to
   confirm it is complete and every quote is a verbatim run from the cited section; add `--changed-list` to
   also check that the cited files are in the change and that a coupled surface is marked applied. The
   merge-blocking CI job that passes the diff and base is deferred to the techfleetnetwork release. The gate
   proves grounding, not that the work is good, so a reviewer still audits it against the diff. See
   `docs/specs/skill-application-receipt.md`.
4. **Fill in the PR template checklist.** It is the list CI and reviewers expect.

CI runs the required checks `test (20)`, `test (24)` (the gate-script tests plus `check:architecture`), and
`routing` (change-type to required-artifact: a new skill needs an ADR, a new gate needs a test). All three
must be green to merge, and branch protection enforces it (`.github/rulesets/main-protection.json`, applied by
`scripts/apply-ruleset.sh`). These prove the routed artifacts exist and the repo passes its gates; they do
not verify that a fresh-context review happened (no required check reads the review log) or judge the quality
of the thinking. The review is required by this guide and the PR template, not by a gate, so run it.

## Releasing and versioning

A published release is the trusted anchor: consumer repos verify their gates against it, and releases are
immutable (a published version can never be rewritten). So we freeze the past and keep improving the
present, in controlled steps. The full rationale is in ADR-0049.

- **Who may cut a release.** Any contributor with write permission, same as merging. No mandatory second
  reviewer; the gates are the mechanical backstop.
- **Version numbers (semver), with one rule for this repo:** a change that would turn a currently-green
  consumer **red** (tightening or removing a gate, changing the manifest shape) is consumer-affecting. Ship
  it as at least a **minor**, and say so loudly in the release notes. Never a quiet patch.
  - **Patch** (1.1.0 to 1.1.1): a fix that does not change what a consumer must do.
  - **Minor** (1.1.0 to 1.2.0): a new gate or capability, backward compatible.
  - **Major** (1.x to 2.0.0): a breaking change for consumers.
- **Cutting a release.** Bump the `version` in `gate-manifest.json`, open a PR (it must pass the gates),
  merge, then publish a GitHub release on the new tag with `gate-manifest.json` attached as an asset. That
  attached file is what consumers' provenance checks compare against.
- **Retiring a bad release.** You cannot edit or delete a frozen release, so supersede it: ship the fix as
  a new version, edit the bad release's notes to read "deprecated, use X.Y.Z," and for a security problem
  publish a GitHub security advisory. Consumers move forward by bumping their pin.
- **Emergency and security fixes.** Same path, fast: cut a new version. There is no multi-reviewer wait.
- **Consumers upgrade forward only.** `esk-genesis` reconcile moves a consumer to a newer pinned version
  and cannot move it backward.
- **Staying current is automatic to detect, deliberate to apply.** Starting an agent session in a
  bootstrapped repo runs a drift check on its own (no one has to remember); if the repo is behind the
  installed skills version, the agent flags it loudly and strongly encourages updating before you code.
  You confirm, then reconcile runs. It never auto-bumps silently, so a stricter gate cannot surprise you
  mid-work.

## Adding a new skill

Create `.claude/skills/<skill-name>/SKILL.md`:

```yaml
---
name: your-skill-name
description: "When to use this skill, used for automatic triggering"
---
# Instructions in Markdown...
```

Add supporting depth under `.claude/skills/<skill-name>/references/` and link to it from `SKILL.md`. A skill
must sit exactly one level under `.claude/skills/` or it will not be discovered (the `skills-location` test
enforces this).
