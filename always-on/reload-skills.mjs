#!/usr/bin/env node
// reload-skills - a SessionStart (matcher: compact) hook that, after a compaction, re-delivers the text of every
// required/applies skill in the task's selection as additionalContext and records each in the load-state. The
// audit finding: after a compaction the app re-attaches only skills invoked earlier, so a skill that was never
// invoked never comes back. This brings the SELECTED skills back regardless, so the next edit has their text in
// context. Exit 0 always; SessionStart cannot block, and a failure just means no re-delivery (the edit-gate then
// holds the next edit until the skill is loaded, so the gap is caught, never silently passed).
import { readFileSync, writeFileSync, existsSync, mkdirSync } from "node:fs";
import { resolve, join, dirname } from "node:path";
import { createHash } from "node:crypto";

const MAX = 10000; // Claude Code caps hook additionalContext at 10,000 characters.
const SAFE = /^[A-Za-z0-9._-]+$/;

function emit(ctx) {
  process.stdout.write(JSON.stringify({ hookSpecificOutput: { hookEventName: "SessionStart", additionalContext: ctx } }));
}

try {
  const selPath = process.env.ESK_SELECTION;
  const skillsDir = process.env.ESK_SKILLS_DIR || ".claude/skills";
  const loadedPath = process.env.ESK_LOADED;
  if (!selPath || !existsSync(resolve(selPath))) process.exit(0); // not wired / no selection yet: nothing to reload
  const sel = JSON.parse(readFileSync(resolve(selPath), "utf8"));
  const names = Object.entries(sel)
    .filter(([, e]) => e && (e.verdict === "required" || e.verdict === "applies"))
    .map(([n]) => n)
    .filter((n) => SAFE.test(n) && n !== "." && n !== "..");

  let state = {};
  if (loadedPath) { try { state = JSON.parse(readFileSync(resolve(loadedPath), "utf8")); } catch { state = {}; } if (!state || typeof state !== "object" || Array.isArray(state)) state = {}; }

  let ctx = "The task's selected skills, re-delivered after a compaction so none is missing from context:\n";
  for (const n of names) {
    const f = join(resolve(skillsDir), n, "SKILL.md");
    if (!existsSync(f)) continue;
    const text = readFileSync(f, "utf8");
    state[n] = createHash("sha256").update(Buffer.from(text, "utf8")).digest("hex");
    ctx += `\n--- ${n} ---\n${text}\n`;
  }
  if (loadedPath) { mkdirSync(dirname(resolve(loadedPath)), { recursive: true }); writeFileSync(resolve(loadedPath), JSON.stringify(state)); }
  if (ctx.length > MAX) ctx = ctx.slice(0, MAX); // cap; the edit-gate still holds any skill not fully re-delivered
  emit(ctx);
} catch { /* never break the session */ }
process.exit(0);
