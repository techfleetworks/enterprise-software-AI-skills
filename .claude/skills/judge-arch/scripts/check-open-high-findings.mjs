#!/usr/bin/env node
/**
 * check-open-high-findings - a HIGH (or critical) review finding blocks "done" until it is fixed or an
 * operator waives it. This reads the structured fresh-context review log and fails if any HIGH finding is
 * still open, so "done" cannot be claimed over an unresolved HIGH. The finish check (issue #174) calls
 * this at task end; it is also runnable on its own.
 *
 *   node check-open-high-findings.mjs [--log docs/arch-reviews/log.jsonl] [--change <name>]
 *
 * A review-log entry is a JSON object with a `findings` array; a finding is an object with a `severity`
 * string and, when resolved, a non-empty `resolution` string or a `waiver` object (reason, approver,
 * expiry). A finding is OPEN when its severity contains "high" or "critical" and it has neither a
 * resolution nor a waiver. Without --change every entry is checked; with --change only that change's
 * entries are.
 *
 * Exit 0 = no open HIGH finding (prints how many it checked). Exit 1 = at least one open HIGH finding
 * (names them). Exit 2 = fail closed (no log, unreadable, a line that is not valid JSON, a finding with
 * no severity).
 */
import { readFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";

function die(msg) { console.error(`[check-open-high-findings] FAIL (closed) - ${msg}`); process.exit(2); }

const args = process.argv.slice(2);
const opt = (n) => { const i = args.indexOf(n); return i >= 0 ? args[i + 1] : undefined; };
if (args.includes("--help") || args.includes("-h")) {
  console.log("usage: node check-open-high-findings.mjs [--log <log.jsonl>] [--change <name>]");
  process.exit(0);
}
const known = new Set(["--log", "--change", "--help", "-h"]);
const unknown = args.filter((a) => a.startsWith("-") && !known.has(a));
if (unknown.length) die(`unknown flag(s): ${unknown.join(", ")}`);

const logPath = resolve(opt("--log") ?? "docs/arch-reviews/log.jsonl");
const change = opt("--change");
if (!existsSync(logPath)) die(`review log not found: ${logPath}`);
const raw = readFileSync(logPath, "utf8");
if (!raw.trim()) die(`review log is empty: ${logPath}`);

const lines = raw.split(/\r?\n/).filter((l) => l.trim());
let entries;
try { entries = lines.map((l) => JSON.parse(l)); }
catch (e) { die(`a review-log line is not valid JSON: ${e.message}`); }

const isHigh = (sev) => /\b(high|critical)\b/i.test(sev);

// A HIGH finding is resolved by a non-empty STRING resolution, or by a COMPLETE, unexpired operator
// waiver. An incomplete waiver (or a non-string resolution) fails closed, matching the sibling gates
// (arch-gate, check-change-routing) and the global rule that a waiver carries a reason, an approver, and
// an expiry. An empty "{}" waiver must never silence a HIGH.
function resolved(f, change) {
  if (typeof f.resolution === "string" && f.resolution.trim() !== "") return true;
  if (f.resolution != null && typeof f.resolution !== "string") die(`a HIGH finding in change "${change}" has a non-string resolution (${JSON.stringify(f.resolution)}); only a stated resolution clears it (fail closed).`);
  if (f.waiver == null) return false;
  const w = f.waiver;
  const hasApprover = (typeof w.approver === "string" && w.approver.trim() !== "") || (typeof w.approvedBy === "string" && w.approvedBy.trim() !== "");
  const complete = w && typeof w === "object" && !Array.isArray(w)
    && typeof w.reason === "string" && w.reason.trim() !== ""
    && hasApprover
    && typeof w.expires === "string" && w.expires.trim() !== "";
  if (!complete) die(`a HIGH finding in change "${change}" has a waiver missing a required field (needs reason, approver, expires); an incomplete waiver cannot clear a HIGH (fail closed).`);
  const exp = Date.parse(w.expires);
  if (Number.isNaN(exp)) die(`a HIGH finding in change "${change}" has a waiver with an unparseable expires "${w.expires}" (fail closed).`);
  return exp >= Date.now(); // an expired waiver has lapsed: the finding is open again
}

const scope = change ? entries.filter((e) => e && e.change === change) : entries;
if (change && scope.length === 0) die(`no review entry for change "${change}" (fail closed; a missing review is not a pass).`);

const open = [];
let checked = 0;
for (const e of scope) {
  const findings = Array.isArray(e && e.findings) ? e.findings : [];
  for (const f of findings) {
    if (f == null || typeof f !== "object") die(`a finding in change "${e.change}" is not an object`);
    if (!("severity" in f)) die(`a finding in change "${e.change}" has no "severity" (cannot tell if it is HIGH; fail closed).`);
    if (typeof f.severity !== "string") die(`a finding in change "${e.change}" has a non-string severity (${JSON.stringify(f.severity)}); cannot classify (fail closed).`);
    checked++;
    if (isHigh(f.severity) && !resolved(f, e.change)) open.push({ change: e.change, where: f.where, finding: f.finding || f.summary });
  }
}

if (open.length) {
  console.error(`[check-open-high-findings] FAIL - ${open.length} open HIGH finding(s) block "done":`);
  for (const o of open) console.error(`  - [${o.change}] ${o.where || "?"}: ${o.finding || "(no description)"}`);
  console.error(`\nFix each finding (a committed change that resolves it), or record an operator waiver (reason, approver, expiry), before the work is called done.`);
  process.exit(1);
}
console.log(`[check-open-high-findings] OK - ${checked} finding(s) checked across ${scope.length} review entr(y/ies); no open HIGH finding.`);
process.exit(0);
