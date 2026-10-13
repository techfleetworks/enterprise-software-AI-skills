// Discriminating tests for .claude/skills/universal-accessibility-wcag/scripts/check-a11y-checklist.mjs.
// Every combined-checklist criterion must have a valid verdict; automated-only closure is rejected for
// manual/both criteria; manual passes need reviewer+date; not-applicable needs a reason; bad input fails closed.
import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const REPO = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const CHECK = resolve(REPO, ".claude/skills/universal-accessibility-wcag/scripts/check-a11y-checklist.mjs");
const ASSETS = resolve(REPO, ".claude/skills/universal-accessibility-wcag/assets");

// A tiny checklist fixture with one of each method.
const CHECKLIST = { criteria: [
  { sc: "3.1.1", name: "Language of Page", method: "automated" },
  { sc: "1.1.1", name: "Non-text Content", method: "both" },
  { sc: "2.1.1", name: "Keyboard", method: "manual" },
] };

function run(record, checklist = CHECKLIST) {
  const dir = mkdtempSync(join(tmpdir(), "a11y-"));
  const cp = join(dir, "checklist.json"); writeFileSync(cp, JSON.stringify(checklist));
  const rp = join(dir, "record.json"); writeFileSync(rp, typeof record === "string" ? record : JSON.stringify(record));
  const r = spawnSync(process.execPath, [CHECK, "--checklist", cp, "--record", rp], { encoding: "utf8" });
  return { status: r.status, out: (r.stdout || "") + (r.stderr || "") };
}

const FULL = {
  "3.1.1": { status: "pass-automated" },
  "1.1.1": { status: "pass-manual", reviewer: "a11y-team", date: "2026-10-12" },
  "2.1.1": { status: "pass-manual", reviewer: "a11y-team", date: "2026-10-12" },
};

// --- valid records PASS ------------------------------------------------------
test("PASSES when every criterion has a valid verdict", () => {
  assert.equal(run(FULL).status, 0, run(FULL).out);
});
test("FLAGS a pass-manual verdict dated in the future (fabricated sign-off, discriminating)", () => {
  const r = run({ ...FULL, "1.1.1": { status: "pass-manual", reviewer: "a11y-team", date: "2099-12-31" } });
  assert.equal(r.status, 1, r.out);
  assert.match(r.out, /future/i);
});
test("PASSES not-applicable with a reason", () => {
  const r = run({ ...FULL, "2.1.1": { status: "not-applicable", note: "static page, no interactive controls" } });
  assert.equal(r.status, 0, r.out);
});
test("PASSES the real committed combined checklist against the example record", () => {
  const r = spawnSync(process.execPath, [CHECK,
    "--checklist", join(ASSETS, "combined-a11y-checklist.json"),
    "--record", join(ASSETS, "example", "a11y-conformance.json")], { encoding: "utf8" });
  assert.equal(r.status, 0, (r.stdout || "") + (r.stderr || ""));
});

// --- each gap FAILS (discriminating) -----------------------------------------
test("FLAGS a criterion with no verdict in the record (exit 1)", () => {
  const { "2.1.1": _omit, ...rec } = FULL;
  const r = run(rec);
  assert.equal(r.status, 1, r.out);
  assert.match(r.out, /2\.1\.1/);
});
test("FLAGS an invalid status (exit 1)", () => {
  const r = run({ ...FULL, "2.1.1": { status: "todo" } });
  assert.equal(r.status, 1, r.out);
  assert.match(r.out, /invalid or missing status/);
});
test("FLAGS pass-automated on a MANUAL criterion (automation is not enough, discriminating)", () => {
  const r = run({ ...FULL, "2.1.1": { status: "pass-automated" } });
  assert.equal(r.status, 1, r.out);
  assert.match(r.out, /not enough/);
});
test("FLAGS pass-automated on a BOTH criterion (discriminating)", () => {
  const r = run({ ...FULL, "1.1.1": { status: "pass-automated" } });
  assert.equal(r.status, 1, r.out);
});
test("ACCEPTS pass-automated on an AUTOMATED criterion (discriminating boundary)", () => {
  // 3.1.1 is method "automated", so pass-automated alone is valid; keep the others valid.
  assert.equal(run(FULL).status, 0);
});
test("FLAGS pass-manual with no reviewer (exit 1)", () => {
  const r = run({ ...FULL, "2.1.1": { status: "pass-manual", date: "2026-10-12" } });
  assert.equal(r.status, 1, r.out);
  assert.match(r.out, /reviewer/);
});
test("FLAGS pass-manual with no/!ISO date (exit 1)", () => {
  const r = run({ ...FULL, "2.1.1": { status: "pass-manual", reviewer: "x" } });
  assert.equal(r.status, 1, r.out);
});
test("FLAGS not-applicable with no reason (exit 1, discriminating)", () => {
  const r = run({ ...FULL, "2.1.1": { status: "not-applicable" } });
  assert.equal(r.status, 1, r.out);
  assert.match(r.out, /note/);
});
test("FLAGS a placeholder reviewer like 'TBD' (exit 1, discriminating)", () => {
  const r = run({ ...FULL, "2.1.1": { status: "pass-manual", reviewer: "TBD", date: "2026-10-12" } });
  assert.equal(r.status, 1, r.out);
  assert.match(r.out, /reviewer/);
});
test("FLAGS a placeholder not-applicable note like 'n/a' (exit 1, discriminating)", () => {
  const r = run({ ...FULL, "2.1.1": { status: "not-applicable", note: "n/a" } });
  assert.equal(r.status, 1, r.out);
});
test("FLAGS an impossible date like 0000-00-00 (exit 1, discriminating)", () => {
  const r = run({ ...FULL, "2.1.1": { status: "pass-manual", reviewer: "a11y-team", date: "0000-00-00" } });
  assert.equal(r.status, 1, r.out);
});
test("FLAGS an out-of-range date like 2026-99-99 (exit 1, discriminating)", () => {
  const r = run({ ...FULL, "2.1.1": { status: "pass-manual", reviewer: "a11y-team", date: "2026-99-99" } });
  assert.equal(r.status, 1, r.out);
});

// --- fail closed on bad input ------------------------------------------------
test("fails closed (exit 2) when a file is missing", () => {
  const r = spawnSync(process.execPath, [CHECK, "--checklist", join(tmpdir(), "nope.json"), "--record", join(tmpdir(), "nope2.json")], { encoding: "utf8" });
  assert.equal(r.status, 2);
});
test("fails closed (exit 2) on invalid JSON in the record", () => {
  assert.equal(run("{ not json").status, 2);
});
test("fails closed (exit 2) on an empty checklist", () => {
  assert.equal(run(FULL, { criteria: [] }).status, 2);
});
test("fails closed (exit 2) when args are missing", () => {
  const r = spawnSync(process.execPath, [CHECK], { encoding: "utf8" });
  assert.equal(r.status, 2);
});
