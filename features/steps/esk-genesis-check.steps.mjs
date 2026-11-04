// Step definitions for features/repo-process/esk-genesis-check.feature (#203 gap 2, ADR-0115).
// Drives the REAL esk-genesis installer: builds a minimal upstream source fixture, genesis's a throwaway
// consumer, then runs the read-only --check and asserts its verdict, so a regressed --check reds here.
import { mkdtempSync, mkdirSync, writeFileSync, existsSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync, execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import assert from "node:assert/strict";

const REPO = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..");
const GEN = join(REPO, ".claude/skills/bootstrap/scripts/esk-genesis.mjs");
const sha = (s) => createHash("sha256").update(s).digest("hex");
const created = [];

function buildSource() {
  const root = mkdtempSync(join(tmpdir(), "egc-src-"));
  created.push(root);
  const sdir = join(root, ".claude", "skills", "judge-arch", "scripts");
  mkdirSync(sdir, { recursive: true });
  mkdirSync(join(root, "test"), { recursive: true });
  const tdir = join(root, ".claude", "skills", "bootstrap", "templates");
  mkdirSync(tdir, { recursive: true });
  writeFileSync(join(tdir, "pre-push"), "#!/usr/bin/env node\nprocess.exit(0);\n");
  writeFileSync(join(tdir, "install-hooks.mjs"), "#!/usr/bin/env node\nprocess.exit(0);\n");
  const gateBody = "// bootstrap-v2-gate: alpha\n// body\n";
  const runBody = "// bootstrap-v2-machinery: runner\n// body\n";
  const testBody = "// test\n";
  writeFileSync(join(sdir, "check-alpha.mjs"), gateBody);
  writeFileSync(join(sdir, "run-runner.mjs"), runBody);
  writeFileSync(join(root, "test/alpha.test.mjs"), testBody);
  const manifest = {
    version: "1.0.0",
    generatedFrom: "techfleetworks/enterprise-software-AI-skills@1.0.0",
    gates: [{ id: "alpha", origin: "upstream", skill: "judge-arch", script: "scripts/ci/check-alpha.mjs", sha256: sha(gateBody), test: "test/alpha.test.mjs", testSha256: sha(testBody), lane: "required" }],
    machinery: [{ id: "runner", skill: "judge-arch", script: "scripts/ci/run-runner.mjs", sha256: sha(runBody) }],
    aggregator: { requiredCheck: "enterprise-gates" },
  };
  writeFileSync(join(root, "gate-manifest.json"), JSON.stringify(manifest, null, 2) + "\n");
  return root;
}
function newTarget() {
  const parent = mkdtempSync(join(tmpdir(), "egc-tgt-"));
  created.push(parent);
  const t = join(parent, "repo");
  mkdirSync(t, { recursive: true });
  execFileSync("git", ["init", "-q", t], { stdio: "pipe" });
  return t;
}
const genesis = (src, tgt) => spawnSync(process.execPath, [GEN, "--source", src, "--target", tgt, "--yes"], { encoding: "utf8" });
const check = (src, tgt) => spawnSync(process.execPath, [GEN, "--source", src, "--target", tgt, "--check"], { encoding: "utf8" });

export default function ({ Given, When, Then, And }) {
  Given(/^a consumer repo that has been genesis'd from the upstream gates$/, (world) => {
    world.src = buildSource();
    world.tgt = newTarget();
    const g = genesis(world.src, world.tgt);
    assert.equal(g.status, 0, (g.stdout || "") + (g.stderr || ""));
  });
  Given(/^a repo that was never genesis'd$/, (world) => {
    world.src = buildSource();
    world.tgt = newTarget();
  });
  And(/^one of its installed gate scripts is deleted$/, (world) => {
    rmSync(join(world.tgt, "scripts/ci/check-alpha.mjs"));
  });
  And(/^the upstream source no longer matches its own manifest$/, (world) => {
    writeFileSync(join(world.src, ".claude/skills/judge-arch/scripts/check-alpha.mjs"), "// bootstrap-v2-gate: alpha\n// TAMPERED\n");
  });
  When(/^esk-genesis --check is run on it$/, (world) => {
    world.result = check(world.src, world.tgt);
  });
  Then(/^the check exits 0 and reports the repo covered and current$/, (world) => {
    assert.equal(world.result.status, 0, (world.result.stdout || "") + (world.result.stderr || ""));
    assert.match((world.result.stdout || "") + (world.result.stderr || ""), /covered and current/i);
  });
  Then(/^the check exits 1 and reports drift$/, (world) => {
    assert.equal(world.result.status, 1, (world.result.stdout || "") + (world.result.stderr || ""));
    assert.match((world.result.stdout || "") + (world.result.stderr || ""), /DRIFT/);
  });
  And(/^no gate-manifest\.json or scripts\/ci is created$/, (world) => {
    assert.ok(!existsSync(join(world.tgt, "gate-manifest.json")), "no manifest written");
    assert.ok(!existsSync(join(world.tgt, "scripts/ci")), "no gate scripts written");
  });
  Then(/^the check exits 2 \(cannot assess, fail closed\)$/, (world) => {
    assert.equal(world.result.status, 2, (world.result.stdout || "") + (world.result.stderr || ""));
  });
}

process.on("exit", () => { for (const d of created) { try { rmSync(d, { recursive: true, force: true }); } catch { /* best-effort */ } } });
