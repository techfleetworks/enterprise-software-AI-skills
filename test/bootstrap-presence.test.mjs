// Proves check-bootstrap-presence (BOOTSTRAP-PRESENCE-001, bootstrap-v2) actually detects: it builds
// throwaway fixture repos with and without each genesis skeleton file and runs the real gate via its
// GATE_REPO_ROOT seam, asserting exit codes - full skeleton → 0, each missing skeleton file → 1, and a
// missing or invalid repo root to 2 (fail-closed). The test FAILS if the gate stops detecting
// (discrimination), so a neutralized gate cannot pass.
import { test } from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from "node:fs";
import { resolve, join, dirname } from "node:path";
import { tmpdir } from "node:os";

const GUARD = resolve(process.cwd(), ".claude/skills/judge-arch/scripts/check-bootstrap-presence.mjs");
const created = [];

const SKELETON = [
  "gate-manifest.json",
  ".github/workflows/enterprise-gates.yml",
  "scripts/ci/check-skill-gate-parity.mjs",
];

/** Build a fixture repo containing every skeleton file except those in `omit`. */
function fixture({ omit = [] } = {}) {
  const root = mkdtempSync(join(tmpdir(), "presence-"));
  created.push(root);
  for (const rel of SKELETON) {
    if (omit.includes(rel)) continue;
    const abs = join(root, rel);
    mkdirSync(dirname(abs), { recursive: true });
    writeFileSync(abs, "// present\n");
  }
  return root;
}

function run(root) {
  try {
    execFileSync("node", [GUARD], { stdio: "pipe", env: { ...process.env, GATE_REPO_ROOT: root } });
    return 0;
  } catch (e) {
    return e.status ?? 1;
  }
}

test("PRESENCE: passes (0) when the full genesis skeleton is present", () => {
  assert.equal(run(fixture()), 0);
});

for (const rel of SKELETON) {
  test(`PRESENCE: FAILS (1) when "${rel}" is missing`, () => {
    assert.equal(run(fixture({ omit: [rel] })), 1);
  });
}

test("PRESENCE: FAILS (1) when several skeleton files are missing", () => {
  assert.equal(run(fixture({ omit: SKELETON.slice(1) })), 1);
});

test("PRESENCE: does NOT pass when a skeleton path is a directory, not a file (no false positive)", () => {
  const root = fixture({ omit: ["gate-manifest.json"] });
  mkdirSync(join(root, "gate-manifest.json")); // a directory where a file is required
  assert.equal(run(root), 1);
});

test("PRESENCE: fails CLOSED (2) when the repo root does not exist", () => {
  const root = join(tmpdir(), "presence-does-not-exist-" + Date.now());
  assert.equal(run(root), 2);
});

test("PRESENCE: fails CLOSED (2) when the repo root is a file, not a directory", () => {
  const dir = mkdtempSync(join(tmpdir(), "presence-"));
  created.push(dir);
  const fileRoot = join(dir, "not-a-dir");
  writeFileSync(fileRoot, "i am a file\n");
  assert.equal(run(fileRoot), 2);
});

process.on("exit", () => {
  for (const d of created) {
    try {
      rmSync(d, { recursive: true, force: true });
    } catch {
      /* best-effort */
    }
  }
});
