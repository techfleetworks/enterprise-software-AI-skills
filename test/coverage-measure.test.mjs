// Discriminating tests for .claude/skills/comprehensive-test-strategy/scripts/coverage-measure.mjs
//
// The load-bearing case: a hand-picked grid reports LESS than full t-way coverage (exit 1), while a real
// covering array reports full coverage (exit 0). A no-op that always exits 0 flips the partial-grid case.
import { test } from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { writeFileSync, mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const REPO = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const CHECK = resolve(REPO, ".claude/skills/comprehensive-test-strategy/scripts/coverage-measure.mjs");
const F = { A: [0, 1], B: [0, 1], C: [0, 1] };

function run(plan, extra = []) {
  const dir = mkdtempSync(join(tmpdir(), "coverage-measure-"));
  const file = join(dir, "plan.json");
  writeFileSync(file, typeof plan === "string" ? plan : JSON.stringify(plan));
  try {
    const out = execFileSync(process.execPath, [CHECK, file, ...extra], { stdio: "pipe", encoding: "utf8" });
    return { code: 0, out };
  } catch (e) {
    return { code: e.status ?? 1, out: (e.stdout || "") + (e.stderr || "") };
  }
}

test("a full pairwise covering array reports 100% (exit 0)", () => {
  const r = run({ factors: F, strength: 2, rows: [
    { A: 0, B: 0, C: 0 }, { A: 0, B: 1, C: 1 }, { A: 1, B: 0, C: 1 }, { A: 1, B: 1, C: 0 },
  ] });
  assert.equal(r.code, 0, r.out);
  assert.match(r.out, /12 of 12/);
});

test("a hand-picked diagonal grid reports less than full coverage (exit 1) - discriminating", () => {
  const r = run({ factors: F, strength: 2, rows: [{ A: 0, B: 0, C: 0 }, { A: 1, B: 1, C: 1 }] });
  assert.equal(r.code, 1, r.out);
  assert.match(r.out, /6 of 12/);
});

test("a constraint is removed from the target set, so a forbidden pair is not counted", () => {
  // {A:0,B:0} is forbidden, so the AB pair (0,0) drops: 11 targetable pairs, all covered by these 5 rows.
  const r = run({ factors: F, strength: 2, constraints: [{ A: 0, B: 0 }], rows: [
    { A: 0, B: 1, C: 0 }, { A: 0, B: 1, C: 1 }, { A: 1, B: 0, C: 0 }, { A: 1, B: 1, C: 1 }, { A: 1, B: 0, C: 1 },
  ] });
  assert.equal(r.code, 0, r.out);
  assert.match(r.out, /11 of 11/);
});

test("--strength overrides the plan (3-way on a pairwise array is incomplete, exit 1)", () => {
  const r = run({ factors: F, strength: 2, rows: [
    { A: 0, B: 0, C: 0 }, { A: 0, B: 1, C: 1 }, { A: 1, B: 0, C: 1 }, { A: 1, B: 1, C: 0 },
  ] }, ["--strength", "3"]);
  assert.equal(r.code, 1, r.out);
  assert.match(r.out, /of 8/);
});

test("a row with an undeclared value fails closed (exit 2)", () => {
  assert.equal(run({ factors: F, strength: 2, rows: [{ A: 0, B: 0, C: 9 }] }).code, 2);
});

test("a row missing a factor fails closed (exit 2)", () => {
  assert.equal(run({ factors: F, strength: 2, rows: [{ A: 0, B: 0 }] }).code, 2);
});

test("strength greater than the number of factors fails closed (exit 2)", () => {
  assert.equal(run({ factors: F, strength: 5, rows: [{ A: 0, B: 0, C: 0 }] }).code, 2);
});

test("zero rows fails closed (exit 2)", () => {
  assert.equal(run({ factors: F, strength: 2, rows: [] }).code, 2);
});

test("empty factors fails closed (exit 2)", () => {
  assert.equal(run({ factors: {}, strength: 1, rows: [{}] }).code, 2);
});

test("a non-numeric --strength fails closed (exit 2)", () => {
  assert.equal(run({ factors: F, strength: 2, rows: [{ A: 0, B: 0, C: 0 }] }, ["--strength", "two"]).code, 2);
});

test("invalid JSON fails closed (exit 2)", () => {
  assert.equal(run("{ not json").code, 2);
});

// Regression (review F1): distinct value classes that stringify alike (1 vs "1", true vs "true") must stay
// distinct, or a row covering one is miscounted as covering both and the tool reports a false 100%.
test("a numeric value and its string twin are distinct classes, not a false full-coverage (exit 1)", () => {
  const r = run({ factors: { A: [1, "1"] }, strength: 1, rows: [{ A: 1 }] });
  assert.equal(r.code, 1, r.out);
  assert.match(r.out, /1 of 2/);
});
test("boolean true vs string 'true' are distinct classes (exit 1)", () => {
  const r = run({ factors: { A: [true, "true"] }, strength: 1, rows: [{ A: true }] });
  assert.equal(r.code, 1, r.out);
});

// Regression (review F2): constraints get the same strict validation as rows, not blind trust.
test("a constraints value that is not an array fails closed (exit 2)", () => {
  assert.equal(run({ factors: F, strength: 2, constraints: { A: 0, B: 0 }, rows: [{ A: 0, B: 0, C: 0 }] }).code, 2);
});
test("a constraint naming an undeclared factor fails closed (exit 2)", () => {
  assert.equal(run({ factors: F, strength: 2, constraints: [{ Z: 0 }], rows: [{ A: 0, B: 0, C: 0 }] }).code, 2);
});
test("a constraint with an undeclared value fails closed (exit 2)", () => {
  assert.equal(run({ factors: F, strength: 2, constraints: [{ A: 9 }], rows: [{ A: 0, B: 0, C: 0 }] }).code, 2);
});
test("an empty constraint object fails closed (exit 2)", () => {
  assert.equal(run({ factors: F, strength: 2, constraints: [{}], rows: [{ A: 0, B: 0, C: 0 }] }).code, 2);
});

test("--help prints usage and exits 0", () => {
  const out = execFileSync(process.execPath, [CHECK, "--help"], { encoding: "utf8" });
  assert.match(out, /usage:/i);
});
