# Project instructions

This repository's engineering standards are always on for sessions that work **inside this repo**. The
directive below is imported, so a session rooted in the repo or a subdirectory loads it automatically as
context, with no setup and no approval, and a `git pull` keeps it current (Claude Code loads a project
`CLAUDE.md` from the working directory and its parents, and a relative import loads with no prompt). The
committed hook in `.claude/settings.json` injects the same directive into subagents as well, including the
built-in Explore and Plan agents that do not read this file, after a one-time workspace-trust step.

These layers deliver the **directive text** on pull; they do not install the skills themselves, and they do
not reach every session. A session rooted **above or outside** this repo (for example a parent folder that
holds several repos) does not auto-load this file, and no committed file can reach another machine's
`~/.claude`, so broader coverage needs the one-time installer in `.claude/skills/bootstrap/`. See `always-on/README.md`
for the coverage map and its limits.

See `always-on/README.md` for how the two layers work and their limits, and `.claude/skills/bootstrap/SKILL.md` to install
the always-on hook into another project or machine.

@always-on/enterprise-skills-always-on.md
