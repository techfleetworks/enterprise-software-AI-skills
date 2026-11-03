// Step definitions for features/repo-process/consumer-gate-promotion.feature (ADR-0113).
// Each scenario builds a throwaway fixture surface and runs the REAL wrapper gate the skills ship, via its
// --config seam, so a regression in any promoted gate turns these red (the same gates CI runs on this repo).
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";
import assert from "node:assert/strict";

const REPO = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..");
const CLAIMS = join(REPO, ".claude/skills/skeptical-audit/scripts/check-claims-grounded.mjs");
const READABILITY = join(REPO, ".claude/skills/usability-ux-universal-design/scripts/check-readability.mjs");
const SECRET = join(REPO, ".claude/skills/comprehensive-test-strategy/scripts/check-secret-leaks.mjs");

const TAGGED = "# Report\n\nThe deployment is live [observed]: `curl` returned 200 at 12:00 UTC.\n";
const UNTAGGED = "# Report\n\nThe deployment is live and every request is handled.\n";
const HARD =
  "The comprehensive instrumentation infrastructure necessitates substantial architectural reconfiguration " +
  "whenever organizational requirements evolve unpredictably throughout the implementation lifecycle.\n";
const SECRET_VALUE = "sup3r s3cret token value xyz";

function newRoot(world, prefix) {
  world.root = mkdtempSync(join(tmpdir(), `${prefix}-`));
  world.docs = join(world.root, "surface");
  mkdirSync(world.docs);
  return world.docs;
}
function writeDoc(world, name, text) {
  const p = join(world.docs, name);
  mkdirSync(dirname(p), { recursive: true });
  writeFileSync(p, text);
}
function writeConfig(world, obj) {
  world.configPath = join(world.root, "gate.config.json");
  writeFileSync(world.configPath, JSON.stringify(obj));
}
function runGate(world, gate, env = {}) {
  const r = spawnSync(process.execPath, [gate, "--config", world.configPath], {
    encoding: "utf8",
    env: { ...process.env, ...env },
  });
  world.exit = r.status;
  world.out = (r.stdout || "") + (r.stderr || "");
}

export default function ({ Given, When, Then }) {
  // --- claims-grounded ---
  Given(/^a findings surface whose only document is evidence-tagged$/, (world) => {
    const docs = newRoot(world, "cgp-claims");
    writeDoc(world, "finding.md", TAGGED);
    writeConfig(world, { roots: [docs], ext: [".md"] });
  });
  Given(/^a findings surface with a document that carries an untagged claim$/, (world) => {
    const docs = newRoot(world, "cgp-claims");
    writeDoc(world, "ok.md", TAGGED);
    writeDoc(world, "bad.md", UNTAGGED);
    writeConfig(world, { roots: [docs], ext: [".md"] });
  });
  Given(/^a findings surface with no matching documents$/, (world) => {
    const docs = newRoot(world, "cgp-claims");
    writeDoc(world, "notes.txt", UNTAGGED); // only .md is scanned, so the surface is empty
    writeConfig(world, { roots: [docs], ext: [".md"] });
  });
  When(/^the claims-grounded gate runs$/, (world) => runGate(world, CLAIMS));

  // --- readability-grade ---
  Given(/^a user-facing surface with a document above the grade ceiling$/, (world) => {
    const docs = newRoot(world, "cgp-read");
    writeDoc(world, "guide.md", HARD);
    writeConfig(world, { maxGrade: 8, roots: [docs], ext: [".md"] });
  });
  When(/^the readability-grade gate runs$/, (world) => runGate(world, READABILITY));

  // --- secret-leak ---
  Given(/^a build artifact that contains a configured secret value$/, (world) => {
    const docs = newRoot(world, "cgp-leak");
    writeDoc(world, "bundle.js", `startup\ntoken = ${SECRET_VALUE}\n`);
    writeConfig(world, { secretEnvVars: ["SECRET_TOKEN"], scan: [docs] });
  });
  When(/^the secret-leak gate runs$/, (world) => runGate(world, SECRET, { SECRET_TOKEN: SECRET_VALUE }));
  Then(/^the report names the environment variable but not the secret value$/, (world) => {
    assert.match(world.out, /SECRET_TOKEN/, world.out);
    assert.doesNotMatch(world.out, /sup3r s3cret token value xyz/);
  });

  // --- manifest classification ---
  Given(/^the repository gate manifest$/, (world) => {
    world.manifest = JSON.parse(readFileSync(join(REPO, "gate-manifest.json"), "utf8"));
  });
  Then(/^verify-check-discrimination is listed as a consumer-gate with a pinned test$/, (world) => {
    const entry = (world.manifest.consumerRequiredGates || []).find((g) => g.id === "verify-check-discrimination");
    assert.ok(entry, "verify-check-discrimination is not in consumerRequiredGates");
    assert.equal(typeof entry.testSha256, "string");
    assert.ok(entry.testSha256.length === 64, "testSha256 must be a 64-char hash");
  });

  // --- outcomes (named "promoted gate" so they do not collide with other feature files' shared steps) ---
  Then(/^the promoted gate passes$/, (world) => assert.equal(world.exit, 0, world.out));
  Then(/^the promoted gate fails$/, (world) => assert.equal(world.exit, 1, `expected exit 1, got ${world.exit}\n${world.out}`));
  Then(/^the promoted gate fails closed$/, (world) => assert.equal(world.exit, 2, `expected exit 2 (fail-closed), got ${world.exit}\n${world.out}`));
}
