// transcript-files - read a Claude Code transcript (JSONL) and answer three questions about it, in ONE place so
// the finish-check (main Stop) and the subagent-check (SubagentStop) never grow two copies of this logic
// (issue #176). The transcript grows while a hook reads it, so every read snapshots the size and reads only that
// far. A transcript named in a payload that cannot be read is an ERROR (throws) - the caller fails closed - never
// an empty result, so a read failure is never mistaken for "nothing happened".
import { readFileSync, existsSync, statSync, openSync, readSync, closeSync } from "node:fs";
import { resolve } from "node:path";

const EDIT_TOOLS = new Set(["Write", "Edit", "MultiEdit", "NotebookEdit"]);
const str = (v) => typeof v === "string" && v.trim() !== "";
const fwd = (p) => String(p).split("\\").join("/");

// Read a transcript to a fixed point (the size at open), or THROW if it cannot be read. Shared by every reader.
export function readTranscript(tpath) {
  const abs = resolve(tpath);
  try {
    const st = statSync(abs); // throws if missing
    if (!st.isFile()) throw new Error("the transcript path is not a file");
    const size = st.size; // fixed point: ignore anything appended after this
    const fd = openSync(abs, "r");
    try { const buf = Buffer.alloc(size); readSync(fd, buf, 0, size, 0); return buf.toString("utf8"); } finally { closeSync(fd); }
  } catch (e) {
    throw new Error(`the transcript at ${tpath} could not be read (${e && e.message}); failing closed.`);
  }
}
function* lines(text) { for (const line of text.split(/\r?\n/)) { if (line.trim()) { try { yield JSON.parse(line); } catch { /* skip */ } } } }

// The files the task changed, from edit-tool tool_use calls (handles nested message.content and both key spellings).
export function changedFilesFromTranscript(tpath) {
  const files = new Set();
  const walk = (node) => {
    if (!node || typeof node !== "object") return;
    if (Array.isArray(node)) { for (const x of node) walk(x); return; }
    const name = node.name || (node.toolUse && node.toolUse.name);
    if ((node.type === "tool_use" || node.toolUse) && EDIT_TOOLS.has(name)) {
      const input = node.input || (node.toolUse && node.toolUse.input) || {};
      const fp = input.file_path || input.filePath || input.notebook_path;
      if (str(fp)) files.add(fwd(fp));
    }
    for (const k of Object.keys(node)) if (node[k] && typeof node[k] === "object") walk(node[k]);
  };
  for (const obj of lines(readTranscript(tpath))) walk(obj);
  return [...files];
}

// The skills a transcript LOADED OR READ (issue #176's definition): a Skill tool_use (its skill/command name), or
// any tool input that names a file under skills/<name>/. Skill text merely pasted into a brief does NOT count.
export function skillsReadInTranscript(tpath) {
  const names = new Set();
  const underSkills = /(?:^|\/)skills\/([A-Za-z0-9._-]+)\//;
  const walk = (node) => {
    if (!node || typeof node !== "object") return;
    if (Array.isArray(node)) { for (const x of node) walk(x); return; }
    const name = node.name || (node.toolUse && node.toolUse.name);
    const input = node.input || (node.toolUse && node.toolUse.input) || {};
    if ((node.type === "tool_use" || node.toolUse) && name === "Skill") {
      const s = input.skill || input.command || input.name;
      if (str(s)) names.add(String(s).replace(/^.*:/, "")); // strip a plugin: prefix
    }
    // a file read/grep whose path sits under skills/<name>/ counts as reading that skill
    for (const v of Object.values(input)) if (str(v)) { const m = fwd(v).match(underSkills); if (m) names.add(m[1]); }
    for (const k of Object.keys(node)) if (node[k] && typeof node[k] === "object") walk(node[k]);
  };
  for (const obj of lines(readTranscript(tpath))) walk(obj);
  return names;
}

// The hand-back: the text of the LAST assistant turn (the subagent's final report). Used to check that a read-only
// reviewer's findings carry evidence (claim-lint). Returns "" if none found.
export function lastAssistantText(tpath) {
  let last = "";
  for (const obj of lines(readTranscript(tpath))) {
    const role = obj.role || (obj.message && obj.message.role) || obj.type;
    if (role !== "assistant") continue;
    const content = (obj.message && obj.message.content) !== undefined ? obj.message.content : obj.content;
    if (typeof content === "string") { last = content; continue; }
    if (Array.isArray(content)) { const t = content.map((c) => (typeof c === "string" ? c : (c && typeof c.text === "string" ? c.text : ""))).join("\n").trim(); if (t) last = t; }
  }
  return last;
}

// The brief: the text of the FIRST user turn in the transcript (what the parent told the subagent). Used to find
// skills the brief NAMED, so "named but never read" can be refused. Returns "" if none found.
export function firstUserText(tpath) {
  for (const obj of lines(readTranscript(tpath))) {
    const role = obj.role || (obj.message && obj.message.role) || obj.type;
    if (role !== "user" && role !== "human") continue;
    const content = (obj.message && obj.message.content) !== undefined ? obj.message.content : obj.content;
    if (typeof content === "string") return content;
    if (Array.isArray(content)) return content.map((c) => (typeof c === "string" ? c : (c && typeof c.text === "string" ? c.text : ""))).join("\n");
  }
  return "";
}
