#!/usr/bin/env node
// record-load - a PostToolUse hook on the Skill tool that records a GENUINE skill load into the load-state
// (ESK_LOADED), keyed by the skill file's current sha256. This is how "loaded this session" becomes true: the
// edit-gate and the finish-check read this state, so a skill counts as loaded only when its text was actually
// read with the Skill tool (not recalled from memory, not auto-injected). Exit 0 always; a PostToolUse hook must
// never break the turn, and it only ADDS a fact, so any failure just means the load is not recorded (fail safe
// toward "not loaded", which the gates then catch).
import { readFileSync, writeFileSync, existsSync, mkdirSync } from "node:fs";
import { resolve, join, dirname } from "node:path";
import { createHash } from "node:crypto";

const SAFE = /^[A-Za-z0-9._-]+$/;
let raw = "";
process.stdin.on("data", (d) => (raw += d));
process.stdin.on("end", () => {
  try {
    const loadedPath = process.env.ESK_LOADED;
    if (!loadedPath) return; // not wired: nothing to record
    const skillsDir = process.env.ESK_SKILLS_DIR || ".claude/skills";
    const payload = JSON.parse(raw || "{}");
    const input = payload.tool_input || payload.toolInput || {};
    const name = String(input.skill || input.name || "").trim();
    if (!name || !SAFE.test(name) || name === "." || name === "..") return; // not a safe skill name
    const skillFile = join(resolve(skillsDir), name, "SKILL.md");
    if (!existsSync(skillFile)) return; // unknown skill: do not record a load that did not deliver real text
    const hash = createHash("sha256").update(readFileSync(skillFile)).digest("hex");
    let state = {};
    try { state = JSON.parse(readFileSync(resolve(loadedPath), "utf8")); } catch { state = {}; }
    if (!state || typeof state !== "object" || Array.isArray(state)) state = {};
    state[name] = hash;
    mkdirSync(dirname(resolve(loadedPath)), { recursive: true });
    writeFileSync(resolve(loadedPath), JSON.stringify(state));
  } catch { /* never break the turn; an unrecorded load just reads as not-loaded, which the gates catch */ }
  process.exit(0);
});
