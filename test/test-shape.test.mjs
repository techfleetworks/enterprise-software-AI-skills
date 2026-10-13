// Discriminating tests for .claude/skills/comprehensive-test-strategy/scripts/check-test-shape.mjs.
// A pyramid-shaped suite PASSES; an inverted / top-heavy / under-based / over-unclassified one FAILS.
import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const REPO = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const CHECK = resolve(REPO, ".claude/skills/comprehensive-test-strategy/scripts/check-test-shape.mjs");

const DIRS = { unit: "tests/unit/t", integration: "tests/integration/t", e2e: "tests/e2e/t", other: "tests/other/t" };
function junit(spec) {
  let cases = "";
  for (const { layer, n, time = 0.01 } of spec)
    for (let i = 0; i < n; i++)
      cases += `  <testcase classname="${DIRS[layer]}${i}" name="case${i}" time="${time}"/>\n`;
  return `<?xml version="1.0"?>\n<testsuite tests="${spec.reduce((a, s) => a + s.n, 0)}">\n${cases}</testsuite>\n`;
}
const BASE_CFG = {
  layers: { unit: ["/unit/"], integration: ["/integration/"], e2e: ["/e2e/"] },
  minShare: { unit: 0.6 }, maxShare: { e2e: 0.15 }, requirePyramid: true, maxUnclassifiedShare: 0.2,
};
function run(spec, cfg = BASE_CFG, { rawXml } = {}) {
  const dir = mkdtempSync(join(tmpdir(), "shape-"));
  const report = join(dir, "junit.xml");
  const config = join(dir, "test-shape.json");
  writeFileSync(report, rawXml != null ? rawXml : junit(spec));
  writeFileSync(config, JSON.stringify(cfg));
  const r = spawnSync(process.execPath, [CHECK, "--report", report, "--config", config], { encoding: "utf8" });
  return { status: r.status, out: (r.stdout || "") + (r.stderr || "") };
}

// --- hardening: commented-out tests and vacuous config ----------------------
test("FLAGS an ice-cream cone padded with commented-out testcases (discriminating)", () => {
  const real = `  <testcase classname="${DIRS.e2e}1" name="a" time="0.01"/>\n  <testcase classname="${DIRS.e2e}2" name="b" time="0.01"/>\n`;
  let commented = "  <!--\n";
  for (let i = 0; i < 12; i++) commented += `  <testcase classname="${DIRS.unit}${i}" name="u${i}" time="0.01"/>\n`;
  for (let i = 0; i < 4; i++) commented += `  <testcase classname="${DIRS.integration}${i}" name="g${i}" time="0.01"/>\n`;
  commented += "  -->\n";
  const rawXml = `<?xml version="1.0"?>\n<testsuite>\n${real}${commented}</testsuite>\n`;
  const r = run(null, BASE_CFG, { rawXml });
  assert.equal(r.status, 1, r.out); // the real shape is 100% e2e; the commented block must not count
});
test("a layers-only config does NOT claim on-pyramid; it discloses the pyramid was not enforced (discriminating)", () => {
  // An 83%-e2e suite used to report "on-pyramid" with no thresholds set. It must not imply enforcement.
  const cfg = { layers: { unit: ["/unit/"], e2e: ["/e2e/"] } };
  const r = run([{ layer: "unit", n: 1 }, { layer: "e2e", n: 5 }], cfg);
  assert.equal(r.status, 0, r.out);
  assert.match(r.out, /NOT enforced/i);
  assert.doesNotMatch(r.out, /on-pyramid/);
});

// --- healthy pyramid passes --------------------------------------------------
test("PASSES a healthy pyramid (many unit, some integration, few e2e)", () => {
  const r = run([{ layer: "unit", n: 20 }, { layer: "integration", n: 6 }, { layer: "e2e", n: 2 }]);
  assert.equal(r.status, 0, r.out);
});

// --- inverted / top-heavy fails (discriminating) -----------------------------
test("FAILS an inverted ice-cream cone (e2e > unit)", () => {
  const r = run([{ layer: "unit", n: 1 }, { layer: "integration", n: 2 }, { layer: "e2e", n: 5 }]);
  assert.equal(r.status, 1, r.out);
});
test("FAILS when e2e share exceeds the cap (discriminating)", () => {
  const r = run([{ layer: "unit", n: 10 }, { layer: "e2e", n: 3 }]); // e2e = 23% > 15%
  assert.equal(r.status, 1, r.out);
  assert.match(r.out, /e2e/);
});
test("FAILS when the unit base is below the floor (discriminating)", () => {
  const r = run([{ layer: "unit", n: 4 }, { layer: "integration", n: 3 }, { layer: "e2e", n: 3 }]); // unit 40%
  assert.equal(r.status, 1, r.out);
});
test("FAILS the requirePyramid order (integration > unit)", () => {
  const cfg = { ...BASE_CFG, minShare: {}, maxShare: {} }; // isolate the ordering rule
  const r = run([{ layer: "unit", n: 2 }, { layer: "integration", n: 5 }, { layer: "e2e", n: 1 }], cfg);
  assert.equal(r.status, 1, r.out);
  assert.match(r.out, /pyramid order/);
});

// --- unclassified guard + runtime cap ----------------------------------------
test("FAILS when too many tests match no layer (can't assess)", () => {
  const r = run([{ layer: "unit", n: 5 }, { layer: "other", n: 5 }]); // 50% unclassified > 20%
  assert.equal(r.status, 1, r.out);
  assert.match(r.out, /unclassified|no layer/i);
});
test("FAILS when a layer's total runtime exceeds its cap", () => {
  const cfg = { ...BASE_CFG, maxTotalSeconds: { e2e: 600 } };
  const r = run([{ layer: "unit", n: 20 }, { layer: "e2e", n: 2, time: 400 }], cfg); // e2e 800s > 600
  assert.equal(r.status, 1, r.out);
  assert.match(r.out, /runtime|take/i);
});

// --- glob classification -----------------------------------------------------
test("classifies via a glob pattern (*.unit.* / *.e2e.*) — no thresholds, proves classification", () => {
  const cfg = { layers: { unit: ["*.unit.*"], e2e: ["*.e2e.*"] } }; // layers only, no thresholds
  const xml = `<testsuite><testcase classname="src/foo.unit.ts" name="a" time="0.01"/>` +
    `<testcase classname="src/foo.unit.ts" name="b" time="0.01"/>` +
    `<testcase classname="src/foo.e2e.ts" name="c" time="0.01"/></testsuite>`;
  const r = run([], cfg, { rawXml: xml });
  assert.equal(r.status, 0, r.out);
  assert.match(r.out, /unit=2/);
  assert.match(r.out, /e2e=1/);
});

// --- fixes from the fresh-context review -------------------------------------
test("requirePyramid uses the DECLARED layer order — custom names, inverted → fails (#1)", () => {
  const cfg = { layers: { unit: ["/unit/"], component: ["/component/"], ui: ["/ui/"] }, requirePyramid: true };
  const xml = `<testsuite>` +
    `<testcase classname="tests/unit/a" name="a" time="0.01"/>` +
    `<testcase classname="tests/component/b" name="b" time="0.01"/>` +
    Array.from({ length: 8 }, (_, i) => `<testcase classname="tests/ui/c${i}" name="c${i}" time="0.01"/>`).join("") +
    `</testsuite>`;
  const r = run([], cfg, { rawXml: xml });
  assert.equal(r.status, 1, r.out); // 1 unit / 1 component / 8 ui is inverted → must fail
  assert.match(r.out, /pyramid order/);
});
test("a mostly-untagged suite FAILS even without an explicit maxUnclassifiedShare (#2 default guard)", () => {
  const cfg = { layers: { unit: ["/unit/"], e2e: ["/e2e/"] }, minShare: { unit: 0.6 } }; // no maxUnclassifiedShare
  const xml = `<testsuite><testcase classname="tests/unit/a" name="a" time="0.01"/>` +
    Array.from({ length: 9 }, (_, i) => `<testcase classname="tests/misc/m${i}" name="m${i}" time="0.01"/>`).join("") +
    `</testsuite>`;
  const r = run([], cfg, { rawXml: xml });
  assert.equal(r.status, 1, r.out); // 9/10 untagged → default 0.2 cap breached
  assert.match(r.out, /no layer|unclassified/i);
});
test("a '>' inside a classname attribute does not drop the test to unclassified (#3)", () => {
  const cfg = { layers: { unit: ["/unit/"] } };
  const xml = `<testsuite><testcase classname="src/foo>bar/unit/x" name="a" time="0.01"/>` +
    `<testcase classname="tests/unit/b" name="b" time="0.01"/></testsuite>`;
  const r = run([], cfg, { rawXml: xml });
  assert.equal(r.status, 0, r.out);
  assert.match(r.out, /unit=2/); // both counted as unit, none unclassified
});

// --- fail closed -------------------------------------------------------------
test("fails closed (exit 2) on a report with zero testcases", () => {
  assert.equal(run([], BASE_CFG, { rawXml: "<testsuite></testsuite>" }).status, 2);
});
test("fails closed (exit 2) when the report is missing", () => {
  const dir = mkdtempSync(join(tmpdir(), "shape-nr-"));
  const config = join(dir, "c.json");
  writeFileSync(config, JSON.stringify(BASE_CFG));
  const r = spawnSync(process.execPath, [CHECK, "--report", join(dir, "nope.xml"), "--config", config], { encoding: "utf8" });
  assert.equal(r.status, 2);
});
test("fails closed (exit 2) when the config has no layers", () => {
  assert.equal(run([{ layer: "unit", n: 3 }], {}).status, 2);
});
