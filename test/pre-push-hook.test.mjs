// Proves the pre-push hook template (bootstrap-v2, ADR-0048) actually runs the OFFLINE manifest gates and
// blocks a push when one fails. It builds a throwaway repo with a gate-manifest.json and stub gate scripts
// (exit 0 or 1), runs the real hook with that dir as the working tree, and asserts the exit code: all
// offline gates pass -> 0, any offline gate fails -> non-zero, the network gate (provenance) is skipped, an
// absent script is skipped, no manifest -> 0, and the env contract (GATE_* vars) is actually passed to the
// gates. The test FAILS if the hook stops running gates, stops blocking, or stops setting the env.
import { test } from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from "node:fs";
import { resolve, join } from "node:path";
import { tmpdir } from "node:os";

const HOOK = resolve(process.cwd(), ".claude/skills/bootstrap/templates/pre-push");
const created = [];

/**
 * Build a repo dir. gates: [{id, exit?, writeScript?, envCheck?}]. Each gate is listed in the manifest and
 * (unless writeScript:false) gets a stub scripts/ci/check-<id>.mjs. envCheck stubs exit non-zero unless the
 * GATE_* env vars are present, so a passing run proves the hook set them.
 */
function repo({ gates = [], omitManifest = false } = {}) {
  const root = mkdtempSync(join(tmpdir(), "prepush-"));
  created.push(root);
  mkdirSync(join(root, "scripts", "ci"), { recursive: true });
  const manifestGates = [];
  for (const g of gates) {
    const rel = `scripts/ci/check-${g.id}.mjs`;
    if (g.writeScript !== false) {
      const body = g.envCheck
        ? `if(!process.env.GATE_MANIFEST_FILE||!process.env.GATE_DIR||!process.env.GATE_REPO_ROOT)process.exit(9);process.exit(${g.exit ?? 0});\n`
        : `process.exit(${g.exit ?? 0});\n`;
      writeFileSync(join(root, rel), body);
    }
    manifestGates.push({ id: g.id, origin: "upstream", skill: "judge-arch", script: rel, sha256: "0".repeat(64), test: `test/${g.id}.test.mjs`, lane: "required" });
  }
  if (!omitManifest) {
    writeFileSync(join(root, "gate-manifest.json"), JSON.stringify({ version: "1.0.0", gates: manifestGates, aggregator: { requiredCheck: "enterprise-gates" } }));
  }
  return root;
}

function runHook(root) {
  try {
    // cwd = the fixture; the hook's `git rev-parse` fails there (not a git repo) and falls back to cwd.
    execFileSync("node", [HOOK], { cwd: root, stdio: "pipe" });
    return 0;
  } catch (e) {
    return e.status ?? 1;
  }
}

test("PRE-PUSH: passes (0) when all offline manifest gates pass", () => {
  assert.equal(runHook(repo({ gates: [{ id: "skill-gate-parity", exit: 0 }, { id: "bootstrap-presence", exit: 0 }] })), 0);
});

test("PRE-PUSH: BLOCKS (non-zero) when an offline gate fails", () => {
  assert.notEqual(runHook(repo({ gates: [{ id: "skill-gate-parity", exit: 1 }, { id: "bootstrap-presence", exit: 0 }] })), 0);
});

test("PRE-PUSH: BLOCKS (non-zero) when a second offline gate fails", () => {
  assert.notEqual(runHook(repo({ gates: [{ id: "skill-gate-parity", exit: 0 }, { id: "bootstrap-presence", exit: 1 }] })), 0);
});

test("PRE-PUSH: skips the network gate (provenance), so it never blocks locally", () => {
  // provenance would fail locally (exit 1) if run, but the hook must skip it; parity passes -> hook passes.
  assert.equal(runHook(repo({ gates: [{ id: "skill-gate-parity", exit: 0 }, { id: "manifest-provenance", exit: 1 }] })), 0);
});

test("PRE-PUSH: skips a gate whose script is absent (never blocks over a missing file)", () => {
  assert.equal(runHook(repo({ gates: [{ id: "skill-gate-parity", exit: 0 }, { id: "bootstrap-presence", writeScript: false }] })), 0);
});

test("PRE-PUSH: passes (0) when there is no manifest (nothing to pre-check locally)", () => {
  assert.equal(runHook(repo({ omitManifest: true })), 0);
});

test("PRE-PUSH: passes the GATE_* env contract to the gates", () => {
  // The stub exits 9 unless GATE_MANIFEST_FILE/GATE_DIR/GATE_REPO_ROOT are all set. A pass proves the hook
  // set the env; if the hook stopped passing the env, this test would go red.
  assert.equal(runHook(repo({ gates: [{ id: "skill-gate-parity", exit: 0, envCheck: true }] })), 0);
});

// --- the install-hooks helper (arms the hook on npm install) ---
const HELPER = resolve(process.cwd(), ".claude/skills/bootstrap/templates/install-hooks.mjs");
const gitInit = (dir) => execFileSync("git", ["init", "-q", dir], { stdio: "pipe" });
const hooksPath = (dir) => {
  try { return execFileSync("git", ["-C", dir, "config", "--get", "core.hooksPath"], { encoding: "utf8" }).trim(); } catch { return ""; }
};

test("INSTALL-HOOKS: arms core.hooksPath in a git repo with no prior value", () => {
  const dir = mkdtempSync(join(tmpdir(), "ih-")); created.push(dir); gitInit(dir);
  execFileSync("node", [HELPER], { cwd: dir, stdio: "pipe" });
  assert.equal(hooksPath(dir), ".githooks");
});

test("INSTALL-HOOKS: does NOT clobber an existing core.hooksPath", () => {
  const dir = mkdtempSync(join(tmpdir(), "ih-")); created.push(dir); gitInit(dir);
  execFileSync("git", ["-C", dir, "config", "core.hooksPath", ".husky"], { stdio: "pipe" });
  execFileSync("node", [HELPER], { cwd: dir, stdio: "pipe" });
  assert.equal(hooksPath(dir), ".husky");
});

test("INSTALL-HOOKS: is a no-op when core.hooksPath is already .githooks", () => {
  const dir = mkdtempSync(join(tmpdir(), "ih-")); created.push(dir); gitInit(dir);
  execFileSync("git", ["-C", dir, "config", "core.hooksPath", ".githooks"], { stdio: "pipe" });
  execFileSync("node", [HELPER], { cwd: dir, stdio: "pipe" });
  assert.equal(hooksPath(dir), ".githooks");
});

test("INSTALL-HOOKS: never fails the install outside a git repo", () => {
  const dir = mkdtempSync(join(tmpdir(), "ih-")); created.push(dir);
  let code = 0;
  try { execFileSync("node", [HELPER], { cwd: dir, stdio: "pipe" }); } catch (e) { code = e.status ?? 1; }
  assert.equal(code, 0);
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
