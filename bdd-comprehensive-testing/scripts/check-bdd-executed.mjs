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

// Attribute each run to the MOST SPECIFIC datastore feature it matches. A report uri matches a
// datastore feature path when it equals it, or ends with "/" + it (handles "features/payments/x.feature"
// vs "payments/x.feature"; the "/" boundary rejects "banana.feature" vs "a.feature"). Longest match
// wins, so a run of "sub/a.feature" credits "sub/a.feature" and NOT a shallower "a.feature" — a plain
// suffix match would let the deeper feature's run credit the shallower same-basename one (false green).
const feats = [...new Set(index.map((r) => String(r.feature).split("\\").join("/")))]
  .sort((a, b) => b.length - a.length);
const attribute = (uri) => feats.find((f) => uri === f || uri.endsWith("/" + f)) ?? null;

const ran = new Map(); // "feat::scenario" -> worst status seen (non-passed wins)
for (const x of runs) {
  const feat = attribute(x.uri);
  if (!feat) continue; // a run for a feature not in the datastore — not our concern
  const key = feat + "::" + x.name;
  const prev = ran.get(key);
  ran.set(key, prev && prev !== "passed" ? prev : x.status);
}

const problems = [];
for (const r of index) {
  const key = String(r.feature).split("\\").join("/") + "::" + r.scenario;
  const st = ran.get(key);
  if (st === undefined) problems.push(`"${r.feature} » ${r.scenario}": never executed (no result for that feature + scenario)`);
  else if (st !== "passed") problems.push(`"${r.feature} » ${r.scenario}": ${st} (must be passed)`);
}

if (problems.length) {
  console.error(`[check-bdd-executed] FAIL — ${problems.length} scenario(s) did not run-and-pass:`);
  for (const p of problems) console.error("  • " + p);
  process.exit(1);
}
console.log(`[check-bdd-executed] OK — all ${index.length} datastore scenario(s) executed and passed.`);
process.exit(0);
