#!/usr/bin/env node
/**
 * esk-init.mjs: install, verify, and keep current the enterprise-skills always-on hook.
 *
 * This is the deterministic half of the `bootstrap` skill. In this version it owns the always-on
 * hook lifecycle (install it, confirm it, and reconcile it after a repo update). Broader
 * artifact scaffolding (arch-gate config, BDD, SRE, and so on) is a later phase; this script is
 * built so that work plugs into the same framework (detect, plan, consent, back up, write,
 * validate, restore-on-failure, record, drift-check).
 *
 * SAFE BY DEFAULT: it never writes without `--yes`. With no action flag it prints the plan and
 * stops, so the `bootstrap` skill can show the plan and ask before anything changes.
 *
 *   node esk-init.mjs                 # plan only (same as --dry-run): show what WOULD change
 *   node esk-init.mjs --yes           # apply: install or reconcile the hook (backs up first)
 *   node esk-init.mjs --check         # drift gate for CI: exit non-zero if not installed/current
 *
 * Flags:
 *   --yes                 apply the plan (the only way it writes)
 *   --dry-run             print the plan and write nothing (the default)
 *   --check               verify installed + current + valid; exit 0 if so, non-zero on drift
 *   --personal            target ~/.claude/settings.json (default target is ./.claude/settings.json)
 *   --settings <path>     target this settings.json explicitly
 *   --repo <path>         the enterprise-skills repo root (default: resolved from this script)
 *   --shell powershell    write the Windows PowerShell shell-form hook instead of exec form
 *
 * Exit: 0 = success / already current (or a clean plan). 1 = drift (for --check) or a problem the
 * user must act on. 2 = bad usage or an unreadable/unwritable target (fail closed).
 */
import { readFileSync, writeFileSync, existsSync, copyFileSync, mkdirSync, unlinkSync } from "node:fs";
import { dirname, resolve, join } from "node:path";
import { fileURLToPath } from "node:url";
import { homedir } from "node:os";
import { spawnSync } from "node:child_process";

function die(msg) { console.error(`[esk-init] FAIL: ${msg}`); process.exit(2); }

// --- resolve the repo, the emitter, the directive, and the version -----------
const here = dirname(fileURLToPath(import.meta.url));          // bootstrap/scripts
const args = process.argv.slice(2);
const flag = (n) => args.includes(n);
const opt = (n) => { const i = args.indexOf(n); return i >= 0 ? args[i + 1] : undefined; };

const repoRoot = resolve(opt("--repo") || resolve(here, "..", ".."));
const emitter = join(repoRoot, "always-on", "emit-directive.mjs");
const directive = join(repoRoot, "always-on", "enterprise-skills-always-on.md");
if (!existsSync(emitter) || !existsSync(directive)) {
  die(`could not find the always-on files under ${repoRoot} (expected always-on/emit-directive.mjs and ` +
    `enterprise-skills-always-on.md). Pass --repo <path-to-enterprise-skills>.`);
}
let version = "0.0.0";
try { version = JSON.parse(readFileSync(join(repoRoot, "package.json"), "utf8")).version || version; } catch { /* keep default */ }

// --- resolve the target settings.json + marker -------------------------------
const personal = flag("--personal");
const settingsPath = resolve(opt("--settings") || (personal ? join(homedir(), ".claude", "settings.json") : join(process.cwd(), ".claude", "settings.json")));
const settingsDir = dirname(settingsPath);
const markerPath = join(settingsDir, ".esk-installed");
const logPath = join(settingsDir, "ESK-INSTALL-LOG.md");
const useShell = (opt("--shell") || "").toLowerCase() === "powershell";

// --- the hook entry we manage ------------------------------------------------
const EVENTS = ["SessionStart", "SubagentStart"];
function hookEntry(event) {
  if (useShell) {
    return { type: "command", shell: "powershell", command: `node "${emitter}" ${event}`, timeout: 10, statusMessage: "Loading enterprise always-on skills directive" };
  }
  return { type: "command", command: "node", args: [emitter, event], timeout: 10, statusMessage: "Loading enterprise always-on skills directive" };
}
// Recognize OUR hook across versions and forms, including the LEGACY copy-based hook that ran
// `node -e '...' "$HOME/.claude/enterprise-skills-always-on.md"`. Matching the legacy form too is what
// lets a reconcile UPGRADE an old install in place (replace it) instead of adding a duplicate beside it.
// The legacy branch requires the inline-reader shape (not the bare filename), so a foreign hook that
// merely mentions the directive file for some other purpose is NOT mistaken for ours.
const hookText = (h) => (Array.isArray(h.args) ? h.args.map(String).join(" ") : "") + " " + (typeof h.command === "string" ? h.command : "");
const isOurs = (h) => {
  if (!h || typeof h !== "object") return false;
  const s = hookText(h);
  if (s.includes("emit-directive.mjs")) return true;                                   // our emitter, any form
  return s.includes("enterprise-skills-always-on.md") && /readFileSync|node\s+-e/.test(s); // legacy inline reader
};
// An existing entry that already references the repo via ${CLAUDE_PROJECT_DIR} + our emitter + this event
// is the portable committed form; a reconcile must NOT rewrite it to a machine-absolute path.
const isPortable = (h, event) => { const s = hookText(h); return s.includes("${CLAUDE_PROJECT_DIR}") && s.includes("emit-directive.mjs") && s.includes(event); };

function readSettings() {
  if (!existsSync(settingsPath)) return { obj: {}, existed: false };
  let raw;
  try { raw = readFileSync(settingsPath, "utf8"); } catch (e) { die(`cannot read ${settingsPath} (${e.message})`); }
  try { return { obj: JSON.parse(raw), existed: true }; } catch (e) { die(`${settingsPath} is not valid JSON (${e.message}); fix or move it before installing.`); }
}

// Merge our entries additively; return {obj, actions}. Preserves foreign hooks and keys, updates our
// single entry in place (idempotent), and collapses duplicates of our entry into one.
function withHooks(obj) {
  const next = JSON.parse(JSON.stringify(obj));
  if (next.hooks !== undefined && (typeof next.hooks !== "object" || next.hooks === null || Array.isArray(next.hooks))) {
    die(`settings.json "hooks" is not an object; fix or remove it before installing.`);
  }
  next.hooks = next.hooks && typeof next.hooks === "object" ? next.hooks : {};
  const actions = [];
  for (const event of EVENTS) {
    if (next.hooks[event] !== undefined && !Array.isArray(next.hooks[event])) {
      die(`settings.json "hooks.${event}" is not an array; fix or remove it before installing (we will not silently drop it).`);
    }
    const groups = Array.isArray(next.hooks[event]) ? next.hooks[event] : (next.hooks[event] = []);
    const desired = hookEntry(event);
    // Locate every occurrence of OUR hook (in document order), so duplicates can be collapsed.
    const locs = [];
    groups.forEach((g, gi) => { if (g && Array.isArray(g.hooks)) g.hooks.forEach((h, hi) => { if (isOurs(h)) locs.push([gi, hi]); }); });
    if (locs.length === 0) {
      groups.push({ hooks: [desired] });
      actions.push(`add ${event} hook`);
    } else {
      const [gi0, hi0] = locs[0];
      const existing = groups[gi0].hooks[hi0];
      // Leave an existing portable committed form alone: rewriting ${CLAUDE_PROJECT_DIR} to a machine
      // absolute path would de-portabilize this repo's own committed hook for every other clone.
      // (A deliberate form switch, e.g. --shell powershell, still rewrites.)
      if (locs.length === 1 && !useShell && isPortable(existing, event)) {
        // already current and portable; no change
      } else {
        const before = JSON.stringify(existing);
        groups[gi0].hooks[hi0] = desired;
        for (let k = locs.length - 1; k >= 1; k--) { const [gi, hi] = locs[k]; groups[gi].hooks.splice(hi, 1); }
        next.hooks[event] = groups.filter((g) => !(g && Array.isArray(g.hooks) && g.hooks.length === 0));
        if (locs.length > 1) actions.push(`collapse ${locs.length} duplicate ${event} hooks into one`);
        else if (JSON.stringify(desired) !== before) actions.push(`update ${event} hook to the current emitter + form`);
      }
    }
  }
  return { obj: next, actions };
}

// --- canary: the hook command, run as configured, must emit the directive ----
// Honest scope: this proves the emitter + path + directive work. It does NOT prove Claude Code
// invokes the hook in a real session (settings shape willing); that end-to-end proof is the manual
// "open a fresh session and ask it to quote the directive" step the report prints.
function canary() {
  const r = spawnSync(process.execPath, [emitter, "SessionStart"], { encoding: "utf8" });
  if (r.status !== 0) return { ok: false, why: `emitter exited ${r.status}` };
  try {
    const parsed = JSON.parse(r.stdout || "");
    const ctx = parsed?.hookSpecificOutput?.additionalContext || "";
    if (!ctx.includes("Enterprise engineering skills")) return { ok: false, why: "emitter output did not contain the directive" };
    return { ok: true };
  } catch (e) { return { ok: false, why: `emitter output was not valid JSON (${e.message})` }; }
}

function readMarker() {
  if (!existsSync(markerPath)) return null;
  try { return JSON.parse(readFileSync(markerPath, "utf8")); } catch { return { version: "unparseable" }; }
}

// --- current-state assessment (drives --check and the plan) ------------------
function assess() {
  const { obj, existed } = readSettings();
  const problems = [];
  for (const event of EVENTS) {
    const groups = Array.isArray(obj?.hooks?.[event]) ? obj.hooks[event] : [];
    let count = 0;
    for (const g of groups) if (Array.isArray(g?.hooks)) count += g.hooks.filter(isOurs).length;
    if (count === 0) problems.push(`no ${event} hook pointing at emit-directive.mjs`);
    else if (count > 1) problems.push(`${count} duplicate ${event} hooks pointing at emit-directive.mjs (run --yes to collapse them)`);
  }
  const marker = readMarker();
  if (!marker) problems.push("no .esk-installed marker");
  else if (marker.version !== version) problems.push(`installed version ${marker.version} is behind the repo version ${version}`);
  const c = canary();
  if (!c.ok) problems.push(`canary: ${c.why}`);
  return { obj, existed, marker, problems };
}

// --- modes -------------------------------------------------------------------
const mode = flag("--check") ? "check" : flag("--yes") ? "apply" : "plan";

if (mode === "check") {
  const { problems } = assess();
  if (problems.length) {
    console.error(`[esk-init] drift: the always-on hook is not installed/current here:`);
    for (const p of problems) console.error("  • " + p);
    console.error(`Run \`node ${join("bootstrap", "scripts", "esk-init.mjs")} --yes\` (or the bootstrap skill) to fix.`);
    process.exit(1);
  }
  console.log(`[esk-init] OK:always-on hook installed, current (v${version}), and emitting. Target: ${settingsPath}`);
  process.exit(0);
}

// Plan (shared by plan + apply)
const before = readSettings();
const marker = readMarker();
const fresh = !marker;
const { obj: planned, actions } = withHooks(before.obj);
const nothingToDo = actions.length === 0 && marker && marker.version === version;

console.log(`\nEnterprise skills always-on ${fresh ? "install" : "reconcile"} plan`);
console.log(`  repo:      ${repoRoot} (version ${version})`);
console.log(`  settings:  ${settingsPath}${before.existed ? "" : " (will be created)"}`);
console.log(`  marker:    ${markerPath}${marker ? ` (installed version ${marker.version})` : " (none yet)"}`);
console.log(`  hook form: ${useShell ? "PowerShell shell form" : "exec form (no shell)"}`);
if (nothingToDo) { console.log(`  result:    already installed and current. Nothing to change.`); }
else {
  console.log(`  changes:`);
  for (const a of actions) console.log(`    - ${a}`);
  if (fresh) console.log(`    - write the .esk-installed marker (version ${version})`);
  else if (!marker || marker.version !== version) console.log(`    - bump the marker to version ${version}`);
  console.log(`  safety:    back up settings.json first; validate JSON after writing; restore on any failure.`);
}

if (mode === "plan") {
  if (!nothingToDo) console.log(`\nThis is a dry run. Re-run with --yes to apply (or let the bootstrap skill ask you first).`);
  process.exit(0);
}

// --- apply (only with --yes): back up, write, validate, canary, restore-on-fail ---
if (nothingToDo) { console.log(`\n[esk-init] OK:nothing to change.`); process.exit(0); }

let backup = null;
try {
  if (!existsSync(settingsDir)) mkdirSync(settingsDir, { recursive: true });
  if (before.existed) { backup = settingsPath + ".esk.bak"; copyFileSync(settingsPath, backup); }
  writeFileSync(settingsPath, JSON.stringify(planned, null, 2) + "\n");
} catch (e) { die(`could not write ${settingsPath} (${e.message})`); }

// Validate the write, then run the canary. On any failure, restore and fail closed.
function restore(why) {
  let note;
  try {
    if (backup) { copyFileSync(backup, settingsPath); note = `restored ${settingsPath} from ${backup}`; }
    else { if (existsSync(settingsPath)) unlinkSync(settingsPath); note = `removed ${settingsPath} (it did not exist before this run)`; }
  } catch (e) {
    note = `AUTOMATIC RESTORE FAILED (${e.message}); restore it yourself ` + (backup ? `from ${backup}` : `by deleting ${settingsPath}`);
  }
  console.error(`[esk-init] FAIL: ${why}. ${note}. Marker NOT written.`);
  process.exit(2);
}
let reread;
try { reread = JSON.parse(readFileSync(settingsPath, "utf8")); } catch (e) { restore(`settings.json was not valid JSON after writing (${e.message})`); }
for (const event of EVENTS) {
  const groups = Array.isArray(reread?.hooks?.[event]) ? reread.hooks[event] : [];
  if (!groups.some((g) => Array.isArray(g?.hooks) && g.hooks.some(isOurs))) restore(`the ${event} hook was not present after writing`);
}
const c = canary();
if (!c.ok) restore(`canary failed (${c.why})`);

// Success: write the marker + the log.
const stamp = new Date().toISOString();
writeFileSync(markerPath, JSON.stringify({ version, installedAt: stamp, settings: settingsPath, repo: repoRoot, form: useShell ? "powershell" : "exec" }, null, 2) + "\n");
const logLine = `\n## ${stamp}: ${fresh ? "installed" : "reconciled"} always-on (v${version}, ${useShell ? "powershell" : "exec"} form)\n` +
  actions.map((a) => `- ${a}`).join("\n") + `\n- backup: ${backup || "none (new file)"}\n- canary: emitter produced the directive\n`;
try { writeFileSync(logPath, (existsSync(logPath) ? readFileSync(logPath, "utf8") : "# ESK install log\n") + logLine); }
catch (e) { console.error(`[esk-init] note: could not write the install log ${logPath} (${e.message}); the install itself succeeded.`); }

console.log(`\n[esk-init] OK:always-on ${fresh ? "installed" : "reconciled"} (v${version}). Backup: ${backup || "none"}.`);
console.log(`What you should still do: open a FRESH session and ask it to quote the first line of the directive,`);
console.log(`and have it spawn a subagent and do the same. That is the only true end-to-end proof the hook fires.`);
process.exit(0);
