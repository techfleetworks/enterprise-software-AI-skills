#!/usr/bin/env node
// session-setup - a SessionStart hook that (1) SELF-TESTS the enforcement wiring and reports loudly if any hook is
// missing or was removed (tamper-visible), and (2) tells the agent the per-session paths to write its records to,
// so enforcement can actually fire (issue #174 PR-B, the activation layer).
//
// Honest trust model (ADR-0101): .claude/settings.json is writable by the agent, so this does NOT physically
// PREVENT an agent from removing the enforcement hooks. It makes removal VISIBLE: every session that starts after a
// hook is deleted or altered opens with a plain warning in context, and a SessionStart hook cannot be silently
// swallowed without also removing THIS hook (which the warning names). Prevention needs OS-level managed settings,
// documented as the optional stronger tier in always-on/README.md.
//
// A SessionStart hook cannot block, so this ALWAYS exits 0; its only output is additionalContext for the session.
// When enforcement is not on (ESK_ENFORCE != 1) it emits nothing, so an un-bootstrapped machine is untouched.
import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { homedir } from "node:os";
import { enforcementOn, isSafeSession, sessionPaths } from "./esk-paths.mjs";

// Read the operator waivers file and return its entries (or []). Used to SURFACE every waiver in effect at session
// start, so a waiver added outside the operator process (a forged by:"operator" entry) is visible, not silent.
function readWaivers(p) {
  try { if (!existsSync(p)) return []; const w = JSON.parse(readFileSync(p, "utf8")); return Array.isArray(w) ? w : (Array.isArray(w.waivers) ? w.waivers : []); } catch { return []; }
}

// The enforcement hooks the install must keep registered: [event, script-basename, what it does]. This is the full
// set the installer (esk-init --enforce) guarantees, so the self-test warns if any of them is removed.
const REQUIRED_HOOKS = [
  ["PreToolUse", "edit-gate.mjs", "holds an edit until select/load/plan are done"],
  ["Stop", "finish-check.mjs", "holds the turn until the formula is proven"],
  ["SubagentStop", "finish-check.mjs", "same, for a subagent's turn"],
  ["PostToolUse", "record-load.mjs", "records a genuine skill load"],
  ["SessionStart", "reload-skills.mjs", "re-flags selected skills to load after a compaction"],
];

function emit(context) {
  if (context) process.stdout.write(JSON.stringify({ hookSpecificOutput: { hookEventName: "SessionStart", additionalContext: context } }));
  process.exit(0);
}
process.on("uncaughtException", () => process.exit(0)); // never let this hook break a session; it cannot block anyway

// Read a settings.json if present; return its parsed object or null (a parse error reads as "no hooks here").
function readSettings(p) { try { return existsSync(p) ? JSON.parse(readFileSync(p, "utf8")) : null; } catch { return null; } }
// True if any hook group under settings.hooks[event] references `basename` in its command/args.
function hasHook(settings, event, basename) {
  const groups = settings && settings.hooks && Array.isArray(settings.hooks[event]) ? settings.hooks[event] : [];
  for (const g of groups) for (const h of (g && Array.isArray(g.hooks) ? g.hooks : [])) {
    const s = (Array.isArray(h.args) ? h.args.map(String).join(" ") : "") + " " + (typeof h.command === "string" ? h.command : "");
    if (s.includes(basename)) return true;
  }
  return false;
}

let raw = "";
process.stdin.on("error", () => process.exit(0));
process.stdin.on("data", (d) => (raw += d));
process.stdin.on("end", () => {
  let payload = {};
  try { payload = raw.trim() ? JSON.parse(raw) : {}; } catch { payload = {}; }
  if (!enforcementOn()) process.exit(0); // not wired: say nothing

  // Candidate settings files that could carry the hooks: the project's, its local override, and the personal one.
  const projectDir = process.env.CLAUDE_PROJECT_DIR || process.cwd();
  const candidates = [
    join(projectDir, ".claude", "settings.json"),
    join(projectDir, ".claude", "settings.local.json"),
    join(homedir(), ".claude", "settings.json"),
  ].map(readSettings).filter(Boolean);

  const missing = REQUIRED_HOOKS.filter(([event, base]) => !candidates.some((s) => hasHook(s, event, base)));

  const parts = [];
  if (missing.length) {
    parts.push(
      "ENFORCEMENT WARNING (enterprise-skills): the following enforcement hooks are NOT registered in any settings.json, " +
      "so the skills formula is not being enforced for this session. This can mean the install is incomplete or an " +
      "enforcement hook was removed. Re-run `node .claude/skills/bootstrap/scripts/esk-init.mjs --yes` to restore it.\n" +
      missing.map(([event, base, what]) => `  - ${event} -> ${base} (${what})`).join("\n"),
    );
  }
  if (isSafeSession(payload.session_id)) {
    const p = sessionPaths(payload.session_id);
    parts.push(
      "Enterprise-skills enforcement is ON for this session. Write the task's proof to these per-session files " +
      "(they live outside the work tree so a cleaned folder cannot lose them):\n" +
      `  - selection record: ${p.selection}\n` +
      `  - load-state:       ${p.loaded}\n` +
      `  - planning records: ${p.plans}\n` +
      `  - task record:      ${p.record}\n` +
      `  - per-task receipt: ${p.receipt}\n` +
      "The edit-gate holds an edit until select/load/plan exist; the finish-check holds the turn until build, prove, " +
      "review, encode, and the receipt are proven. Operator waivers (by:operator) go in " +
      `${p.waivers}; you cannot waive a step for yourself.`,
    );
    // Surface every operator waiver in effect, so a waiver added outside the operator process is VISIBLE (this is the
    // detection the trust model promises for the waiver seam: it is seen, not silently honored).
    const waivers = readWaivers(process.env.ESK_WAIVERS_FILE || p.waivers);
    if (waivers.length) {
      parts.push(
        `OPERATOR WAIVERS IN EFFECT this session (${waivers.length}). If you (the operator) did not record these, a step was waived without you - review them:\n` +
        waivers.map((w) => `  - ${w && w.step} (by: ${w && w.by}; reason: ${w && w.reason || "none"})`).join("\n"),
      );
    }
  } else {
    // No usable session id: the gates cannot derive their per-session paths, so they FAIL CLOSED (block edits and
    // turn-ends) rather than enforce silently. Say that plainly instead of claiming enforcement continues.
    parts.push("Enterprise-skills enforcement is ON, but no usable session id was provided, so the per-session paths cannot be derived; the edit-gate and finish-check will FAIL CLOSED (hold edits and the turn) until a session id is available or ESK_SELECTION/ESK_TASK_RECORD are set explicitly.");
  }
  emit(parts.join("\n\n"));
});
