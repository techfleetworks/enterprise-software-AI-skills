#!/usr/bin/env node
/**
 * bdd-run - a small, dependency-free step runner that EXECUTES the .feature scenarios and emits the
 * standard Cucumber JSON report that check-bdd-executed reconciles.
 *
 * Why this exists, and why it is not @cucumber/cucumber: every gate in this repo is a dependency-free
 * Node script, and the BDD gates deliberately use the official @cucumber/gherkin PARSER as the oracle
 * (see bdd-lib.mjs) rather than pulling the full runner and its dependency tree. This runner keeps
 * that stance: it reuses the same parser to get the AST, runs the steps, and writes the SAME Cucumber
 * JSON interchange format check-bdd-executed already consumes, so the choice is swappable later for
 * @cucumber/cucumber behind that one contract with no change to the reconciler.
 *
 * Honest limit (documented): it supports the Gherkin subset these feature files use - Feature, Rule,
 * Background, Scenario, and Given/When/Then/And/But steps, with @tags. It does NOT implement Scenario
 * Outline / Examples, data tables, or doc strings; it fails closed (exit 2) if it meets one, naming
 * the file, rather than silently passing. If the suite ever needs those, swap in @cucumber/cucumber.
 *
 *   node bdd-run.mjs [featuresDir] --steps <stepsDir> [--out <cucumber.json>]
 *
 * Step definitions: each .mjs under <stepsDir> DEFAULT-exports a function that receives the registry:
 *   export default function ({ Given, When, Then, And, But, Before, After }) {
 *     Given(/^a signed-in user$/, async (world) => { world.user = ...; });
 *   }
 * Steps match on the step TEXT against every registered pattern regardless of keyword (as Cucumber
 * does); a RegExp pattern's capture groups are passed to the step function after the world object. A
 * plain-string pattern matches that text exactly.
 *
 * Exit 0 = every scenario ran and every step passed. Exit 1 = a scenario did not fully pass
 * (a failed, undefined, or skipped step). Exit 2 = fail-closed (bad args, no features, no step files,
 * a step file that could not be imported, or an unsupported Gherkin construct).
 */
import { readdirSync, writeFileSync } from "node:fs";
import { resolve, join, relative, sep } from "node:path";
import { pathToFileURL } from "node:url";
import { findFeatureFiles, parseFeature } from "./bdd-lib.mjs";

function die(msg) {
  console.error(`[bdd-run] FAIL - ${msg}`);
  process.exit(2);
}

const args = process.argv.slice(2);
function opt(name) {
  const i = args.indexOf(name);
  if (i === -1) return undefined;
  const v = args[i + 1];
  if (v === undefined || v.startsWith("--")) die(`option ${name} needs a value`);
  return v;
}
const root = resolve(args.find((a) => !a.startsWith("--")) ?? "features");
const stepsDir = resolve(opt("--steps") ?? join(root, "steps"));
const outPath = opt("--out");

// --- load step definitions ---------------------------------------------------
const stepdefs = []; // { pattern: RegExp|string, fn }
const hooks = { before: [], after: [] };
const define = (pattern, fn) => {
  if (typeof fn !== "function") die(`a step was defined without a function body: ${pattern}`);
  if (!(pattern instanceof RegExp) && typeof pattern !== "string") die(`a step pattern must be a RegExp or a string: ${String(pattern)}`);
  stepdefs.push({ pattern, fn });
};
const registry = {
  Given: define, When: define, Then: define, And: define, But: define,
  Before: (fn) => hooks.before.push(fn),
  After: (fn) => hooks.after.push(fn),
};

function stepFiles(dir) {
  let entries;
  try { entries = readdirSync(dir, { withFileTypes: true }); }
  catch { return []; }
  const out = [];
  for (const e of entries) {
    const p = join(dir, e.name);
    if (e.isDirectory()) out.push(...stepFiles(p));
    else if (e.name.endsWith(".mjs") || e.name.endsWith(".js")) out.push(p);
  }
  return out.sort();
}

const files = stepFiles(stepsDir);
if (files.length === 0) die(`no step-definition files (*.mjs) under ${stepsDir} (fail closed; a run with no steps cannot pass).`);
for (const f of files) {
  let mod;
  try { mod = await import(pathToFileURL(f).href); }
  catch (e) { die(`could not import step file ${f}: ${e.message}`); }
  if (typeof mod.default !== "function") die(`step file ${f} must default-export a function that receives the registry`);
  try { mod.default(registry); }
  catch (e) { die(`step file ${f} threw while registering steps: ${e.message}`); }
}

// --- enumerate features ------------------------------------------------------
const featureFiles = findFeatureFiles(root);
if (featureFiles.length === 0) die(`no .feature files under ${root} (zero-scan; fail closed).`);

// Collect the (scenario, steps) list from one parsed feature, prepending Background steps at the level
// they apply (feature-level background to every scenario; a rule's background to that rule's scenarios).
function scenarioRuns(doc) {
  const runs = [];
  const feature = doc.feature;
  if (!feature) return runs;
  const stepsOf = (node) => (node.steps || []).map((s) => ({ keyword: (s.keyword || "").trim(), text: s.text }));
  const featureBg = [];
  for (const c of feature.children || []) if (c.background) featureBg.push(...stepsOf(c.background));
  const addScenario = (scn, inheritedBg) => {
    if (scn.examples && scn.examples.length) die(`Scenario Outline is not supported by this minimal runner: "${scn.name}". Use plain Scenarios, or swap in @cucumber/cucumber.`);
    runs.push({ name: scn.name, steps: [...inheritedBg, ...stepsOf(scn)] });
  };
  for (const c of feature.children || []) {
    if (c.scenario) addScenario(c.scenario, featureBg);
    else if (c.rule) {
      const ruleBg = [];
      for (const rc of c.rule.children || []) if (rc.background) ruleBg.push(...stepsOf(rc.background));
      for (const rc of c.rule.children || []) if (rc.scenario) addScenario(rc.scenario, [...featureBg, ...ruleBg]);
    }
  }
  return runs;
}

// --- match + execute ---------------------------------------------------------
function match(text) {
  const hits = [];
  for (const s of stepdefs) {
    if (s.pattern instanceof RegExp) { if (s.pattern.test(text)) hits.push(s); }
    else if (s.pattern === text) hits.push(s);
  }
  return hits;
}

async function runStep(world, text) {
  const hits = match(text);
  if (hits.length === 0) return { status: "undefined" };
  if (hits.length > 1) return { status: "failed", error_message: `ambiguous step: ${hits.length} definitions match "${text}"` };
  const s = hits[0];
  const caps = s.pattern instanceof RegExp ? (s.pattern.exec(text) || []).slice(1) : [];
  try { await s.fn(world, ...caps); return { status: "passed" }; }
  catch (e) { return { status: "failed", error_message: (e && e.stack) || String(e) }; }
}

const report = [];
let anyNotPassed = false;

for (const file of featureFiles) {
  const parsed = parseFeature(file);
  if (parsed.error) die(`feature does not parse (run check-gherkin-valid first): ${file}: ${parsed.error.message}`);
  const uri = relative(root, file).split(sep).join("/");
  const elements = [];
  for (const scn of scenarioRuns(parsed.doc)) {
    const world = {};
    let aborted = false;
    for (const h of hooks.before) {
      try { await h(world); }
      catch (e) { aborted = true; elements.push({ type: "scenario", name: scn.name, steps: [{ keyword: "Before", name: "hook", result: { status: "failed", error_message: (e && e.stack) || String(e) } }] }); break; }
    }
    if (aborted) { anyNotPassed = true; continue; }

    const steps = [];
    let failed = false;
    for (const st of scn.steps) {
      if (failed) { steps.push({ keyword: st.keyword + " ", name: st.text, result: { status: "skipped" } }); continue; }
      const result = await runStep(world, st.text);
      if (result.status !== "passed") failed = true;
      steps.push({ keyword: st.keyword + " ", name: st.text, result });
    }
    for (const h of hooks.after) { try { await h(world); } catch { /* after-hook errors do not un-pass a scenario here */ } }
    if (failed || steps.length === 0) anyNotPassed = true;
    elements.push({ type: "scenario", name: scn.name, steps });
  }
  report.push({ uri, name: (parsed.doc.feature && parsed.doc.feature.name) || uri, elements });
}

const json = JSON.stringify(report, null, 2) + "\n";
if (outPath) { writeFileSync(resolve(outPath), json); }
else { process.stdout.write(json); }

const scenarioCount = report.reduce((n, f) => n + f.elements.length, 0);
if (anyNotPassed) {
  // Name the failing scenario(s) and step(s) on stderr, not only in the report file: a CI run that does not upload
  // the report still shows WHICH scenario broke, so a green-local/red-CI split is debuggable from the log alone.
  for (const f of report) {
    for (const el of f.elements) {
      const bad = (el.steps || []).find((s) => s.result && s.result.status !== "passed" && s.result.status !== "skipped");
      if (bad) console.error(`[bdd-run]   FAIL: "${el.name}" at step "${(bad.keyword || "").trim()} ${bad.name}" -> ${(bad.result.error_message || bad.result.status || "").split(/\r?\n/)[0]}`);
    }
  }
  console.error(`[bdd-run] FAIL - some scenario did not fully pass (${scenarioCount} scenario(s) across ${report.length} feature(s)). See the report${outPath ? ` at ${outPath}` : ""}.`);
  process.exit(1);
}
console.error(`[bdd-run] OK - ${scenarioCount} scenario(s) across ${report.length} feature(s) ran and every step passed.`);
process.exit(0);
