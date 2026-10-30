#!/usr/bin/env node
// task-receipt - per-task skill-application receipts for work done OUTSIDE a repo (issue #177).
//
// The repo's receipt (check-skill-receipt.mjs) is one entry per pull request. Work done in a folder that is not
// a git repo never has a PR, so it never gets a checked receipt. In the audited session one receipt from the day
// before was copied unchanged into every build, and the receipts that were written could not be checked. This
// tool gives each TASK its own grounded receipt, stored outside the work folder and tied to the hashes of the
// files the task changed, so a stale, copied, or empty receipt is refused.
//
//   node task-receipt.mjs write  --session <id> --entry <file.json|-> [--store <dir>]
//   node task-receipt.mjs check  --receipt <file.jsonl> [--task <id>] --changed-list <csv>
//                                [--selection <csv>] --skills-dir <dir>
//   node task-receipt.mjs export --receipt <file.jsonl> [--task <id>] --change <name> [--author <who>]
//
// Store: one append-only JSONL file per session at <store>/<session_id>.jsonl (default store
// ~/.claude/esk/receipts), so two sessions in the same folder never overwrite each other.
//
// check exits: 0 = accepted (grounded, every changed file covered with a current hash, selection satisfied);
//   2 = REFUSED / fail closed (empty, stale/copied, an uncovered file, a quote that is not verbatim under its
//   cited heading, an applied entry pointing outside the change, a missing selected skill, or malformed input).
//   A refusal always blocks a task from ending; there is no "soft" failure.
//
// Dependency-free (Node built-ins), offline. Reuses the grounding logic of check-skill-receipt via
// receipt-grounding.mjs (one owner of "grounded").
import { readFileSync, writeFileSync, appendFileSync, existsSync, statSync, mkdirSync } from "node:fs";
import { resolve, join, dirname } from "node:path";
import { homedir } from "node:os";
import { createHash } from "node:crypto";
import { MIN_QUOTE_WORDS, quoteUnderHeading } from "./receipt-grounding.mjs";

const SAFE_NAME = /^[A-Za-z0-9._-]+$/; // skill names and session ids: no path separators, no traversal
const VERDICTS = new Set(["applied", "not-applicable", "waived"]);

const argv = process.argv.slice(2);
const command = argv[0];
const opt = (n, d) => { const i = argv.indexOf(n); return i >= 0 && argv[i + 1] !== undefined && !argv[i + 1].startsWith("--") ? argv[i + 1] : d; };
const parseList = (s) => (s == null ? null : String(s).split(",").map((x) => x.trim().split("\\").join("/")).filter(Boolean));
const sha256 = (buf) => createHash("sha256").update(buf).digest("hex");

const USAGE = `task-receipt - per-task skill receipts, stored outside the work folder, tied to file hashes.
  node task-receipt.mjs write  --session <id> --entry <file.json|-> [--store <dir>]
  node task-receipt.mjs check  --receipt <file.jsonl> [--task <id>] --changed-list <csv> [--selection <csv>] --skills-dir <dir>
  node task-receipt.mjs export --receipt <file.jsonl> [--task <id>] --change <name> [--author <who>]
check exit: 0 accepted, 2 refused / fail closed.`;
if (argv.includes("--help") || argv.includes("-h") || !command) { console.log(USAGE); process.exit(command ? 0 : 2); }

// Fail closed. For `check` this is the single refusal path (exit 2 = the task cannot end); for write/export it
// is an input error. One place, so a malformed/empty/stale receipt can never slip through as acceptance.
function refuse(msg) { console.error(`[task-receipt] REFUSED - ${msg}`); process.exit(2); }

function readStdin() { try { return readFileSync(0, "utf8"); } catch { return ""; } }

function loadEntries(receiptPath) {
  if (!receiptPath) refuse("--receipt <file.jsonl> is required.");
  const abs = resolve(receiptPath);
  if (!existsSync(abs) || !statSync(abs).isFile()) refuse(`receipt file not found: ${abs}`);
  const raw = readFileSync(abs, "utf8");
  const lines = raw.split(/\r?\n/).filter((l) => l.trim());
  if (lines.length === 0) refuse(`the receipt has no entries (the file exists but is empty): ${abs}`);
  const entries = [];
  for (const l of lines) {
    try { entries.push(JSON.parse(l)); }
    catch (e) { refuse(`a receipt line is not valid JSON: ${e.message}`); }
  }
  return entries;
}
function pickEntry(entries, taskId) {
  const entry = taskId ? [...entries].reverse().find((e) => e && e.task_id === taskId) : entries[entries.length - 1];
  if (!entry) refuse(taskId ? `no receipt entry with task_id "${taskId}".` : "no receipt entry found.");
  if (typeof entry !== "object" || Array.isArray(entry)) refuse("a receipt entry is not an object.");
  return entry;
}

// --- write -------------------------------------------------------------------
if (command === "write") {
  const session = opt("--session");
  if (!session || !SAFE_NAME.test(session)) refuse(`--session <id> is required and must match ${SAFE_NAME} (no path separators).`);
  const entryArg = opt("--entry");
  if (!entryArg) refuse("--entry <file.json|-> is required.");
  const store = resolve(opt("--store", join(homedir(), ".claude", "esk", "receipts")));
  let rawEntry;
  if (entryArg === "-") rawEntry = readStdin();
  else { const p = resolve(entryArg); if (!existsSync(p)) refuse(`--entry file not found: ${p}`); rawEntry = readFileSync(p, "utf8"); }
  let entry;
  try { entry = JSON.parse(rawEntry); } catch (e) { refuse(`--entry is not valid JSON: ${e.message}`); }
  if (!entry || typeof entry !== "object" || Array.isArray(entry)) refuse("--entry must be a JSON object.");
  if (!entry.task_id || !String(entry.task_id).trim()) refuse("the entry needs a non-empty task_id.");
  entry.session_id = session; // the store is keyed by session, so pin it on the entry too
  if (!entry.created_at) entry.created_at = new Date().toISOString();
  // One file per session: parallel sessions in the same folder never write the same file, so neither overwrites
  // the other. Append-only (O_APPEND), one JSON object per line.
  mkdirSync(store, { recursive: true });
  const file = join(store, `${session}.jsonl`);
  appendFileSync(file, JSON.stringify(entry) + "\n");
  const count = readFileSync(file, "utf8").split(/\r?\n/).filter((l) => l.trim()).length;
  console.log(`[task-receipt] wrote task "${entry.task_id}" to ${file} (${count} entr${count === 1 ? "y" : "ies"} for this session).`);
  process.exit(0);
}

// --- check -------------------------------------------------------------------
if (command === "check") {
  const entries = loadEntries(opt("--receipt"));
  const entry = pickEntry(entries, opt("--task", null));
  const changed = parseList(opt("--changed-list", null));
  if (!changed || changed.length === 0) refuse("--changed-list <csv> is required (the files this task changed); a receipt with nothing to cover cannot be accepted.");
  const selection = parseList(opt("--selection", null)); // optional: skills the task was required to apply
  const skillsDir = resolve(opt("--skills-dir", ".claude/skills"));
  if (!existsSync(skillsDir) || !statSync(skillsDir).isDirectory()) refuse(`skills dir not found: ${skillsDir}`);

  // changed_files must be a list of {path, sha256}
  const recorded = entry.changed_files;
  if (!Array.isArray(recorded) || recorded.length === 0) refuse("the receipt has no changed_files; it describes no work.");
  const recordedByPath = new Map();
  for (const r of recorded) {
    if (!r || typeof r !== "object" || !r.path || !r.sha256) refuse("each changed_files item needs a path and a sha256.");
    recordedByPath.set(String(r.path).split("\\").join("/"), String(r.sha256));
  }

  // Full coverage AND current hash: every file the task changed must be in the receipt, and its recorded hash
  // must equal the file's CURRENT hash. A stale or copied receipt lists other files or old hashes, so it fails
  // here; a sampled receipt leaves a changed file uncovered, so it fails here too. Full check, never a sample.
  for (const f of changed) {
    if (!recordedByPath.has(f)) refuse(`changed file "${f}" is not covered by the receipt (every changed file must be covered; no sampling).`);
    if (!existsSync(f) || !statSync(f).isFile()) refuse(`changed file "${f}" does not exist now, so its hash cannot be confirmed.`);
    const current = sha256(readFileSync(f));
    if (current !== recordedByPath.get(f)) {
      refuse(`the receipt does not describe the files it changed: "${f}" hash ${recordedByPath.get(f).slice(0, 12)} != current ${current.slice(0, 12)} (stale or copied receipt).`);
    }
  }

  // Skills: verdicts valid; applied entries grounded against the INSTALLED skill text and its current hash;
  // applied files inside the change; waived entries carry an unexpired waiver.
  const skills = entry.skills;
  if (!Array.isArray(skills)) refuse("the receipt needs a skills array.");
  const byName = new Map();
  for (const s of skills) {
    if (!s || typeof s !== "object" || !s.name) refuse("each skills item needs a name.");
    const name = String(s.name);
    if (!SAFE_NAME.test(name)) refuse(`unsafe skill name "${name}" (no path separators).`);
    if (!VERDICTS.has(s.verdict)) refuse(`skill "${name}" has an invalid verdict "${s.verdict}" (applied | not-applicable | waived).`);
    byName.set(name, s);
    if (s.verdict === "not-applicable") continue;
    if (s.verdict === "waived") {
      const w = s.waiver;
      if (!w || !w.reason || !w.approver || !w.expires) refuse(`skill "${name}" is waived but the waiver needs reason, approver, and expires.`);
      if (Date.parse(w.expires) < Date.now()) refuse(`skill "${name}" has an expired waiver (expired ${w.expires}).`);
      continue;
    }
    // applied: resolve the installed skill file, confirm its hash, ground the quote under the cited heading
    const skillFile = join(skillsDir, name, "SKILL.md");
    if (!existsSync(skillFile) || !statSync(skillFile).isFile()) refuse(`skill "${name}" is applied but its installed file was not found at ${skillFile}.`);
    const fileText = readFileSync(skillFile, "utf8");
    if (s.skill_file_sha256 && sha256(Buffer.from(fileText, "utf8")) !== s.skill_file_sha256) {
      refuse(`skill "${name}": the installed SKILL.md hash does not match the receipt's skill_file_sha256 (the receipt was written against different skill text).`);
    }
    if (!s.heading || !s.quote) refuse(`skill "${name}" is applied but is missing a heading or a quote.`);
    const g = quoteUnderHeading(fileText, s.heading, s.quote);
    if (!g.ok) refuse(`skill "${name}": ${g.reason}. Cited heading: "#${String(s.heading).toLowerCase()}".`);
    const files = Array.isArray(s.files) ? s.files.map((x) => String(x).split("\\").join("/")) : [];
    if (files.length === 0) refuse(`skill "${name}" is applied but names no files it was applied to.`);
    for (const wf of files) {
      if (!changed.includes(wf)) refuse(`skill "${name}": applied to "${wf}", which is not in the change (an applied entry must point at files really in the task).`);
    }
  }

  // Selection: every required skill must be applied (never silently dropped to not-applicable or omitted).
  if (selection) {
    for (const req of selection) {
      const s = byName.get(req);
      if (!s || s.verdict !== "applied") refuse(`the receipt does not match the selection: required skill "${req}" is ${s ? s.verdict : "missing"}, not applied.`);
    }
  }

  const sel = selection ? `, selection of ${selection.length} satisfied` : ", no selection given";
  console.log(`[task-receipt] OK - task "${entry.task_id}" accepted: ${changed.length} changed file(s) covered with current hashes, ${skills.length} skill entr${skills.length === 1 ? "y" : "ies"} grounded${sel}. A human must still review the work.`);
  process.exit(0);
}

// --- export ------------------------------------------------------------------
if (command === "export") {
  const entries = loadEntries(opt("--receipt"));
  const entry = pickEntry(entries, opt("--task", null));
  const change = opt("--change");
  if (!change) refuse("--change <name> is required (the PR / branch the per-task work becomes).");
  const author = opt("--author", entry.session_id ? `session:${entry.session_id}` : "unknown");
  const date = (entry.created_at && String(entry.created_at).slice(0, 10)) || new Date().toISOString().slice(0, 10);
  const out = { change, date, author, humanReviewed: null, skills: {} };
  for (const s of entry.skills || []) {
    const name = String(s.name);
    if (s.verdict === "applied") {
      out.skills[name] = {
        status: "applied",
        why: s.why || "(from per-task receipt; fill in for the PR)",
        what: s.what || "(from per-task receipt; fill in for the PR)",
        where: Array.isArray(s.files) ? s.files : [],
        anchors: [`${name}/SKILL.md#${String(s.heading).toLowerCase()}`],
        quotes: [s.quote],
      };
    } else {
      // not-applicable and waived both map to not-applicable in the PR format (which has no waived status); a
      // waiver's reason is carried into why so the context is not lost.
      out.skills[name] = {
        status: "not-applicable",
        why: s.verdict === "waived" && s.waiver ? `waived: ${s.waiver.reason}` : (s.why || "(from per-task receipt; fill in for the PR)"),
      };
    }
  }
  process.stdout.write(JSON.stringify(out) + "\n");
  process.exit(0);
}

refuse(`unknown command "${command}" (expected write | check | export). Run with --help.`);
