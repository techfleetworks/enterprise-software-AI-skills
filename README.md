# Engineering Standards — Portable Agent Skills

A set of six model-agnostic "skills": condensed, actionable engineering
standards that an AI coding agent (or a person) can load as context. The
content is vendor-neutral — no reference to any specific model, assistant, or
tool — so it can be published and used with any LLM or agent framework.

## What's in here

Each folder is one self-contained skill:

- `comprehensive-test-strategy/` — test pyramid, contract, load/performance, chaos, quality gates
- `compliance-data-lifecycle/` — SOC2/ISO, GDPR/CCPA, audit logging, retention, safe migrations & DR
- `enterprise-architecture-standards/` — architecture styles, DB design, microservices, resilience, scalability
- `owasp-secure-coding-bdd/` — OWASP threat-modeling checklists as BDD security scenarios
- `release-deployment-safety/` — zero-downtime deploys, canary/blue-green, feature flags, rollback
- `sre-operational-readiness/` — SLIs/SLOs, golden signals, alerting, incident response, runbooks

## Format

Every skill is a folder containing:

```
<skill-name>/
  SKILL.md          # YAML frontmatter (name + description) + Markdown instructions
  references/*.md    # deep-dive reference material the agent reads on demand
```

`SKILL.md` uses a tiny YAML front-matter header followed by plain Markdown:

```yaml
---
name: <skill-name>
description: <when to use this skill — used for automatic triggering>
---
# ...instructions in Markdown...
```

This is intentionally the lowest common denominator: any tool that supports
the SKILL.md convention reads it natively, and any model that doesn't can
still consume the file as ordinary Markdown. Nothing here is tied to one
vendor.

## How to use it with different agents/models

- **Claude Code / SKILL.md-aware tools:** drop each `<skill-name>/` folder into
  your skills directory (personal `~/.claude/skills/`, project `.claude/skills/`,
  or a plugin). The agent auto-loads a skill when its `description` matches the task.
- **Cursor / Copilot / Windsurf / rules-based tools:** point your project rules
  at the relevant `SKILL.md` (or copy its body into your rules file). The
  `references/*.md` files can be attached on demand.
- **Any other model / custom agent:** treat `SKILL.md` as a system-prompt or
  retrieval document. Load the frontmatter `description` to decide relevance,
  then feed the Markdown body (and any referenced file) as context.

## Publishing notes

- All frontmatter is valid YAML (descriptions containing `:` are quoted, so
  strict parsers won't choke).
- Content contains no model, company, or product names — safe to share publicly.
- Skill folder names are kebab-case and match the frontmatter `name`, which is
  what most loaders key on.
