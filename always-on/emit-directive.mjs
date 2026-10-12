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
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

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
