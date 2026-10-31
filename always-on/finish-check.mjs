#!/usr/bin/env node
// finish-check - the core of the enterprise-skills enforcement (issue #174). A Stop and SubagentStop hook that,
// before a task can END, derives the files the task changed from the transcript and holds the turn until the
// skills formula has left its proof for a file-changing task: order (the steps ran in order), build (tests moved
// with the code, every new check can fail), prove (an evidence ledger, claim-lint, recorded checker exits),
// review (a fresh-context review covering every changed file, no open HIGH/MEDIUM), encode (each caught mistake
// became a tested rule), and the per-task receipt (issue #177). A read-only task ends at once. It FAILS CLOSED:
// a crash, a missing task record for a change, or any unmet step is a BLOCK, because a Stop hook that exits any
// way but 2 lets the turn end.
//
// It is wired by the installer (issue #174 PR-B) for Stop and SubagentStop. Here is the engine and its contract;
// the esk-init registration, operator waivers, hook-file protection, the self-test, the install canary, and the
// one-line operator summary are PR-B.
//
// Input (stdin, the Claude Code Stop payload): { transcript_path | agent_transcript_path, stop_hook_active,
// session_id }. Config (set per session by the installer):
//   ESK_TASK_RECORD  the task record with the formula proofs (JSON; see always-on/finish-check-records.md)
//   ESK_RECEIPT      the per-task receipt (JSONL) checked by task-receipt.mjs
//   ESK_SKILLS_DIR   the skills dir (default .claude/skills)
//   ESK_BLOCKS       a small JSON counter file for loop safety (per task)
//   ESK_BLOCK_CAP    blocks-in-a-row before escalating instead of blocking (default 3; Claude Code caps at 8)
// When ESK_TASK_RECORD is unset the engine is not wired: it emits a NOTICE and lets the turn end, so it never
// breaks a machine that has not installed it (the install is the bootstrap step).
//
// Exit 0 = let the turn end (read-only, all steps proven, not wired, or the loop cap reached -> escalate). Exit 2
// = BLOCK with {decision:"block","reason":...} naming each missing item and its fix.
import { readFileSync, writeFileSync, existsSync, statSync, mkdirSync, openSync, readSync, closeSync } from "node:fs";
import { resolve, dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";
import { resolvePath, enforcementOn } from "./esk-paths.mjs";

const EDIT_TOOLS = new Set(["Write", "Edit", "MultiEdit", "NotebookEdit"]);
const QUESTIONS = ["boundary", "ownership", "dependency", "error-handling"]; // the four questions a review covers
const here = dirname(fileURLToPath(import.meta.url));
const TASK_RECEIPT = join(here, "..", ".claude", "skills", "judge-arch", "scripts", "task-receipt.mjs");

// A Stop hook that fails any way but exit 2 lets the turn end, so route every error to block (fail closed).
function block(reasons) {
  const reason = Array.isArray(reasons) ? reasons.join("\n") : String(reasons);
  bumpBlocks();
  process.stdout.write(JSON.stringify({ decision: "block", reason }));
  process.stderr.write(`[finish-check] BLOCK - the task cannot end:\n${reason}\n`);
  process.exit(2);
}
function allow(note) { if (note) process.stderr.write(`[finish-check] ${note}\n`); process.exit(0); }
process.on("uncaughtException", (e) => block(`finish-check crashed, failing closed: ${e && e.message}`));
process.stdin.on("error", () => block("finish-check could not read its input; failing closed."));

// --- loop safety: count blocks in a row; at the cap, escalate (end the turn with a plain message) not loop ----
// blocksPath is resolved from ESK_BLOCKS at top; when enforcement is on it is derived per session after the
// payload is parsed (the session id lives in the payload), so it is `let`, read by readBlocks/bumpBlocks at call time.
let blocksPath = process.env.ESK_BLOCKS ? resolve(process.env.ESK_BLOCKS) : null;
let SESSION = null; // the payload's session_id, used to derive per-session paths when enforcement is on
const blockCap = Number(process.env.ESK_BLOCK_CAP || "3");
function readBlocks() { if (!blocksPath) return 0; try { return Number(JSON.parse(readFileSync(blocksPath, "utf8")).count) || 0; } catch { return 0; } }
function bumpBlocks() { if (!blocksPath) return; try { mkdirSync(dirname(blocksPath), { recursive: true }); writeFileSync(blocksPath, JSON.stringify({ count: readBlocks() + 1 })); } catch { /* best effort */ } }

let raw = "";
process.stdin.on("data", (d) => (raw += d));
process.stdin.on("end", () => {
  try {
    const payload = raw.trim() ? JSON.parse(raw) : {};
    SESSION = payload.session_id;
    // The task record: an explicit ESK_TASK_RECORD wins; else, when enforcement is on (ESK_ENFORCE=1), it is
    // derived from the base store plus this session id; else null = not wired (the turn may end).
    const recordPath = resolvePath("record", "ESK_TASK_RECORD", SESSION);
    // Not wired (enforcement off AND no explicit record): the turn may end, so an un-bootstrapped machine is never
    // broken. If enforcement IS on but the path could not be resolved (a missing/unsafe session id with no explicit
    // record), that is an error, not "not wired" - handled after the read-only check so a read-only turn still ends.
    if (!recordPath && !enforcementOn()) allow("the finish-check is not wired (no task record configured); the turn may end.");
    if (!blocksPath) blocksPath = resolvePath("blocks", "ESK_BLOCKS", SESSION);

    // Derive the files the task changed from the transcript (edit-tool inputs), read up to a fixed point.
    const tpath = payload.transcript_path || payload.agent_transcript_path || null;
    const changed = tpath ? changedFilesFromTranscript(tpath) : [];

    // Read-only task: nothing changed, so no formula and no receipt. End at once (no operator-visible delay).
    if (changed.length === 0) allow("read-only task: no files changed, no receipt required.");

    // Enforcement is on but the task record path could not be resolved for a file-changing task (a missing or
    // unsafe session id, with no explicit ESK_TASK_RECORD): fail CLOSED rather than let the turn end unchecked.
    if (!recordPath) block("enforcement is on but no usable session id was provided, so the per-session task record path could not be resolved; failing closed. Set ESK_TASK_RECORD explicitly, or ensure the Stop payload carries a session_id.");

    // Loop safety: if we have already blocked up to the cap, escalate instead of blocking again. stop_hook_active
    // (Claude Code re-invoking the hook after a prior block) does not change the decision: the block counter
    // already tracks the run, so the cap alone is the trigger.
    const priorBlocks = readBlocks();
    if (priorBlocks >= blockCap) {
      const missing = evaluate(recordPath, changed);
      allow(`escalated after ${priorBlocks} block(s) in a row: the task is ending with these still missing - ${missing.length ? missing.join("; ") : "none"}. Operator: review before accepting.`);
    }

    const missing = evaluate(recordPath, changed);
    if (missing.length) block(missing);
    // Reset the block counter on a clean finish.
    if (blocksPath) { try { writeFileSync(blocksPath, JSON.stringify({ count: 0 })); } catch { /* best effort */ } }
    allow();
  } catch (e) {
    block(`finish-check failed, failing closed: ${e && e.message}`);
  }
});

// Return the list of unmet formula items (empty = the task may end). A file-changing task with no record is a
// block in itself: the agent changed files and recorded no proof.
function evaluate(recordPath, changed) {
  const abs = resolve(recordPath);
  if (!existsSync(abs) || !statSync(abs).isFile()) {
    return [`the task changed ${changed.length} file(s) but has no task record of the formula; write the record (select, load, plan, build, prove, review, encode, receipt).`];
  }
  let rec;
  try { rec = JSON.parse(readFileSync(abs, "utf8")); } catch (e) { return [`the task record is not valid JSON (${e.message}); fix it.`]; }
  if (!rec || typeof rec !== "object") return ["the task record is not an object."];
  const problems = [];
  checkOrder(rec, problems);
  checkBuild(rec, changed, problems);
  checkProve(rec, problems);
  checkReview(rec, changed, problems);
  checkEncode(rec, problems);
  checkReceipt(rec, changed, problems);
  return problems;
}

function str(v) { return typeof v === "string" && v.trim() !== ""; }
function arr(v) { return Array.isArray(v) && v.length > 0; }

// Operator waivers come from a SEPARATE operator-written file, never the agent's own task record, so the agent
// cannot waive a step by writing its own record (agent-cannot-self-waive). An entry counts only when it names the
// step, is marked by:"operator", and carries a reason. The file is ESK_WAIVERS_FILE, else the per-session
// <base>/waivers/<session_id>.json when enforcement is on. Honest limit (detection model, ADR-0101): the agent
// CAN write files, so this does not physically prevent a forged by:"operator" entry. It makes one VISIBLE instead:
// session-setup.mjs lists EVERY operator waiver in effect at the start of the next session, so a waiver added
// outside the operator process is surfaced to the operator rather than honored silently.
let WAIVERS = null;
function operatorWaivers() {
  if (WAIVERS !== null) return WAIVERS;
  WAIVERS = [];
  const wp = resolvePath("waivers", "ESK_WAIVERS_FILE", SESSION); // one derivation rule, shared with every other path
  if (wp && existsSync(wp)) {
    try { const w = JSON.parse(readFileSync(wp, "utf8")); WAIVERS = Array.isArray(w) ? w : (Array.isArray(w.waivers) ? w.waivers : []); } catch { WAIVERS = []; }
  }
  return WAIVERS;
}
function waived(step) { return operatorWaivers().some((w) => w && w.step === step && w.by === "operator" && str(w.reason)); }

// Order: the file-changing formula runs select -> load -> plan -> build -> prove -> review -> encode -> receipt,
// in order. A missing or out-of-order step is a hold (done-before-review-refused covers the review case).
function checkOrder(rec, problems) {
  const REQUIRED = ["select", "load", "plan", "build", "prove", "review", "encode", "receipt"];
  const steps = Array.isArray(rec.steps) ? rec.steps : [];
  for (const s of REQUIRED) if (!steps.includes(s) && !waived(s)) problems.push(`the ${s} step is missing (the formula runs ${REQUIRED.join(" -> ")} in order).`);
  // order: the completed steps must appear in the canonical order
  const idx = steps.map((s) => REQUIRED.indexOf(s)).filter((i) => i >= 0);
  for (let i = 1; i < idx.length; i++) if (idx[i] < idx[i - 1]) { problems.push(`the formula steps are out of order (${steps.join(", ")}).`); break; }
}

// Build: a source change moves a test with it; a new check ships a discriminating test; a coverage number is not
// itself a pass if a changed branch is uncovered.
function checkBuild(rec, changed, problems) {
  if (waived("build")) return;
  const b = rec.build || {};
  const touchedSource = changed.some((f) => /\.(ts|js|mjs|py|go|rs|java)$/.test(f) && !/\.(test|spec)\./.test(f) && !/(^|\/)(test|tests|__tests__)\//.test(f));
  const touchedTest = changed.some((f) => /\.(test|spec)\./.test(f) || /(^|\/)(test|tests|__tests__)\//.test(f));
  if (touchedSource && !touchedTest && b.testsChanged !== true) problems.push(`a source file changed but no test moved with it; add or update the test for the changed behavior.`);
  for (const c of (Array.isArray(b.newChecks) ? b.newChecks : [])) {
    if (!c || c.hasDiscriminatingTest !== true) problems.push(`the new check "${(c && c.script) || "?"}" has no committed test that fails when it is replaced by a no-op.`);
  }
  if (b.coverage && str(b.coverage.uncoveredChangedBranch)) problems.push(`coverage reached its target but the changed branch "${b.coverage.uncoveredChangedBranch}" is not exercised; a coverage number is not the target.`);
}

// Prove: an evidence ledger, claim-lint --strict exits 0, and each selected checker's command/exit/output is
// recorded.
function checkProve(rec, problems) {
  if (waived("prove")) return;
  const p = rec.prove || {};
  if (p.ledger !== true) problems.push(`the final report has no evidence ledger (skeptical-audit).`);
  if (p.claimLintExit !== 0) problems.push(`claim-lint --strict did not pass on the final report (an untagged claim blocks the finish).`);
  for (const c of (Array.isArray(p.checkers) ? p.checkers : [])) {
    if (!c || !str(c.command) || typeof c.exit !== "number" || !str(c.output_sha256)) problems.push(`a checker result is not fully recorded (needs command, exit, output_sha256).`);
  }
}

// Review: a fresh-context review that covered every changed file against every question, is logged, did not time
// out, and left no open HIGH/MEDIUM finding (unless each open one is operator-waived).
function checkReview(rec, changed, problems) {
  if (waived("review")) return;
  const r = rec.review || {};
  if (r.freshContext !== true) { problems.push(`the review step is missing or was done in the author's own context; run a fresh-context review.`); return; }
  if (r.timedOut === true) { problems.push(`the review timed out before a verdict; start a new review.`); return; }
  const matrix = r.matrix && typeof r.matrix === "object" ? r.matrix : {};
  for (const f of changed) {
    const row = matrix[f] || matrix[f.split("\\").join("/")];
    if (!row) { problems.push(`the review matrix does not cover the changed file "${f}".`); continue; }
    for (const q of QUESTIONS) if (!row[q] || !str(row[q].verdict) || !str(row[q].source)) problems.push(`the review of "${f}" has no verdict+source for "${q}".`);
  }
  if (r.logged !== true) problems.push(`the review was not appended to the review log.`);
  for (const fnd of (Array.isArray(r.findings) ? r.findings : [])) {
    const sev = String(fnd && fnd.severity || "").toLowerCase();
    if ((sev === "high" || sev === "critical" || sev === "medium") && fnd.status !== "fixed" && fnd.status !== "waived") {
      problems.push(`an open ${sev} review finding${fnd.file ? ` in ${fnd.file}` : ""} is neither fixed nor operator-waived.`);
    }
  }
}

// Encode: every caught-and-fixed mistake became a rule, or carries a recorded reason for not writing one.
function checkEncode(rec, problems) {
  if (waived("encode")) return;
  for (const f of (Array.isArray(rec.encode && rec.encode.findings) ? rec.encode.findings : [])) {
    if (f && f.fixed === true && !str(f.rule) && !str(f.reason)) problems.push(`a caught mistake was fixed but not encoded as a rule and has no recorded reason${f.description ? `: ${f.description}` : ""}.`);
  }
}

// Receipt: delegate to the per-task receipt checker (issue #177) over the task's changed files.
function checkReceipt(rec, changed, problems) {
  if (waived("receipt")) return;
  // An explicit ESK_RECEIPT wins; then the record's own receiptPath; then the derived per-session receipt (via the
  // shared resolver, ADR-0097's <base>/receipts/<session_id>.jsonl when enforcement is on).
  const receiptPath = process.env.ESK_RECEIPT || rec.receiptPath || resolvePath("receipt", "ESK_RECEIPT", SESSION);
  if (!str(receiptPath)) { problems.push(`no per-task receipt for this task; write one covering the changed files and the applied skills.`); return; }
  const skillsDir = process.env.ESK_SKILLS_DIR || ".claude/skills";
  const r = spawnSync(process.execPath, [TASK_RECEIPT, "check", "--receipt", receiptPath, "--changed-list", changed.join(","), "--skills-dir", skillsDir], { encoding: "utf8" });
  if (r.status !== 0) problems.push(`the per-task receipt check did not pass:\n${(r.stdout || "") + (r.stderr || "")}`.trim());
}

// --- transcript parsing: the files the task changed, from edit-tool calls, read up to a fixed byte point -------
// The transcript is JSONL and grows while a Stop hook reads it, so snapshot its size and read only that far.
function changedFilesFromTranscript(tpath) {
  const abs = resolve(tpath);
  // A transcript_path was provided, so the transcript must be readable. A missing, non-file, or unreadable
  // transcript is an ERROR, not an empty change set: it THROWS, the outer handler catches it, and the turn is
  // BLOCKED (fail closed). Only an empty-but-readable transcript reads as read-only. Returning [] here would
  // silently reclassify a read failure as "no files changed" and let the turn end with zero enforcement.
  let text;
  try {
    const st = statSync(abs); // throws if missing
    if (!st.isFile()) throw new Error("the transcript path is not a file");
    const size = st.size; // fixed point: ignore anything appended after this
    const fd = openSync(abs, "r");
    try { const buf = Buffer.alloc(size); readSync(fd, buf, 0, size, 0); text = buf.toString("utf8"); } finally { closeSync(fd); }
  } catch (e) {
    throw new Error(`the transcript at ${tpath} could not be read (${e && e.message}); failing closed.`);
  }
  const files = new Set();
  for (const line of text.split(/\r?\n/)) {
    if (!line.trim()) continue;
    let obj; try { obj = JSON.parse(line); } catch { continue; }
    collectEdits(obj, files);
  }
  return [...files];
}
// Walk a transcript line for any tool_use of an edit tool and record its file_path (handles nested message.content).
function collectEdits(node, files) {
  if (!node || typeof node !== "object") return;
  if (Array.isArray(node)) { for (const x of node) collectEdits(x, files); return; }
  if ((node.type === "tool_use" || node.toolUse) && EDIT_TOOLS.has(node.name || (node.toolUse && node.toolUse.name))) {
    const input = node.input || (node.toolUse && node.toolUse.input) || {};
    const fp = input.file_path || input.filePath || input.notebook_path;
    if (str(fp)) files.add(String(fp).split("\\").join("/"));
  }
  for (const k of Object.keys(node)) if (node[k] && typeof node[k] === "object") collectEdits(node[k], files);
}
