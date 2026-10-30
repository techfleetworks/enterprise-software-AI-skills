#!/usr/bin/env node
// edit-gate - a PreToolUse hook that holds a source edit until the task's skill SELECT and LOAD steps are done
// (issue #175, steps 1 and 2 of the formula; step 3 plan is added by PR-B).
//
// Why: today a skill is read only if the agent decides to, and after a compaction only skills used earlier come
// back. This hook runs on the file-writing tools and, before the edit runs, requires a selection record for the
// task (every skill has a verdict, router-required skills cannot be self-waived) and requires every
// required/applies skill's text to have been loaded this session. If not, it DENIES the edit (exit 2, the
// documented PreToolUse block) with what to do, so the agent writes the selection / loads the skill and retries.
//
// Wire it as a PreToolUse hook on Write|Edit|MultiEdit|NotebookEdit (exec form: node edit-gate.mjs). Bash
// commands that write files are best-effort: match Bash too and this hook denies when a selection is missing,
// but it cannot parse every shell redirection, so the Stop finish-check (issue #174) remains the backstop.
//
// Config (set per session by the installer; the hook can only enforce what it is told):
//   ESK_SELECTION   path to the task's selection record (JSON: skill -> {verdict, reason})
//   ESK_LOADED      path to the load-state (JSON: skill -> sha256 delivered this session)
//   ESK_SKILLS_DIR  the skills dir (default .claude/skills)
//   ESK_WAIVERS     comma-separated skills the operator waived
// When ESK_SELECTION is unset the machine has not wired the gate, so the hook emits a NOTICE and allows rather
// than break unrelated work; where it IS set, a missing selection is a deny. It FAILS CLOSED (deny) on its own
// errors, because a PreToolUse hook that crashes otherwise fails open.
import { readFileSync, existsSync } from "node:fs";
import { resolve, dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";

const EDIT_TOOLS = new Set(["Write", "Edit", "MultiEdit", "NotebookEdit"]);
const here = dirname(fileURLToPath(import.meta.url));
const CHECK = join(here, "check-task-plan.mjs");

// Deny a tool call: stderr is the reason Claude sees, exit 2 is the documented PreToolUse block. (A hook that
// fails any other way fails OPEN, so every error path below routes here.)
function deny(reason) {
  process.stderr.write(`[edit-gate] ${reason}\n`);
  process.exit(2);
}
function allow(note) {
  if (note) process.stderr.write(`[edit-gate] ${note}\n`);
  process.exit(0);
}

let raw = "";
process.stdin.on("data", (d) => (raw += d));
process.stdin.on("end", () => {
  let payload;
  try { payload = JSON.parse(raw || "{}"); } catch { deny("could not parse the PreToolUse payload; failing closed."); }
  const tool = payload.tool_name || payload.toolName || "";
  const input = payload.tool_input || payload.toolInput || {};
  const isEdit = EDIT_TOOLS.has(tool);
  const isBash = tool === "Bash";
  if (!isEdit && !isBash) allow(); // not a file-writing tool; nothing to gate

  // The file this edit targets (edit tools carry it; Bash does not reliably).
  const targetPath = input.file_path || input.filePath || input.notebook_path || null;

  const selectionPath = process.env.ESK_SELECTION;
  const skillsDir = process.env.ESK_SKILLS_DIR || ".claude/skills";

  // Not wired on this machine: do not break unrelated work. The finish-check (issue #174) still backs this up.
  if (!selectionPath) allow("the edit-gate is not wired (ESK_SELECTION unset); skipping the select/load check.");

  // Let the agent create or update the selection record and the load-state themselves (chicken-and-egg).
  const exempt = [selectionPath, process.env.ESK_LOADED].filter(Boolean).map((p) => resolve(p));
  if (targetPath && exempt.includes(resolve(targetPath))) allow();

  // Step 1 must exist: the selection record. Missing file = the agent has not written the selection yet.
  if (!existsSync(resolve(selectionPath))) {
    deny("write the skill selection for this task first (every skill marked required / applies / not-applicable with a reason). The edit is held until it exists.");
  }

  const changed = targetPath ? ["--changed-list", targetPath.split("\\").join("/")] : [];
  const waivers = process.env.ESK_WAIVERS ? ["--waivers", process.env.ESK_WAIVERS] : [];

  // Step 1: validate the selection (completeness, reasons, no self-waive of a router-required skill).
  const sel = spawnSync(process.execPath, [CHECK, "selection", "--selection", selectionPath, "--skills-dir", skillsDir, ...changed, ...waivers], { encoding: "utf8" });
  if (sel.status !== 0) deny(`selection step not satisfied:\n${(sel.stdout || "") + (sel.stderr || "")}`.trim());

  // Step 2: every required/applies skill's text must have been loaded this session.
  if (process.env.ESK_LOADED) {
    const load = spawnSync(process.execPath, [CHECK, "loaded", "--selection", selectionPath, "--loaded", process.env.ESK_LOADED, "--skills-dir", skillsDir], { encoding: "utf8" });
    if (load.status !== 0) deny(`load step not satisfied (load the skill, then retry the edit):\n${(load.stdout || "") + (load.stderr || "")}`.trim());
  }

  allow();
});
