// Discriminating tests for the two verifiable-quality gates and their shared lib:
//   check-has-test              — the COVERAGE gate (every check has a test that EXECS it).
//   verify-check-discrimination — the MUTATION gate (those tests FAIL when the check is a no-op).
//   verifiable-lib.mjs          — the one owner of config-load + check-enumeration + crediting
//                                 (extracted so the two gates can never drift). See Finding A,
//                                 docs/arch-reviews/log.jsonl (gate-scripts-dogfood-review).
//
// Each gate is proven to DISCRIMINATE: it must PASS the good fixture AND FAIL the broken ones.
import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtempSync, mkdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const REPO = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const HAS = resolve(REPO, "verifiable-quality-gates/scripts/check-has-test.mjs");
const DISC = resolve(REPO, "verifiable-quality-gates/scripts/verify-check-discrimination.mjs");

// A real check: exits 1 when its target file contains "VIOLATION", else 0.
const CHECK_SRC = `#!/usr/bin/env node
import { readFileSync } from "node:fs";
process.exit(readFileSync(process.argv[2], "utf8").includes("VIOLATION") ? 1 : 0);
`;

// A GOOD test: asserts BOTH that the check flags a violation (status 1) and clears clean input
// (status 0). When the check is stubbed to a no-op, the "flags a violation" assertion breaks →
// the test fails → the mutation gate sees discrimination.
function goodTest(checkPath) {
  return `import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
const CHECK = ${JSON.stringify(checkPath)};
test("flags a violation", () => {
  const f = join(mkdtempSync(join(tmpdir(), "t-")), "x");
  writeFileSync(f, "line with VIOLATION");
  assert.equal(spawnSync(process.execPath, [CHECK, f]).status, 1);
});
test("clears clean input", () => {
  const f = join(mkdtempSync(join(tmpdir(), "t-")), "x");
  writeFileSync(f, "all clean");
  assert.equal(spawnSync(process.execPath, [CHECK, f]).status, 0);
});
`;
}

// A VACUOUS test: references the check and execs it, but only asserts the clean-input case (status
// 0). A no-op check also exits 0, so this test keeps passing when the check is neutralized — the
// mutation gate must catch that.
function vacuousTest(checkPath) {
  return `import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
const CHECK = ${JSON.stringify(checkPath)};
test("runs the check", () => {
  const f = join(mkdtempSync(join(tmpdir(), "t-")), "x");
  writeFileSync(f, "all clean");
  assert.equal(spawnSync(process.execPath, [CHECK, f]).status, 0);
});
`;
}

// A NON-EXEC test: references the check by name but never spawns it → cannot credit coverage.
function nonExecTest(checkPath) {
  return `import { test } from "node:test";
// references ${checkPath} in a comment, but execs nothing.
test("asserts nothing about the check", () => {});
`;
}

// Build an isolated fixture: checks/check-foo.mjs + the given test files + config + allowlist.
// `allowlistValue` overrides the allowlist file contents (to exercise fail-closed shape checks).
function fixture({ tests = {}, allowlistValue = "[]", omitKey } = {}) {
  const root = mkdtempSync(join(tmpdir(), "vqg-"));
  const checksDir = join(root, "checks");
  const testsDir = join(root, "tests");
  mkdirSync(checksDir);
  mkdirSync(testsDir);
  const checkPath = join(checksDir, "check-foo.mjs");
  writeFileSync(checkPath, CHECK_SRC);
  for (const [name, make] of Object.entries(tests)) writeFileSync(join(testsDir, name), make(checkPath));
  const allowPath = join(root, "allow.json");
  writeFileSync(allowPath, allowlistValue);
  const cfg = {
    checksDir,
    checkPattern: "^check-.*\\.mjs$",
    testsDir,
    testPattern: "\\.(test|spec)\\.mjs$",
    allowlist: allowPath,
    testCommand: [process.execPath, "--test"],
  };
  if (omitKey) delete cfg[omitKey];
  const cfgPath = join(root, "verifiable-gates.config.json");
  writeFileSync(cfgPath, JSON.stringify(cfg));
  return cfgPath;
}

const runHas = (cfgPath) => spawnSync(process.execPath, [HAS, cfgPath], { encoding: "utf8" });
const runDisc = (cfgPath) => spawnSync(process.execPath, [DISC, cfgPath], { encoding: "utf8" });

// --- coverage gate (check-has-test) -----------------------------------------
test("coverage: PASSES when a check has an exec-test that references it", () => {
  const r = runHas(fixture({ tests: { "foo.test.mjs": goodTest } }));
  assert.equal(r.status, 0, (r.stdout || "") + (r.stderr || ""));
});
test("coverage: FAILS when the only test never execs the check (discriminating)", () => {
  const r = runHas(fixture({ tests: { "foo.test.mjs": nonExecTest } }));
  assert.equal(r.status, 1);
});
test("coverage: FAILS when no test references the check at all (discriminating)", () => {
  const r = runHas(fixture({ tests: {} }));
  assert.equal(r.status, 1);
});

// --- mutation gate (verify-check-discrimination) ----------------------------
test("mutation: PASSES when the test fails against a no-op check", () => {
  const r = runDisc(fixture({ tests: { "foo.test.mjs": goodTest } }));
  assert.equal(r.status, 0, (r.stdout || "") + (r.stderr || ""));
});
test("mutation: FAILS a vacuous test that still passes against a no-op check (discriminating)", () => {
  const r = runDisc(fixture({ tests: { "foo.test.mjs": vacuousTest } }));
  assert.equal(r.status, 1);
});

// --- shared lib fail-closed (verifiable-lib.loadConfig), proven via BOTH gates ---
test("lib: both gates fail closed when the allowlist is not a JSON array", () => {
  const cfg = fixture({ tests: { "foo.test.mjs": goodTest }, allowlistValue: "{}" });
  assert.equal(runHas(cfg).status, 1);
  assert.equal(runDisc(cfg).status, 1);
});
test("lib: both gates fail closed when a required config key is missing", () => {
  const cfg = fixture({ tests: { "foo.test.mjs": goodTest }, omitKey: "checksDir" });
  assert.equal(runHas(cfg).status, 1);
  assert.equal(runDisc(cfg).status, 1);
});
