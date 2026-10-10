#!/usr/bin/env node
// check-bdd-executed — prove the suite actually RAN, not just that the .feature files are valid.
//
// Reads the BDD runner's machine-readable results (Cucumber JSON) and reconciles them against the
// committed datastore: every scenario in features/bdd-index.json must have executed and PASSED, with
// zero undefined / pending / skipped / failed. A misconfigured job that runs nothing — or silently
// skips scenarios — fails closed instead of going green. This is what makes "the autotests really ran
// and covered every scenario" provable rather than assumed.
//
//   node check-bdd-executed.mjs [featuresDir] --results <cucumber.json>
//   BDD_RESULTS=<cucumber.json> node check-bdd-executed.mjs [featuresDir]
//
// Exit 0 = every datastore scenario executed and passed. Exit 1 = a gap, or missing/bad input.
import { resolve, join } from "node:path";
import { readFileSync } from "node:fs";

const args = process.argv.slice(2);
const root = resolve(args.find((a) => !a.startsWith("--")) ?? "features");
const ri = args.indexOf("--results");
const resultsPath = ri >= 0 ? args[ri + 1] : process.env.BDD_RESULTS;
const fail = (m) => { console.error(`[check-bdd-executed] FAIL — ${m}`); process.exit(1); };

if (!resultsPath) fail("no results report given (pass --results <cucumber.json> or set BDD_RESULTS). A run with no report cannot be trusted.");

let index, report;
try { index = JSON.parse(readFileSync(join(root, "bdd-index.json"), "utf8")); }
catch { fail(`cannot read datastore ${join(root, "bdd-index.json")} — run bdd-index-generate.mjs`); }
try { report = JSON.parse(readFileSync(resolve(resultsPath), "utf8")); }
catch (e) { fail(`cannot read/parse results report ${resultsPath}: ${e.message}`); }

const expected = index.map((r) => r.scenario);
if (expected.length === 0) fail("datastore lists zero scenarios (nothing to reconcile; fail closed).");

// Collapse the Cucumber-JSON report to scenario-name -> worst step status seen.
// A scenario passes only if it executed and every step passed (outline rows with the same name all
// must pass). Any failed/undefined/pending/skipped, or absence, is a failure.
const ran = new Map(); // name -> "passed" | a non-passed status
for (const feature of Array.isArray(report) ? report : []) {
  for (const el of feature.elements || []) {
    if (el.type && el.type !== "scenario") continue;
    const steps = el.steps || [];
    let status = steps.length ? "passed" : "empty";
    for (const s of steps) {
      const st = (s.result && s.result.status) || "undefined";
      if (st !== "passed") { status = st; break; }
    }
    const prev = ran.get(el.name);
    // keep the worst (non-passed wins) so a flaky/partial outline can't be credited
    ran.set(el.name, prev && prev !== "passed" ? prev : status);
  }
}

const problems = [];
for (const name of expected) {
  const st = ran.get(name);
  if (st === undefined) problems.push(`"${name}": never executed (no result in the report)`);
  else if (st !== "passed") problems.push(`"${name}": ${st} (must be passed)`);
}

if (problems.length) {
  console.error(`[check-bdd-executed] FAIL — ${problems.length} scenario(s) did not run-and-pass:`);
  for (const p of problems) console.error("  • " + p);
  process.exit(1);
}
console.log(`[check-bdd-executed] OK — all ${expected.length} datastore scenario(s) executed and passed.`);
process.exit(0);
