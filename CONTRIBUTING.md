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
3. **Fill in the PR template checklist.** It is the list CI and reviewers expect.

CI runs the required checks `test (20)`, `test (24)` (the gate-script tests plus `check:architecture`), and
`routing` (change-type to required-artifact: a new skill needs an ADR, a new gate needs a test). All three
must be green to merge, and branch protection enforces it (`.github/rulesets/main-protection.json`, applied by
`scripts/apply-ruleset.sh`). These prove a review happened and the artifacts exist; they cannot judge the
quality of the thinking, which is why the fresh-context review is required, not optional.

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
