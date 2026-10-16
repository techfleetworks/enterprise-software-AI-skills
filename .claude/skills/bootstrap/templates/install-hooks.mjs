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
 * Two safety rules:
 * - It NEVER clobbers an existing core.hooksPath (husky, another hooks dir): if one is already set to
 *   something other than .githooks, it leaves it and prints a one-line note instead.
 * - It NEVER fails the install: any problem (not a git repo, git missing, a CI checkout) is swallowed and
 *   the script exits 0, so `npm install` is never broken by it.
 */
import { spawnSync } from "node:child_process";

const ok = () => process.exit(0);
const git = (args) => spawnSync("git", args, { encoding: "utf8" });

try {
  // Only act inside a git work tree; a tarball install or odd CI checkout is not one.
  const top = git(["rev-parse", "--is-inside-work-tree"]);
  if (top.status !== 0 || (top.stdout || "").trim() !== "true") ok();

  const current = (git(["config", "--get", "core.hooksPath"]).stdout || "").trim();
  if (current === ".githooks") ok(); // already armed
  if (current) {
    console.log(`[install-hooks] core.hooksPath is already "${current}"; leaving it. To also run the enterprise pre-push hook, point it at .githooks or merge the hook into ${current}/.`);
    ok();
  }
  const set = git(["config", "core.hooksPath", ".githooks"]);
  if (set.status === 0) console.log(`[install-hooks] armed the pre-push hook (core.hooksPath = .githooks).`);
} catch {
  /* never fail the install */
}
process.exit(0);
