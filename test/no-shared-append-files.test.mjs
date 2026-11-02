// Proves the structural fix for the recurring merge conflicts (ADR-0108, superseding ADR-0087's union driver).
//
// Every PR used to append to the same few files (the review log, the receipt log, the BDD coverage log, the
// changelog, the generated BDD index, the npm test list), so any two open PRs conflicted. GitHub ignores merge
// drivers when it decides whether a PR conflicts, so no driver could fix that. Now each change adds its OWN new
// file, and two PRs never touch the same file. These tests pin that:
//   1. the old shared files are not tracked, and no merge driver is configured for the new layout;
//   2. CHANGELOG.md carries no Unreleased section (unreleased notes live in changelog.d/);
//   3. every entry file follows the <YYYYMMDDTHHMMSSZ>-<slug> name form that keeps names unique and ordered;
//   4. a real two-branch merge, with every merge driver off, merges cleanly in the new layout and conflicts in
//      the old one (the discrimination control: if the layout regresses to a shared file, this flips).
import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtempSync, writeFileSync, appendFileSync, readFileSync, readdirSync, mkdirSync, rmSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { ENTRY_NAME } from "../.claude/skills/judge-arch/scripts/entry-log.mjs";
import { LOG_ENTRY_NAME } from "../.claude/skills/bdd-comprehensive-testing/scripts/bdd-lib.mjs";
import { FRAGMENT_NAME } from "../scripts/changelog-release.mjs";

const REPO = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const gitOK = spawnSync("git", ["--version"], { stdio: "ignore" }).status === 0;
const opts = { skip: gitOK ? false : "git unavailable here (CI/ubuntu runs it)" };

const SHARED = ["docs/arch-reviews/log.jsonl", "docs/skill-receipts/log.jsonl", "features/bdd-coverage-log.md",
  "features/bdd-index.json", "features/INDEX.md"];
const ENTRY_DIRS = [["docs/arch-reviews/entries", ".json"], ["docs/skill-receipts/entries", ".json"],
  ["features/bdd-coverage-log", ".md"], ["changelog.d", ".md"]];
const NAME = { ".json": ENTRY_NAME, ".md": LOG_ENTRY_NAME };

// The stamped-name rule has three owners on purpose: judge-arch's reader, the BDD skill's reader (that skill
// installs on its own, so it cannot import judge-arch), and the release script. They must stay one rule.
test("the three stamped-name patterns are the same rule apart from the extension", () => {
  const stem = (re) => re.source.replace(/\\\.(json|md)\$$/, "");
  assert.equal(stem(LOG_ENTRY_NAME), stem(ENTRY_NAME));
  assert.equal(stem(FRAGMENT_NAME), stem(ENTRY_NAME));
  assert.equal(ENTRY_NAME.flags + LOG_ENTRY_NAME.flags + FRAGMENT_NAME.flags, "");
});

test("the old shared append files are not tracked", opts, () => {
  const r = spawnSync("git", ["-C", REPO, "ls-files", "--", ...SHARED], { encoding: "utf8" });
  assert.equal(r.status, 0, r.stderr);
  assert.equal(r.stdout.trim(), "", `these shared files are tracked again and will make every two open PRs conflict:\n${r.stdout}`);
});

test("no merge driver is set for the entry directories or the changelog", opts, () => {
  const paths = [...ENTRY_DIRS.map(([d, ext]) => `${d}/20260101T000000Z-x${ext}`), "CHANGELOG.md"];
  const r = spawnSync("git", ["-C", REPO, "check-attr", "merge", "--", ...paths], { encoding: "utf8" });
  assert.equal(r.status, 0, r.stderr);
  for (const line of r.stdout.trim().split("\n")) assert.match(line, /: merge: unspecified$/, line);
});

test("CHANGELOG.md has no Unreleased section (unreleased notes go in changelog.d/)", () => {
  assert.doesNotMatch(readFileSync(join(REPO, "CHANGELOG.md"), "utf8"), /^##\s+Unreleased/im);
});

test("every file in an entry folder, whatever its extension, is named <YYYYMMDDTHHMMSSZ>-<slug>", () => {
  for (const [dir, ext] of ENTRY_DIRS) {
    assert.ok(existsSync(join(REPO, dir)), `${dir} is missing`);
    const bad = readdirSync(join(REPO, dir)).filter((n) => n !== "README.md" && !NAME[ext].test(n));
    assert.deepEqual(bad, [], `${dir}: names not in the stamped form`);
  }
});

// Two branches off one base each record one change, then the second merges into the first, with every merge
// driver and attribute off. `layout` writes a change's records into a work tree. Returns the merge status and
// output, and the entry-dir listings after the merge.
function mergeScenario(layout) {
  const dir = mkdtempSync(join(tmpdir(), "nsaf-"));
  const g = (...a) => spawnSync("git", ["-C", dir, "-c", "core.attributesFile=", ...a], { encoding: "utf8" });
  try {
    g("init", "-q", "-b", "main");
    for (const [k, v] of [["user.email", "t@t.t"], ["user.name", "t"], ["commit.gpgsign", "false"]]) g("config", k, v);
    layout(dir, "base");
    g("add", "-A"); g("commit", "-qm", "base");
    g("checkout", "-q", "-b", "feature");
    layout(dir, "feature");
    g("add", "-A"); g("commit", "-qm", "feature");
    g("checkout", "-q", "main");
    layout(dir, "other");
    g("add", "-A"); g("commit", "-qm", "other");
    const m = g("merge", "--no-edit", "feature");
    const files = Object.fromEntries(ENTRY_DIRS.map(([d]) => [d, existsSync(join(dir, d)) ? readdirSync(join(dir, d)).sort() : []]));
    return { status: m.status, out: m.stdout + m.stderr, files };
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

const STAMP = { base: "20260101T000000Z", feature: "20260102T000000Z", other: "20260102T000001Z" };
const perEntry = (dir, who) => {
  for (const [d, ext] of ENTRY_DIRS) {
    mkdirSync(join(dir, d), { recursive: true });
    writeFileSync(join(dir, d, `${STAMP[who]}-${who}${ext}`), `{"change":"${who}"}\n`);
  }
};
const sharedFile = (dir, who) => {
  for (const f of SHARED.slice(0, 3)) {
    mkdirSync(dirname(join(dir, f)), { recursive: true });
    appendFileSync(join(dir, f), `{"change":"${who}"}\n`);
  }
};

test("the one-file-per-entry layout merges two changes cleanly with no merge driver", opts, () => {
  const r = mergeScenario(perEntry);
  assert.equal(r.status, 0, `two PRs each adding their own entry files must not conflict:\n${r.out}`);
  for (const [d, ext] of ENTRY_DIRS) {
    assert.deepEqual(r.files[d], ["base", "feature", "other"].map((w) => `${STAMP[w]}-${w}${ext}`).sort(), `${d} keeps every entry`);
  }
});

test("the old shared-file layout conflicts on the same merge (discriminating control)", opts, () => {
  const r = mergeScenario(sharedFile);
  assert.notEqual(r.status, 0, "appending to one shared file must conflict; if this passes, the control is broken");
  assert.match(r.out, /CONFLICT/);
});
