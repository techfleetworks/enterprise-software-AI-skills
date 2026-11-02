// Step definitions for features/repo-process/consumer-gate-classification.feature (ADR-0109).
// Builds a throwaway skills tree + gate-manifest.json and runs the REAL check-upstream-manifest-integrity gate
// via its env seams, so a classification rule that regressed turns these red (the same gate CI runs on this repo).
import { mkdtempSync, mkdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import assert from "node:assert/strict";

const REPO = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..");
const GATE = join(REPO, ".claude/skills/judge-arch/scripts/check-upstream-manifest-integrity.mjs");
const sha = (s) => createHash("sha256").update(s).digest("hex");

function newTree(world) {
  world.root = mkdtempSync(join(tmpdir(), "cgc-"));
  world.skillsDir = join(world.root, ".claude", "skills");
  mkdirSync(world.skillsDir, { recursive: true });
  world.gates = [];
  world.consumerRequiredGates = [];
}
// Write a marked source under a skill and return its LF-normalized hash.
function writeSource(world, skill, name, marker, id) {
  const dir = join(world.skillsDir, skill, "scripts");
  mkdirSync(dir, { recursive: true });
  const body = `// bootstrap-v2-${marker}: ${id}\n// body\n`;
  writeFileSync(join(dir, name), body);
  return sha(body.replace(/\r\n/g, "\n"));
}
function writeTest(world, rel, body = "// test\n") {
  mkdirSync(join(world.root, dirname(rel)), { recursive: true });
  writeFileSync(join(world.root, rel), body);
  return sha(body.replace(/\r\n/g, "\n"));
}
function writeManifest(world) {
  const man = { version: "1.0.0", gates: world.gates, aggregator: { requiredCheck: "enterprise-gates" } };
  if (world.consumerRequiredGates.length) man.consumerRequiredGates = world.consumerRequiredGates;
  writeFileSync(join(world.root, "gate-manifest.json"), JSON.stringify(man));
}

export default function ({ Given, When, Then }) {
  Given(/^a skills tree with one installable gate that is fully classified and manifested$/, (world) => {
    newTree(world);
    const hash = writeSource(world, "judge-arch", "check-alpha.mjs", "gate", "alpha");
    const testSha = writeTest(world, "test/alpha.test.mjs");
    world.gates.push({ id: "alpha", origin: "upstream", skill: "judge-arch", script: "scripts/ci/check-alpha.mjs", sha256: hash, test: "test/alpha.test.mjs", lane: "required", testSha256: testSha });
  });

  Given(/^a check script with no scope marker$/, (world) => {
    const dir = join(world.skillsDir, "pattern-selector", "scripts");
    mkdirSync(dir, { recursive: true });
    writeFileSync(join(dir, "check-rogue.mjs"), "// no marker here\n");
  });

  Given(/^a shipped script not named check-star with no scope marker$/, (world) => {
    const dir = join(world.skillsDir, "pattern-selector", "scripts");
    mkdirSync(dir, { recursive: true });
    writeFileSync(join(dir, "sneaky-gate.mjs"), "// a gate by any other name, but no marker\n");
  });

  Given(/^a shipped non-gate script marked as a helper$/, (world) => {
    const dir = join(world.skillsDir, "pattern-selector", "scripts");
    mkdirSync(dir, { recursive: true });
    writeFileSync(join(dir, "shared-lib.mjs"), "// bootstrap-v2-helper: shared-lib\n// a library\n");
  });

  Given(/^a consumer-gate marked source that the manifest does not list$/, (world) => {
    writeSource(world, "bdd-comprehensive-testing", "check-ghost.mjs", "consumer-gate", "ghost");
    // deliberately NOT added to world.consumerRequiredGates
  });

  Given(/^an upstream-only marked source that the manifest lists as a gate$/, (world) => {
    const hash = writeSource(world, "judge-arch", "check-selfgov.mjs", "upstream-only", "selfgov");
    writeTest(world, "test/selfgov.test.mjs");
    // listing an upstream-only id as a gate is the violation
    world.gates.push({ id: "selfgov", origin: "upstream", skill: "judge-arch", script: "scripts/ci/check-selfgov.mjs", sha256: hash, test: "test/selfgov.test.mjs", lane: "required", testSha256: sha("// test\n") });
  });

  Given(/^an upstream-only marked check script that the manifest does not list$/, (world) => {
    writeSource(world, "judge-arch", "check-selfgov.mjs", "upstream-only", "selfgov");
    // correct: upstream-only lives in no manifest section
  });

  Given(/^a consumer-gate entry with no acceptance contract$/, (world) => {
    const hash = writeSource(world, "bdd-comprehensive-testing", "check-bdd-coverage.mjs", "consumer-gate", "bdd-coverage");
    writeTest(world, "test/bdd-coverage.test.mjs");
    world.consumerRequiredGates.push({ id: "bdd-coverage", origin: "upstream", skill: "bdd-comprehensive-testing", script: "scripts/ci/check-bdd-coverage.mjs", sha256: hash, test: "test/bdd-coverage.test.mjs" }); // no acceptance
  });

  When(/^the upstream-integrity gate runs$/, (world) => {
    writeManifest(world);
    const r = spawnSync("node", [GATE], {
      encoding: "utf8",
      env: { ...process.env, GATE_MANIFEST_FILE: join(world.root, "gate-manifest.json"), GATE_SKILLS_DIR: world.skillsDir },
    });
    world.exit = r.status;
    world.out = (r.stdout || "") + (r.stderr || "");
  });

  Then(/^the gate passes$/, (world) => assert.equal(world.exit, 0, world.out));
  Then(/^the gate fails$/, (world) => assert.equal(world.exit, 1, `expected exit 1, got ${world.exit}\n${world.out}`));
}
