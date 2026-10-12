# Project instructions

This repository's engineering standards are always on. The directive below is imported, so every session
that works in this repo loads it automatically as context, with no setup and no approval, and a `git pull`
keeps it current (Claude Code loads a project `CLAUDE.md` every session, and a relative import like the one
below loads with no prompt). The committed hook in `.claude/settings.json` injects the same directive into
subagents as well, including the built-in Explore and Plan agents, which do not read this file. Together
they mean anyone who pulls this repo picks up the latest directive, on every pull, without a manual step.

See `always-on/README.md` for how the two layers work and their limits, and `bootstrap/SKILL.md` to install
the always-on hook into another project or machine.

@always-on/enterprise-skills-always-on.md
