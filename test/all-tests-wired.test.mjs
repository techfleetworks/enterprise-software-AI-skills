// Guard (arch-encode of a real miss): every test/*.test.mjs MUST run in the required CI test job, or it silently
// never runs. That is the exact "a test exists but does not run" failure verifiable-quality-gates targets. Since
// ADR-0108 `npm test` runs scripts/run-tests.mjs, which finds the files itself (a hand-kept list in package.json
// made every PR that added a test conflict with every other). These tests pin both halves: npm test calls the
// runner, and the runner finds every test file and refuses to pass on none.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync, mkdtempSync, writeFileSync, mkdirSync, copyFileSync, symlinkSync } from "node:fs";
import { tmpdir } from "node:os";
import { resolve, dirname, join, basename } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";
import { listTestFiles } from "../scripts/run-tests.mjs";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const RUNNER = resolve(ROOT, "scripts/run-tests.mjs");
const onDisk = readdirSync(resolve(ROOT, "test")).filter((f) => f.endsWith(".test.mjs")).sort();

test("npm test runs the discovering runner, not a hand-kept list", () => {
  const script = JSON.parse(readFileSync(resolve(ROOT, "package.json"), "utf8")).scripts?.test || "";
  assert.equal(script, "node scripts/run-tests.mjs");
});

test("the runner finds every test file on disk (no test silently skipped in the required CI job)", () => {
  assert.deepEqual(listTestFiles(resolve(ROOT, "test")).map((f) => basename(f)), onDisk);
});

test("the runner takes only *.test.mjs, not other scripts beside them (discriminating)", () => {
  const dir = mkdtempSync(join(tmpdir(), "rt-"));
  writeFileSync(join(dir, "a.test.mjs"), "");
  writeFileSync(join(dir, "check-has-test.mjs"), "");
  writeFileSync(join(dir, "helper.mjs"), "");
  assert.deepEqual(listTestFiles(dir).map((f) => basename(f)), ["a.test.mjs"]);
});

test("the runner fails closed (exit 2) when it finds no test files", () => {
  const r = spawnSync(process.execPath, [RUNNER, mkdtempSync(join(tmpdir(), "rt-empty-"))], { encoding: "utf8" });
  assert.equal(r.status, 2, r.stderr);
  assert.match(r.stderr, /zero tests is not a pass/);
});

// The child must not inherit NODE_TEST_CONTEXT from this test run: with it set, a nested `node --test` reports to
// the parent and exits 0 whatever happened, which would hide the very failure this case checks for.
const freshEnv = () => { const env = { ...process.env }; delete env.NODE_TEST_CONTEXT; return env; };

test("the runner passes a failing test file's exit code through (discriminating)", () => {
  const dir = mkdtempSync(join(tmpdir(), "rt-fail-"));
  writeFileSync(join(dir, "x.test.mjs"), `import { test } from "node:test"; test("t", () => { throw new Error("boom"); });`);
  const r = spawnSync(process.execPath, [RUNNER, dir], { encoding: "utf8", env: freshEnv() });
  assert.notEqual(r.status, 0, r.stdout);
});

// A checkout reached through a junction or symlink: import.meta.url is the real path, argv[1] is not. A guard
// that compared them raw skipped the whole run and exited 0 with zero tests (review finding F1).
test("the runner still runs, and still fails, when reached through a junction or symlink (discriminating)", (t) => {
  const real = mkdtempSync(join(tmpdir(), "rt-real-"));
  mkdirSync(join(real, "scripts"));
  mkdirSync(join(real, "test"));
  copyFileSync(RUNNER, join(real, "scripts", "run-tests.mjs"));
  writeFileSync(join(real, "test", "x.test.mjs"), `import { test } from "node:test"; test("t", () => { throw new Error("boom"); });`);
  const link = join(tmpdir(), `rt-link-${process.pid}-${Date.now()}`);
  try { symlinkSync(real, link, "junction"); } catch (e) { t.skip(`cannot create a link here: ${e.message}`); return; }
  const r = spawnSync(process.execPath, [join(link, "scripts", "run-tests.mjs")], { encoding: "utf8", env: freshEnv() });
  assert.notEqual(r.status, 0, `through a link the runner exited ${r.status}, so it ran nothing:\n${r.stdout}${r.stderr}`);
  assert.match(r.stdout + r.stderr, /boom|fail/i);
});

test("the runner exits 0 when every test passes (control)", () => {
  const dir = mkdtempSync(join(tmpdir(), "rt-pass-"));
  writeFileSync(join(dir, "x.test.mjs"), `import { test } from "node:test"; test("t", () => {});`);
  const r = spawnSync(process.execPath, [RUNNER, dir], { encoding: "utf8", env: freshEnv() });
  assert.equal(r.status, 0, r.stdout);
});
