// Discriminating tests for owasp-secure-coding-bdd/scripts/check-security-coverage.mjs — the change-type ->
// required-@security-scenario enforcement gate. Each test writes a throwaway "changed" file plus a features
// dir and runs the REAL gate against the REAL shipped config. Covered: a triggered surface with its scenario
// passes; without it fails (discriminating); a non-security change passes; a valid waiver suppresses; an
// expired or malformed waiver does not; and the fail-closed paths (empty config, surface triggered but no
// features dir) exit 2.
import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtempSync, mkdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const REPO = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const GATE = resolve(REPO, "owasp-secure-coding-bdd/scripts/check-security-coverage.mjs");
const REAL_CONFIG = resolve(REPO, "owasp-secure-coding-bdd/assets/security-coverage.config.json");

const SQL_CODE = "const rows = db.query('SELECT id FROM users WHERE name = ' + name);\n";
const SAFE_CODE = "export const add = (a, b) => a + b;\n";

function featureWith(tag) {
  return `Feature: security\n\n  @security ${tag}\n  Scenario: blocked\n    Given a request\n    When an attacker sends a payload\n    Then it is rejected\n`;
}

// Build a fixture: a changed code file + a features dir (optionally holding a scenario with `tag`).
function fixture({ code, tag = null, featureText = null, waivers = null, config = REAL_CONFIG, withFeatures = true }) {
  const dir = mkdtempSync(join(tmpdir(), "sec-cov-"));
  const codeFile = join(dir, "changed.js");
  writeFileSync(codeFile, code);
  let feats = null;
  if (withFeatures) {
    feats = join(dir, "features");
    mkdirSync(feats);
    const body = featureText != null ? featureText : (tag ? featureWith(tag) : null);
    if (body) writeFileSync(join(feats, "s.feature"), body);
  }
  let waiversPath = null;
  if (waivers) { waiversPath = join(dir, "w.json"); writeFileSync(waiversPath, JSON.stringify(waivers)); }
  return { codeFile, feats, waiversPath, config };
}

function run({ codeFile, feats, waiversPath, config }) {
  const a = ["--config", config];
  if (feats) a.push("--features", feats);
  if (waiversPath) a.push("--waivers", waiversPath);
  a.push(codeFile);
  const r = spawnSync(process.execPath, [GATE, ...a], { encoding: "utf8" });
  return { status: r.status, out: (r.stdout || "") + (r.stderr || "") };
}

test("PASS: a SQL change WITH its @security scenario", () => {
  const r = run(fixture({ code: SQL_CODE, tag: "@owasp:sql-injection" }));
  assert.equal(r.status, 0, r.out);
  assert.match(r.out, /PASS/);
});

test("FAIL: a SQL change WITHOUT a sql-injection scenario (exit 1, discriminating)", () => {
  const r = run(fixture({ code: SQL_CODE, tag: null }));
  assert.equal(r.status, 1);
  assert.match(r.out, /sql-injection/);
});

test("PASS: a non-security change triggers nothing", () => {
  const r = run(fixture({ code: SAFE_CODE, tag: null }));
  assert.equal(r.status, 0);
  assert.match(r.out, /No security-relevant surface/);
});

test("PASS: a valid, non-expired waiver suppresses the requirement", () => {
  const r = run(fixture({ code: SQL_CODE, tag: null, waivers: [{ tag: "@owasp:sql-injection", reason: "legacy path, tracked", approvedBy: "mdenner", expires: "2999-01-01" }] }));
  assert.equal(r.status, 0, r.out);
});

test("FAIL: an expired waiver does not suppress (exit 1)", () => {
  const r = run(fixture({ code: SQL_CODE, tag: null, waivers: [{ tag: "@owasp:sql-injection", reason: "legacy", approvedBy: "mdenner", expires: "2000-01-01" }] }));
  assert.equal(r.status, 1);
});

test("FAIL CLOSED: a waiver missing a required field (exit 2)", () => {
  const r = run(fixture({ code: SQL_CODE, tag: null, waivers: [{ tag: "@owasp:sql-injection", reason: "x" }] }));
  assert.equal(r.status, 2);
  assert.match(r.out, /missing required field/);
});

test("FAIL CLOSED: a waiver with an unparseable expires date (exit 2, discriminating)", () => {
  const r = run(fixture({ code: SQL_CODE, tag: null, waivers: [{ tag: "@owasp:sql-injection", reason: "legacy", approvedBy: "mdenner", expires: "whenever" }] }));
  assert.equal(r.status, 2, r.out);
  assert.match(r.out, /unparseable/);
});

test("PASS: a scenario whose @security and @owasp tag are on separate lines is still matched", () => {
  const multiLine = "Feature: security\n\n  @security\n  @owasp:sql-injection\n  Scenario: blocked\n    Given a request\n    When an attacker sends a payload\n    Then it is rejected\n";
  const r = run(fixture({ code: SQL_CODE, featureText: multiLine }));
  assert.equal(r.status, 0, r.out);
});

test("FAIL CLOSED: a security surface triggered but no --features dir (exit 2)", () => {
  const r = run(fixture({ code: SQL_CODE, tag: null, withFeatures: false }));
  assert.equal(r.status, 2);
  assert.match(r.out, /features/i);
});

test("FAIL CLOSED: an empty config (exit 2)", () => {
  const dir = mkdtempSync(join(tmpdir(), "sec-cov-cfg-"));
  const cfg = join(dir, "empty.json");
  writeFileSync(cfg, JSON.stringify({ rules: [] }));
  const r = run(fixture({ code: SQL_CODE, tag: null, config: cfg }));
  assert.equal(r.status, 2);
});
