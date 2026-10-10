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

if (index.length === 0) fail("datastore lists zero scenarios (nothing to reconcile; fail closed).");

// Collect every executed scenario as { uri, name, status }. A scenario is "passed" only if it has
// steps and all passed (outline rows with the same name must all pass); any failed/undefined/pending/
// skipped wins. We keep the FEATURE identity (uri), not just the name — scenario names collide across
// features, and crediting by bare name would mark feature B's scenario passed because feature A's
// same-named one ran (the vacuous-green failure this gate exists to prevent).
const runs = [];
for (const feature of Array.isArray(report) ? report : []) {
  const uri = String(feature.uri || "").split("\\").join("/");
  for (const el of feature.elements || []) {
    if (el.type && el.type !== "scenario") continue;
    const steps = el.steps || [];
    let status = steps.length ? "passed" : "empty";
    for (const s of steps) {
      const st = (s.result && s.result.status) || "undefined";
      if (st !== "passed") { status = st; break; }
    }
    runs.push({ uri, name: el.name, status });
  }
}

// A report feature matches a datastore record when its uri equals, or ends with "/" + , the record's
// featuresRoot-relative path (handles "features/payments/x.feature" vs "payments/x.feature"). The "/"
// boundary avoids a false match of "banana.feature" against "a.feature".
const matchesFeature = (uri, feat) => uri === feat || uri.endsWith("/" + feat);

const problems = [];
for (const r of index) {
  const feat = String(r.feature).split("\\").join("/");
  const hits = runs.filter((x) => x.name === r.scenario && matchesFeature(x.uri, feat));
  if (hits.length === 0) problems.push(`"${r.feature} » ${r.scenario}": never executed (no result for that feature + scenario)`);
  else { const bad = hits.find((h) => h.status !== "passed"); if (bad) problems.push(`"${r.feature} » ${r.scenario}": ${bad.status} (must be passed)`); }
}
const expected = index;

if (problems.length) {
  console.error(`[check-bdd-executed] FAIL — ${problems.length} scenario(s) did not run-and-pass:`);
  for (const p of problems) console.error("  • " + p);
  process.exit(1);
}
console.log(`[check-bdd-executed] OK — all ${expected.length} datastore scenario(s) executed and passed.`);
process.exit(0);
