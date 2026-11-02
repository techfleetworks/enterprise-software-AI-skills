// Discriminating tests for bdd-run.mjs (the dependency-free step runner, issue #178). Each builds a
// throwaway features/ + steps/ dir, runs the REAL runner, and asserts the exit code and the emitted
// Cucumber JSON - including the failing cases (a throwing step, an undefined step) that a no-op runner
// could not report, which is what makes the runner's own result trustworthy.
import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const REPO = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const RUN = resolve(REPO, ".claude/skills/bdd-comprehensive-testing/scripts/bdd-run.mjs");

// Build a features dir with one feature and one step file (its JS body as text). Returns paths.
function scaffold(featureText, stepsBody) {
  const root = mkdtempSync(join(tmpdir(), "bddrun-"));
  mkdirSync(join(root, "d"), { recursive: true });
  mkdirSync(join(root, "steps"), { recursive: true });
  writeFileSync(join(root, "d", "f.feature"), featureText);
  if (stepsBody !== null) writeFileSync(join(root, "steps", "s.steps.mjs"), stepsBody);
  return root;
}
function run(root, extra = []) {
  const out = join(root, "cucumber.json");
  const r = spawnSync(process.execPath, [RUN, root, "--steps", join(root, "steps"), "--out", out, ...extra], { encoding: "utf8" });
  let report = null;
  try { report = JSON.parse(readFileSync(out, "utf8")); } catch { /* may not exist on fail-closed */ }
  return { status: r.status, out: (r.stdout || "") + (r.stderr || ""), report };
}
const steps = (body) => `export default function ({ Given, When, Then, And, But }) {\n${body}\n}`;

const PASS_FEATURE = `Feature: T\n  Scenario: ok\n    Given a\n    When b\n    Then c\n`;
const PASS_STEPS = steps(`Given(/^a$/, () => {}); When(/^b$/, () => {}); Then(/^c$/, () => {});`);

test("passing scenario: runner exits 0 and every step is passed", () => {
  const r = run(scaffold(PASS_FEATURE, PASS_STEPS));
  assert.equal(r.status, 0, r.out);
  const statuses = r.report[0].elements[0].steps.map((s) => s.result.status);
  assert.deepEqual(statuses, ["passed", "passed", "passed"]);
});

test("a throwing step is reported failed and the runner exits 1 (discriminating)", () => {
  const body = `Given(/^a$/, () => {}); When(/^b$/, () => { throw new Error("boom"); }); Then(/^c$/, () => {});`;
  const r = run(scaffold(PASS_FEATURE, steps(body)));
  assert.equal(r.status, 1, r.out);
  const st = r.report[0].elements[0].steps.map((s) => s.result.status);
  assert.deepEqual(st, ["passed", "failed", "skipped"], "the failed step must stop the scenario and skip the rest");
});

test("an undefined step is reported undefined and the runner exits 1 (discriminating)", () => {
  const body = `Given(/^a$/, () => {}); Then(/^c$/, () => {});`; // no def for "b"
  const r = run(scaffold(PASS_FEATURE, steps(body)));
  assert.equal(r.status, 1, r.out);
  const st = r.report[0].elements[0].steps.map((s) => s.result.status);
  assert.deepEqual(st, ["passed", "undefined", "skipped"]);
});

test("Background steps run before each scenario", () => {
  const feature = `Feature: T\n  Background:\n    Given a\n  Scenario: ok\n    Then c\n`;
  const body = `let seen=false; Given(/^a$/, (w) => { w.a=true; }); Then(/^c$/, (w) => { if(!w.a) throw new Error("bg did not run"); });`;
  const r = run(scaffold(feature, steps(body)));
  assert.equal(r.status, 0, r.out);
});

test("RegExp capture groups are passed to the step function", () => {
  const feature = `Feature: T\n  Scenario: ok\n    Given the number 42\n`;
  const body = `Given(/^the number (\\d+)$/, (w, n) => { if (n !== "42") throw new Error("bad capture: " + n); });`;
  const r = run(scaffold(feature, steps(body)));
  assert.equal(r.status, 0, r.out);
});

test("fail-closed: no feature files", () => {
  const root = mkdtempSync(join(tmpdir(), "bddrun-"));
  mkdirSync(join(root, "steps"), { recursive: true });
  writeFileSync(join(root, "steps", "s.steps.mjs"), PASS_STEPS);
  const r = run(root);
  assert.equal(r.status, 2, r.out);
});

test("fail-closed: no step files", () => {
  const r = run(scaffold(PASS_FEATURE, null));
  assert.equal(r.status, 2, r.out);
});

test("fail-closed: a step file with no default-exported function", () => {
  const r = run(scaffold(PASS_FEATURE, `export const x = 1;`));
  assert.equal(r.status, 2, r.out);
});

// --- Scenario Outline (ADR-0106): one run per Examples row, <column> filled from the row ---
const OUTLINE = `Feature: T\n  Background:\n    Given a\n  Scenario Outline: o\n    Given the value <n> and <m>\n\n    Examples:\n      | n | m |\n      | 1 | x |\n      | 2 | y |\n\n    Examples:\n      | n | m |\n      | 3 | z |\n`;

test("a Scenario Outline runs once per Examples row, across every Examples block, with <column> filled in", () => {
  const body = `Given(/^a$/, () => {}); Given(/^the value (\\d) and ([a-z])$/, (w, n, m) => { (globalThis.seen ||= []).push(n + m); });`;
  const r = run(scaffold(OUTLINE, steps(body)));
  assert.equal(r.status, 0, r.out);
  const els = r.report[0].elements;
  assert.equal(els.length, 3, "three rows -> three runs");
  assert.deepEqual(els.map((e) => e.name), ["o", "o", "o"], "every row keeps the outline's name");
  assert.deepEqual(els.map((e) => e.steps.map((s) => s.name)), [["a", "the value 1 and x"], ["a", "the value 2 and y"], ["a", "the value 3 and z"]]);
});

test("one failing Examples row fails the run (exit 1) and the other rows still run (discriminating)", () => {
  const body = `Given(/^a$/, () => {}); Given(/^the value (\\d) and ([a-z])$/, (w, n) => { if (n === "2") throw new Error("row 2 fails"); });`;
  const r = run(scaffold(OUTLINE, steps(body)));
  assert.equal(r.status, 1, r.out);
  const st = r.report[0].elements.map((e) => e.steps[1].result.status);
  assert.deepEqual(st, ["passed", "failed", "passed"]);
});

test("a placeholder no row fills stays in the text, so its step is undefined, not passed (discriminating)", () => {
  const feature = `Feature: T\n  Scenario Outline: o\n    Given the value <missing>\n\n    Examples:\n      | n |\n      | 1 |\n`;
  const r = run(scaffold(feature, steps(`Given(/^the value 1$/, () => {});`)));
  assert.equal(r.status, 1, r.out);
  assert.equal(r.report[0].elements[0].steps[0].result.status, "undefined");
});

test("placeholders are filled in one pass: a cell that looks like another column is kept as written", () => {
  const feature = `Feature: T\n  Scenario Outline: o\n    Given the value <n> and <m>\n\n    Examples:\n      | n   | m |\n      | <m> | y |\n`;
  const r = run(scaffold(feature, steps(`Given(/^the value <m> and y$/, () => {});`)));
  assert.equal(r.status, 0, r.out);
});

test("fail-closed: an Examples block with a header and no rows is named, not silently passed", () => {
  const feature = `Feature: T\n  Scenario Outline: o\n    Given <n>\n\n    Examples:\n      | n |\n`;
  const r = run(scaffold(feature, PASS_STEPS));
  assert.equal(r.status, 2, r.out);
  assert.match(r.out, /no header or no rows/);
});
