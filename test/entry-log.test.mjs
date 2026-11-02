// Tests for the one-file-per-entry logs (ADR-0108): judge-arch's entry-log.mjs reader (shared by the review
// coverage gate, the receipt gate, and the open-HIGH gate) and the BDD skill's own coverage-log reader. The old
// single-file logs made every two open PRs conflict; the directory form cannot. These tests prove the directory
// form keeps every guarantee the file form had: entries read in order, a bad name or bad JSON fails closed, and
// append-only still catches an edited or removed entry, now against a git ref.
import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync, unlinkSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { readEntries, verifyAppendOnly, defaultLogPath } from "../.claude/skills/judge-arch/scripts/entry-log.mjs";

const REPO = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const COV = resolve(REPO, ".claude/skills/judge-arch/scripts/check-arch-review-coverage.mjs");
const HIGH = resolve(REPO, ".claude/skills/judge-arch/scripts/check-open-high-findings.mjs");
const BDD = (s) => resolve(REPO, ".claude/skills/bdd-comprehensive-testing/scripts", s);
const gitOK = spawnSync("git", ["--version"], { stdio: "ignore" }).status === 0;
const gitOpts = { skip: gitOK ? false : "git unavailable here (CI/ubuntu runs it)" };

const dirLog = (files) => {
  const d = mkdtempSync(join(tmpdir(), "elog-"));
  for (const [n, v] of Object.entries(files)) writeFileSync(join(d, n), typeof v === "string" ? v : JSON.stringify(v) + "\n");
  return d;
};
const run = (script, args, env = {}) => {
  const r = spawnSync(process.execPath, [script, ...args], { encoding: "utf8", env: { ...process.env, ...env } });
  return { status: r.status, out: (r.stdout || "") + (r.stderr || "") };
};

// A throwaway git repo with `rel` committed as the base; returns { root, dir, git }.
function repoWith(rel, files) {
  const root = mkdtempSync(join(tmpdir(), "elog-git-"));
  const git = (...a) => spawnSync("git", ["-C", root, ...a], { encoding: "utf8" });
  git("init", "-q", "-b", "main");
  for (const [k, v] of [["user.email", "t@t.t"], ["user.name", "t"], ["commit.gpgsign", "false"]]) git("config", k, v);
  const dir = join(root, rel);
  mkdirSync(dir, { recursive: true });
  for (const [n, v] of Object.entries(files)) writeFileSync(join(dir, n), v);
  git("add", "-A"); git("commit", "-qm", "base");
  return { root, dir, git };
}

// --- the reader ---------------------------------------------------------------------------------------------
test("entries read oldest first by stamped name, one JSON object per file", () => {
  const d = dirLog({ "20261102T000000Z-b.json": { n: 2 }, "20261101T000000Z-a.json": { n: 1 }, "README.md": "not an entry\n" });
  assert.deepEqual(readEntries(d), [{ n: 1 }, { n: 2 }]);
});

test("a .json file not in the stamped form fails closed (names would stop being unique and ordered)", () => {
  assert.throws(() => readEntries(dirLog({ "review.json": { n: 1 } })), /review\.json/);
});

test("a file with another extension in the folder fails closed instead of being skipped (discriminating)", () => {
  assert.throws(() => readEntries(dirLog({ "20261101T000000Z-a.json": { n: 1 }, "20261102T000000Z-b.jsonl": "{}\n" })), /20261102T000000Z-b\.jsonl/);
});

test("a BDD coverage-log entry with another extension fails closed instead of being skipped (discriminating)", () => {
  const r = run(BDD("check-bdd-coverage.mjs"), [features({ "20261101T000000Z-a.md": "- event: added\n", "20261102T000000Z-b.markdown": "- event: bogus\n" })]);
  assert.equal(r.status, 1);
  assert.match(r.out, /20261102T000000Z-b\.markdown/);
});

test("an entry that is not valid JSON fails closed, naming the file", () => {
  assert.throws(() => readEntries(dirLog({ "20261101T000000Z-a.json": "{nope" })), /20261101T000000Z-a\.json/);
});

test("an empty entries directory fails closed (a missing review is not a pass)", () => {
  assert.throws(() => readEntries(dirLog({})), /no entries/);
});

test("a legacy .jsonl file still reads, one entry per line", () => {
  const d = mkdtempSync(join(tmpdir(), "elog-"));
  writeFileSync(join(d, "log.jsonl"), '{"n":1}\n{"n":2}\n');
  assert.deepEqual(readEntries(join(d, "log.jsonl")), [{ n: 1 }, { n: 2 }]);
});

test("the default path is the entries directory, falling back to a legacy file only when there is no directory", () => {
  const d = mkdtempSync(join(tmpdir(), "elog-"));
  writeFileSync(join(d, "log.jsonl"), '{"n":1}\n');
  assert.equal(defaultLogPath(join(d, "entries"), join(d, "log.jsonl")), join(d, "log.jsonl"));
  mkdirSync(join(d, "entries"));
  assert.equal(defaultLogPath(join(d, "entries"), join(d, "log.jsonl")), join(d, "entries"));
});

// --- append-only against a git ref ---------------------------------------------------------------------------
test("adding a new entry file is append-only", gitOpts, () => {
  const { dir } = repoWith("log", { "20261101T000000Z-a.json": '{"n":1}\n' });
  writeFileSync(join(dir, "20261102T000000Z-b.json"), '{"n":2}\n');
  assert.match(verifyAppendOnly(dir, "main").note, /append-only verified against main/);
});

test("an edited past entry is caught (discriminating)", gitOpts, () => {
  const { dir } = repoWith("log", { "20261101T000000Z-a.json": '{"n":1}\n' });
  writeFileSync(join(dir, "20261101T000000Z-a.json"), '{"n":"rewritten"}\n');
  assert.throws(() => verifyAppendOnly(dir, "main"), /20261101T000000Z-a\.json was edited/);
});

test("a removed past entry is caught (discriminating)", gitOpts, () => {
  const { dir } = repoWith("log", { "20261101T000000Z-a.json": '{"n":1}\n', "20261102T000000Z-b.json": '{"n":2}\n' });
  unlinkSync(join(dir, "20261101T000000Z-a.json"));
  assert.throws(() => verifyAppendOnly(dir, "main"), /20261101T000000Z-a\.json was removed/);
});

test("a line-ending change alone is not an edit (a Windows checkout must not fail append-only)", gitOpts, () => {
  const { dir } = repoWith("log", { "20261101T000000Z-a.json": '{"n":1}\n' });
  writeFileSync(join(dir, "20261101T000000Z-a.json"), '{"n":1}\r\n');
  assert.doesNotThrow(() => verifyAppendOnly(dir, "main"));
});

test("a ref that does not exist fails closed, never a silent pass", gitOpts, () => {
  const { dir } = repoWith("log", { "20261101T000000Z-a.json": '{"n":1}\n' });
  assert.throws(() => verifyAppendOnly(dir, "no-such-ref"), /fail closed/);
});

// The outcome that matters: an option-looking ref fails closed and writes nothing. Limit, stated: this does not
// isolate the `--end-of-options` guards, because ls-tree runs first and also fails on an option-only value (it
// needs a tree). The guards are defense in depth for the git diff call if that order ever changes.
test("a base ref that looks like a git option fails closed and writes nothing (@security)", gitOpts, () => {
  const { root, dir } = repoWith("log", { "20261101T000000Z-a.json": '{"n":1}\n' });
  const out = join(root, "pwned.txt");
  assert.throws(() => verifyAppendOnly(dir, `--output=${out}`), /fail closed/);
  assert.equal(existsSync(out), false, "the ref was treated as a git option and wrote a file");
  assert.throws(() => verifyAppendOnly(dir, "-r"), /fail closed/);
});

test("a directory the base ref never had passes as the first history (the migration PR)", gitOpts, () => {
  const { root } = repoWith("other", { "x.txt": "x\n" });
  const dir = join(root, "log");
  mkdirSync(dir);
  writeFileSync(join(dir, "20261101T000000Z-a.json"), '{"n":1}\n');
  assert.match(verifyAppendOnly(dir, "main").note, /no prior entries/);
});

// --- the gates, end to end, on a directory log ----------------------------------------------------------------
const QS = ["boundary", "ownership", "dependency", "error-handling"];
const review = (change, over = {}) => ({
  date: "2026-11-02", change, scope: ["a.ts"],
  matrix: { "a.ts": Object.fromEntries(QS.map((q) => [q, { verdict: "cleared", evidence: `rg ${q} -> clean` }])) },
  findings: [], grepCommands: ["rg -n request src/"], archGate: "pass", verdict: "PASS", ...over,
});

test("review coverage reads a directory log and finds this change's entry", () => {
  const d = dirLog({ "20261101T000000Z-old.json": review("old"), "20261102T000000Z-c1.json": review("c1") });
  const r = run(COV, ["--log", d, "--change", "c1", "--changed-list", "a.ts"]);
  assert.equal(r.status, 0, r.out);
});

test("review coverage on a directory log still flags an unreviewed file (discriminating)", () => {
  const d = dirLog({ "20261102T000000Z-c1.json": review("c1") });
  assert.equal(run(COV, ["--log", d, "--change", "c1", "--changed-list", "a.ts,b.ts"]).status, 1);
});

test("review coverage with --base <ref> fails on an edited past review (discriminating)", gitOpts, () => {
  const { dir } = repoWith("entries", { "20261101T000000Z-c1.json": JSON.stringify(review("c1")) + "\n" });
  writeFileSync(join(dir, "20261101T000000Z-c1.json"), JSON.stringify(review("c1", { verdict: "EDITED" })) + "\n");
  const r = run(COV, ["--log", dir, "--change", "c1", "--changed-list", "a.ts", "--base", "main"]);
  assert.equal(r.status, 1, r.out);
  assert.match(r.out, /was edited/);
});

test("the open-HIGH gate reads a directory log and blocks an open HIGH finding (discriminating)", () => {
  const d = dirLog({ "20261102T000000Z-c1.json": review("c1", { findings: [{ severity: "high", where: "a.ts", finding: "x" }] }) });
  assert.equal(run(HIGH, ["--log", d]).status, 1);
  assert.equal(run(HIGH, ["--log", dirLog({ "20261102T000000Z-c1.json": review("c1") })]).status, 0);
});

// --- the BDD coverage log as a directory, and the derived datastore ------------------------------------------
const FEATURE = `Feature: W

  @audience:customer @usecase:a @category:happy @quality:functional @severity:high
  Scenario: ok
    Given a
    When b
    Then c

  @audience:customer @usecase:b @category:error @quality:functional @severity:high
  Scenario: bad
    Given a
    When x
    Then y
`;
function features(entries) {
  const root = mkdtempSync(join(tmpdir(), "elog-bdd-"));
  writeFileSync(join(root, "w.feature"), FEATURE);
  writeFileSync(join(root, "bdd-config.json"), JSON.stringify({ audiences: ["customer"] }));
  mkdirSync(join(root, "bdd-coverage-log"));
  writeFileSync(join(root, "bdd-coverage-log", "README.md"), "about the log\n");
  for (const [n, v] of Object.entries(entries)) writeFileSync(join(root, "bdd-coverage-log", n), v);
  return root;
}

test("BDD coverage passes a directory log with no committed datastore (derived from the feature files)", () => {
  const r = run(BDD("check-bdd-coverage.mjs"), [features({ "20261101T000000Z-a.md": "## x\n- event: added\n" })]);
  assert.equal(r.status, 0, r.out);
  assert.match(r.out, /datastore derived from the feature files/);
});

test("BDD coverage on a directory log flags an unknown event (discriminating)", () => {
  assert.equal(run(BDD("check-bdd-coverage.mjs"), [features({ "20261101T000000Z-a.md": "- event: bogus\n" })]).status, 1);
});

test("BDD coverage on a directory log flags a badly named entry (discriminating)", () => {
  const r = run(BDD("check-bdd-coverage.mjs"), [features({ "notes.md": "- event: added\n" })]);
  assert.equal(r.status, 1);
  assert.match(r.out, /notes\.md/);
});

test("BDD coverage with BDD_LOG_BASE_REF fails on an edited past entry (discriminating)", gitOpts, () => {
  const root = mkdtempSync(join(tmpdir(), "elog-bddgit-"));
  const git = (...a) => spawnSync("git", ["-C", root, ...a], { encoding: "utf8" });
  git("init", "-q", "-b", "main");
  for (const [k, v] of [["user.email", "t@t.t"], ["user.name", "t"], ["commit.gpgsign", "false"]]) git("config", k, v);
  const f = join(root, "features");
  mkdirSync(join(f, "bdd-coverage-log"), { recursive: true });
  writeFileSync(join(f, "w.feature"), FEATURE);
  writeFileSync(join(f, "bdd-config.json"), JSON.stringify({ audiences: ["customer"] }));
  writeFileSync(join(f, "bdd-coverage-log", "20261101T000000Z-a.md"), "## a\n- event: added\n");
  git("add", "-A"); git("commit", "-qm", "base");
  assert.equal(run(BDD("check-bdd-coverage.mjs"), [f], { BDD_LOG_BASE_REF: "main" }).status, 0);
  writeFileSync(join(f, "bdd-coverage-log", "20261101T000000Z-a.md"), "## a\n- event: removed\n");
  const r = run(BDD("check-bdd-coverage.mjs"), [f], { BDD_LOG_BASE_REF: "main" });
  assert.equal(r.status, 1, r.out);
  assert.match(r.out, /was edited/);
  rmSync(root, { recursive: true, force: true });
});

test("BDD coverage still flags a stale datastore file when one is present (discriminating)", () => {
  const root = features({ "20261101T000000Z-a.md": "- event: added\n" });
  writeFileSync(join(root, "bdd-index.json"), "[]\n");
  const r = run(BDD("check-bdd-coverage.mjs"), [root]);
  assert.equal(r.status, 1);
  assert.match(r.out, /bdd-index\.json is out of sync/);
});

test("check-bdd-executed reconciles against the derived datastore when none is committed", () => {
  const root = features({ "20261101T000000Z-a.md": "- event: added\n" });
  const rep = join(root, "r.json");
  const el = (name, status) => ({ type: "scenario", name, steps: [{ result: { status } }] });
  writeFileSync(rep, JSON.stringify([{ uri: "w.feature", elements: [el("ok", "passed"), el("bad", "passed")] }]));
  assert.equal(run(BDD("check-bdd-executed.mjs"), [root, "--results", rep]).status, 0);
  writeFileSync(rep, JSON.stringify([{ uri: "w.feature", elements: [el("ok", "passed")] }]));
  assert.equal(run(BDD("check-bdd-executed.mjs"), [root, "--results", rep]).status, 1, "a derived scenario that never ran must still fail");
});
