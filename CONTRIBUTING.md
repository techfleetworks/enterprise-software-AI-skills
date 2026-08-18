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

## Adding a new skill

Create `<skill-name>/SKILL.md`:

```yaml
---
name: your-skill-name
description: "When to use this skill — used for automatic triggering"
---
# Instructions in Markdown...
```

Add supporting depth under `<skill-name>/references/` and link to it from `SKILL.md`.
