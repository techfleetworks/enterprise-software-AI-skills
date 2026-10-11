#!/usr/bin/env node
/**
 * check-test-shape — fail when the test suite drifts off the pyramid (the ice-cream-cone anti-pattern).
 *
 * The structural half of comprehensive-test-strategy's pyramid rule (references/test-pyramid-and-types.md):
 * "many unit, some integration, few e2e; invert it and you get a slow, flaky suite nobody trusts." This
 * gate reads a test report, classifies each test into a layer, and fails if the shape is wrong — so the
 * pyramid is enforced by measurement, not left to vigilance. Dependency-free (Node built-ins).
 *
 *   node check-test-shape.mjs --report <junit.xml> --config <test-shape.json>
 *
 * It reads JUnit XML (the near-universal report format — most runners emit it directly or via a
 * reporter). Each <testcase classname="..." name="..." time="..."> is classified into the FIRST layer
 * whose patterns match its classname (then name). A pattern with `*` is a glob; otherwise a
 * case-insensitive substring.
 *
 * Config (all keys except `layers` optional):
 *   {
 *     "layers": { "unit": ["*.unit.*","/unit/"], "integration": ["/integration/"], "e2e": ["/e2e/"] },
 *     "minShare": { "unit": 0.6 },          // unit must be >= 60% of CLASSIFIED tests
 *     "maxShare": { "e2e": 0.15 },          // e2e must be <= 15%
 *     "requirePyramid": true,               // count(unit) >= count(integration) >= count(e2e)
 *     "maxUnclassifiedShare": 0.2,          // too many untagged tests -> can't assess -> fail
 *     "maxTotalSeconds": { "e2e": 600 }     // optional runtime cap on a layer's summed time
 *   }
 *
 * Exit 0 = the shape is within thresholds. 1 = a threshold is breached. 2 = bad usage / unreadable /
 * unparseable report / zero tests (fail closed — an unmeasurable suite is not a passing suite).
 */
import { readFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";

function die(msg) { console.error(`[check-test-shape] FAIL — ${msg}`); process.exit(2); }

const args = process.argv.slice(2);
const opt = (n) => { const i = args.indexOf(n); return i >= 0 ? args[i + 1] : undefined; };
const reportPath = opt("--report");
const configPath = opt("--config");
if (!reportPath) die("missing --report <junit.xml>");
if (!configPath) die("missing --config <test-shape.json>");

for (const [label, p] of [["report", reportPath], ["config", configPath]]) {
  if (!existsSync(resolve(p))) die(`${label} not found: ${p}`);
}
let cfg;
try { cfg = JSON.parse(readFileSync(resolve(configPath), "utf8")); }
catch (e) { die(`config is not valid JSON (${e.message})`); }
if (!cfg.layers || typeof cfg.layers !== "object" || !Object.keys(cfg.layers).length) {
  die(`config needs a non-empty "layers" map (e.g. {"unit":["/unit/"],"e2e":["/e2e/"]})`);
}

// --- glob/substr matcher -----------------------------------------------------
function toMatcher(pattern) {
  if (pattern.includes("*")) {
    const re = "^" + pattern.split("*").map((s) => s.replace(/[.+^${}()|[\]\\]/g, "\\$&")).join(".*") + "$";
    const rx = new RegExp(re, "i");
    return (s) => rx.test(s);
  }
  const needle = pattern.toLowerCase();
  return (s) => s.toLowerCase().includes(needle);
}
const layerMatchers = Object.entries(cfg.layers).map(([layer, pats]) => {
  if (!Array.isArray(pats) || !pats.length) die(`layer "${layer}" needs a non-empty array of patterns`);
  return [layer, pats.map(toMatcher)];
});
const classify = (key) => {
  for (const [layer, ms] of layerMatchers) if (ms.some((m) => m(key))) return layer;
  return null;
};

// --- parse JUnit testcases ---------------------------------------------------
const xml = readFileSync(resolve(reportPath), "utf8");
const attr = (tag, name) => { const m = tag.match(new RegExp(`\\b${name}\\s*=\\s*"([^"]*)"`, "i")); return m ? m[1] : ""; };
const cases = xml.match(/<testcase\b[^>]*?\/?>/gi) || [];
if (cases.length === 0) die("no <testcase> entries in the report (zero tests — fail closed)");

const counts = {}; // layer -> count
const seconds = {}; // layer -> summed time
let unclassified = 0;
for (const tag of cases) {
  const key = attr(tag, "classname") || attr(tag, "name") || attr(tag, "file");
  const layer = classify(key);
  if (!layer) { unclassified++; continue; }
  counts[layer] = (counts[layer] || 0) + 1;
  seconds[layer] = (seconds[layer] || 0) + (parseFloat(attr(tag, "time")) || 0);
}
const classified = Object.values(counts).reduce((a, b) => a + b, 0);
const total = classified + unclassified;
const share = (layer) => (classified ? (counts[layer] || 0) / classified : 0);

// --- apply thresholds --------------------------------------------------------
const pct = (x) => (x * 100).toFixed(1) + "%";
const problems = [];

const unclShare = total ? unclassified / total : 0;
if (cfg.maxUnclassifiedShare != null && unclShare > cfg.maxUnclassifiedShare) {
  problems.push(`${pct(unclShare)} of tests (${unclassified}/${total}) matched no layer — over the ${pct(cfg.maxUnclassifiedShare)} cap; the shape can't be assessed (tag them or widen layer patterns)`);
}
if (classified === 0) problems.push("no tests matched any layer — cannot assess the pyramid (fail closed)");

for (const [layer, min] of Object.entries(cfg.minShare || {})) {
  if (share(layer) < min) problems.push(`${layer} is ${pct(share(layer))} of classified tests — below the ${pct(min)} floor (base too small / inverted pyramid)`);
}
for (const [layer, max] of Object.entries(cfg.maxShare || {})) {
  if (share(layer) > max) problems.push(`${layer} is ${pct(share(layer))} of classified tests — above the ${pct(max)} cap (too top-heavy — ice-cream cone)`);
}
if (cfg.requirePyramid) {
  const u = counts.unit || 0, i = counts.integration || 0, e = counts.e2e || 0;
  if (!(u >= i && i >= e)) problems.push(`pyramid order violated: unit(${u}) >= integration(${i}) >= e2e(${e}) is false`);
}
for (const [layer, cap] of Object.entries(cfg.maxTotalSeconds || {})) {
  if ((seconds[layer] || 0) > cap) problems.push(`${layer} tests take ${(seconds[layer] || 0).toFixed(1)}s total — over the ${cap}s cap`);
}

const summary = layerMatchers.map(([l]) => `${l}=${counts[l] || 0} (${pct(share(l))})`).join(", ") +
  (unclassified ? `, unclassified=${unclassified}` : "");

if (problems.length) {
  console.error(`[check-test-shape] FAIL — ${problems.length} issue(s). Shape: ${summary}`);
  for (const p of problems) console.error(`  • ${p}`);
  console.error(`\nPush tests DOWN the pyramid (references/test-pyramid-and-types.md): cover each behavior at the lowest layer that proves it.`);
  process.exit(1);
}
console.log(`[check-test-shape] OK — ${total} test(s) on-pyramid. Shape: ${summary}`);
process.exit(0);
