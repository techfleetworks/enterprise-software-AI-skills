#!/usr/bin/env node
/**
 * check-a11y-checklist - fail unless every item in the combined accessibility checklist has a verdict.
 *
 * The structural half of "comply with all of them." The combined checklist (assets/combined-a11y-checklist.json)
 * is WCAG 2.2 Level A and AA, the strict superset of every stable web accessibility requirement the three
 * source checklists point to: Section 508 of 2017 incorporates WCAG 2.0 A and AA by reference, the US ADA
 * (DOJ Title II rule of 2024) requires WCAG 2.1 AA, and WCAG 2.2 contains both. (WCAG 3.0 is a W3C draft, so
 * it is direction, not a conformance target. The ADA Checklist for Existing Facilities is for buildings, not
 * the web.) This gate reads that checklist and a project's conformance record and fails (exit 1) when any
 * success criterion has no recorded verdict, so "we meet all three standards" cannot be an unproven claim.
 * Dependency-free (Node built-ins), vendor-neutral.
 *
 *   node check-a11y-checklist.mjs --checklist combined-a11y-checklist.json --record a11y-conformance.json
 *
 * The checklist is an array of {"sc":"1.1.1","level":"A","method":"automated|manual|both", ...}.
 * The record maps each SC to a verdict, either an object {"1.1.1": {...}} or an array [{"sc":"1.1.1", ...}]:
 *   {"status":"pass-automated"}                      a passing automated check covers it (axe, lint)
 *   {"status":"pass-manual","reviewer":"...","date":"YYYY-MM-DD"}   a human verified it; reviewer + date required
 *   {"status":"not-applicable","note":"<reason>"}    it genuinely does not apply here; reason required
 * Any other status, a missing entry, a placeholder, a manual pass with no reviewer or date, or a
 * not-applicable with no reason FAILS. A criterion whose method is not purely automated cannot be closed
 * with "pass-automated" alone, because automated tools catch only part of accessibility.
 *
 * Exit 0 = every checklist criterion has a valid verdict. 1 = one or more gaps. 2 = bad usage / IO.
 */
import { readFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";

function die(msg) { console.error(`[check-a11y-checklist] FAIL - ${msg}`); process.exit(2); }

const args = process.argv.slice(2);
function opt(name) { const i = args.indexOf(name); return i >= 0 ? args[i + 1] : undefined; }
const checklistPath = opt("--checklist");
const recordPath = opt("--record");
if (!checklistPath || !recordPath) die("usage: check-a11y-checklist.mjs --checklist <combined-a11y-checklist.json> --record <a11y-conformance.json>");

function loadJson(p, what) {
  const abs = resolve(p);
  if (!existsSync(abs)) die(`${what} not found: ${abs}`);
  try { return JSON.parse(readFileSync(abs, "utf8")); }
  catch (e) { die(`${what} is not valid JSON (${e.message})`); }
}

const rawChecklist = loadJson(checklistPath, "checklist");
// The checklist is either a bare array of criteria, or an object carrying metadata plus a `criteria` array.
const checklist = Array.isArray(rawChecklist) ? rawChecklist
  : (rawChecklist && Array.isArray(rawChecklist.criteria) ? rawChecklist.criteria : null);
if (!checklist || checklist.length === 0) die("checklist must be a non-empty JSON array of criteria (or an object with a non-empty `criteria` array)");

// Normalize the record to a Map sc -> verdict object.
const rawRecord = loadJson(recordPath, "record");
const record = new Map();
if (Array.isArray(rawRecord)) {
  for (const e of rawRecord) { if (!e || !e.sc) die(`record array entry has no "sc": ${JSON.stringify(e)}`); record.set(String(e.sc), e); }
} else if (rawRecord && typeof rawRecord === "object") {
  for (const [sc, v] of Object.entries(rawRecord)) record.set(sc, (v && typeof v === "object") ? v : { status: v });
} else {
  die("record must be a JSON object or array");
}

const STATUSES = new Set(["pass-automated", "pass-manual", "not-applicable"]);
// A placeholder records no real decision, so it must not satisfy a reviewer or a reason, the same bar
// the other gates use. A reviewer/note must be >= 3 chars and not a placeholder.
const PLACEHOLDER = /^(n\/?a|tba|tbd|todo|xxx|\?+|-+|none|unknown|pending)$/i;
const real = (v) => typeof v === "string" && v.trim().length >= 3 && !PLACEHOLDER.test(v.trim());
// A real calendar date: anchored, with month 01-12 and day 01-31, so "0000-00-00" or "2026-99-99" fail.
const isDate = (v) => typeof v === "string" && /^\d{4}-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])$/.test(v.trim());
// A review date in the future is not a real sign-off (a fabricated "2099-12-31" would otherwise certify that
// a human reviewed it). Require a well-formed date that is today or earlier.
const isFutureDate = (v) => isDate(v) && new Date(v.trim()).getTime() > Date.now();

const problems = [];
for (const item of checklist) {
  const sc = item && item.sc ? String(item.sc) : null;
  if (!sc) die(`checklist entry has no "sc": ${JSON.stringify(item)}`);
  const method = String(item.method || "manual").toLowerCase();
  const v = record.get(sc);
  if (!v) { problems.push(`${sc} (${item.name || "?"}): no verdict in the conformance record`); continue; }
  const status = String(v.status || "").toLowerCase();
  if (!STATUSES.has(status)) { problems.push(`${sc}: invalid or missing status "${v.status}" (use: ${[...STATUSES].join(", ")})`); continue; }
  if (status === "pass-automated" && method !== "automated") {
    problems.push(`${sc}: "pass-automated" is not enough for a ${method}-method criterion; automated tools catch only part of it, so verify and record "pass-manual" (reviewer + date)`);
  }
  if (status === "pass-manual" && (!real(v.reviewer) || !isDate(v.date) || isFutureDate(v.date))) {
    problems.push(`${sc}: "pass-manual" needs a reviewer and a real YYYY-MM-DD date that is today or earlier (not a future date)`);
  }
  if (status === "not-applicable" && !real(v.note)) {
    problems.push(`${sc}: "not-applicable" needs a note explaining why it does not apply`);
  }
}

if (problems.length) {
  console.error(`[check-a11y-checklist] FAIL - ${problems.length} of ${checklist.length} criteria without a valid verdict:`);
  for (const p of problems) console.error("  • " + p);
  console.error(`\nEvery criterion in the combined checklist (WCAG 2.2 A and AA = Section 508 + ADA Title II + more)\n` +
    `needs a verdict: pass-automated (automated-only criteria), pass-manual (reviewer + date), or not-applicable (reason).`);
  process.exit(1);
}
console.log(`[check-a11y-checklist] OK - all ${checklist.length} combined-checklist criteria have a valid verdict.`);
process.exit(0);
