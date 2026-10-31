#!/usr/bin/env node
// edit-gate - a PreToolUse hook that holds a source edit until the task's skill SELECT, LOAD, and PLAN steps are
// done (issue #175, steps 1, 2, and 3 of the formula).
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
//   ESK_PLANS       path to the planning records (JSON: record-type -> record); step 3
// When ESK_SELECTION is unset the machine has not wired the gate, so the hook emits a NOTICE and allows rather
// than break unrelated work; where it IS set, a missing selection is a deny. It FAILS CLOSED (deny) on its own
// errors, because a PreToolUse hook that crashes otherwise fails open.
import { readFileSync, existsSync, appendFileSync, mkdirSync } from "node:fs";
import { resolve, dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";
import { resolvePath, enforcementOn } from "./esk-paths.mjs";

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

// A PreToolUse hook that fails any way other than exit 2 fails OPEN (the edit proceeds), so route EVERY error to
// deny. deny()/allow() call process.exit synchronously, so they bypass the try/catch below; only an unexpected
// throw lands in it.
process.on("uncaughtException", () => deny("edit-gate crashed; failing closed."));
process.stdin.on("error", () => deny("edit-gate could not read its input; failing closed."));

let raw = "";
process.stdin.on("data", (d) => (raw += d));
process.stdin.on("end", () => {
  try {
    let payload;
    try { payload = JSON.parse(raw || "{}"); } catch { deny("could not parse the PreToolUse payload; failing closed."); }
    const tool = payload.tool_name || payload.toolName || "";
    const input = payload.tool_input || payload.toolInput || {};
    // Only the file-editing tools are gated here. Bash is NOT matched (gating it would deny read-only commands
    // before a selection can be written); files written through Bash are backstopped by the #174 finish-check.
    if (!EDIT_TOOLS.has(tool)) allow();

    const targetPath = input.file_path || input.filePath || input.notebook_path || null;
    // An explicit ESK_SELECTION/ESK_LOADED/ESK_PLANS wins; else, when enforcement is on (ESK_ENFORCE=1), each is
    // derived from the base store plus this session id (the activation layer, ADR-0101); else null = not wired.
    const sessionId = payload.session_id;
    const selectionPath = resolvePath("selection", "ESK_SELECTION", sessionId);
    const loadedPath = resolvePath("loaded", "ESK_LOADED", sessionId);
    const plansPath = resolvePath("plans", "ESK_PLANS", sessionId);
    const skillsDir = process.env.ESK_SKILLS_DIR || ".claude/skills";

    // Not wired (enforcement off AND no explicit selection): do not break unrelated work; the finish-check still
    // backs this up. But if enforcement IS on and the path could not be resolved (a missing/unsafe session id with
    // no explicit ESK_SELECTION), fail CLOSED (deny) rather than let an unchecked edit through.
    if (!selectionPath) {
      if (enforcementOn()) deny("enforcement is on but no usable session id was provided, so the selection record path could not be resolved; failing closed. Set ESK_SELECTION explicitly, or ensure the payload carries a session_id.");
      allow("the edit-gate is not wired (no selection record configured); skipping the select/load check.");
    }

    // Let the agent create or update the selection record and the load-state themselves (chicken-and-egg).
    const exempt = [selectionPath, loadedPath].filter(Boolean).map((p) => resolve(p));
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

    const notes = [];
    // Step 2: every required/applies skill's text must have been loaded this session (when the load-state is wired).
    if (loadedPath) {
      const load = spawnSync(process.execPath, [CHECK, "loaded", "--selection", selectionPath, "--loaded", loadedPath, "--skills-dir", skillsDir], { encoding: "utf8" });
      if (load.status !== 0) deny(`load step not satisfied (load the skill, then retry the edit):\n${(load.stdout || "") + (load.stderr || "")}`.trim());
    } else {
      notes.push("the load-state is not wired");
    }
    // Step 3: the planning records for the selected skills must exist and be complete (when plans are wired).
    if (plansPath) {
      const plan = spawnSync(process.execPath, [CHECK, "plan", "--selection", selectionPath, "--plans", plansPath, "--skills-dir", skillsDir], { encoding: "utf8" });
      if (plan.status !== 0) deny(`plan step not satisfied (write the missing planning records, then retry):\n${(plan.stdout || "") + (plan.stderr || "")}`.trim());
    } else {
      notes.push("the plan check is not wired");
    }
    // Edit-time subagent ledger (issue #176): when THIS edit runs inside a subagent (the payload carries an agent
    // id), record the file to the subagent ledger now, marked unreceipted. The subagent-check reconciles it at
    // hand-back; but if the subagent is cut off (a usage limit, a crash) before its hand-back check runs, this
    // edit-time entry is what lets the PARENT's finish-check still catch the uncovered file. A main-session edit
    // (no agent id) is NOT recorded here - the main task record already covers it.
    const agent = payload.agent_name || payload.subagent_type || payload.agent || payload.agentType || null;
    const ledgerPath = agent && targetPath ? resolvePath("subagents", "ESK_SUBAGENTS_FILE", sessionId) : null;
    if (ledgerPath) { try { mkdirSync(dirname(ledgerPath), { recursive: true }); appendFileSync(ledgerPath, JSON.stringify({ agent, changed_files: [targetPath.split("\\").join("/")], receipt_ok: false, source: "edit-gate" }) + "\n"); } catch { /* best effort */ } }
    allow(notes.length ? `edit allowed; ${notes.join("; ")}.` : undefined);
  } catch (e) {
    deny(`edit-gate failed (${e && e.message}); failing closed.`);
  }
});
