// Discriminating tests for judge-arch's two review gates:
//   check-arch-review-coverage   — a change isn't "reviewed" unless the log proves the full matrix.
//   check-arch-rules-discriminate — the mechanical layer must flag planted violations (mutation test).
import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtempSync, writeFileSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const REPO = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const COV = resolve(REPO, ".claude/skills/judge-arch/scripts/check-arch-review-coverage.mjs");
const DISC = resolve(REPO, ".claude/skills/judge-arch/scripts/check-arch-rules-discriminate.mjs");
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
function cov(entry, changedList, extra = [], change = "c1") {
  const log = typeof entry === "string" ? entry : writeLog(entry);
  const r = spawnSync(process.execPath, [COV, "--log", log, "--change", change, "--changed-list", changedList, ...extra], { encoding: "utf8" });
  return r.status;
}

// --- check-arch-review-coverage ---------------------------------------------
test("coverage: passes a fully reviewed, evidenced change", () => {
  assert.equal(cov(baseEntry(), "a.ts"), 0);
});
test("coverage: FLAGS an unreviewed changed file (discriminating)", () => {
  assert.equal(cov(baseEntry(), "a.ts,b.ts"), 1);
});
test("coverage ISSUE-151: a vendored .claude/skills file is NOT required to be reviewed (re-vendor, discriminating)", () => {
  // Reverting the exclusion makes the vendored file "unreviewed" -> exit 1, so this is discriminating.
  assert.equal(cov(baseEntry(), "a.ts,.claude/skills/judge-arch/scripts/arch-gate.mjs"), 0);
});
test("coverage ISSUE-151: a pure re-vendor (only vendored paths) needs no review cells", () => {
  assert.equal(cov(baseEntry(), ".claude/skills/judge-arch/SKILL.md,.claude/skills/judge-arch/scripts/arch-gate.mjs"), 0);
});
test("coverage ISSUE-151: a real (non-vendored) unreviewed file still fails (the exclusion is narrow)", () => {
  assert.equal(cov(baseEntry(), "a.ts,src/widget.tsx"), 1);
});
test("coverage ISSUE-151 N1: --no-default-skills-exclude re-requires review of a .claude/skills file (upstream repo reviews its own skills)", () => {
  // The UPSTREAM repo's OWN product IS .claude/skills; the escape turns the default exclusion off so its skill
  // changes still need review. Discriminating: without the flag this exact file is excluded (exit 0, test above).
  assert.equal(cov(baseEntry(), "a.ts,.claude/skills/judge-arch/scripts/arch-gate.mjs", ["--no-default-skills-exclude"]), 1);
});
test("coverage ISSUE-151 N2: a discriminate-fixtures path OUTSIDE .claude/skills is NOT excluded (narrowing is anchored to the tree)", () => {
  // The old un-anchored fixtures regex matched this anywhere; dropping it means a real product path that merely
  // contains that segment is still reviewed. Unreviewed -> exit 1.
  assert.equal(cov(baseEntry(), "a.ts,src/discriminate-fixtures/Calc.tsx"), 1);
});
test("coverage ISSUE-151: --exclude <prefix> drops a matching path from the files needing review (with control)", () => {
  // Control: without the flag, src/vendor/x.ts is unreviewed -> exit 1.
  assert.equal(cov(baseEntry(), "a.ts,src/vendor/x.ts"), 1);
  // With --exclude src/vendor, that path needs no review cell -> exit 0.
  assert.equal(cov(baseEntry(), "a.ts,src/vendor/x.ts", ["--exclude", "src/vendor"]), 0);
});
test("coverage: FLAGS a missing question in the matrix (discriminating)", () => {
  const e = baseEntry(); delete e.matrix["a.ts"].dependency;
  assert.equal(cov(e, "a.ts"), 1);
});
test("coverage: FLAGS a cleared cell with no evidence (no silent clears, discriminating)", () => {
  const e = baseEntry(); e.matrix["a.ts"].boundary = { verdict: "cleared", evidence: "" };
  assert.equal(cov(e, "a.ts"), 1);
});
test("coverage: FLAGS an all-n/a matrix with no evidence (vacuous full-review bypass, discriminating)", () => {
  // Hardening: declaring every question n/a for every file with no reason used to certify a full review.
  const e = baseEntry();
  for (const q of QS) e.matrix["a.ts"][q] = { verdict: "n/a" };
  assert.equal(cov(e, "a.ts"), 1);
});
test("coverage: an n/a cell WITH a reason still passes (no false positive)", () => {
  const e = baseEntry();
  for (const q of QS) e.matrix["a.ts"][q] = { verdict: "n/a", evidence: "pure doc change; no code surface" };
  assert.equal(cov(e, "a.ts"), 0);
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
test("coverage: FLAGS a stale entry not FOR this change (discriminating — the HIGH false-pass)", () => {
  const e = baseEntry(); e.change = "OLD-PR-99 (unrelated)"; // lists a.ts, fully evidenced, but for another change
  assert.equal(cov(e, "a.ts", [], "c1"), 1);
});
test("coverage: fails closed when --base is given but missing (no silent skip)", () => {
  const missing = join(tmpdir(), "no-base-" + Date.now() + ".jsonl");
  assert.equal(cov(baseEntry(), "a.ts", ["--base", missing]), 1);
});

// --- Finding B: append-only check is optional but MUST be disclosed, with a force-knob ----------
function covRun(entry, changedList, extra = [], env = {}, change = "c1") {
  const log = typeof entry === "string" ? entry : writeLog(entry);
  return spawnSync(process.execPath, [COV, "--log", log, "--change", change, "--changed-list", changedList, ...extra],
    { encoding: "utf8", env: { ...process.env, ...env } });
}
test("coverage: without --base it PASSES but the OK line discloses append-only was NOT verified", () => {
  const r = covRun(baseEntry(), "a.ts");
  assert.equal(r.status, 0, (r.stdout || "") + (r.stderr || ""));
  assert.match(r.stdout, /NOT verified/);
});
test("coverage: with a matching --base it PASSES and discloses append-only VERIFIED", () => {
  const log = writeLog(baseEntry());
  const base = join(mkdtempSync(join(tmpdir(), "base-")), "base.jsonl");
  writeFileSync(base, readFileSync(log, "utf8")); // current log starts with (equals) the base
  const r = covRun(log, "a.ts", ["--base", base]);
  assert.equal(r.status, 0, (r.stdout || "") + (r.stderr || ""));
  assert.match(r.stdout, /append-only verified/);
});
test("coverage: ARCH_REQUIRE_LOG_BASE=1 with no --base FAILS closed (discriminating force-knob)", () => {
  const r = covRun(baseEntry(), "a.ts", [], { ARCH_REQUIRE_LOG_BASE: "1" });
  assert.equal(r.status, 1);
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
test("discriminate: a MISSING planted fixture reports a fixture error, not an arch-gate miss (#126)", () => {
  // A consumer that gitignores data/ (etc.) can drop a fixture file; the gate must then blame the fixture set,
  // not arch-gate for a "slip-through". planted.json names a file that does not exist on disk.
  const dir = mkdtempSync(join(tmpdir(), "disc-fx-"));
  writeFileSync(join(dir, "planted.json"), JSON.stringify(["ghost/missing.ts"]));
  const r = spawnSync(process.execPath, [DISC, "--fixtures", dir], { encoding: "utf8" });
  const out = (r.stdout || "") + (r.stderr || "");
  assert.equal(r.status, 1, out);
  assert.match(out, /missing from|incomplete/i, "must report a missing-fixture error");
  assert.doesNotMatch(out, /did not flag/i, "must NOT blame arch-gate for a slip-through when the fixture is absent");
});
