#!/usr/bin/env node
// check-arch-review-coverage — a change isn't "reviewed" unless the review log proves it.
//
// For the changed code files, the latest entry in the append-only review log must cover EVERY file
// against ALL four questions, with a verdict per cell, a re-runnable evidence source on every
// `finding` and every `cleared` cell (no silent clears), valid @question/@severity on every finding,
// and the grep-battery recorded as run. Fail-closed. See references/review-log-and-coverage.md.
//
//   node check-arch-review-coverage.mjs --change <ref> --changed-list a.ts,b.ts [--log docs/arch-reviews/log.jsonl] [--base <base-log>]
//
// Exit 0 = the change is fully, evidently reviewed. Exit 1 = a gap or missing input.
import { readFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";

const die = (m) => { console.error(`[check-arch-review-coverage] FAIL — ${m}`); process.exit(1); };
const args = process.argv.slice(2);
const opt = (n) => { const i = args.indexOf(n); return i >= 0 ? args[i + 1] : undefined; };

const logPath = resolve(opt("--log") ?? "docs/arch-reviews/log.jsonl");
const changedArg = opt("--changed-list");
const change = opt("--change");
const basePath = opt("--base");
const QUESTIONS = ["boundary", "ownership", "dependency", "error-handling"];
const VERDICTS = new Set(["finding", "cleared", "n/a"]);
const SEVERITY = new Set(["high", "med", "low"]);
const QUESTION_TAGS = new Set([...QUESTIONS, "over-engineering", "under-engineering"]);
const nonEmpty = (v) => v != null && String(v).trim() !== "";

if (!change) die("no --change <ref> given (the commit/PR this review must be FOR; fail closed).");
if (!changedArg) die("no --changed-list given (the changed code files to require coverage for; fail closed).");
const changed = changedArg.split(",").map((s) => s.trim().split("\\").join("/")).filter(Boolean);
if (changed.length === 0) die("empty changed-list (fail closed).");

if (!existsSync(logPath)) die(`review log not found: ${logPath}`);
const raw = readFileSync(logPath, "utf8");
if (!raw.trim()) die(`review log is empty: ${logPath}`);

// Append-only: the committed log must be a clean append to the base revision's log. A --base that is
// given but unreadable is a hard error (never a silent skip) — only "no --base at all" skips the check.
if (basePath) {
  if (!existsSync(basePath)) die(`--base given but not found: ${basePath} — cannot verify append-only (fail closed).`);
  const base = readFileSync(basePath, "utf8");
  if (base && !raw.startsWith(base)) die("review log is not append-only — a prior entry was edited or removed.");
}

const lines = raw.split(/\r?\n/).filter((l) => l.trim());
let entries;
try { entries = lines.map((l) => JSON.parse(l)); }
catch (e) { die(`a log entry is not valid JSON: ${e.message}`); }
// The review must be FOR this change — not just any past entry that happens to mention these files.
const entry = [...entries].reverse().find((e) => e && e.change === change);
if (!entry) die(`no review record whose change == "${change}" — append a review for THIS change (a stale entry for an unrelated change does not count).`);

const matrix = entry.matrix || {};
const problems = [];

for (const f of changed) {
  const cells = matrix[f];
  if (!cells) { problems.push(`${f}: not in the review matrix (unreviewed)`); continue; }
  for (const q of QUESTIONS) {
    const cell = cells[q];
    if (!cell || !cell.verdict) { problems.push(`${f} » ${q}: no verdict`); continue; }
    if (!VERDICTS.has(cell.verdict)) { problems.push(`${f} » ${q}: invalid verdict "${cell.verdict}"`); continue; }
    if ((cell.verdict === "finding" || cell.verdict === "cleared") && !nonEmpty(cell.evidence)) {
      problems.push(`${f} » ${q}: "${cell.verdict}" with no evidence (no silent clears)`);
    }
  }
}

for (const [i, fd] of (entry.findings || []).entries()) {
  const at = `finding #${i}${fd.title ? ` ("${fd.title}")` : ""}`;
  if (!QUESTION_TAGS.has(fd.question)) problems.push(`${at}: @question "${fd.question}" not in vocabulary`);
  if (!SEVERITY.has(fd.severity)) problems.push(`${at}: @severity "${fd.severity}" not in vocabulary`);
  if (!nonEmpty(fd.file)) problems.push(`${at}: missing @file`);
  if (!nonEmpty(fd.evidence)) problems.push(`${at}: missing evidence`);
}

if (!Array.isArray(entry.grepCommands) || entry.grepCommands.length === 0) {
  problems.push("the grep-battery was not recorded as run (grepCommands empty)");
}

if (problems.length) {
  console.error(`[check-arch-review-coverage] FAIL — ${problems.length} problem(s):`);
  for (const p of problems) console.error("  • " + p);
  process.exit(1);
}
console.log(`[check-arch-review-coverage] OK — ${changed.length} changed file(s) fully reviewed ` +
  `(× ${QUESTIONS.length} questions), every cell verdicted + evidenced, logged.`);
process.exit(0);
