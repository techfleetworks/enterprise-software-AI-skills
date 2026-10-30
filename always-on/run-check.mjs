#!/usr/bin/env node
/**
 * run-check - resolve a skill's checker from ANY folder and run it FAIL-CLOSED (reference implementation).
 *
 * The failure this exists to stop (observed in an audit, 2026-10-26): a skill told the agent to run
 * `check_adr.sh` by a path relative to the skill folder. From a work folder somewhere else the agent ran
 * `bash check_adr.sh 2>&1 | tail -4 || ls check_adr.sh`; the file was not there, but the `| tail` exited 0 so
 * the `|| ls` never ran, the real failure was hidden, and the agent then judged the ADRs itself with a
 * stand-in count. Three bugs in one line: a checker addressed by a folder-relative path, a pipe that hid the
 * exit code, and a missing checker treated as "skip and judge myself" instead of a block.
 *
 * This front door removes all three. Every checker a skill names is run through it, never by a relative path
 * and never through a pipe:
 *   - It RESOLVES the checker to its absolute installed path by searching the real skill-discovery locations:
 *     an explicit --skills-dir / $ESK_SKILLS_DIR override PINS the search to one location, otherwise it
 *     searches the nearest project `.claude/skills` walking up from the current folder, then `~/.claude/skills`,
 *     then the repo this script ships in. Either way the current folder does not matter.
 *   - It reads the checker's exit code DIRECTLY (spawn, no shell, no pipe), so an exit code can never be
 *     masked by `| tail` or `| head`.
 *   - It FAILS CLOSED: a missing checker, a skill folder that is not installed, a checker that cannot start,
 *     and a checker that runs past its time limit are each a BLOCK (exit 2) that names the full install path
 *     and the install command, never a silent skip and never a pass. No stand-in judgment by the agent counts.
 *
 *   node run-check.mjs which <skill> <script> [--skills-dir DIR]
 *   node run-check.mjs run   <skill> <script> [--skills-dir DIR] [--timeout-ms N] [-- <args passed to the checker>]
 *
 * Exit codes (the contract a finish-check hook reads):
 *   0 = the checker ran and PASSED (exit 0). Only then is the "which" path or the pass line printed.
 *   1 = the checker ran and FAILED (its own non-zero exit). Its output is shown. "done" is blocked, but the
 *       checker spoke for itself; the agent still does not substitute its own judgment.
 *   2 = FAIL CLOSED / BLOCK: bad args, an unsafe name, the skill not installed, the checker missing, the
 *       checker unable to start, or a timeout. The message names the full path and the install command.
 *
 * Dependency-free; Node >= 20; no shell (Windows exec-form safe). Matches scripts/compare-gate-runs.mjs.
 */
import { statSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { dirname, join, resolve, isAbsolute } from "node:path";
import { fileURLToPath } from "node:url";
import { homedir } from "node:os";

const DEFAULT_TIMEOUT_MS = 120000; // 2 minutes; a checker that runs longer is reported as a timeout, not a pass.
const INSTALL_CMD = "node .claude/skills/bootstrap/scripts/esk-init.mjs --personal --yes --skills";
const INSTALL_DOC = ".claude/skills/bootstrap/SKILL.md";

function block(msg) {
  // Fail closed. One place, so "missing / cannot start / timeout / not installed" can never leak out as a pass.
  console.error(`[run-check] BLOCK - ${msg}`);
  process.exit(2);
}

// --- args --------------------------------------------------------------------
const argv = process.argv.slice(2);
// Split off any checker args after a "--" so they are never parsed as our own options.
const ddIndex = argv.indexOf("--");
const passThrough = ddIndex === -1 ? [] : argv.slice(ddIndex + 1);
const ours = ddIndex === -1 ? argv : argv.slice(0, ddIndex);

function opt(name, dflt) {
  const i = ours.indexOf(name);
  if (i === -1) return dflt;
  const v = ours[i + 1];
  if (v === undefined || v.startsWith("--")) block(`option ${name} needs a value`);
  return v;
}
const positionals = ours.filter((a, i) => {
  if (a.startsWith("--")) return false;
  const prev = ours[i - 1];
  return !(prev && prev.startsWith("--")); // drop an option's value
});
const [command, skill, script] = positionals;

const wantsHelp = ours.includes("--help") || ours.includes("-h");
if (wantsHelp || !command) {
  const usage =
    "usage:\n" +
    "  node run-check.mjs which <skill> <script> [--skills-dir DIR]\n" +
    "  node run-check.mjs run   <skill> <script> [--skills-dir DIR] [--timeout-ms N] [-- <checker args>]\n" +
    "exit: 0 pass, 1 checker failed, 2 fail-closed (bad args, unsafe name, not installed, missing, cannot start, timeout)";
  console.log(usage);
  process.exit(wantsHelp ? 0 : 2); // --help is a clean exit; no command at all is a usage error (fail closed)
}
if (command !== "which" && command !== "run") block(`unknown command "${command}"; expected "which" or "run"`);
if (!skill || !script) block(`both <skill> and <script> are required (got skill=${skill || "-"}, script=${script || "-"})`);

// --- name safety: resolution reads caller-supplied names, so reject anything that could escape a skills root
// (path separators, "..", absolute paths, drive letters) or carry shell-unsafe characters. No traversal, ever.
const SAFE = /^[A-Za-z0-9._-]+$/;
for (const [label, val] of [["skill", skill], ["script", script]]) {
  if (!SAFE.test(val) || val === "." || val === "..") {
    block(`unsafe ${label} name "${val}": only letters, digits, dot, underscore and hyphen are allowed (no path separators, no "..")`);
  }
}
const KNOWN_EXT = [".mjs", ".js", ".sh"];
if (!KNOWN_EXT.some((e) => script.endsWith(e))) {
  block(`unsupported checker "${script}": expected one of ${KNOWN_EXT.join(", ")}`);
}

// --- resolve the skills-discovery roots, in order ----------------------------
const here = dirname(fileURLToPath(import.meta.url)); // always-on/ sits at the repo root
const roots = [];
const seen = new Set();
const addRoot = (p) => {
  if (!p) return;
  const abs = resolve(p);
  if (seen.has(abs)) return;
  seen.add(abs);
  roots.push(abs);
};

// An explicit skills dir (flag beats env) PINS resolution to exactly that location - an override means "use
// this, not auto-discovery" - which also lets a caller or a test resolve against a known sandbox. With no
// override, search the real discovery locations in order.
const override = opt("--skills-dir", process.env.ESK_SKILLS_DIR);
if (override) {
  addRoot(override);
} else {
  // 1. The nearest project `.claude/skills`, walking up from the current folder to the filesystem root.
  for (let dir = process.cwd(); ; ) {
    addRoot(join(dir, ".claude", "skills"));
    const up = dirname(dir);
    if (up === dir) break;
    dir = up;
  }
  // 2. The per-machine user location.
  addRoot(join(homedir(), ".claude", "skills"));
  // 3. The repo this script ships in (always-on/ -> repo root -> .claude/skills), so an in-repo run always works.
  addRoot(join(dirname(here), ".claude", "skills"));
}

const isDir = (p) => { try { return statSync(p).isDirectory(); } catch { return false; } };
const isFile = (p) => { try { return statSync(p).isFile(); } catch { return false; } };

// Where the skill folder was found (for a precise "checker missing" message) vs not installed at all.
const skillRootsFound = roots.filter((r) => isDir(join(r, skill)));
if (skillRootsFound.length === 0) {
  block(
    `skill "${skill}" is not installed in any skills location, so its checker "${script}" cannot be loaded or run. ` +
      `Searched: ${roots.map((r) => join(r, skill)).join(", ")}. ` +
      `Install the skills to a discovery location and retry: ${INSTALL_CMD} (see ${INSTALL_DOC}). ` +
      `This is a BLOCK, not a skip: do not judge in the checker's place.`,
  );
}

// The checker path under each root where the skill exists; take the first that actually has the file.
const candidatePaths = skillRootsFound.map((r) => join(r, skill, "scripts", script));
const resolvedPath = candidatePaths.find((p) => isFile(p)); // wrapped: a TOCTOU removal blocks cleanly, never throws
if (!resolvedPath) {
  block(
    `checker "${script}" for skill "${skill}" was not found. Expected it at: ${candidatePaths.join(", ")}. ` +
      `The skill is installed but its checker is missing (a partial or stale install). Reinstall and retry: ` +
      `${INSTALL_CMD} (see ${INSTALL_DOC}). This is a BLOCK, not a skip, and no stand-in count counts as this check.`,
  );
}

// --- which: print the absolute path and stop ---------------------------------
if (command === "which") {
  console.log(resolvedPath);
  process.exit(0);
}

// --- run: execute with a timeout, read the exit code directly (no shell, no pipe) --------------------
const timeoutRaw = opt("--timeout-ms", String(DEFAULT_TIMEOUT_MS));
const timeoutMs = Number(timeoutRaw);
if (!Number.isFinite(timeoutMs) || timeoutMs <= 0) block(`--timeout-ms must be a positive number of milliseconds (got "${timeoutRaw}")`);

// Choose the interpreter by extension. Each is spawned as a real executable with an args array and NO shell,
// so nothing in the path or the pass-through args is ever interpreted by a shell.
const runner = resolvedPath.endsWith(".sh") ? "bash" : process.execPath; // .mjs/.js run on this same Node
const runnerArgs = [resolvedPath, ...passThrough];

const MAX_OUTPUT = 10 * 1024 * 1024; // 10 MB: a generous ceiling so a verbose but passing checker is not blocked.
const res = spawnSync(runner, runnerArgs, {
  timeout: timeoutMs,
  encoding: "utf8",
  shell: false,
  maxBuffer: MAX_OUTPUT,
  // Keep the checker's own view of where it runs; it resolves its own inputs.
});

// Timeout first: spawnSync reports ETIMEDOUT and kills the child. A timeout is a FAILURE, never a pass.
if (res.error && res.error.code === "ETIMEDOUT") {
  if (res.stdout) process.stderr.write(res.stdout);
  if (res.stderr) process.stderr.write(res.stderr);
  block(
    `checker ${resolvedPath} did not finish within ${timeoutMs} ms and was stopped. ` +
      `A checker that runs past its time limit is reported as a TIMEOUT, not a pass. ` +
      `Raise the limit with --timeout-ms only if the checker is genuinely slow, then rerun.`,
  );
}
// Too much output: Node aborts the spawn with ENOBUFS. The run was truncated, so we cannot trust it; fail
// closed with a cause that is not "could not start" (the checker did start).
if (res.error && res.error.code === "ENOBUFS") {
  block(
    `checker ${resolvedPath} produced more than ${MAX_OUTPUT} bytes of output and was stopped; a run that cannot ` +
      `be read in full is a BLOCK, not a pass. Make the checker quieter, or raise the limit and rerun.`,
  );
}
// Any other spawn error means the checker could not start (e.g. bash or node missing on PATH): fail closed.
if (res.error) {
  block(
    `checker ${resolvedPath} could not start: ${res.error.message}. ` +
      (runner === "bash"
        ? "This checker needs bash; install Git for Windows or set CLAUDE_CODE_GIT_BASH_PATH, then retry. "
        : "") +
      `A checker that cannot start is a BLOCK, not a skip.`,
  );
}

// The checker ran. Forward everything it said, then translate its exit code directly (read, never piped).
if (res.stdout) process.stdout.write(res.stdout);
if (res.stderr) process.stderr.write(res.stderr);

if (res.status === 0) {
  const out = `[run-check] OK - ${skill}/${script} passed (${resolvedPath}).`;
  const hash = createHash("sha256").update(`${resolvedPath}\n${res.stdout || ""}`).digest("hex").slice(0, 12);
  console.log(out);
  console.log(`[run-check] evidence: checker-output-sha256=${hash}`);
  process.exit(0);
}

// Killed by a signal we did not set (our own timeout is handled above): an unexplained kill, so fail closed
// rather than read it as a failure the checker chose to report.
if (res.status === null) {
  block(
    `checker ${resolvedPath} was killed by signal ${res.signal} before it exited; an unexplained kill is a ` +
      `BLOCK, not a pass.`,
  );
}

// A non-zero exit: the checker itself failed. Surface it as exit 1 (distinct from a fail-closed block). It is
// still a real failure the agent must not paper over, but the checker spoke for itself.
console.error(
  `[run-check] FAIL - ${skill}/${script} exited ${res.status} (${resolvedPath}). ` +
    `The checker reported a problem above; fix it, do not work around it.`,
);
process.exit(1);
