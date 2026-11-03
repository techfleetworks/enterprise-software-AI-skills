// Discriminating tests for .claude/skills/usability-ux-universal-design/scripts/check-readability.mjs
//
// The gate walks a configured user-facing surface and runs the REAL readability --max-grade over EVERY file
// in it. These spawn the real gate against fixture surfaces and assert its exit code. The load-bearing case:
// a surface with one above-grade file must FAIL (exit 1); a no-op gate (always exit 0) flips that, which is
// what makes the test discriminate. Fail-closed cases (empty surface, missing/!numeric maxGrade, missing
// config/root) must exit 2 - an unmeasured surface is never a silent pass.
import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtempSync, mkdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const REPO = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const GATE = resolve(REPO, ".claude/skills/usability-ux-universal-design/scripts/check-readability.mjs");

// A deliberately large grade gap so a maxGrade of 8 cleanly separates them regardless of small formula drift.
const SIMPLE = "The cat sat. The dog ran. We go now. It is good. The sun is up.\n"; // very low grade
const HARD =
  "The comprehensive instrumentation infrastructure necessitates substantial architectural reconfiguration " +
  "whenever organizational requirements evolve unpredictably throughout the implementation lifecycle.\n"; // high grade

function surface(files = {}, extra = {}) {
  const root = mkdtempSync(join(tmpdir(), "readgate-"));
  const docs = join(root, "docs");
  mkdirSync(docs);
  for (const [name, text] of Object.entries(files)) {
    const p = join(docs, name);
    mkdirSync(dirname(p), { recursive: true });
    writeFileSync(p, text);
  }
  const cfg = { maxGrade: 8, roots: [docs], ext: [".md"], ...extra };
  const cfgPath = join(root, "readability.config.json");
  writeFileSync(cfgPath, JSON.stringify(cfg));
  return { root, docs, cfgPath };
}
const run = (cfgPath) => spawnSync(process.execPath, [GATE, "--config", cfgPath], { encoding: "utf8" });

test("PASSES a surface whose every file is at or below the grade (exit 0)", () => {
  const { cfgPath } = surface({ "a.md": SIMPLE, "b.md": SIMPLE });
  const r = run(cfgPath);
  assert.equal(r.status, 0, (r.stdout || "") + (r.stderr || ""));
  assert.match((r.stdout || "") + (r.stderr || ""), /2 file\(s\) scanned/);
});

test("FAILS when any file reads above the grade (exit 1) - discriminating", () => {
  const { cfgPath } = surface({ "ok.md": SIMPLE, "hard.md": HARD });
  const r = run(cfgPath);
  assert.equal(r.status, 1, (r.stdout || "") + (r.stderr || ""));
  assert.match((r.stdout || "") + (r.stderr || ""), /hard\.md/);
});

test("a NESTED above-grade file is still caught (whole-tree walk, discriminating)", () => {
  const { cfgPath } = surface({ "sub/deep/hard.md": HARD });
  assert.equal(run(cfgPath).status, 1);
});

test("a single-FILE root is scanned (exit 1 when it is above grade)", () => {
  const root = mkdtempSync(join(tmpdir(), "readgate-"));
  const file = join(root, "README.md");
  writeFileSync(file, HARD);
  const cfgPath = join(root, "c.json");
  writeFileSync(cfgPath, JSON.stringify({ maxGrade: 8, roots: [file] }));
  assert.equal(run(cfgPath).status, 1);
});

test("fail-closed: an EMPTY surface exits 2, not a silent pass", () => {
  const { cfgPath } = surface({ "notes.txt": HARD }, { ext: [".md"] }); // the .txt is ignored -> zero files
  assert.equal(run(cfgPath).status, 2);
});

test("fail-closed: a missing maxGrade exits 2", () => {
  const { cfgPath } = surface({ "a.md": SIMPLE }, { maxGrade: undefined });
  assert.equal(run(cfgPath).status, 2);
});

test("fail-closed: a non-numeric maxGrade exits 2", () => {
  const { cfgPath } = surface({ "a.md": SIMPLE }, { maxGrade: "ten" });
  assert.equal(run(cfgPath).status, 2);
});

test("fail-closed: a missing config exits 2", () => {
  const r = spawnSync(process.execPath, [GATE, "--config", join(tmpdir(), "nope-readability.json")], { encoding: "utf8" });
  assert.equal(r.status, 2);
});

test("fail-closed: no --config exits 2", () => {
  assert.equal(spawnSync(process.execPath, [GATE], { encoding: "utf8" }).status, 2);
});

test("fail-closed: a root that does not exist exits 2", () => {
  const root = mkdtempSync(join(tmpdir(), "readgate-"));
  const cfgPath = join(root, "c.json");
  writeFileSync(cfgPath, JSON.stringify({ maxGrade: 8, roots: [join(root, "nope")] }));
  assert.equal(run(cfgPath).status, 2);
});

test("--help prints usage and exits 0", () => {
  const r = spawnSync(process.execPath, [GATE, "--help"], { encoding: "utf8" });
  assert.equal(r.status, 0);
  assert.match(r.stdout || "", /usage:/i);
});
