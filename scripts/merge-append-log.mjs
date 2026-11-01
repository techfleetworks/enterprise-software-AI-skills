#!/usr/bin/env node
/**
 * merge-append-log (ADR-0107). The git merge driver for this repo's append-only logs: the arch-review log, the
 * skill-receipt log, and the BDD coverage log. Their checkers (check-arch-review-coverage, check-skill-receipt,
 * check-bdd-coverage) require the base branch's log to be an EXACT PREFIX of the PR's log. So a merge must keep
 * every line from both sides AND put the upstream side's lines first.
 *
 * git's built-in `union` driver cannot do that: it always puts "ours" first, so merging main INTO a branch put
 * the branch's lines before main's, and the PR then failed the prefix check. It also depends on no config named
 * `merge.union.driver`: one such entry (`true`) shadowed the built-in on 2026-11-01 and silently kept only
 * "ours", dropping PR 197's log lines with no conflict.
 *
 *   node scripts/merge-append-log.mjs %O %A %B %P   (git runs this; writes the merge into %A)
 *   node scripts/merge-append-log.mjs --install     (npm prepare runs this; registers the driver in .git/config)
 *
 * Merge rule:
 * - Both sides appended to the base (a merge): the side already published upstream (its log is a prefix of
 *   origin/main's, else origin/HEAD's) goes first; when neither is, "theirs" goes first (the `git merge
 *   origin/main` case); when both are, the longer one already holds the other. In a .jsonl log a leading entry
 *   the first side also added is kept once.
 * - One side appended to the base and the other still holds every base line in order (a rebase or stash apply,
 *   where the base is the replayed commit's parent): keep the other side and append the new lines verbatim.
 * - Anything else (a side edited or removed a past line), or a driver error, is a conflict written with
 *   whole-file conflict markers so the file never looks resolved. History is never rewritten silently.
 *
 * When the driver is NOT registered in a clone, git falls back to its normal 3-way merge, which raises a conflict.
 * When node or this script is missing (an older branch), git reports a conflict but the file is left as "ours"
 * with no markers: check `git diff` before `git add` in that case.
 */
import { readFileSync, writeFileSync } from "node:fs";
import { spawnSync } from "node:child_process";

const DRIVER = "append-log";
const git = (args) => spawnSync("git", args, { encoding: "utf8", maxBuffer: 256 * 1024 * 1024 });

if (process.argv[2] === "--install") {
  // Never fails `npm install`: a non-repo checkout or missing git just gets a note.
  const set = (k, v) => git(["config", "--local", k, v]).status === 0;
  const ok = set(`merge.${DRIVER}.name`, "append-only log: keep both sides, upstream lines first")
    && set(`merge.${DRIVER}.driver`, `node scripts/merge-append-log.mjs %O %A %B %P`);
  console.log(ok ? `[merge-append-log] registered the ${DRIVER} merge driver.`
    : `[merge-append-log] could not register the ${DRIVER} merge driver (not a git checkout?); log merges will conflict instead.`);
  // A config definition of a built-in driver name replaces the built-in. CHANGELOG.md still uses `union`.
  for (const name of ["union", "text", "binary"]) {
    const v = git(["config", "--show-scope", "--get", `merge.${name}.driver`]);
    if (v.status === 0) {
      const [scope, value] = v.stdout.trim().split("\t");
      const fix = ["local", "global", "system", "worktree"].includes(scope)
        ? `git config --${scope} --unset merge.${name}.driver`
        : `remove it from GIT_CONFIG_* or the "git -c" option that sets it`;
      console.log(`[merge-append-log] WARNING: ${scope} git config sets merge.${name}.driver = "${value}", which REPLACES git's ` +
        `built-in "${name}" driver and can drop lines silently. Remove it: ${fix}`);
    }
  }
  process.exit(0);
}

const [basePath, oursPath, theirsPath, logPath] = process.argv.slice(2);
if (!basePath || !oursPath || !theirsPath || !logPath) {
  console.error("usage: merge-append-log.mjs <base> <ours> <theirs> <path>  |  --install");
  process.exit(2);
}

// Report, then write whole-file conflict markers into %A ourselves (a 3-way `git merge-file` can merge a deletion
// cleanly and leave no markers), so the file cannot pass for resolved.
function conflict(reason, ours = "", theirs = "") {
  console.error(`[merge-append-log] ${logPath}: ${reason}; resolve by hand.`);
  const nl = (s) => (s && !s.endsWith("\n") ? s + "\n" : s);
  writeFileSync(oursPath, `<<<<<<< ours\n${nl(ours)}=======\n${nl(theirs)}>>>>>>> theirs\n`);
  process.exit(1);
}

// The upstream copy of this log, or null when there is none (then "theirs" goes first).
function upstreamLog() {
  for (const ref of ["origin/main", "origin/HEAD"]) {
    const r = git(["show", `${ref}:${logPath}`]);
    if (r.status === 0) return r.stdout;
  }
  console.error(`[merge-append-log] ${logPath}: no origin/main or origin/HEAD copy to order by; putting "theirs" first.`);
  return null;
}

// True when every base line appears in `text`, in order (nothing past was removed or reordered).
function keepsBase(base, text) {
  const lines = text.split("\n");
  let i = 0;
  for (const line of base.split("\n")) {
    while (i < lines.length && lines[i] !== line) i++;
    if (i++ >= lines.length) return false;
  }
  return true;
}

// Appends `tail` verbatim. Never skips text that merely looks present: markdown entries repeat lines.
const join = (head, tail) => head + (head && !head.endsWith("\n") ? "\n" : "") + tail;

// In a .jsonl log every line is one whole entry, so a leading run of `tail` entries that `headAdds` also added
// (a cherry-picked or squash-merged entry) is the same entry and is kept once, one copy per copy `headAdds`
// holds. Byte-identical .jsonl lines are treated as one entry. Other files (markdown) are never deduplicated.
function dropShared(headAdds, tail) {
  if (!logPath.endsWith(".jsonl")) return tail;
  const count = new Map();
  for (const line of headAdds.split("\n")) if (line) count.set(line, (count.get(line) ?? 0) + 1);
  const lines = tail.split("\n");
  let i = 0;
  while (i < lines.length - 1 && count.get(lines[i]) > 0) count.set(lines[i], count.get(lines[i++]) - 1);
  return lines.slice(i).join("\n");
}

function merge(base, ours, theirs) {
  const oursAppends = ours.startsWith(base);
  const theirsAppends = theirs.startsWith(base);
  if (oursAppends && theirsAppends) {
    const oa = ours.slice(base.length);
    const ta = theirs.slice(base.length);
    const upstream = upstreamLog();
    const published = (text) => upstream !== null && upstream.startsWith(text);
    // Both already upstream: both are prefixes of one log, so the longer one holds every entry of the shorter.
    if (published(ours) && published(theirs)) return ours.length >= theirs.length ? ours : theirs;
    return published(ours) && !published(theirs) ? join(ours, dropShared(oa, ta)) : join(theirs, dropShared(ta, oa));
  }
  // A replay (rebase, stash apply): the other side may hold extra lines anywhere, but none of the base's removed.
  // The prefix checkers (--base) catch a merge that inserts into past history this way.
  if (theirsAppends && keepsBase(base, ours)) return join(ours, theirs.slice(base.length));
  if (oursAppends && keepsBase(base, theirs)) return join(theirs, ours.slice(base.length));
  return null;
}

// Read each input on its own, so one unreadable input still leaves the readable sides inside the markers.
let readError = null;
const read = (p) => { try { return readFileSync(p, "utf8"); } catch (e) { readError ??= e; return ""; } };
const [base, ours, theirs] = [basePath, oursPath, theirsPath].map(read);
if (readError) conflict(`could not read a merge input (${readError.message})`, ours, theirs);
try {
  const result = merge(base, ours, theirs);
  if (result === null) conflict("a side edited or removed a past entry (not a clean append)", ours, theirs);
  writeFileSync(oursPath, result);
} catch (e) {
  conflict(`the driver failed (${e.message})`, ours, theirs);
}
process.exit(0);
