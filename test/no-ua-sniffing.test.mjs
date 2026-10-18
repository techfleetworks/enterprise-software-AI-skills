// Discriminating tests for .claude/skills/universal-browser-device-support/scripts/check-no-ua-sniffing.mjs.
// UA sniffing (navigator.userAgent reads, brand-string tests) must FAIL; feature detection PASSES;
// a reasoned inline ignore suppresses, a reason-less one does not; zero source files fails closed.
import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtempSync, writeFileSync, mkdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const REPO = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const CHECK = resolve(REPO, ".claude/skills/universal-browser-device-support/scripts/check-no-ua-sniffing.mjs");

function run(src, ext = "js") {
  const dir = mkdtempSync(join(tmpdir(), "ua-"));
  const f = join(dir, `code.${ext}`);
  writeFileSync(f, src);
  const r = spawnSync(process.execPath, [CHECK, f], { encoding: "utf8" });
  return { status: r.status, out: (r.stdout || "") + (r.stderr || "") };
}

// --- feature detection PASSES ------------------------------------------------
test("PASSES feature-detection code with no UA sniffing", () => {
  const r = run("if ('IntersectionObserver' in window) { observe(); }\nif (CSS.supports('display','grid')) { grid(); }\n");
  assert.equal(r.status, 0, r.out);
});
test("does NOT flag a brand name that appears only in a comment (no false positive)", () => {
  const r = run("// tested in Chrome, Safari, and Firefox\nconst ok = 'IntersectionObserver' in window;\n");
  assert.equal(r.status, 0, r.out);
});
test("does NOT flag a plain string assignment of a brand name (no test operator)", () => {
  const r = run("const label = 'Safari';\nexport default label;\n");
  assert.equal(r.status, 0, r.out);
});

// --- UA sniffing FAILS (discriminating) --------------------------------------
test("FLAGS navigator.userAgent read (ua-api, exit 1)", () => {
  const r = run("const ua = navigator.userAgent;\n");
  assert.equal(r.status, 1, r.out);
  assert.match(r.out, /ua-api/);
});
test("FLAGS navigator.vendor / platform / userAgentData (ua-api)", () => {
  assert.equal(run("const v = navigator.vendor;\n").status, 1);
  assert.equal(run("const p = navigator.platform;\n").status, 1);
  assert.equal(run("const b = navigator.userAgentData.brands;\n").status, 1);
});
test("FLAGS a brand-string indexOf test (ua-brand-test, exit 1)", () => {
  const r = run("const ua = window._ua;\nif (ua.indexOf('MSIE') !== -1) { legacy(); }\n");
  assert.equal(r.status, 1, r.out);
  assert.match(r.out, /ua-brand-test/);
});
test("FLAGS a /Chrome/.test(...) regex brand test", () => {
  const r = run("const isChrome = /Chrome/.test(someStr);\n");
  assert.equal(r.status, 1, r.out);
  assert.match(r.out, /ua-brand-test/);
});
test("FLAGS a brand equality comparison", () => {
  const r = run("if (brand === 'Firefox') { quirk(); }\n");
  assert.equal(r.status, 1, r.out);
});
test("works on .ts/.tsx source too", () => {
  assert.equal(run("const ua: string = navigator.userAgent;\n", "ts").status, 1);
});

// --- suppression semantics ---------------------------------------------------
test("an inline ignore WITH a reason suppresses on the same line (exit 0)", () => {
  const r = run("const ua = navigator.userAgent; // ua-sniff:ignore analytics capture only, not for branching\n");
  assert.equal(r.status, 0, r.out);
});
test("an ignore on the line ABOVE suppresses (exit 0)", () => {
  const r = run("// ua-sniff:ignore documented Safari scroll quirk, has a feature-detected fallback\nconst ua = navigator.userAgent;\n");
  assert.equal(r.status, 0, r.out);
});
test("a targeted ignore=ua-api suppresses only that rule (exit 0 here)", () => {
  const r = run("const ua = navigator.userAgent; // ua-sniff:ignore=ua-api logged for analytics\n");
  assert.equal(r.status, 0, r.out);
});
test("a TRAILING ignore on one line does NOT leak to a real sniff on the next line (discriminating)", () => {
  const r = run("const ua = navigator.userAgent; // ua-sniff:ignore analytics only\nconst isChrome = /Chrome/.test(ua);\n");
  assert.equal(r.status, 1, r.out);
  assert.match(r.out, /ua-brand-test/);
});
test("a bare ignore with NO reason does NOT suppress (exit 1, discriminating)", () => {
  const r = run("const ua = navigator.userAgent; // ua-sniff:ignore\n");
  assert.equal(r.status, 1, r.out);
});
test("a targeted ignore for a DIFFERENT rule does NOT suppress (discriminating)", () => {
  const r = run("const ua = navigator.userAgent; // ua-sniff:ignore=ua-brand-test wrong rule\n");
  assert.equal(r.status, 1, r.out);
  assert.match(r.out, /ua-api/);
});

// --- fail closed on zero scan ------------------------------------------------
test("fails closed (exit 2) when a directory has no JS/TS files", () => {
  const dir = mkdtempSync(join(tmpdir(), "ua-empty-"));
  mkdirSync(join(dir, "sub"));
  const r = spawnSync(process.execPath, [CHECK, dir], { encoding: "utf8" });
  assert.equal(r.status, 2, r.out);
});

// --- whole-repo travelling scope: --allow-empty + --ignore -------------------
// When the gate travels into a consumer, the aggregator scans the whole tree ("."), which is empty of
// source on some repos and always contains the copied gate infra under scripts/ci. These flags make that
// scope work without a hole: --allow-empty passes a genuinely empty scan, --ignore skips ONLY the resolved
// gate-infra dir, and the paths are manifest-locked so a dev cannot widen them to hide product code.
function tree(files) {
  const dir = mkdtempSync(join(tmpdir(), "ua-tree-"));
  for (const [rel, src] of Object.entries(files)) {
    const f = join(dir, rel);
    mkdirSync(dirname(f), { recursive: true });
    writeFileSync(f, src);
  }
  return dir;
}
function runIn(cwd, args) {
  const r = spawnSync(process.execPath, [CHECK, ...args], { cwd, encoding: "utf8" });
  return { status: r.status, out: (r.stdout || "") + (r.stderr || "") };
}

test("--allow-empty makes a zero-source scan PASS (exit 0) instead of failing closed", () => {
  const dir = tree({ "README.md": "# docs only\n" });
  assert.equal(runIn(dir, ["--allow-empty", "."]).status, 0);
});
test("WITHOUT --allow-empty a zero-source scan still fails closed (exit 2, discriminating)", () => {
  const dir = tree({ "README.md": "# docs only\n" });
  assert.equal(runIn(dir, ["."]).status, 2);
});
test("--ignore scripts/ci skips the gate infra but still scans product code", () => {
  const dir = tree({
    "scripts/ci/check-no-ua-sniffing.mjs": "const ua = navigator.userAgent; // the gate's own docstring has brand names\n",
    "src/clean.js": "export const x = 1;\n",
  });
  const r = runIn(dir, ["--allow-empty", "--ignore", "scripts/ci", "."]);
  assert.equal(r.status, 0, r.out);
});
test("--ignore does NOT suppress a violation in product code (discriminating)", () => {
  const dir = tree({
    "scripts/ci/gate.mjs": "const ua = navigator.userAgent;\n",
    "src/bad.js": "if (navigator.userAgent.includes('Chrome')) legacy();\n",
  });
  const r = runIn(dir, ["--allow-empty", "--ignore", "scripts/ci", "."]);
  assert.equal(r.status, 1, r.out);
  assert.match(r.out, /src[\\/]bad\.js/);
});
test("--ignore is anchored at cwd: a decoy src/scripts/ci is NOT skipped (anti-evasion)", () => {
  const dir = tree({ "src/scripts/ci/sneaky.js": "const ua = navigator.userAgent;\n" });
  const r = runIn(dir, ["--allow-empty", "--ignore", "scripts/ci", "."]);
  assert.equal(r.status, 1, r.out);
  assert.match(r.out, /sneaky\.js/);
});
test("--ignore with no path argument fails usage (exit 2)", () => {
  const dir = tree({ "src/clean.js": "export const x = 1;\n" });
  assert.equal(runIn(dir, ["--ignore"]).status, 2);
});
