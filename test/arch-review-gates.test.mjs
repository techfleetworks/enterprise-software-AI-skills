// Discriminating tests for judge-arch's two review gates:
//   check-arch-review-coverage   — a change isn't "reviewed" unless the log proves the full matrix.
//   check-arch-rules-discriminate — the mechanical layer must flag planted violations (mutation test).
import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const REPO = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const COV = resolve(REPO, "judge-arch/scripts/check-arch-review-coverage.mjs");
const DISC = resolve(REPO, "judge-arch/scripts/check-arch-rules-discriminate.mjs");
const QS = ["boundary", "ownership", "dependency", "error-handling"];

function fullMatrix() {
  const m = {};
  for (const q of QS) m[q] = { verdict: "cleared", evidence: `rg ${q} → clean (file:1)` };
  return m;
}
function baseEntry() {
  return {
    date: "2026-10-10", change: "c1", scope: ["a.ts"],
    matrix: { "a.ts": fullMatrix() },
    findings: [], grepCommands: ["rg -n -i request src/services/"],
    archGate: "pass", verdict: "PASS",
  };
}
function writeLog(entry) {
  const p = join(mkdtempSync(join(tmpdir(), "arclog-")), "log.jsonl");
  writeFileSync(p, JSON.stringify(entry) + "\n");
  return p;
}
function cov(entry, changedList, extra = []) {
  const log = typeof entry === "string" ? entry : writeLog(entry);
  const r = spawnSync(process.execPath, [COV, "--log", log, "--changed-list", changedList, ...extra], { encoding: "utf8" });
  return r.status;
}

// --- check-arch-review-coverage ---------------------------------------------
test("coverage: passes a fully reviewed, evidenced change", () => {
  assert.equal(cov(baseEntry(), "a.ts"), 0);
});
test("coverage: FLAGS an unreviewed changed file (discriminating)", () => {
  assert.equal(cov(baseEntry(), "a.ts,b.ts"), 1);
});
test("coverage: FLAGS a missing question in the matrix (discriminating)", () => {
  const e = baseEntry(); delete e.matrix["a.ts"].dependency;
  assert.equal(cov(e, "a.ts"), 1);
});
test("coverage: FLAGS a cleared cell with no evidence (no silent clears, discriminating)", () => {
  const e = baseEntry(); e.matrix["a.ts"].boundary = { verdict: "cleared", evidence: "" };
  assert.equal(cov(e, "a.ts"), 1);
});
test("coverage: FLAGS a finding with an out-of-vocabulary severity (discriminating)", () => {
  const e = baseEntry();
  e.matrix["a.ts"].boundary = { verdict: "finding", evidence: "x:1" };
  e.findings = [{ title: "t", question: "boundary", severity: "bogus", file: "a.ts", evidence: "x:1" }];
  assert.equal(cov(e, "a.ts"), 1);
});
test("coverage: FLAGS a review that didn't record the grep-battery (discriminating)", () => {
  const e = baseEntry(); e.grepCommands = [];
  assert.equal(cov(e, "a.ts"), 1);
});
test("coverage: fails closed on an empty log", () => {
  const p = join(mkdtempSync(join(tmpdir(), "arclog-")), "log.jsonl");
  writeFileSync(p, "");
  assert.equal(cov(p, "a.ts"), 1);
});
test("coverage: FLAGS a non-append (edited history) log (discriminating)", () => {
  const log = writeLog(baseEntry());
  const base = join(mkdtempSync(join(tmpdir(), "base-")), "base.jsonl");
  writeFileSync(base, JSON.stringify({ date: "2000-01-01", different: true }) + "\n"); // current log doesn't start with this
  assert.equal(cov(log, "a.ts", ["--base", base]), 1);
});

// --- check-arch-rules-discriminate ------------------------------------------
test("discriminate: the real arch-gate flags every planted violation", () => {
  const r = spawnSync(process.execPath, [DISC], { encoding: "utf8" });
  assert.equal(r.status, 0, (r.stdout || "") + (r.stderr || ""));
});
test("discriminate: a no-op arch-gate FAILS the gate (vacuous mechanical layer, discriminating)", () => {
  const stub = join(mkdtempSync(join(tmpdir(), "stub-")), "arch-gate.mjs");
  writeFileSync(stub, "process.exit(0);\n"); // detects nothing
  const r = spawnSync(process.execPath, [DISC, "--arch-gate", stub], { encoding: "utf8" });
  assert.equal(r.status, 1);
});
