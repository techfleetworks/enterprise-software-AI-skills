// bootstrap-v2-helper: entry-log
// entry-log - the one reader for the append-only review and receipt logs (ADR-0108).
//
// A log is a DIRECTORY with one file per entry, never one shared file every change appends to. Two open pull
// requests then add two different new files, so they cannot conflict on the log, on any host, with no merge
// driver (GitHub ignores merge drivers when it decides whether a PR conflicts). Each entry file is named
// `<UTC stamp>-<slug>.json`, for example `20261102T013000Z-fix-no-shared-append-files.json`, and holds exactly
// one JSON object. The stamp makes name order the entry order, so "the latest entry for a change" stays defined.
//
// Append-only is a file rule now: against a base git ref, every entry file the base has must still exist here,
// unchanged (line endings aside). Adding files is the only allowed change. The check runs two git commands
// whatever the history size.
//
// A path that is a FILE is read as the legacy one-line-per-entry .jsonl log, so a consumer that has not moved to
// the directory form keeps working. The legacy form is read-only history; new entries go in the directory.
import { readFileSync, existsSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { spawnSync } from "node:child_process";

export const ENTRY_NAME = /^\d{8}T\d{6}Z-[a-z0-9][a-z0-9._-]*\.json$/;

// The default location: the entries directory when it exists, else the legacy log file beside it.
export function defaultLogPath(dir, legacyFile) {
  return existsSync(dir) || !existsSync(legacyFile) ? dir : legacyFile;
}

// Read every entry, oldest first. Throws an Error naming the problem (missing, empty, bad name, bad JSON).
export function readEntries(path) {
  if (!existsSync(path)) throw new Error(`log not found: ${path}`);
  if (statSync(path).isDirectory()) {
    // Every file but a README is an entry, whatever its extension, so a misnamed entry fails here instead of
    // being skipped (a skipped review would read as no review at all).
    const names = readdirSync(path).filter((n) => n !== "README.md").sort();
    const bad = names.filter((n) => !ENTRY_NAME.test(n));
    if (bad.length) throw new Error(`entry file name(s) not in the <YYYYMMDDTHHMMSSZ>-<slug>.json form: ${bad.join(", ")}`);
    if (names.length === 0) throw new Error(`log directory has no entries: ${path}`);
    return names.map((n) => {
      try { return JSON.parse(readFileSync(join(path, n), "utf8")); }
      catch (e) { throw new Error(`entry ${n} is not valid JSON: ${e.message}`); }
    });
  }
  const raw = readFileSync(path, "utf8");
  if (!raw.trim()) throw new Error(`log is empty: ${path}`);
  return raw.split(/\r?\n/).filter((l) => l.trim()).map((l) => {
    try { return JSON.parse(l); } catch (e) { throw new Error(`a log line is not valid JSON: ${e.message}`); }
  });
}

// Verify the log only grew. `base` is a git ref for a directory log, or a file holding the base revision for a
// legacy file log. Returns { note } on success; throws an Error naming what was edited or removed, or why the
// base could not be read (fail closed).
export function verifyAppendOnly(path, base) {
  if (statSync(path).isDirectory()) {
    const { count, problems } = diffAgainstRef(path, base);
    if (problems.length) throw new Error(`log is not append-only against ${base}: ${problems.join("; ")} (history must be immutable)`);
    return { note: count ? `append-only verified against ${base}` : `append-only verified (no prior entries at ${base})` };
  }
  if (!existsSync(base)) throw new Error(`base log not found: ${base} (cannot verify append-only; fail closed)`);
  if (statSync(base).isDirectory()) throw new Error(`base log ${base} is a directory, not the base revision of ${path} (fail closed)`);
  const baseText = readFileSync(base, "utf8");
  if (baseText && !readFileSync(path, "utf8").startsWith(baseText)) throw new Error("log is not append-only: a prior entry was edited or removed (history must be immutable)");
  return { note: "append-only verified" };
}

// Compare a directory with its tree at `ref`, in two git calls whatever the history size: how many files the ref
// has there, and which of them the work tree deleted or changed. core.autocrlf=input makes a line-ending change
// alone read as unchanged, so a Windows checkout does not fail. Throws on any git failure (fail closed).
function diffAgainstRef(dir, ref) {
  const git = (...a) => {
    const r = spawnSync("git", ["-c", "core.autocrlf=input", "-c", "core.quotePath=false", ...a], { cwd: dir, encoding: "utf8" });
    if (r.status !== 0) throw new Error(`git ${a.join(" ")} failed: ${(r.stderr || "").trim() || `exit ${r.status}`} (cannot verify append-only; fail closed)`);
    return r.stdout;
  };
  // --end-of-options: the ref comes from a CLI flag or CI env, so a value like "--output=<file>" must be read as a
  // ref (and fail), never as a git option.
  const count = git("ls-tree", "--name-only", "--end-of-options", ref).split("\n").filter((n) => n && n !== "README.md").length;
  const problems = git("diff", "--no-renames", "--relative", "--name-status", "--diff-filter=DMT", "--end-of-options", ref, "--", ".", ":!README.md")
    .split("\n").filter(Boolean).map((l) => {
      const [status, name] = l.split("\t");
      return `${name} was ${status === "D" ? "removed" : "edited"}`;
    });
  return { count, problems };
}
