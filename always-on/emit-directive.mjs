#!/usr/bin/env node
/**
 * emit-directive.mjs: print the always-on enterprise-skills directive for a Claude Code hook.
 *
 * Why this exists: the earlier hook ran `node -e '...'` through `"shell": "bash"` and read the
 * directive from `$HOME/.claude/...`. On a machine where bash is missing or broken (for example a
 * Windows box with a damaged msys install), that hook fails, and because a failed SessionStart hook
 * produces no output, the directive is silently NOT injected and enforcement turns off with no sign.
 * This script removes that failure mode. It is meant to be run in a hook's EXEC form (no shell):
 *     "command": "node", "args": ["<dir>/emit-directive.mjs", "SessionStart"]
 * so it never depends on bash. It resolves the directive as its own sibling file (no `$HOME`, no env
 * expansion), and if the directive is missing it writes a loud WARNING to stderr AND still emits a
 * fallback NOTICE in the injected context, so a broken install is visible to the agent, never a silent
 * no-op. It always exits 0 so it can never block a session.
 *
 *   node emit-directive.mjs SessionStart  [directive-path]   # SessionStart hook
 *   node emit-directive.mjs SubagentStart [directive-path]   # SubagentStart hook
 *
 * Both events emit the SAME JSON shape (one code path; SubagentStart ignores plain stdout, and JSON
 * avoids the "stdout must not start with {" trap for SessionStart):
 *     {"hookSpecificOutput":{"hookEventName":"<event>","additionalContext":"<directive>"}}
 *
 * The directive path defaults to `enterprise-skills-always-on.md` next to this script; override it
 * with argv[3] or the ESK_DIRECTIVE env var (for a non-sibling layout or a test; the installer relies
 * on the sibling default and does not pass a path).
 */
import { readFileSync, writeFileSync, existsSync, unlinkSync, mkdirSync, readdirSync } from "node:fs";
import { dirname, resolve, join } from "node:path";
import { fileURLToPath } from "node:url";
import { homedir } from "node:os";
import { decideNudge } from "./sync-nudge.mjs";
import { decideEnforcementNudge, rulesetRequires } from "./enforcement-nudge.mjs";

const MAX = 10000; // Claude Code caps hook additionalContext at 10,000 characters.
const arg = (process.argv[2] || "").toLowerCase();
const event = arg.includes("subagent") ? "SubagentStart" : "SessionStart";
const here = dirname(fileURLToPath(import.meta.url));
const directivePath = process.argv[3] || process.env.ESK_DIRECTIVE || resolve(here, "enterprise-skills-always-on.md");

// Strip ANSI CSI/OSC sequences and other control characters so no escape codes leak into the transcript.
const clean = (s) =>
  s.replace(/\u001B\[[0-9;?]*[ -/]*[@-~]/g, "")
   .replace(/\u001B\][\s\S]*?(?:\u0007|\u001B\\)/g, "")
   .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, "");

let text;
let missing = false;
try {
  text = readFileSync(directivePath, "utf8");
} catch {
  missing = true;
  text =
    "NOTICE: the enterprise always-on skills directive is MISSING, so enforcement is OFF for this " +
    "session. Re-install it per always-on/README.md before relying on the enterprise skills.";
}

text = clean(text);

// Auto-sync nudge (ADR-0054): on a SESSION start only (never spam every subagent), if the install is behind
// the repo, prepend a loud encourage-to-sync message so the agent relays it and offers to sync. The decision
// and the persistent counter live in sync-nudge.mjs; here we only do the file I/O, and the whole thing is
// best-effort: any failure means no nudge, never a broken directive. Prepended (not appended) so it survives
// the MAX-length truncation below, which cuts the end.
function readJson(p) { try { return JSON.parse(readFileSync(p, "utf8")); } catch { return null; } }
function sessionNudge() {
  const repoRoot = dirname(here); // always-on/ sits at the repo root, so its parent is the repo root
  const pkg = readJson(join(repoRoot, "package.json"));
  const currentVersion = pkg && typeof pkg.version === "string" ? pkg.version : null;
  if (!currentVersion) return null;
  // Find the install marker that points at THIS repo: prefer one whose .repo matches, else the user-level one.
  const candidates = [join(homedir(), ".claude", ".esk-installed"), join(repoRoot, ".claude", ".esk-installed")];
  let installedVersion = null;
  for (const c of candidates) {
    const m = readJson(c);
    if (!m || typeof m.version !== "string") continue;
    if (m.repo === repoRoot) { installedVersion = m.version; break; } // the install for THIS repo: authoritative
    // Fallback ONLY to a legacy marker that names no repo; never trust a marker that names a DIFFERENT repo
    // (a global install for repo A must not drive a behind/in-sync verdict for an unrelated clone B).
    if (installedVersion == null && m.repo == null) installedVersion = m.version;
  }
  if (installedVersion == null) return null; // not installed via the installer: say nothing
  const statePath = join(homedir(), ".claude", ".esk-nudge.json");
  const state = readJson(statePath);
  const { text: nudge, nextState } = decideNudge({ currentVersion, installedVersion, state });
  // Persist the counter (best-effort). null nextState means in-sync: clear the file so a later drift restarts.
  // mkdir first so the counter can advance (and the cap be reached) even on a repo-only install with no ~/.claude.
  try {
    if (nextState) { mkdirSync(dirname(statePath), { recursive: true }); writeFileSync(statePath, JSON.stringify(nextState) + "\n"); }
    else if (existsSync(statePath)) unlinkSync(statePath);
  } catch { /* cannot persist the counter; still show the nudge this session */ }
  return nudge;
}
// Enforcement nudge (ADR-0066): on a SESSION start, if this is a consumer whose travelling gates RUN but are
// not yet REQUIRED by branch protection, prepend a loud nudge to turn enforcement on. Signals are local files
// (the enterprise-gates workflow, the committed ruleset(s), the applied-marker); the decision and the counter
// live in enforcement-nudge.mjs. Best-effort: any failure means no nudge, never a broken directive.
function enforcementNudge() {
  const repoRoot = dirname(here); // always-on/ sits at the repo root, so its parent is the repo root
  // Installed-as-consumer signal: the genesis-scaffolded workflow is present. The origin repo does not have it.
  const installed = existsSync(join(repoRoot, ".github", "workflows", "enterprise-gates.yml"));
  if (!installed) return null;
  const manifest = readJson(join(repoRoot, "gate-manifest.json"));
  const requiredCheck = manifest && manifest.aggregator && typeof manifest.aggregator.requiredCheck === "string"
    ? manifest.aggregator.requiredCheck : "enterprise-gates";
  // Does any committed ruleset require the check?
  const rulesetsDir = join(repoRoot, ".github", "rulesets");
  const rulesets = [];
  try {
    for (const name of readdirSync(rulesetsDir)) {
      if (!name.endsWith(".json")) continue;
      const obj = readJson(join(rulesetsDir, name));
      if (obj) rulesets.push(obj);
    }
  } catch { /* no rulesets dir: treated as "not required" */ }
  const rulesetRequiresCheck = rulesetRequires(rulesets, requiredCheck);
  const applied = existsSync(join(repoRoot, ".github", ".esk-enforcement-applied"));
  const statePath = join(repoRoot, ".claude", ".esk-enforcement-nudge.json");
  const state = readJson(statePath);
  const { text: nudge, nextState } = decideEnforcementNudge({ installed, rulesetRequiresCheck, applied, requiredCheck, state });
  try {
    if (nextState) { mkdirSync(dirname(statePath), { recursive: true }); writeFileSync(statePath, JSON.stringify(nextState) + "\n"); }
    else if (existsSync(statePath)) unlinkSync(statePath);
  } catch { /* cannot persist the counter; still show the nudge this session */ }
  return nudge;
}

// ESK_NUDGE_DISABLE lets a test (or a user) turn the nudges off entirely, so a suite that asserts the exact
// directive text is not coupled to the ambient install marker (repo-local OR user-level) and its version.
if (event === "SessionStart" && !missing && !process.env.ESK_NUDGE_DISABLE) {
  try {
    const nudge = sessionNudge();
    if (nudge) text = nudge + "\n\n---\n\n" + text;
  } catch { /* never let the nudge break the directive */ }
  // Prepended AFTER the sync nudge, so the enforcement nudge appears FIRST: a security gap outranks a version
  // gap, and being first means it survives the MAX-length truncation that trims the end.
  try {
    const enudge = enforcementNudge();
    if (enudge) text = enudge + "\n\n---\n\n" + text;
  } catch { /* never let the nudge break the directive */ }
}

if (missing) {
  process.stderr.write(
    `[enterprise-skills] WARNING: the always-on directive was not found at ${directivePath}. ` +
    `The enterprise skills are NOT being enforced in this session. Re-install the always-on hook ` +
    `(see always-on/README.md) so the directive file sits next to this script.\n`,
  );
}
if (text.length > MAX) {
  // Claude never sees a hook's stderr when it exits 0, so a stderr-only warning is invisible to the agent.
  // Prepend a short in-context NOTICE (sized so the notice plus the clipped directive stay within MAX) and
  // keep the stderr line for human logs.
  const truncNotice =
    `NOTICE: the enterprise always-on directive was TRUNCATED to fit the ${MAX}-character hook limit, ` +
    `so some skills or rules below may be cut off. Shorten the directive, then re-check. ---\n`;
  process.stderr.write(
    `[enterprise-skills] WARNING: the directive is ${text.length} characters, over the ${MAX}-character ` +
    `hook limit; keep it short so it is not truncated. Emitting a truncation NOTICE plus the first ` +
    `${MAX - truncNotice.length} characters.\n`,
  );
  text = truncNotice + text.slice(0, MAX - truncNotice.length);
}

process.stdout.write(JSON.stringify({ hookSpecificOutput: { hookEventName: event, additionalContext: text } }));
process.exit(0);
