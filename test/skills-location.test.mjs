// Prevent-by-construction gate for ADR-0028: skills must stay in the Claude Code project
// discovery location, `.claude/skills/<name>/SKILL.md`, so a `git pull` makes them loadable with no
// install. If a skill is moved back to the repo root (or nested two levels deep), it stops being
// auto-discovered and this fails, loudly, in CI.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readdirSync, existsSync } from "node:fs";
import { join, resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const REPO = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const SKILLS = join(REPO, ".claude", "skills");

test("every skill lives one level under .claude/skills/, where Claude Code discovers it on pull", () => {
  assert.ok(existsSync(SKILLS), ".claude/skills/ must exist (the project skill-discovery location)");
  const dirs = readdirSync(SKILLS, { withFileTypes: true }).filter((e) => e.isDirectory());
  assert.ok(dirs.length >= 17, `expected at least 17 skills under .claude/skills/, found ${dirs.length}`);
  for (const d of dirs) {
    assert.ok(
      existsSync(join(SKILLS, d.name, "SKILL.md")),
      `.claude/skills/${d.name}/ must contain a SKILL.md directly inside it (one level deep, so it is discovered)`,
    );
  }
});

test("no SKILL.md lives OUTSIDE .claude/skills/ (a pull must not ship an undiscoverable skill)", () => {
  // `worktrees` and `vendor` are excluded: an app-managed git worktree is a separate checkout, and the
  // gitignored OWASP vendor tree is upstream content, not a skill.
  const IGNORE = new Set(["node_modules", ".git", "dist", "build", "worktrees", "vendor"]);
  const stray = [];
  (function walk(dir) {
    let entries;
    try { entries = readdirSync(dir, { withFileTypes: true }); } catch { return; }
    for (const e of entries) {
      if (e.isDirectory()) { if (!IGNORE.has(e.name)) walk(join(dir, e.name)); }
      else if (e.name === "SKILL.md") {
        const rel = join(dir, e.name).slice(REPO.length + 1).split("\\").join("/");
        if (!rel.startsWith(".claude/skills/")) stray.push(rel);
      }
    }
  })(REPO);
  assert.deepEqual(stray, [], `SKILL.md files found outside .claude/skills/: ${stray.join(", ")}`);
});
