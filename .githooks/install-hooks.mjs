#!/usr/bin/env node
/**
 * install-hooks (bootstrap-v2, ADR-0050). Arms the committed pre-push hook with zero extra developer
 * steps, by pointing git's core.hooksPath at the repo's .githooks directory.
 *
 * It is meant to run from a package.json "prepare" script, which npm runs automatically on `npm install`,
 * the command developers already run when they set up a repo. So a fresh clone arms the hook on its own,
 * which git otherwise forbids doing automatically (a cloned repo is not allowed to auto-run a committed
 * hook, for security).
 *
 * core.hooksPath is a REPO-WIDE setting (it applies to the whole repository and every worktree, and makes
 * git stop looking in $GIT_DIR/hooks). So the helper writes it only when it is safe to, under these rules:
 * - Only when THIS package is the repository ROOT. Run from a package nested inside ANOTHER repository (no
 *   .git of its own), writing core.hooksPath would re-point that enclosing repo at a .githooks dir it does
 *   not have, silently disabling its hooks. So it compares the repo top-level with this package root (#143).
 * - It NEVER clobbers an existing core.hooksPath (husky, another hooks dir): if one is already set to
 *   something other than .githooks, it leaves it and prints a one-line note instead.
 * - It NEVER disables hooks the consumer already uses: if a .pre-commit-config.yaml or a real hook in
 *   $GIT_DIR/hooks is present, it does NOT set core.hooksPath (that would stop those hooks running
 *   repo-wide); it prints how to arm the pre-push hook without clobbering them (#131).
 * - It NEVER fails the install: any problem (not a git repo, git missing, a CI checkout) is swallowed and
 *   the script exits 0, so `npm install` is never broken by it.
 */
import { spawnSync } from "node:child_process";
import { existsSync, readdirSync, realpathSync } from "node:fs";
import { dirname, resolve, join } from "node:path";
import { fileURLToPath } from "node:url";

const ok = () => process.exit(0);
const git = (args) => spawnSync("git", args, { encoding: "utf8" });
// The package root is the folder that holds this .githooks/ dir (…/.githooks/install-hooks.mjs -> …/).
const PKG_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
// realpath so a case/separator/symlink difference between git's path and ours does not cause a false mismatch.
const norm = (p) => { try { return realpathSync(p); } catch { return resolve(p); } };
// A hooks dir has an "active" hook if it holds any file that is not a git `*.sample` template or a dotfile.
const hasActiveHook = (dir) => {
  try { return readdirSync(dir).some((n) => !n.endsWith(".sample") && !n.startsWith(".")); } catch { return false; }
};

try {
  // Only act inside a git work tree; a tarball install or odd CI checkout is not one.
  const inside = git(["rev-parse", "--is-inside-work-tree"]);
  if (inside.status !== 0 || (inside.stdout || "").trim() !== "true") ok();

  // Only arm when THIS package is the repository root; otherwise we would write a different repository's
  // config. If the top-level differs from this package root, change nothing. (#143)
  const topRes = git(["rev-parse", "--show-toplevel"]);
  const top = topRes.status === 0 ? norm(topRes.stdout.trim()) : null;
  if (!top || top !== norm(PKG_ROOT)) {
    console.log(`[install-hooks] not the repository root (repo top is ${top ?? "unknown"}, this package is ${norm(PKG_ROOT)}); leaving core.hooksPath unchanged.`);
    ok();
  }

  const current = (git(["config", "--get", "core.hooksPath"]).stdout || "").trim();
  if (current === ".githooks") ok(); // already armed
  if (current) {
    console.log(`[install-hooks] core.hooksPath is already "${current}"; leaving it. To also run the enterprise pre-push hook, point it at .githooks or merge the hook into ${current}/.`);
    ok();
  }

  // Do not disable hooks the consumer already relies on. Setting core.hooksPath makes git stop looking in
  // $GIT_DIR/hooks, so a pre-commit-framework install or any hand-installed hook there would silently stop
  // running, repo-wide and in every worktree. If we find either, leave core.hooksPath unset and say how to
  // arm the pre-push hook without clobbering them. (#131)
  if (existsSync(join(PKG_ROOT, ".pre-commit-config.yaml"))) {
    console.log(`[install-hooks] a .pre-commit-config.yaml is present; NOT setting core.hooksPath (it would disable your pre-commit hooks repo-wide). To run the enterprise pre-push gates too, add a pre-commit repo:local hook with "stages: [pre-push]" and "entry: node .githooks/pre-push", then run "pre-commit install --hook-type pre-push".`);
    ok();
  }
  const hooksDirRes = git(["rev-parse", "--git-path", "hooks"]);
  const hooksDir = hooksDirRes.status === 0 ? resolve(top, hooksDirRes.stdout.trim()) : null;
  if (hooksDir && hasActiveHook(hooksDir)) {
    console.log(`[install-hooks] hooks are installed in ${hooksDir}; NOT setting core.hooksPath (git would stop running them repo-wide). To run the enterprise pre-push hook, chain it from your existing hook, then set core.hooksPath to .githooks once merged.`);
    ok();
  }

  const set = git(["config", "core.hooksPath", ".githooks"]);
  if (set.status === 0) console.log(`[install-hooks] armed the pre-push hook (core.hooksPath = .githooks).`);
} catch {
  /* never fail the install */
}
process.exit(0);
