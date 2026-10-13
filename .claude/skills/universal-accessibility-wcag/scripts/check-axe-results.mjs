#!/usr/bin/env node
/**
 * check-axe-results - the pass/fail VERDICT for an axe-core accessibility run (the part that must be
 * provably correct). Pairs with run-axe.mjs, the browser scaffold that PRODUCES the results.
 *
 * Why split: a real axe scan needs a browser + a running app (axe-core + Playwright), so it can't be a
 * self-contained, dependency-free gate like the others - and that browser-driving step can't run in
 * this repo's own CI. But the thing that can silently be WRONG is the verdict logic (treating
 * violations as a pass, honoring an expired suppression). That logic lives here, is dependency-free,
 * and is discriminating-tested on fixture results. The scaffold is honestly documented, not tested.
 *
 *   node check-axe-results.mjs --results <axe-results.json> --config <axe-config.json>
 *
 * Results JSON: a single axe run `{ "url": "...", "violations": [ { "id","impact","nodes":[...] } ] }`
 * or an ARRAY of such runs (one per scanned page). `impact` is axe's own: minor|moderate|serious|critical.
 * Config: { "failOn": ["critical","serious"], "allowlist": [ {"rule","reason","sc","expires"} ] }
 *   - failOn defaults to ["critical","serious"] (axe's high-impact bands).
 *   - an allowlist entry needs rule + reason + expires (sc recommended); an EXPIRED entry no longer
 *     suppresses - "never blindly suppress," per references/accessibility-testing.md.
 *
 * Exit 0 = no failing violations. 1 = one or more. 2 = bad usage / unreadable / unparseable / no runs
 * (an unscanned result is not a passing result - fail closed).
 */
import { readFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";

function die(msg) { console.error(`[check-axe-results] FAIL - ${msg}`); process.exit(2); }

const args = process.argv.slice(2);
const opt = (n) => { const i = args.indexOf(n); return i >= 0 ? args[i + 1] : undefined; };
const resultsPath = opt("--results");
const configPath = opt("--config");
if (!resultsPath) die("missing --results <axe-results.json>");
if (!configPath) die("missing --config <axe-config.json>");
for (const [label, p] of [["results", resultsPath], ["config", configPath]]) {
  if (!existsSync(resolve(p))) die(`${label} not found: ${p}`);
}

const IMPACTS = new Set(["minor", "moderate", "serious", "critical"]);

let cfg;
try { cfg = JSON.parse(readFileSync(resolve(configPath), "utf8")); }
catch (e) { die(`config is not valid JSON (${e.message})`); }
const failOn = new Set((cfg.failOn || ["critical", "serious"]).map((s) => String(s).toLowerCase()));
for (const f of failOn) if (!IMPACTS.has(f)) die(`config failOn has an unknown impact "${f}" (use: ${[...IMPACTS].join(", ")})`);
if (failOn.size === 0) die(`config failOn is empty - the gate would pass everything; set at least one of ${[...IMPACTS].join(", ")}`);

// --- validate allowlist (shrink-only waiver discipline: rule + reason + a real, unexpired expiry) ---
const allow = new Map(); // rule id -> entry
for (const [i, e] of (cfg.allowlist || []).entries()) {
  const missing = ["rule", "reason", "expires"].filter((k) => !e || !e[k]);
  if (missing.length) die(`allowlist[${i}] is missing: ${missing.join(", ")} (every suppression needs rule, reason, expires)`);
  // A blank or whitespace-only reason is no reason: it must not be able to suppress a critical/serious finding.
  if (String(e.reason).trim().length < 3) die(`allowlist[${i}] (rule "${e.rule}") has a blank or too-short reason; a suppression needs a real reason (>=3 chars)`);
  if (Number.isNaN(new Date(e.expires).getTime())) die(`allowlist[${i}] (rule "${e.rule}") has an unparseable expires "${e.expires}" (use ISO like 2026-12-31)`);
  allow.set(String(e.rule), e);
}
const suppressed = (ruleId) => {
  const e = allow.get(ruleId);
  return e && new Date(e.expires) >= new Date(); // expired entries no longer suppress
};

// --- load + normalize runs ---------------------------------------------------
let raw;
try { raw = JSON.parse(readFileSync(resolve(resultsPath), "utf8")); }
catch (e) { die(`results is not valid JSON (${e.message})`); }
const runs = Array.isArray(raw) ? raw : (raw && typeof raw === "object" ? [raw] : null);
if (!runs || runs.length === 0) die("results contained no axe runs (nothing scanned - fail closed)");
for (const r of runs) if (!r || !Array.isArray(r.violations)) die("each run must have a `violations` array (is this an axe-core result?)");

// --- verdict -----------------------------------------------------------------
const problems = [];
let scanned = 0, totalViolations = 0;
for (const run of runs) {
  scanned++;
  const where = run.url || run.pageUrl || "(page)";
  for (const v of run.violations) {
    totalViolations++;
    const impact = String(v.impact || "").toLowerCase();
    // A violation with no / unrecognized impact can't be judged against the threshold. Fail CLOSED
    // rather than silently treating it as "below threshold" (the one place this gate could pass a real
    // violation) - every other bad-input path here dies too.
    if (!IMPACTS.has(impact)) die(`violation "${v.id || "?"}" on ${where} has an unrecognized impact "${v.impact}" - cannot assess (fail closed)`);
    if (!failOn.has(impact)) continue;         // below the fail threshold
    if (suppressed(v.id)) continue;            // allowlisted, not expired
    const nodes = Array.isArray(v.nodes) ? v.nodes.length : 0;
    problems.push(`${where}  [${impact}] ${v.id}${nodes ? ` (${nodes} node${nodes > 1 ? "s" : ""})` : ""}`);
  }
}

// report stale allowlist entries (rule no longer firing or past expiry) so the list shrinks
const firing = new Set(runs.flatMap((r) => r.violations.map((v) => v.id)));
const stale = [...allow.values()].filter((e) => !firing.has(e.rule) || new Date(e.expires) < new Date());

if (problems.length) {
  console.error(`[check-axe-results] FAIL - ${problems.length} accessibility violation(s) at/above ${[...failOn].join("/")} across ${scanned} page(s):`);
  for (const p of problems) console.error(`  • ${p}`);
  console.error(`\nFix the violation, or add a time-boxed allowlist entry (rule + reason + WCAG SC + expires) - a clean axe run means "no DETECTABLE issues," not "accessible" (do the manual layers too).`);
  process.exit(1);
}
console.log(`[check-axe-results] OK - ${scanned} page(s) scanned, ${totalViolations} total violation(s), none at/above ${[...failOn].join("/")} (unsuppressed).`);
if (stale.length) console.log(`  note: ${stale.length} allowlist entry(ies) can be REMOVED (rule no longer fires, or expired): ${stale.map((e) => e.rule).join(", ")}`);
process.exit(0);
