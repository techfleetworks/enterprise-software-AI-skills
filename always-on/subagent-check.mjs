#!/usr/bin/env node
// subagent-check - a SubagentStop hook that holds a subagent's HAND-BACK until its part of the work is proven
// (issue #176). Delivery of the directive to subagents was already confirmed; USE was not: in the audited session,
// on two of three days only 8 of 68 subagents loaded any skill, and no subagent wrote a receipt, while subagents
// made 584 edits. This refuses a hand-back when a subagent:
//   - changed files but has no receipt covering them, or
//   - was told in its brief to apply a skill it never loaded or read, or
//   - (a read-only reviewer) hands back findings that do not carry evidence (claim-lint).
// It also appends the subagent's result to a per-session ledger so the PARENT's finish-check can catch what this
// check missed (a subagent cut off before it could fix a refusal still leaves its uncovered files flagged).
//
// It reads agent_transcript_path (the subagent's own transcript). It FAILS CLOSED: a SubagentStop hook that exits
// any way but 2 lets the hand-back through, so a crash, an unreadable transcript, or any unmet item is a BLOCK.
// When enforcement is not wired (no ESK_ENFORCE and no explicit record) it is a no-op, so it never breaks a machine
// that has not installed it. Config mirrors finish-check (ESK_ENFORCE/ESK_HOME, ESK_RECEIPT, ESK_SKILLS_DIR).
import { existsSync, mkdirSync, appendFileSync, writeFileSync, rmSync, readdirSync } from "node:fs";
import { resolve, dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";
import { tmpdir } from "node:os";
import { resolvePath, enforcementOn } from "./esk-paths.mjs";
import { changedFilesFromTranscript, skillsReadInTranscript, firstUserText, lastAssistantText } from "./transcript-files.mjs";

const here = dirname(fileURLToPath(import.meta.url));
const TASK_RECEIPT = join(here, "..", ".claude", "skills", "judge-arch", "scripts", "task-receipt.mjs");
const CLAIM_LINT = join(here, "..", ".claude", "skills", "skeptical-audit", "scripts", "claim-lint.mjs");
const str = (v) => typeof v === "string" && v.trim() !== "";
// Brief shorthands the audit saw ("ADR ...", "apply ... quality-gate ...") mapped to the real skill folder name.
const ALIASES = { adr: "architectural-decision-records", bdd: "bdd-comprehensive-testing", owasp: "owasp-secure-coding-bdd", "quality-gate": "verifiable-quality-gates", "quality-gates": "verifiable-quality-gates" };
const escapeRe = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
// The skills the brief NAMED. Scoped to the "## Skills (load and apply ...)" block when the template's header is
// present (so the SubagentStart directive's own list of every skill, if it lands in the first turn, is not read as
// "the brief named all of them" - a false over-block), else the whole brief. Folder names and aliases match on word
// boundaries, so a short name does not match incidental prose.
function namedInBrief(brief, installed) {
  const m = brief.match(/^#{1,6}[ \t]*skills\b.*$/im);
  let scope = brief;
  if (m) { const rest = brief.slice(brief.indexOf(m[0]) + m[0].length); const nxt = rest.search(/^#{1,6}[ \t]/m); scope = nxt >= 0 ? rest.slice(0, nxt) : rest; }
  const named = new Set();
  for (const name of installed) if (new RegExp(`\\b${escapeRe(name)}\\b`, "i").test(scope)) named.add(name);
  for (const [alias, real] of Object.entries(ALIASES)) if (new RegExp(`\\b${escapeRe(alias)}\\b`, "i").test(scope)) named.add(real);
  return named;
}

let SESSION = null, AGENT = "subagent", CHANGED = [], RECEIPT_OK = false;

function writeLedger() {
  // Record this hand-back for the parent backstop, whether we allow or block, so an uncovered subagent is visible
  // even if it is cut off right after. Append-only JSONL (concurrency-safe for parallel subagents).
  const lp = resolvePath("subagents", "ESK_SUBAGENTS_FILE", SESSION);
  if (!lp) return;
  try { mkdirSync(dirname(lp), { recursive: true }); appendFileSync(lp, JSON.stringify({ agent: AGENT, changed_files: CHANGED, receipt_ok: RECEIPT_OK, ts: new Date().toISOString() }) + "\n"); } catch { /* best effort */ }
}
function block(reasons) {
  const reason = Array.isArray(reasons) ? reasons.join("\n") : String(reasons);
  writeLedger();
  process.stdout.write(JSON.stringify({ decision: "block", reason }));
  process.stderr.write(`[subagent-check] BLOCK - the hand-back is refused:\n${reason}\n`);
  process.exit(2);
}
function allow(note) { writeLedger(); if (note) process.stderr.write(`[subagent-check] ${note}\n`); process.exit(0); }
process.on("uncaughtException", (e) => block(`subagent-check crashed, failing closed: ${e && e.message}`));
process.stdin.on("error", () => block("subagent-check could not read its input; failing closed."));

let raw = "";
process.stdin.on("data", (d) => (raw += d));
process.stdin.on("end", () => {
  try {
    const payload = raw.trim() ? JSON.parse(raw) : {};
    SESSION = payload.session_id;
    AGENT = payload.agent_name || payload.subagent_type || payload.agent || payload.agentType || "subagent";
    const recordPath = resolvePath("record", "ESK_TASK_RECORD", SESSION);
    if (!recordPath && !enforcementOn()) allow("subagent-check is not wired (no enforcement); the hand-back may proceed.");

    const tpath = payload.agent_transcript_path || payload.transcript_path || null;
    if (!tpath) allow("no subagent transcript was provided; nothing to check (the parent finish-check backstops).");

    CHANGED = changedFilesFromTranscript(tpath); // throws on a read error -> block (fail closed)
    const skillsDir = process.env.ESK_SKILLS_DIR || ".claude/skills";
    const read = skillsReadInTranscript(tpath);
    const brief = firstUserText(tpath);
    const installed = existsSync(skillsDir) ? readdirSync(skillsDir, { withFileTypes: true }).filter((e) => e.isDirectory() && existsSync(join(skillsDir, e.name, "SKILL.md"))).map((e) => e.name) : [];
    const named = namedInBrief(brief, installed);

    const problems = [];
    // 1. A skill the brief named but the subagent never loaded or read.
    const unread = [...named].filter((n) => !read.has(n));
    if (unread.length) problems.push(`the brief named skill(s) you never loaded or read: ${unread.join(", ")}. Load each with the Skill tool and quote the heading you applied, then hand back.`);

    if (CHANGED.length > 0) {
      // 2. Changed files need a receipt that covers them.
      const receiptPath = process.env.ESK_RECEIPT || resolvePath("receipt", "ESK_RECEIPT", SESSION);
      if (!str(receiptPath)) { problems.push(`you changed ${CHANGED.length} file(s) but have no receipt; write one covering ${CHANGED.slice(0, 5).join(", ")} and the skills you applied.`); }
      else {
        const r = spawnSync(process.execPath, [TASK_RECEIPT, "check", "--receipt", receiptPath, "--changed-list", CHANGED.join(","), "--skills-dir", skillsDir], { encoding: "utf8" });
        RECEIPT_OK = r.status === 0;
        if (!RECEIPT_OK) problems.push(`the receipt does not cover your changed files:\n${(r.stdout || "") + (r.stderr || "")}`.trim());
      }
    } else {
      // 3. A read-only reviewer: no code receipt, but its findings must carry evidence (claim-lint on the report).
      RECEIPT_OK = true; // nothing changed, so nothing to receipt
      const report = lastAssistantText(tpath);
      if (str(report)) {
        const tmp = join(tmpdir(), `esk-handback-${process.pid}.md`);
        try {
          writeFileSync(tmp, report);
          const r = spawnSync(process.execPath, [CLAIM_LINT, tmp, "--strict"], { encoding: "utf8" });
          if (r.status !== 0) problems.push(`your findings do not carry evidence (claim-lint --strict failed): each finding needs an evidence state, a re-runnable source, and a named limit.\n${(r.stdout || "").trim()}`);
        } finally { try { rmSync(tmp, { force: true }); } catch { /* ignore */ } }
      }
    }

    if (problems.length) block(problems);
    allow();
  } catch (e) {
    block(`subagent-check failed, failing closed: ${e && e.message}`);
  }
});
