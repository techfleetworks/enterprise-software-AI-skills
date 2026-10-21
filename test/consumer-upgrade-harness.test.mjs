// Consumer-lifecycle UPGRADE harness (ADR-0070). PR1 (ADR-0069, test/consumer-lifecycle.test.mjs) proved the
// hook and workflow refresh by staling them with junk. This goes the whole way the user asked for: it installs
// the REAL previous release (a pinned prior tag) into a consumer, upgrades to HEAD, and asserts the upgraded
// consumer is byte-for-byte identical to a FRESH HEAD install. That catches ANY travelling file that fails to
// refresh, drifts, or is orphaned on upgrade, not only the two we already know about.
//
// Honest limit (matches ADR-0070): the convergence check discriminates a no-clobber / "forgot-to-refresh"
// regression only when a travelling file's CONTENT actually changed between the pinned pair. For the
// v1.2.1 -> v1.2.2 pair the hook and workflow content are unchanged (PR1 touched only the installer), so on
// this exact pair a no-clobber revert produces an identical file and this test stays green. The
// content-agnostic discrimination guard is ADR-0069's consumer-lifecycle.test.mjs; discrimination here was
// proven by injecting a content difference + reverting the fix (see ADR-0070 Consequences).
//
// The prior release is materialized with `git worktree add <tag>`; if git or the tag is unavailable the test
// skips (CI/ubuntu always has both).
import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, existsSync, rmSync, readdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve, dirname, relative } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";

const REPO = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const GENESIS_REL = ".claude/skills/bootstrap/scripts/esk-genesis.mjs";
// The prior release to upgrade FROM. A maintained pin, not auto-derived: bump it when cutting a new minor so
// the harness keeps testing the most recent previous release (ADR-0070 Note B).
const PREV_TAG = "v1.2.1";
const norm = (s) => s.replace(/\r\n/g, "\n");

const git = (args) => spawnSync("git", ["-C", REPO, ...args], { encoding: "utf8" });
const genesis = (sourceDir, target) =>
  spawnSync(process.execPath, [join(sourceDir, GENESIS_REL), "--source", sourceDir, "--target", target, "--yes"], { encoding: "utf8" });

// Every file esk-genesis put in the consumer, except the .esk.bak backup (present only after an upgrade, never
// after a fresh install) and any .git. Relative, POSIX-slashed, sorted, so two consumers compare cleanly.
function listFiles(root) {
  const out = [];
  (function walk(d) {
    for (const e of readdirSync(d, { withFileTypes: true })) {
      if (e.name === ".git" || e.name.endsWith(".esk.bak")) continue;
      const p = join(d, e.name);
      if (e.isDirectory()) walk(p);
      else out.push(relative(root, p).replace(/\\/g, "/"));
    }
  })(root);
  return out.sort();
}

test("a prev-release install upgraded to HEAD converges to a fresh HEAD install (every travelling file)", (t) => {
  // Everything created inside the try, so the finally cleans up on any path (including a throw mid-setup).
  let wt = null, fresh = null, upgraded = null;
  try {
    // The worktree path is just a string until `git worktree add` runs, so computing it cannot leak; only a
    // successful add creates something the finally must remove, which is why wt is set only after success.
    const wtPath = join(tmpdir(), "esk-prev-" + process.pid + "-" + Date.now());
    const add = git(["worktree", "add", "--detach", wtPath, PREV_TAG]);
    if (add.status !== 0) { t.skip(`cannot materialize ${PREV_TAG} (git/worktree unavailable here): ${(add.stderr || "").trim()}`); return; }
    wt = wtPath;

    fresh = mkdtempSync(join(tmpdir(), "esk-fresh-"));
    upgraded = mkdtempSync(join(tmpdir(), "esk-upg-"));

    // A: fresh install from HEAD = the gold current state.
    const a = genesis(REPO, fresh);
    assert.equal(a.status, 0, `fresh HEAD install failed:\n${a.stdout}\n${a.stderr}`);
    // B: install the PREVIOUS release, then upgrade to HEAD (exactly what a consumer does).
    const b = genesis(wt, upgraded);
    assert.equal(b.status, 0, `prev-release (${PREV_TAG}) install failed:\n${b.stdout}\n${b.stderr}`);
    const up = genesis(REPO, upgraded);
    assert.equal(up.status, 0, `upgrade to HEAD failed:\n${up.stdout}\n${up.stderr}`);

    // Same file set, and every file byte-identical. A stale (un-refreshed) file is exactly a mismatch here.
    assert.deepEqual(listFiles(upgraded), listFiles(fresh), "upgraded consumer has a different travelling-file set than a fresh HEAD install");
    const stale = [];
    for (const rel of listFiles(fresh)) {
      if (norm(readFileSync(join(fresh, rel), "utf8")) !== norm(readFileSync(join(upgraded, rel), "utf8"))) stale.push(rel);
    }
    assert.deepEqual(stale, [], `these travelling files were NOT refreshed to current on upgrade (esk-genesis must refresh every owned file, ADR-0069/0070): ${stale.join(", ")}`);
  } finally {
    if (fresh) rmSync(fresh, { recursive: true, force: true });
    if (upgraded) rmSync(upgraded, { recursive: true, force: true });
    if (wt) git(["worktree", "remove", "--force", wt]);
  }
});

test("the installed pre-push hook runs the manifest gates with their invoke args and passes on a clean consumer", () => {
  let consumer = null;
  try {
    consumer = mkdtempSync(join(tmpdir(), "esk-hook-"));
    const g = genesis(REPO, consumer);
    assert.equal(g.status, 0, `install failed:\n${g.stdout}\n${g.stderr}`);
    // Make the consumer its own git repo so the hook's `git rev-parse --show-toplevel` resolves to the
    // consumer root deterministically, even if TMPDIR happens to sit inside another git tree (ADR-0070 Note A).
    git(["-C", consumer, "init", "-q"]); // harmless if git is unavailable; the hook then falls back to cwd=consumer
    const hookPath = join(consumer, ".githooks", "pre-push");
    assert.ok(existsSync(hookPath), "no pre-push hook installed");
    // Run the real hook from the consumer root. It reads the manifest and runs each offline gate with its
    // invoke args (the #112.1 path). A clean scaffolded consumer has no product code to flag, so it must pass.
    const r = spawnSync(process.execPath, [hookPath], { cwd: consumer, encoding: "utf8" });
    assert.equal(r.status, 0, `pre-push hook failed on a clean consumer (gates may have lost their invoke args):\n${r.stdout}\n${r.stderr}`);
    // Confirm it actually RAN gates, not the silent no-manifest early exit (which would also be status 0).
    assert.ok(/\b(PASS|check-)/i.test(r.stdout + r.stderr), `pre-push hook produced no gate output; it may have exited 0 without running any gate:\n${r.stdout}\n${r.stderr}`);
  } finally {
    if (consumer) rmSync(consumer, { recursive: true, force: true });
  }
});
