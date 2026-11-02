#!/usr/bin/env node
// changelog-release - fold the unreleased changelog.d/ files into CHANGELOG.md at release time (ADR-0108).
//
// Pull requests never edit CHANGELOG.md; each adds one changelog.d/<YYYYMMDDTHHMMSSZ>-<slug>.md file, so two
// open pull requests cannot conflict on the changelog. The release step runs this once:
//
//   node scripts/changelog-release.mjs <version> <YYYY-MM-DD> [repoRoot]
//
// It inserts `## <version> - <date>` above the newest released section, with the files' text oldest first, then
// deletes the files. Fails closed (exit 2, nothing written) on a bad version or date, any file in changelog.d
// other than README.md that is not in the stamped form, no files to release, a version already in the
// changelog, or a changelog with no released section to insert above. If deleting a released file fails after
// the write, it puts CHANGELOG.md and every deleted file back and exits 2, so a re-run starts clean.
import { readFileSync, writeFileSync, readdirSync, unlinkSync, existsSync, realpathSync } from "node:fs";
import { join, resolve, dirname } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

export const FRAGMENT_NAME = /^\d{8}T\d{6}Z-[a-z0-9][a-z0-9._-]*\.md$/;

// Pure: the new changelog text. Throws an Error naming the problem.
export function foldChangelog(changelog, fragments, version, date) {
  if (!/^\d+\.\d+\.\d+$/.test(version)) throw new Error(`version "${version}" is not MAJOR.MINOR.PATCH`);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) throw new Error(`date "${date}" is not YYYY-MM-DD`);
  const bad = fragments.filter((f) => !FRAGMENT_NAME.test(f.name)).map((f) => f.name);
  if (bad.length) throw new Error(`changelog.d file name(s) not in the <YYYYMMDDTHHMMSSZ>-<slug>.md form: ${bad.join(", ")}`);
  if (fragments.length === 0) throw new Error("no changelog.d files to release (nothing changed since the last release?)");
  if (new RegExp(`^## ${version.replace(/\./g, "\\.")}\\b`, "m").test(changelog)) throw new Error(`CHANGELOG.md already has a ${version} section`);
  const at = changelog.search(/^## \d+\.\d+\.\d+/m);
  if (at < 0) throw new Error("CHANGELOG.md has no released `## <version>` section to insert above");
  const body = [...fragments].sort((a, b) => a.name.localeCompare(b.name)).map((f) => f.text.replace(/\r\n/g, "\n").trim()).join("\n\n");
  return changelog.slice(0, at) + `## ${version} - ${date}\n\n${body}\n\n` + changelog.slice(at);
}

// Run as a script, not imported. Compare REAL paths, so a checkout reached through a symlink or junction still runs.
if (process.argv[1] && import.meta.url === pathToFileURL(realpathSync(process.argv[1])).href) {
  const [version, date, root = resolve(dirname(fileURLToPath(import.meta.url)), "..")] = process.argv.slice(2);
  const dir = join(root, "changelog.d");
  const path = join(root, "CHANGELOG.md");
  try {
    if (!existsSync(path)) throw new Error(`not found: ${path}`);
    // Every file but the README is a release note, whatever its extension, so a misnamed note fails here
    // instead of being skipped and never released.
    const names = existsSync(dir) ? readdirSync(dir).filter((n) => n !== "README.md") : [];
    const fragments = names.map((name) => ({ name, text: readFileSync(join(dir, name), "utf8") }));
    const original = readFileSync(path, "utf8");
    writeFileSync(path, foldChangelog(original, fragments, version ?? "", date ?? ""));
    const deleted = [];
    try {
      for (const f of fragments) { unlinkSync(join(dir, f.name)); deleted.push(f); }
    } catch (e) {
      writeFileSync(path, original);
      for (const f of deleted) writeFileSync(join(dir, f.name), f.text);
      throw new Error(`could not delete a released file (${e.message}); CHANGELOG.md and changelog.d were restored`);
    }
    console.log(`[changelog-release] OK - ${names.length} change(s) released as ${version} (${date}); changelog.d emptied.`);
  } catch (e) {
    console.error(`[changelog-release] FAIL - ${e.message}`);
    process.exit(2);
  }
}
