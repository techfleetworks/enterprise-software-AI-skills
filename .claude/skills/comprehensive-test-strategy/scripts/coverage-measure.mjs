#!/usr/bin/env node
// coverage-measure - measure the t-way combination coverage of a set of test rows (a covering-array check).
//
//   node coverage-measure.mjs <plan.json> [--strength t]
//
// It answers the combinatorial-testing question "what share of the t-way value combinations does this test set
// actually cover?" (see references/combinatorial-testing.md). A hand-picked grid usually covers far less than a
// covering array of the same strength, and this is how you measure and report that share instead of assuming it.
//
// plan.json:
//   {
//     "factors":  { "os": ["win","mac","linux"], "auth": ["pw","sso"], "role": ["admin","user"] },
//     "strength": 2,
//     "rows":     [ { "os": "win", "auth": "pw", "role": "admin" }, ... ],
//     "constraints": [ { "os": "linux", "auth": "sso" } ]   // optional: value combinations that cannot occur
//   }
// --strength overrides the plan's strength. Every row must assign a declared value to every factor.
// A listed constraint (a partial assignment that cannot occur) is removed from the target set, so a covering
// array is not penalized for a combination the system forbids.
//
// Exit codes:
//   0 = every targetable t-way combination is covered (a covering array of strength t).
//   1 = some t-way combinations are uncovered (the share and a sample of the gaps are printed).
//   2 = fail closed: bad usage, an unreadable or invalid plan, a strength out of range, zero rows,
//       zero factors, a factor with no values, or a row with a missing or undeclared value.

import { readFileSync } from "node:fs";

const USAGE =
  "usage: node coverage-measure.mjs <plan.json> [--strength t]\n" +
  "  reports the share of t-way combinations the rows cover; exits 1 when any are uncovered.";

const argv = process.argv.slice(2);
if (argv.includes("-h") || argv.includes("--help")) { console.log(USAGE); process.exit(0); }

let strengthOverride;
const rest = [];
for (let i = 0; i < argv.length; i++) {
  const a = argv[i];
  if (a === "--strength") {
    const v = argv[++i];
    if (v === undefined || !/^\d+$/.test(v)) { console.error(`coverage-measure: --strength needs a whole number\n${USAGE}`); process.exit(2); }
    strengthOverride = Number(v);
  } else if (a.startsWith("--strength=")) {
    const v = a.slice("--strength=".length);
    if (!/^\d+$/.test(v)) { console.error(`coverage-measure: --strength needs a whole number\n${USAGE}`); process.exit(2); }
    strengthOverride = Number(v);
  } else if (a.startsWith("--")) {
    console.error(`coverage-measure: unknown flag: ${a}\n${USAGE}`); process.exit(2);
  } else {
    rest.push(a);
  }
}

const file = rest[0];
if (!file) { console.error(USAGE); process.exit(2); }

const fail = (msg) => { console.error(`coverage-measure: ${msg}`); process.exit(2); };

let plan;
try { plan = JSON.parse(readFileSync(file, "utf8")); }
catch (e) { fail(`cannot read or parse ${file}: ${e.message}`); }

const factors = plan.factors;
if (!factors || typeof factors !== "object" || Array.isArray(factors)) fail("plan.factors must be an object of factor -> [values]");
const names = Object.keys(factors);
if (names.length === 0) fail("plan.factors is empty (need at least one factor)");
for (const n of names) {
  if (!Array.isArray(factors[n]) || factors[n].length === 0) fail(`factor "${n}" must have a non-empty array of values`);
}

const t = strengthOverride ?? plan.strength;
if (!Number.isInteger(t) || t < 1) fail(`strength must be a whole number >= 1 (got ${JSON.stringify(t)})`);
if (t > names.length) fail(`strength ${t} is greater than the number of factors (${names.length})`);

const rows = plan.rows;
if (!Array.isArray(rows) || rows.length === 0) fail("plan.rows must be a non-empty array");
rows.forEach((r, idx) => {
  if (!r || typeof r !== "object") fail(`row ${idx} is not an object`);
  for (const n of names) {
    if (!(n in r)) fail(`row ${idx} is missing factor "${n}"`);
    if (!factors[n].includes(r[n])) fail(`row ${idx} has undeclared value ${JSON.stringify(r[n])} for factor "${n}"`);
  }
});

// Constraints get the same strict validation as rows: a present-but-malformed constraints list (not an array,
// an element that is not a non-empty object, or an undeclared factor/value) fails closed rather than being
// silently ignored, so a typo cannot quietly drop an intended exclusion or shrink the denominator.
let constraints = [];
if (plan.constraints !== undefined && plan.constraints !== null) {
  if (!Array.isArray(plan.constraints)) fail("plan.constraints must be an array of {factor: value} objects");
  plan.constraints.forEach((c, idx) => {
    if (!c || typeof c !== "object" || Array.isArray(c) || Object.keys(c).length === 0) fail(`constraint ${idx} must be a non-empty object of factor -> value`);
    for (const [n, v] of Object.entries(c)) {
      if (!names.includes(n)) fail(`constraint ${idx} names undeclared factor "${n}"`);
      if (!factors[n].includes(v)) fail(`constraint ${idx} has undeclared value ${JSON.stringify(v)} for factor "${n}"`);
    }
  });
  constraints = plan.constraints;
}

// t-subsets of the factor names.
function combinations(arr, k) {
  if (k === 0) return [[]];
  if (k > arr.length) return [];
  const out = [];
  const rec = (start, pick) => {
    if (pick.length === k) { out.push(pick.slice()); return; }
    for (let i = start; i < arr.length; i++) { pick.push(arr[i]); rec(i + 1, pick); pick.pop(); }
  };
  rec(0, []);
  return out;
}
// Cartesian product of the value lists for a set of factors, as assignment maps.
function product(factorSet) {
  let acc = [{}];
  for (const n of factorSet) {
    const next = [];
    for (const partial of acc) for (const v of factors[n]) next.push({ ...partial, [n]: v });
    acc = next;
  }
  return acc;
}
// A target is forbidden if it is a superset of any constraint (all of a constraint's factor:value pairs match).
function forbidden(target) {
  return constraints.some((c) =>
    c && typeof c === "object" && Object.keys(c).length > 0 &&
    Object.entries(c).every(([n, v]) => target[n] === v),
  );
}
// JSON.stringify the value so distinct value classes that stringify alike (1 vs "1", true vs "true") stay
// distinct; a plain template would collapse them and count a row as covering a class no row actually covers.
const key = (m) => Object.keys(m).sort().map((n) => `${n}=${JSON.stringify(m[n])}`).join("&");
const rowCovers = new Set();
for (const subset of combinations(names, t)) {
  for (const r of rows) {
    const proj = {}; for (const n of subset) proj[n] = r[n];
    rowCovers.add(key(proj));
  }
}

let total = 0, covered = 0;
const gaps = [];
for (const subset of combinations(names, t)) {
  for (const target of product(subset)) {
    if (forbidden(target)) continue;
    total += 1;
    if (rowCovers.has(key(target))) covered += 1;
    else if (gaps.length < 10) gaps.push(key(target));
  }
}

if (total === 0) fail("no targetable combinations (every combination is excluded by constraints)");

const share = covered / total;
const pct = (share * 100).toFixed(1);
console.log(`coverage-measure: strength ${t}, ${names.length} factor(s) [${names.join(", ")}], ${rows.length} row(s)`);
console.log(`coverage-measure: ${covered} of ${total} ${t}-way combinations covered (${pct}%)`);
if (covered < total) {
  console.log(`coverage-measure: ${total - covered} uncovered; sample: ${gaps.join("; ")}`);
  process.exit(1);
}
console.log(`coverage-measure: full ${t}-way coverage (a covering array of strength ${t}).`);
process.exit(0);
