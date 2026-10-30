#!/usr/bin/env node
// reload-skills - a SessionStart (matcher: compact) hook. After a compaction the task's selected skill BODIES are
// gone from context (the audit finding: only skills invoked earlier come back). A single real SKILL.md is
// 20-35 KB, well over Claude Code's 10,000-char additionalContext cap, so the bodies cannot be re-inlined here;
// trying would deliver nothing yet mark them loaded, a false "loaded" that defeats the whole gate. Instead this:
//   1. CLEARS each selected required/applies skill from the load-state, so it reads as NOT loaded again and the
//      edit-gate holds the next edit until the skill is genuinely re-read (record-load.mjs captures that).
//   2. emits a short NOTICE naming those skills, so the agent knows to re-load them before editing.
// This way "loaded" stays truthful: it means the current text was actually read this session, not that a
// compaction happened. Exit 0 always (SessionStart cannot block); any failure fails SAFE toward not-loaded,
// because the edit-gate still holds a skill that is not in the load-state.
import { readFileSync, writeFileSync, existsSync, mkdirSync } from "node:fs";
import { resolve, dirname } from "node:path";

const MAX = 10000; // Claude Code caps hook additionalContext at 10,000 characters; the NOTICE is only skill names.
const SAFE = /^[A-Za-z0-9._-]+$/;

function emit(ctx) {
  process.stdout.write(JSON.stringify({ hookSpecificOutput: { hookEventName: "SessionStart", additionalContext: ctx } }));
}

try {
  const selPath = process.env.ESK_SELECTION;
  const loadedPath = process.env.ESK_LOADED;
  if (!selPath || !existsSync(resolve(selPath))) process.exit(0); // not wired / no selection yet
  const sel = JSON.parse(readFileSync(resolve(selPath), "utf8"));
  const names = Object.entries(sel)
    .filter(([, e]) => e && (e.verdict === "required" || e.verdict === "applies"))
    .map(([n]) => n)
    .filter((n) => SAFE.test(n) && n !== "." && n !== "..");

  // Clear each selected skill from the load-state so it must be re-read; the edit-gate then holds until it is.
  if (loadedPath && existsSync(resolve(loadedPath))) {
    let state = {};
    try { state = JSON.parse(readFileSync(resolve(loadedPath), "utf8")); } catch { state = {}; }
    if (state && typeof state === "object" && !Array.isArray(state)) {
      for (const n of names) delete state[n];
      mkdirSync(dirname(resolve(loadedPath)), { recursive: true });
      writeFileSync(resolve(loadedPath), JSON.stringify(state));
    }
  }

  const ctx = names.length
    ? `Context was compacted. The task's selected skills are no longer in context. Re-load each with the Skill tool before your next edit (the edit-gate holds the edit until you do): ${names.join(", ")}.`
    : "Context was compacted. No selected skills needed re-loading.";
  emit(ctx.length > MAX ? ctx.slice(0, MAX) : ctx);
} catch { /* never break the session; an un-cleared skill still reads as loaded only if it already was, and a genuine re-read refreshes it */ }
process.exit(0);
