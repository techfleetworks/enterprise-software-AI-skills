#!/usr/bin/env node
// check-arch-review-coverage — a change isn't "reviewed" unless the review log proves it.
//
// For the changed code files, the latest entry in the append-only review log must cover EVERY file
// against ALL four questions, with a verdict per cell, a re-runnable evidence source on every
// `finding` and every `cleared` cell (no silent clears), valid @question/@severity on every finding,
// and the grep-battery recorded as run. Fail-closed. See references/review-log-and-coverage.md.
//
//   node check-arch-review-coverage.mjs --changed-list a.ts,b.ts [--log docs/arch-reviews/log.jsonl] [--base <base-log>]
//
// Exit 0 = the change is fully, evidently reviewed. Exit 1 = a gap or missing input.
import { readFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";

const die = (m) => { console.error(`[check-arch-review-coverage] FAIL — ${m}`); process.exit(1); };
const args = process.argv.slice(2);
const opt = (n) => { const i = args.indexOf(n); return i >= 0 ? args[i + 1] : undefined; };

const logPath = resolve(opt("--log") ?? "docs/arch-reviews/log.jsonl");
const changedArg = opt("--changed-list");
const basePath = opt("--base");
const QUESTIONS = ["boundary", "ownership", "dependency", "error-handling"];
const VERDICTS = new Set(["finding", "cleared", "n/a"]);
const SEVERITY = new Set(["high", "med", "low"]);
const QUESTION_TAGS = new Set([...QUESTIONS, "over-engineering", "under-engineering"]);
const nonEmpty = (v) => v != null && String(v).trim() !== "";

if (!changedArg) die("no --changed-list given (the changed code files to require coverage for; fail closed).");
const changed = changedArg.split(",").map((s) => s.trim().split("\\").join("/")).filter(Boolean);
if (changed.length === 0) die("empty changed-list (fail closed).");

if (!existsSync(logPath)) die(`review log not found: ${logPath}`);
const raw = readFileSync(logPath, "utf8");
if (!raw.trim()) die(`review log is empty: ${logPath}`);

// Append-only: the committed log must be a clean append to the base revision's log.
if (basePath) {
  const base = existsSync(basePath) ? readFileSync(basePath, "utf8") : null;
  if (base && !raw.startsWith(base)) die("review log is not append-only — a prior entry was edited or removed.");
}

const lines = raw.split(/\r?\n/).filter((l) => l.trim());
let entry;
try { entry = JSON.parse(lines[lines.length - 1]); }
catch (e) { die(`the latest log entry is not valid JSON: ${e.message}`); }

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
