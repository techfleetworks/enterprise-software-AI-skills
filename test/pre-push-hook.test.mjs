// Proves the pre-push hook template (bootstrap-v2, ADR-0048) actually runs the OFFLINE manifest gates and
// blocks a push when one fails. It builds a throwaway repo with a gate-manifest.json and stub gate scripts
// (exit 0 or 1), runs the real hook with that dir as the working tree, and asserts the exit code: all
// offline gates pass -> 0, any offline gate fails -> non-zero, the network gate (provenance) is skipped, an
// absent script is skipped, no manifest -> 0, and the env contract (GATE_* vars) is actually passed to the
// gates. The test FAILS if the hook stops running gates, stops blocking, or stops setting the env.
import { test } from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync, copyFileSync } from "node:fs";
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
      // envCheck: exit 9 unless the GATE_* env is set. expectArg: exit 7 unless that arg was received (proves
      // the hook delivers gate.invoke, ADR-0059). Otherwise exit g.exit (default 0).
      let body;
      if (g.envCheck) body = `if(!process.env.GATE_MANIFEST_FILE||!process.env.GATE_DIR||!process.env.GATE_REPO_ROOT)process.exit(9);process.exit(${g.exit ?? 0});\n`;
      else if (g.expectArg !== undefined) body = `if(!process.argv.slice(2).includes(${JSON.stringify(g.expectArg)}))process.exit(7);process.exit(${g.exit ?? 0});\n`;
      else body = `process.exit(${g.exit ?? 0});\n`;
      writeFileSync(join(root, rel), body);
    }
    // invoke is written verbatim when present (an array for the real case, or a malformed value to prove
    // the hook fails closed). Omitted otherwise, exactly as a gate with no args.
    manifestGates.push({ id: g.id, origin: "upstream", skill: "judge-arch", script: rel, sha256: "0".repeat(64), test: `test/${g.id}.test.mjs`, lane: "required", ...(g.invoke !== undefined ? { invoke: g.invoke } : {}) });
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

test("PRE-PUSH: delivers each gate's invoke args (ADR-0059), so a gate that scans a path actually gets it", () => {
  // The stub exits 7 unless it receives "." in argv. A pass proves the hook passed gate.invoke; before the
  // fix the hook ran gates with no args and this would go red (exactly the issue #112 regression).
  assert.equal(runHook(repo({ gates: [{ id: "no-ua-sniffing", exit: 0, expectArg: ".", invoke: ["--allow-empty", "--ignore", "scripts/ci", "."] }] })), 0);
});

test("PRE-PUSH: a gate needing its invoke args BLOCKS when they are dropped (discriminating)", () => {
  // Same stub (exits 7 without "."), but no invoke in the manifest: the hook must run it arg-less, the gate
  // fails, and the push is blocked. This is the failure the old hook turned into a hollow pass.
  assert.notEqual(runHook(repo({ gates: [{ id: "no-ua-sniffing", exit: 0, expectArg: "." }] })), 0);
});

test("PRE-PUSH: FAILS CLOSED on a malformed invoke (never silently drops a gate's args)", () => {
  // A non-array invoke must block, not be silently ignored (which would run the gate arg-less and scan nothing).
  assert.notEqual(runHook(repo({ gates: [{ id: "no-ua-sniffing", exit: 0, invoke: "scripts/ci" }] })), 0);
});

// --- ISSUE-122: a present-but-broken manifest fails CLOSED, so a push can't slip past by corrupting it ------
// Before the fix the hook exited 0 on a corrupt or gates-less manifest (running nothing), so a push that also
// corrupted the manifest got past a gate the hook otherwise blocks. Each case is discriminating: reverting the
// fix makes the hook exit 0. (An ABSENT manifest stays exit 0 — the documented convenience case, covered above.)
test("ISSUE-122: a PRESENT but unparseable manifest fails closed (non-zero), not a silent exit 0", () => {
  const root = repo({ gates: [{ id: "skill-gate-parity", exit: 0 }] });
  writeFileSync(join(root, "gate-manifest.json"), '{ "version": "1.0.0", "gates": [ \n'); // truncated JSON
  assert.notEqual(runHook(root), 0);
});
test("ISSUE-122: a manifest with no gates array fails closed (non-zero)", () => {
  const root = repo({ gates: [{ id: "skill-gate-parity", exit: 0 }] });
  writeFileSync(join(root, "gate-manifest.json"), JSON.stringify({ version: "1.0.0" }));
  assert.notEqual(runHook(root), 0);
});
test("ISSUE-122: a manifest with an empty gates array fails closed (non-zero)", () => {
  const root = repo({ gates: [{ id: "skill-gate-parity", exit: 0 }] });
  writeFileSync(join(root, "gate-manifest.json"), JSON.stringify({ version: "1.0.0", gates: [] }));
  assert.notEqual(runHook(root), 0);
});

// --- the install-hooks helper (arms the hook on npm install) ---
const HELPER = resolve(process.cwd(), ".claude/skills/bootstrap/templates/install-hooks.mjs");
const gitInit = (dir) => execFileSync("git", ["init", "-q", dir], { stdio: "pipe" });
const hooksPath = (dir) => {
  try { return execFileSync("git", ["-C", dir, "config", "--get", "core.hooksPath"], { encoding: "utf8" }).trim(); } catch { return ""; }
};
// Run the helper the way it actually SHIPS: copied to <root>/.githooks/install-hooks.mjs and run with cwd=root
// (what `npm run prepare` does). The helper locates its package root from its own path, so this layout is what
// its #143 root-check and #131 no-clobber checks see. `from` lets a test run it from a DIFFERENT working dir to
// exercise the nested-repo case.
function armFrom(pkgRoot, cwd = pkgRoot) {
  mkdirSync(join(pkgRoot, ".githooks"), { recursive: true });
  const dst = join(pkgRoot, ".githooks", "install-hooks.mjs");
  copyFileSync(HELPER, dst);
  let code = 0;
  try { execFileSync("node", [dst], { cwd, stdio: "pipe" }); } catch (e) { code = e.status ?? 1; }
  return code;
}

test("INSTALL-HOOKS: arms core.hooksPath in a git repo with no prior value", () => {
  const dir = mkdtempSync(join(tmpdir(), "ih-")); created.push(dir); gitInit(dir);
  armFrom(dir);
  assert.equal(hooksPath(dir), ".githooks");
});

test("INSTALL-HOOKS: does NOT clobber an existing core.hooksPath", () => {
  const dir = mkdtempSync(join(tmpdir(), "ih-")); created.push(dir); gitInit(dir);
  execFileSync("git", ["-C", dir, "config", "core.hooksPath", ".husky"], { stdio: "pipe" });
  armFrom(dir);
  assert.equal(hooksPath(dir), ".husky");
});

test("INSTALL-HOOKS: is a no-op when core.hooksPath is already .githooks", () => {
  const dir = mkdtempSync(join(tmpdir(), "ih-")); created.push(dir); gitInit(dir);
  execFileSync("git", ["-C", dir, "config", "core.hooksPath", ".githooks"], { stdio: "pipe" });
  armFrom(dir);
  assert.equal(hooksPath(dir), ".githooks");
});

test("INSTALL-HOOKS: never fails the install outside a git repo", () => {
  const dir = mkdtempSync(join(tmpdir(), "ih-")); created.push(dir);
  assert.equal(armFrom(dir), 0);
});

// ISSUE-143: run from a package nested inside ANOTHER repo (no .git of its own). The helper must NOT write the
// enclosing repo's core.hooksPath. Discriminating: reverting the root-check sets the outer repo's config.
test("ISSUE-143: does NOT set core.hooksPath on an enclosing repo when run from a nested package", () => {
  const parent = mkdtempSync(join(tmpdir(), "ih-parent-")); created.push(parent); gitInit(parent);
  const pkg = join(parent, "pkg"); mkdirSync(pkg, { recursive: true }); // pkg has no .git of its own
  const code = armFrom(pkg, pkg); // helper at parent/pkg/.githooks, run from pkg -> git finds the enclosing parent repo
  assert.equal(code, 0, "never fails the install");
  assert.equal(hooksPath(parent), "", "the enclosing repository's core.hooksPath must stay unset");
});

// ISSUE-131: a repo using the pre-commit framework (.pre-commit-config.yaml) must keep its hooks. Setting
// core.hooksPath would disable them repo-wide. Discriminating: reverting the guard sets .githooks.
test("ISSUE-131: does NOT set core.hooksPath when a .pre-commit-config.yaml is present", () => {
  const dir = mkdtempSync(join(tmpdir(), "ih-pc-")); created.push(dir); gitInit(dir);
  writeFileSync(join(dir, ".pre-commit-config.yaml"), "repos: []\n");
  armFrom(dir);
  assert.equal(hooksPath(dir), "", "a pre-commit repo's core.hooksPath must stay unset");
});

// ISSUE-131: an existing non-sample hook in .git/hooks means the consumer already uses git hooks; arming
// core.hooksPath would stop git running them. Discriminating: reverting the guard sets .githooks.
test("ISSUE-131: does NOT set core.hooksPath when a real hook already exists in .git/hooks", () => {
  const dir = mkdtempSync(join(tmpdir(), "ih-eh-")); created.push(dir); gitInit(dir);
  writeFileSync(join(dir, ".git", "hooks", "pre-commit"), "#!/bin/sh\nexit 0\n");
  armFrom(dir);
  assert.equal(hooksPath(dir), "", "a repo with an existing .git/hooks hook must keep core.hooksPath unset");
});

test("PRE-PUSH: BLOCKS a failing gate in a REAL git repo (Windows separator regression, discriminating)", () => {
  // The Windows hollow-pass: `git rev-parse --show-toplevel` returns forward slashes even on Windows, while
  // resolve(root, gate.script) returns backslashes; before the fix, `abs.startsWith(root + sep)` compared
  // mismatched separators, so EVERY gate was skipped and the hook exited 0. Here the fixture is a real git
  // repo, so the hook takes the git-toplevel path (not the cwd fallback). On win32 this reproduces the bug
  // (old code exits 0 -> this assertion fails); the fix normalizes root so the gate runs and blocks. On POSIX
  // both separator forms already agree, so it is a valid regression check there.
  const r = repo({ gates: [{ id: "skill-gate-parity", exit: 1 }] });
  execFileSync("git", ["init", "-q", r], { stdio: "pipe" });
  assert.notEqual(runHook(r), 0, "a failing gate in a real git repo must block the push, not hollow-pass");
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

// --- ISSUE-134: the pre-push does not scan gitignored paths (it matches CI's committed-only file set) ---------
test("ISSUE-134: a gitignored file does NOT fail the pre-push (CI never scans it); once tracked it does (discriminating)", () => {
  const dir = mkdtempSync(join(tmpdir(), "prepush-gi-"));
  created.push(dir);
  execFileSync("git", ["init", "-q", dir], { stdio: "pipe" });
  execFileSync("git", ["-C", dir, "config", "core.autocrlf", "false"], { stdio: "pipe" });
  mkdirSync(join(dir, "scripts", "ci"), { recursive: true });
  // the REAL no-ua-sniffing gate, which supports --ignore (that is how the hook excludes gitignored paths)
  copyFileSync(resolve(process.cwd(), ".claude/skills/universal-browser-device-support/scripts/check-no-ua-sniffing.mjs"), join(dir, "scripts", "ci", "check-no-ua-sniffing.mjs"));
  writeFileSync(join(dir, "gate-manifest.json"), JSON.stringify({ version: "1.0.0", gates: [{ id: "no-ua-sniffing", origin: "upstream", skill: "x", script: "scripts/ci/check-no-ua-sniffing.mjs", sha256: "0".repeat(64), test: "t", lane: "required", invoke: ["--allow-empty", "--ignore", "scripts/ci", "."] }], aggregator: { requiredCheck: "enterprise-gates" } }));
  mkdirSync(join(dir, ".venv", "pkg"), { recursive: true });
  writeFileSync(join(dir, ".venv", "pkg", "widget.js"), 'if (navigator.userAgent.indexOf("Trident") > -1) { legacy(); }\n');
  // Gitignored: CI never sees it, so the hook must pass. Reverting the fix scans .venv and fails here.
  writeFileSync(join(dir, ".gitignore"), ".venv/\n");
  assert.equal(runHook(dir), 0, "a gitignored sniffing file must not fail the pre-push (CI never scans it)");
  // Control: the SAME file, no longer gitignored, IS scanned and blocks.
  writeFileSync(join(dir, ".gitignore"), "# .venv no longer ignored\n");
  assert.notEqual(runHook(dir), 0, "once the file is tracked/not-ignored, the pre-push scans it and blocks");
});
