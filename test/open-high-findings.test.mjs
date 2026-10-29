// Discriminating tests for check-open-high-findings.mjs (issue #179): a HIGH/critical review finding with
// no resolution and no waiver blocks "done". Each spawns the REAL checker against a fixture review log and
// asserts the exit code, including the cases a no-op checker (always exit 0) would get wrong.
import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const REPO = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const CHECK = resolve(REPO, ".claude/skills/judge-arch/scripts/check-open-high-findings.mjs");

function log(entries) {
  const dir = mkdtempSync(join(tmpdir(), "ohf-"));
  const p = join(dir, "log.jsonl");
  writeFileSync(p, entries.map((e) => (typeof e === "string" ? e : JSON.stringify(e))).join("\n") + "\n");
  return p;
}
function run(logPath, extra = []) {
  const r = spawnSync(process.execPath, [CHECK, "--log", logPath, ...extra], { encoding: "utf8" });
  return { status: r.status, out: (r.stdout || "") + (r.stderr || "") };
}

test("an open HIGH finding blocks (exit 1, discriminating)", () => {
  const p = log([{ change: "x", findings: [{ severity: "high", where: "a.mjs", finding: "a false-clean path" }] }]);
  const r = run(p);
  assert.equal(r.status, 1, r.out);
  assert.match(r.out, /a\.mjs/);
});

test("a HIGH finding with a resolution passes (exit 0)", () => {
  const p = log([{ change: "x", findings: [{ severity: "high", where: "a.mjs", finding: "x", resolution: "fixed by adding a guard + test" }] }]);
  assert.equal(run(p).status, 0);
});

test("a HIGH finding with an operator waiver passes (exit 0)", () => {
  const p = log([{ change: "x", findings: [{ severity: "high", where: "a.mjs", finding: "x", waiver: { reason: "out of scope", approver: "mdenner", expires: "2026-12-01" } }] }]);
  assert.equal(run(p).status, 0);
});

test("an empty {} waiver does NOT clear a HIGH; it fails closed (exit 2, discriminating)", () => {
  const p = log([{ change: "x", findings: [{ severity: "high", where: "a.mjs", finding: "x", waiver: {} }] }]);
  const r = run(p);
  assert.equal(r.status, 2, r.out);
  assert.match(r.out, /waiver/i);
});

test("a waiver missing an approver fails closed (exit 2)", () => {
  const p = log([{ change: "x", findings: [{ severity: "high", where: "a.mjs", finding: "x", waiver: { reason: "meh", expires: "2099-01-01" } }] }]);
  assert.equal(run(p).status, 2);
});

test("an EXPIRED waiver has lapsed: the HIGH finding is open again (exit 1)", () => {
  const p = log([{ change: "x", findings: [{ severity: "high", where: "a.mjs", finding: "x", waiver: { reason: "temporary", approver: "mdenner", expires: "2000-01-01" } }] }]);
  assert.equal(run(p).status, 1);
});

test("a non-string resolution does not clear a HIGH (fails closed, exit 2)", () => {
  const p = log([{ change: "x", findings: [{ severity: "high", where: "a.mjs", finding: "x", resolution: 0 }] }]);
  assert.equal(run(p).status, 2);
});

test("a non-string severity fails closed (exit 2), not open", () => {
  const p = log([{ change: "x", findings: [{ severity: { level: "high" }, where: "a.mjs", finding: "x" }] }]);
  assert.equal(run(p).status, 2);
});

test("a MEDIUM/low finding does not block (only HIGH/critical do)", () => {
  const p = log([{ change: "x", findings: [{ severity: "medium", where: "a.mjs", finding: "x" }, { severity: "low-medium", where: "b.mjs", finding: "y" }] }]);
  assert.equal(run(p).status, 0);
});

test("a critical finding blocks too (discriminating)", () => {
  const p = log([{ change: "x", findings: [{ severity: "critical", where: "a.mjs", finding: "x" }] }]);
  assert.equal(run(p).status, 1);
});

test("--change scopes to one change's entries", () => {
  const p = log([
    { change: "other", findings: [{ severity: "high", where: "a.mjs", finding: "old open high" }] },
    { change: "mine", findings: [{ severity: "high", where: "b.mjs", finding: "x", resolution: "fixed" }] },
  ]);
  assert.equal(run(p, ["--change", "mine"]).status, 0, "mine's HIGH is resolved");
  assert.equal(run(p, ["--change", "other"]).status, 1, "other's HIGH is open");
});

test("clean entries (no findings) pass", () => {
  assert.equal(run(log([{ change: "x", findings: [] }])).status, 0);
});

test("fail-closed: missing log", () => {
  const r = run(join(tmpdir(), "nope-" + Date.now() + ".jsonl"));
  assert.equal(r.status, 2, r.out);
});

test("fail-closed: a non-JSON line", () => {
  const dir = mkdtempSync(join(tmpdir(), "ohf-"));
  const p = join(dir, "log.jsonl");
  writeFileSync(p, "{not json\n");
  assert.equal(run(p).status, 2);
});

test("fail-closed: a finding with no severity", () => {
  const p = log([{ change: "x", findings: [{ where: "a.mjs", finding: "x" }] }]);
  assert.equal(run(p).status, 2);
});

test("fail-closed: --change names a change with no review entry", () => {
  const p = log([{ change: "x", findings: [] }]);
  assert.equal(run(p, ["--change", "ghost"]).status, 2);
});
