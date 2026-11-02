// Tests for scripts/changelog-release.mjs (ADR-0108): the release step that folds changelog.d/ files into
// CHANGELOG.md. Pull requests no longer edit CHANGELOG.md, so this fold is the only writer of released sections;
// a fold that dropped or reordered a change, or wrote over an existing version, would lose release notes.
import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, readdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { foldChangelog } from "../scripts/changelog-release.mjs";

const SCRIPT = resolve(dirname(fileURLToPath(import.meta.url)), "../scripts/changelog-release.mjs");
const LOG = "# Changelog\n\nIntro.\n\n## 1.3.1 - 2026-10-30\n\nOld notes.\n";
const frag = (name, text) => ({ name, text });

test("folds the files in, oldest first, above the newest released section", () => {
  const out = foldChangelog(LOG, [frag("20261102T000000Z-b.md", "### Fixed (b)\n\n- b\n"), frag("20261101T000000Z-a.md", "### Added (a)\n\n- a\n")], "1.4.0", "2026-11-03");
  assert.equal(out, "# Changelog\n\nIntro.\n\n## 1.4.0 - 2026-11-03\n\n### Added (a)\n\n- a\n\n### Fixed (b)\n\n- b\n\n## 1.3.1 - 2026-10-30\n\nOld notes.\n");
});

for (const [label, args, expect] of [
  ["no files to release", [[], "1.4.0", "2026-11-03"], /no changelog\.d files/],
  ["a version already released", [[frag("20261101T000000Z-a.md", "x")], "1.3.1", "2026-11-03"], /already has a 1\.3\.1 section/],
  ["a bad version", [[frag("20261101T000000Z-a.md", "x")], "1.4", "2026-11-03"], /MAJOR\.MINOR\.PATCH/],
  ["a bad date", [[frag("20261101T000000Z-a.md", "x")], "1.4.0", "Nov 3"], /YYYY-MM-DD/],
  ["a file not in the stamped form", [[frag("notes.md", "x")], "1.4.0", "2026-11-03"], /notes\.md/],
]) {
  test(`refuses ${label}`, () => {
    assert.throws(() => foldChangelog(LOG, ...args), expect);
  });
}

test("refuses a changelog with no released section to insert above", () => {
  assert.throws(() => foldChangelog("# Changelog\n", [frag("20261101T000000Z-a.md", "x")], "1.0.0", "2026-11-03"), /no released/);
});

test("the CLI writes CHANGELOG.md and empties changelog.d, keeping its README", () => {
  const root = mkdtempSync(join(tmpdir(), "clr-"));
  writeFileSync(join(root, "CHANGELOG.md"), LOG);
  mkdirSync(join(root, "changelog.d"));
  writeFileSync(join(root, "changelog.d", "README.md"), "how to\n");
  writeFileSync(join(root, "changelog.d", "20261101T000000Z-a.md"), "### Added (a)\n\n- a\n");
  const r = spawnSync(process.execPath, [SCRIPT, "1.4.0", "2026-11-03", root], { encoding: "utf8" });
  assert.equal(r.status, 0, r.stderr);
  assert.match(readFileSync(join(root, "CHANGELOG.md"), "utf8"), /## 1\.4\.0 - 2026-11-03\n\n### Added \(a\)/);
  assert.deepEqual(readdirSync(join(root, "changelog.d")), ["README.md"]);
});

test("the CLI refuses a release note with another extension instead of skipping it (discriminating)", () => {
  const root = mkdtempSync(join(tmpdir(), "clr-"));
  writeFileSync(join(root, "CHANGELOG.md"), LOG);
  mkdirSync(join(root, "changelog.d"));
  writeFileSync(join(root, "changelog.d", "20261101T000000Z-a.md"), "### Added (a)\n");
  writeFileSync(join(root, "changelog.d", "20261102T000000Z-b.markdown"), "### Fixed (b)\n");
  const r = spawnSync(process.execPath, [SCRIPT, "1.4.0", "2026-11-03", root], { encoding: "utf8" });
  assert.equal(r.status, 2);
  assert.match(r.stderr, /20261102T000000Z-b\.markdown/);
  assert.equal(readFileSync(join(root, "CHANGELOG.md"), "utf8"), LOG);
});

test("the CLI fails closed (exit 2) and writes nothing when there is nothing to release", () => {
  const root = mkdtempSync(join(tmpdir(), "clr-"));
  writeFileSync(join(root, "CHANGELOG.md"), LOG);
  const r = spawnSync(process.execPath, [SCRIPT, "1.4.0", "2026-11-03", root], { encoding: "utf8" });
  assert.equal(r.status, 2);
  assert.equal(readFileSync(join(root, "CHANGELOG.md"), "utf8"), LOG);
});
