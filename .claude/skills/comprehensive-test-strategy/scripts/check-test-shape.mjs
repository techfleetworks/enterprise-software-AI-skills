#!/usr/bin/env node
/**
 * check-test-shape - fail when the test suite drifts off the pyramid (the ice-cream-cone anti-pattern).
 *
 * The structural half of comprehensive-test-strategy's pyramid rule (references/test-pyramid-and-types.md):
 * "many unit, some integration, few e2e; invert it and you get a slow, flaky suite nobody trusts." This
 * gate reads a test report, classifies each test into a layer, and fails if the shape is wrong - so the
 * pyramid is enforced by measurement, not left to vigilance. Dependency-free (Node built-ins).
 *
 *   node check-test-shape.mjs --report <junit.xml> --config <test-shape.json>
 *
 * It reads JUnit XML (the near-universal report format - most runners emit it directly or via a
 * reporter). Each <testcase classname="..." name="..." time="..."> is classified into the FIRST layer
 * whose patterns match its classname (then name). A pattern with `*` is a glob; otherwise a
 * case-insensitive substring.
 *
 * Config (all keys except `layers` optional):
 *   {
 *     "layers": { "unit": ["*.unit.*","/unit/"], "integration": ["/integration/"], "e2e": ["/e2e/"] },
 *     "minShare": { "unit": 0.6 },          // unit must be >= 60% of CLASSIFIED tests
 *     "maxShare": { "e2e": 0.15 },          // e2e must be <= 15%
 *     "requirePyramid": true,               // counts non-increasing down `layers` (which is BASE→TOP)
 *     "maxUnclassifiedShare": 0.2,          // untagged cap; DEFAULTS to 0.2 when any threshold is set
 *     "maxTotalSeconds": { "e2e": 600 }     // optional runtime cap on a layer's summed time
 *   }
 * `layers` is ordered BASE→TOP (unit first, e2e last) - `requirePyramid` reads that order, so it works
 * for any layer names, not just unit/integration/e2e. `maxUnclassifiedShare` can't be silently absent:
 * if you set any shape threshold, it defaults to 0.2 (so a verdict is never rendered on a tiny
 * classified sample while most tests are untagged).
 *
 * Exit 0 = the shape is within thresholds. 1 = a threshold is breached. 2 = bad usage / unreadable /
 * unparseable report / zero tests (fail closed - an unmeasurable suite is not a passing suite).
 */
import { readFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";

function die(msg) { console.error(`[check-test-shape] FAIL - ${msg}`); process.exit(2); }

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
// Strip XML comments and CDATA first, so a commented-out block of <testcase> lines (or testcase-like text in a
// system-out CDATA section) is NOT counted as real tests - otherwise a commented ice-cream cone reads as a
// healthy pyramid. Content the parser would ignore must not move the pass/fail boundary.
const xml = readFileSync(resolve(reportPath), "utf8")
  .replace(/<!--[\s\S]*?-->/g, "")
  .replace(/<!\[CDATA\[[\s\S]*?\]\]>/g, "");
const attr = (tagAttrs, name) => { const m = tagAttrs.match(new RegExp(`\\b${name}\\s*=\\s*"([^"]*)"`, "i")); return m ? m[1] : ""; };
// Quote-aware: a literal '>' is legal inside an XML attribute value, so don't stop at the first '>'.
// Capture the attribute run, allowing '>' only inside quotes, else a `classname="a>b"` truncates the
// tag and the test is silently dropped to unclassified (moving the pass/fail boundary).
const cases = [...xml.matchAll(/<testcase\b((?:[^>"']|"[^"]*"|'[^']*')*)\/?>/gi)].map((m) => m[1]);
if (cases.length === 0) die("no <testcase> entries in the report (zero tests - fail closed)");

const counts = {}; // layer -> count
const seconds = {}; // layer -> summed time
let unclassified = 0;
for (const tagAttrs of cases) {
  const key = attr(tagAttrs, "classname") || attr(tagAttrs, "name") || attr(tagAttrs, "file");
  const layer = classify(key);
  if (!layer) { unclassified++; continue; }
  counts[layer] = (counts[layer] || 0) + 1;
  seconds[layer] = (seconds[layer] || 0) + (parseFloat(attr(tagAttrs, "time")) || 0);
}
const classified = Object.values(counts).reduce((a, b) => a + b, 0);
const total = classified + unclassified;
const share = (layer) => (classified ? (counts[layer] || 0) / classified : 0);

// --- apply thresholds --------------------------------------------------------
const pct = (x) => (x * 100).toFixed(1) + "%";
const problems = [];

// The gate's integrity depends on most tests being classifiable: if too many are untagged, a verdict
// computed on the small classified remainder is unrepresentative (a 9-untagged/1-unit suite would show
// unit=100%). So when ANY shape threshold is configured, apply a default unclassified cap (0.2) unless
// the author set their own - the guard can't be silently absent. With no thresholds at all, there is
// nothing to protect, so no cap is applied.
const anyShapeThreshold =
  (cfg.minShare && Object.keys(cfg.minShare).length) ||
  (cfg.maxShare && Object.keys(cfg.maxShare).length) ||
  !!cfg.requirePyramid ||
  (cfg.maxTotalSeconds && Object.keys(cfg.maxTotalSeconds).length);
const unclCap = cfg.maxUnclassifiedShare != null ? cfg.maxUnclassifiedShare : (anyShapeThreshold ? 0.2 : null);
const unclShare = total ? unclassified / total : 0;
if (unclCap != null && unclShare > unclCap) {
  const dflt = cfg.maxUnclassifiedShare == null ? " (default; set maxUnclassifiedShare to override)" : "";
  problems.push(`${pct(unclShare)} of tests (${unclassified}/${total}) matched no layer - over the ${pct(unclCap)} cap${dflt}; the shape can't be assessed (tag them or widen layer patterns)`);
}
if (classified === 0) problems.push("no tests matched any layer - cannot assess the pyramid (fail closed)");

for (const [layer, min] of Object.entries(cfg.minShare || {})) {
  if (share(layer) < min) problems.push(`${layer} is ${pct(share(layer))} of classified tests - below the ${pct(min)} floor (base too small / inverted pyramid)`);
}
for (const [layer, max] of Object.entries(cfg.maxShare || {})) {
  if (share(layer) > max) problems.push(`${layer} is ${pct(share(layer))} of classified tests - above the ${pct(max)} cap (too top-heavy - ice-cream cone)`);
}
if (cfg.requirePyramid) {
  // Order is DECLARED by the config: `layers` is listed base→top, and counts must be non-increasing
  // down that list. Deriving it from the declared layers (not hardcoded unit/integration/e2e) keeps the
  // gate config-driven - otherwise a repo whose layers are named differently gets `0>=0>=0` = silent pass.
  const order = Object.keys(cfg.layers);
  let prev = Infinity, ok = true;
  const shown = order.map((l) => { const c = counts[l] || 0; if (c > prev) ok = false; prev = c; return `${l}(${c})`; });
  if (!ok) problems.push(`pyramid order violated: counts must be non-increasing base→top (config order), got ${shown.join(" >= ")}`);
}
for (const [layer, cap] of Object.entries(cfg.maxTotalSeconds || {})) {
  if ((seconds[layer] || 0) > cap) problems.push(`${layer} tests take ${(seconds[layer] || 0).toFixed(1)}s total - over the ${cap}s cap`);
}

const summary = layerMatchers.map(([l]) => `${l}=${counts[l] || 0} (${pct(share(l))})`).join(", ") +
  (unclassified ? `, unclassified=${unclassified}` : "");

if (problems.length) {
  console.error(`[check-test-shape] FAIL - ${problems.length} issue(s). Shape: ${summary}`);
  for (const p of problems) console.error(`  • ${p}`);
  console.error(`\nPush tests DOWN the pyramid (references/test-pyramid-and-types.md): cover each behavior at the lowest layer that proves it.`);
  process.exit(1);
}
// Disclose honestly: with no shape threshold configured, only classification ran - the pyramid was NOT
// enforced, so "on-pyramid" would overclaim. Say exactly what was checked (like the review-coverage gate).
const verdict = anyShapeThreshold
  ? `${total} test(s) on-pyramid. Shape: ${summary}`
  : `${total} test(s) classified. Shape: ${summary}. No shape threshold configured, so the pyramid was NOT enforced (set minShare / maxShare / requirePyramid / maxTotalSeconds to enforce it).`;
console.log(`[check-test-shape] OK - ${verdict}`);
process.exit(0);
