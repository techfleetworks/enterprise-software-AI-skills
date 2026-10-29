// Discriminating tests for compare-gate-runs.mjs (issue #178). Each builds base/changed gate-run
// fixtures, runs the REAL script, and asserts the exit code and output - including the cases that
// prove it detects (no-op the script to always exit 0 and the "must be non-zero" cases flip to fail).
import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const REPO = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const SCRIPT = resolve(REPO, ".claude/skills/verifiable-quality-gates/scripts/compare-gate-runs.mjs");

function fixtures(base, changed) {
  const dir = mkdtempSync(join(tmpdir(), "cgr-"));
  const bp = join(dir, "base.json");
  const cp = join(dir, "changed.json");
  if (base !== undefined) writeFileSync(bp, typeof base === "string" ? base : JSON.stringify(base));
  if (changed !== undefined) writeFileSync(cp, typeof changed === "string" ? changed : JSON.stringify(changed));
  return { dir, bp, cp };
}
function run(args) {
  const r = spawnSync(process.execPath, [SCRIPT, ...args], { encoding: "utf8" });
  return { status: r.status, out: (r.stdout || "") + (r.stderr || "") };
}
function compare(base, changed, extra = []) {
  const { bp, cp } = fixtures(base, changed);
  return run(["--base", bp, "--changed", cp, ...extra]);
}

test("happy: identical passing runs report 0 new failures (exit 0)", () => {
  const r = compare([{ gate: "a", exit: 0 }, { gate: "b", exit: 0 }], [{ gate: "a", exit: 0 }, { gate: "b", exit: 0 }]);
  assert.equal(r.status, 0, r.out);
  assert.match(r.out, /OK - 0 new failures/);
});

test("missing field: a status field absent from every record errors and prints NO count (discriminating)", () => {
  // Records have "exit"; we compare on "ok", which no record has.
  const r = compare([{ gate: "a", exit: 0 }], [{ gate: "a", exit: 0 }], ["--status-field", "ok"]);
  assert.equal(r.status, 2, r.out);
  assert.match(r.out, /"ok"/, "error must name the missing field");
  assert.doesNotMatch(r.out, /OK - 0 new failures/, "must not print the clean count line");
});

test("missing field on SOME records also errors (proven-present means every record)", () => {
  const r = compare([{ gate: "a", exit: 0 }], [{ gate: "a" }], ["--status-field", "exit"]);
  assert.equal(r.status, 2, r.out);
  assert.match(r.out, /"exit"/);
});

test("worsening: a red-in-both gate with more problems is a new failure, not clean (discriminating)", () => {
  const r = compare([{ gate: "a", exit: 1, problems: 420 }], [{ gate: "a", exit: 1, problems: 430 }], ["--count-field", "problems"]);
  assert.equal(r.status, 1, r.out);
  assert.match(r.out, /\+10 new problems/);
  assert.match(r.out, /not clean/i);
  assert.doesNotMatch(r.out, /OK - 0 new failures/);
});

test("worsening: a red-in-both gate that did NOT get worse is clean", () => {
  const r = compare([{ gate: "a", exit: 1, problems: 430 }], [{ gate: "a", exit: 1, problems: 430 }], ["--count-field", "problems"]);
  assert.equal(r.status, 0, r.out);
});

test("new failure: passed in base, failed in changed (exit 1, discriminating)", () => {
  const r = compare([{ gate: "a", exit: 0 }], [{ gate: "a", exit: 1 }]);
  assert.equal(r.status, 1, r.out);
  assert.match(r.out, /NEW failures/);
  assert.match(r.out, /\ba\b/);
});

test("both-red with no count field is UNVERIFIABLE and blocks clean (discriminating)", () => {
  const r = compare([{ gate: "a", exit: 1 }], [{ gate: "a", exit: 1 }], ["--count-field", "problems"]);
  assert.equal(r.status, 1, r.out);
  assert.match(r.out, /UNVERIFIABLE/);
});

test("a gate dropped between base and changed blocks clean and is named (discriminating)", () => {
  // b was passing in base and is gone from changed: a silently removed green gate is a false-clean vector.
  const r = compare([{ gate: "a", exit: 0 }, { gate: "b", exit: 0 }], [{ gate: "a", exit: 0 }]);
  assert.equal(r.status, 1, r.out);
  assert.match(r.out, /DROPPED/);
  assert.match(r.out, /\bb\b/);
  assert.doesNotMatch(r.out, /OK - 0 new failures/);
});

test("a dropped gate that was red in base is also flagged (not hidden by its prior failure)", () => {
  const r = compare([{ gate: "a", exit: 0 }, { gate: "b", exit: 1 }], [{ gate: "a", exit: 0 }]);
  assert.equal(r.status, 1, r.out);
  assert.match(r.out, /DROPPED/);
});

test("fail-closed: a changed run with zero records cannot be clean", () => {
  const r = compare([{ gate: "a", exit: 0 }], []);
  assert.equal(r.status, 2, r.out);
  assert.match(r.out, /zero gate records/);
});

test("fail-closed: a base run with zero records cannot establish a baseline", () => {
  const r = compare([], [{ gate: "a", exit: 0 }]);
  assert.equal(r.status, 2, r.out);
});

test("fail-closed: missing --base/--changed", () => {
  assert.equal(run([]).status, 2);
  const { bp } = fixtures([{ gate: "a", exit: 0 }], undefined);
  assert.equal(run(["--base", bp]).status, 2);
});

test("fail-closed: unreadable file", () => {
  const missing = join(tmpdir(), "nope-" + Date.now() + ".json");
  const { cp } = fixtures(undefined, [{ gate: "a", exit: 0 }]);
  assert.equal(run(["--base", missing, "--changed", cp]).status, 2);
});

test("fail-closed: invalid JSON", () => {
  const r = compare("{not json", [{ gate: "a", exit: 0 }]);
  assert.equal(r.status, 2, r.out);
});

test("fail-closed: a non-array payload", () => {
  const r = compare({ gate: "a", exit: 0 }, [{ gate: "a", exit: 0 }]);
  assert.equal(r.status, 2, r.out);
});

test("fail-closed: a record missing its id field", () => {
  const r = compare([{ exit: 0 }], [{ gate: "a", exit: 0 }]);
  assert.equal(r.status, 2, r.out);
  assert.match(r.out, /gate/);
});
