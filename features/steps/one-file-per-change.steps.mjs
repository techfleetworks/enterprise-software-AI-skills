// Step definitions for features/repo-process/one-file-per-change.feature (ADR-0108).
// Builds throwaway git repositories and drives the REAL readers (judge-arch entry-log.mjs, the BDD skill's
// coverage-log reader) and the REAL release script, so a layout or a check that regressed turns these red.
import { mkdtempSync, mkdirSync, writeFileSync, appendFileSync, readFileSync, readdirSync, unlinkSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";
import assert from "node:assert/strict";
import { readEntries, verifyAppendOnly } from "../../.claude/skills/judge-arch/scripts/entry-log.mjs";
import { verifyCoverageLogAgainstRef } from "../../.claude/skills/bdd-comprehensive-testing/scripts/bdd-lib.mjs";

const REPO = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..");
const RELEASE = join(REPO, "scripts/changelog-release.mjs");
const RECORD_DIRS = [["docs/arch-reviews/entries", ".json"], ["docs/skill-receipts/entries", ".json"],
  ["features/bdd-coverage-log", ".md"], ["changelog.d", ".md"]];
const LOGS = { "review log": ["docs/arch-reviews/entries", ".json"], "coverage log": ["features/bdd-coverage-log", ".md"] };

function newRepo() {
  const root = mkdtempSync(join(tmpdir(), "ofpc-"));
  const git = (...a) => spawnSync("git", ["-C", root, "-c", "core.attributesFile=", ...a], { encoding: "utf8" });
  git("init", "-q", "-b", "main");
  for (const [k, v] of [["user.email", "t@t.t"], ["user.name", "t"], ["commit.gpgsign", "false"]]) git("config", k, v);
  return { root, git, commit: (m) => { git("add", "-A"); git("commit", "-qm", m); } };
}
const addRecords = (root, stamp, who) => {
  for (const [d, ext] of RECORD_DIRS) {
    mkdirSync(join(root, d), { recursive: true });
    writeFileSync(join(root, d, `${stamp}-${who}${ext}`), `{"change":"${who}"}\n`);
  }
};
const appendShared = (root, who) => {
  mkdirSync(join(root, "docs/arch-reviews"), { recursive: true });
  appendFileSync(join(root, "docs/arch-reviews/log.jsonl"), `{"change":"${who}"}\n`);
};
const check = (world) => {
  const [d] = LOGS[world.log];
  const dir = join(world.repo.root, d);
  try {
    world.note = world.log === "review log" ? verifyAppendOnly(dir, world.ref).note : verifyCoverageLogAgainstRef(dir, world.ref);
    world.error = null;
  } catch (e) { world.error = e.message; }
};

export default function ({ Given, When, Then, And }) {
  // --- the merge -----------------------------------------------------------------------------------------
  Given(/^a repository whose main branch has one review, one receipt, one coverage entry, and one changelog note$/, (world) => {
    world.repo = newRepo();
    addRecords(world.repo.root, "20261101T000000Z", "base");
    world.repo.commit("base");
  });
  And(/^a branch that adds its own review, receipt, coverage entry, and changelog note$/, (world) => {
    world.repo.git("checkout", "-q", "-b", "feature");
    addRecords(world.repo.root, "20261102T000000Z", "feature");
    world.repo.commit("feature");
  });
  And(/^main gains a different change's review, receipt, coverage entry, and changelog note$/, (world) => {
    world.repo.git("checkout", "-q", "main");
    addRecords(world.repo.root, "20261102T000001Z", "other");
    world.repo.commit("other");
  });
  Given(/^a repository whose main branch has one line in a shared review log$/, (world) => {
    world.repo = newRepo();
    appendShared(world.repo.root, "base");
    world.repo.commit("base");
  });
  And(/^a branch that appends its own line to the shared review log$/, (world) => {
    world.repo.git("checkout", "-q", "-b", "feature");
    appendShared(world.repo.root, "feature");
    world.repo.commit("feature");
  });
  And(/^main appends a different line to the shared review log$/, (world) => {
    world.repo.git("checkout", "-q", "main");
    appendShared(world.repo.root, "other");
    world.repo.commit("other");
  });
  When(/^the branch is merged into main with every merge driver off$/, (world) => {
    const r = world.repo.git("merge", "--no-edit", "feature");
    world.merge = { status: r.status, out: r.stdout + r.stderr };
  });
  Then(/^the merge has no conflict$/, (world) => assert.equal(world.merge.status, 0, world.merge.out));
  Then(/^the merge conflicts$/, (world) => {
    assert.notEqual(world.merge.status, 0, world.merge.out);
    assert.match(world.merge.out, /CONFLICT/);
  });
  And(/^every record from both changes is kept$/, (world) => {
    for (const [d, ext] of RECORD_DIRS) {
      assert.deepEqual(readdirSync(join(world.repo.root, d)).sort(),
        ["20261101T000000Z-base", "20261102T000000Z-feature", "20261102T000001Z-other"].map((n) => n + ext), d);
    }
  });

  // --- append-only against a ref ------------------------------------------------------------------------
  Given(/^a committed (review log|coverage log) with one entry$/, (world, log) => {
    world.log = log;
    world.repo = newRepo();
    const [d, ext] = LOGS[log];
    mkdirSync(join(world.repo.root, d), { recursive: true });
    world.entry = `20261101T000000Z-a${ext}`;
    writeFileSync(join(world.repo.root, d, world.entry), log === "review log" ? '{"change":"a"}\n' : "## a\n- event: added\n");
    world.repo.commit("base");
    world.ref = "main";
  });
  When(/^that past entry is (edited|removed) and the log is checked against the base ref$/, (world, action) => {
    const p = join(world.repo.root, LOGS[world.log][0], world.entry);
    if (action === "edited") writeFileSync(p, "rewritten\n"); else unlinkSync(p);
    check(world);
  });
  When(/^a new entry file is added and the log is checked against the base ref$/, (world) => {
    const [d, ext] = LOGS[world.log];
    writeFileSync(join(world.repo.root, d, `20261102T000000Z-b${ext}`), world.log === "review log" ? '{"change":"b"}\n' : "## b\n- event: added\n");
    check(world);
  });
  When(/^the log is checked against the base ref "([^"]+)"$/, (world, ref) => { world.ref = ref; check(world); });
  Then(/^the check fails and names the entry as (edited|removed)$/, (world, action) => {
    assert.ok(world.error, "the check passed, but a past entry was changed");
    assert.ok(world.error.includes(`${world.entry} was ${action}`), world.error);
  });
  Then(/^the append-only check passes$/, (world) => assert.equal(world.error, null, world.error));
  Then(/^the check fails closed$/, (world) => {
    assert.ok(world.error, "a missing base ref passed");
    assert.match(world.error, /fail closed/);
  });

  // --- entry names --------------------------------------------------------------------------------------
  Given(/^a review log folder holding an entry named "([^"]+)"$/, (world, name) => {
    world.dir = mkdtempSync(join(tmpdir(), "ofpc-name-"));
    writeFileSync(join(world.dir, name), '{"change":"a"}\n');
  });
  When(/^the review log is read$/, (world) => {
    try { readEntries(world.dir); world.error = null; } catch (e) { world.error = e.message; }
  });
  Then(/^the read fails and names "([^"]+)"$/, (world, name) => {
    assert.ok(world.error && world.error.includes(name), world.error ?? "the read passed");
  });

  // --- the release step ---------------------------------------------------------------------------------
  Given(/^a changelog whose newest section is 1\.3\.1$/, (world) => {
    world.root = mkdtempSync(join(tmpdir(), "ofpc-rel-"));
    world.before = "# Changelog\n\n## 1.3.1 - 2026-10-30\n\nOld.\n";
    writeFileSync(join(world.root, "CHANGELOG.md"), world.before);
    mkdirSync(join(world.root, "changelog.d"));
  });
  And(/^unreleased notes "([^"]+)" and "([^"]+)"$/, (world, a, b) => {
    writeFileSync(join(world.root, "changelog.d", a), "### Added (a)\n\n- note a\n");
    writeFileSync(join(world.root, "changelog.d", b), "### Fixed (b)\n\n- note b\n");
  });
  When(/^version (\S+) is released on (\S+)$/, (world, version, date) => {
    world.release = spawnSync(process.execPath, [RELEASE, version, date, world.root], { encoding: "utf8" });
  });
  Then(/^the changelog has a 1\.4\.0 section above 1\.3\.1 holding note a before note b$/, (world) => {
    assert.equal(world.release.status, 0, world.release.stderr);
    const text = readFileSync(join(world.root, "CHANGELOG.md"), "utf8");
    const at = (s) => text.indexOf(s);
    assert.ok(at("## 1.4.0 - 2026-11-03") >= 0 && at("## 1.4.0") < at("note a") && at("note a") < at("note b") && at("note b") < at("## 1.3.1"), text);
  });
  And(/^the unreleased notes are gone$/, (world) => assert.deepEqual(readdirSync(join(world.root, "changelog.d")), []));
  Then(/^the release fails closed and the changelog is unchanged$/, (world) => {
    assert.equal(world.release.status, 2, world.release.stderr);
    assert.equal(readFileSync(join(world.root, "CHANGELOG.md"), "utf8"), world.before);
    assert.ok(existsSync(join(world.root, "changelog.d", "20261101T000000Z-a.md")), "a refused release must not delete the notes");
  });
}
