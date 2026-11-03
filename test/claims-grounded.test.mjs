// Discriminating tests for .claude/skills/skeptical-audit/scripts/check-claims-grounded.mjs
//
// The gate walks a configured "findings" surface and runs the REAL claim-lint --strict over EVERY file in
// it. These spawn the real gate against controlled fixture surfaces and assert its exit code, per
// .claude/skills/verifiable-quality-gates/references/check-test-patterns.md. The load-bearing case: a surface
// containing one untagged-claim file must FAIL (exit 1); a no-op gate (always exit 0) flips that case, which
// is what makes this test discriminate. Fail-closed cases (empty surface, missing config, missing root) must
// exit 2 - an unscanned surface is never a silent pass.
import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtempSync, mkdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const REPO = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const GATE = resolve(REPO, ".claude/skills/skeptical-audit/scripts/check-claims-grounded.mjs");

const CLEAN = "# Plan\n\nThis document describes the rollout steps and the people involved.\n";
const UNTAGGED = "# Report\n\nThe deployment is live and every request is handled.\n"; // claim, no evidence state
const TAGGED = "# Report\n\nThe deployment is live [observed]: `curl` returned 200 at 12:00 UTC.\n";

// Build a fixture surface: a temp root dir seeded with the given files, plus a config pointing at it.
// `extra` overrides config keys (to exercise exclude / ext / fail-closed shapes).
function surface(files = {}, extra = {}) {
  const root = mkdtempSync(join(tmpdir(), "claims-"));
  const docs = join(root, "docs");
  mkdirSync(docs);
  for (const [name, text] of Object.entries(files)) {
    const p = join(docs, name);
    mkdirSync(dirname(p), { recursive: true });
    writeFileSync(p, text);
  }
  const cfg = { roots: [docs], ext: [".md"], ...extra };
  const cfgPath = join(root, "claims-grounded.config.json");
  writeFileSync(cfgPath, JSON.stringify(cfg));
  return { root, docs, cfgPath };
}
const run = (cfgPath) => spawnSync(process.execPath, [GATE, "--config", cfgPath], { encoding: "utf8" });

test("PASSES a surface whose every file is clean (exit 0) and reports the count", () => {
  const { cfgPath } = surface({ "a.md": CLEAN, "b.md": CLEAN });
  const r = run(cfgPath);
  assert.equal(r.status, 0, (r.stdout || "") + (r.stderr || ""));
  assert.match((r.stdout || "") + (r.stderr || ""), /2 file\(s\) scanned/);
});

test("FAILS when any file carries an untagged claim (exit 1) - discriminating", () => {
  // A no-op gate (always exit 0) would pass this; that is the mutation the discrimination gate plants.
  const { cfgPath } = surface({ "ok.md": CLEAN, "bad.md": UNTAGGED });
  const r = run(cfgPath);
  assert.equal(r.status, 1, (r.stdout || "") + (r.stderr || ""));
  assert.match((r.stdout || "") + (r.stderr || ""), /bad\.md/);
});

test("does NOT flag an evidence-tagged claim (no false positive, exit 0)", () => {
  const { cfgPath } = surface({ "a.md": TAGGED });
  assert.equal(run(cfgPath).status, 0);
});

test("a NESTED untagged-claim file is still caught (whole-tree walk, discriminating)", () => {
  const { cfgPath } = surface({ "sub/deep/bad.md": UNTAGGED });
  assert.equal(run(cfgPath).status, 1);
});

test("exclude skips a configured subtree (no false positive on an excluded template)", () => {
  const { docs, cfgPath } = surface({ "templates/bad.md": UNTAGGED, "real.md": CLEAN }, { exclude: ["templates"] });
  // sanity: the exclude is a path substring; the untagged file lives under docs/templates/
  void docs;
  assert.equal(run(cfgPath).status, 0);
});

test("fail-closed: an EMPTY surface (no matching files) exits 2, not a silent pass", () => {
  const { cfgPath } = surface({ "notes.txt": UNTAGGED }, { ext: [".md"] }); // only .md scanned; the .txt is ignored -> zero files
  assert.equal(run(cfgPath).status, 2);
});

test("fail-closed: a missing config exits 2", () => {
  const r = spawnSync(process.execPath, [GATE, "--config", join(tmpdir(), "does-not-exist.json")], { encoding: "utf8" });
  assert.equal(r.status, 2);
});

test("fail-closed: no --config exits 2", () => {
  assert.equal(spawnSync(process.execPath, [GATE], { encoding: "utf8" }).status, 2);
});

test("fail-closed: a root that does not exist exits 2", () => {
  const root = mkdtempSync(join(tmpdir(), "claims-"));
  const cfgPath = join(root, "c.json");
  writeFileSync(cfgPath, JSON.stringify({ roots: [join(root, "nope")], ext: [".md"] }));
  assert.equal(run(cfgPath).status, 2);
});

test("fail-closed: an empty roots array exits 2", () => {
  const root = mkdtempSync(join(tmpdir(), "claims-"));
  const cfgPath = join(root, "c.json");
  writeFileSync(cfgPath, JSON.stringify({ roots: [], ext: [".md"] }));
  assert.equal(run(cfgPath).status, 2);
});

test("--help prints usage and exits 0", () => {
  const out = execHelp();
  assert.match(out, /usage:/i);
});
function execHelp() {
  const r = spawnSync(process.execPath, [GATE, "--help"], { encoding: "utf8" });
  assert.equal(r.status, 0);
  return r.stdout || "";
}
