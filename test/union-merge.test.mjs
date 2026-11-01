// Proves how the shared accumulating files merge when two PRs each add an entry (ADR-0087, ADR-0107).
//
// The append-only logs (both log.jsonl files and features/bdd-coverage-log.md) use the committed `append-log`
// driver (scripts/merge-append-log.mjs). Their checkers require the base branch's log to be an exact PREFIX of
// the PR's log, so a merge must keep every line from BOTH sides with the upstream side first. Each scenario
// builds a real repo whose lines are ~21,000 characters long (as long as the real review entries), registers the
// driver with the same `--install` command `npm install` runs, and fails if a line is lost, duplicated, or the
// order breaks the prefix. It also pins the 2026-11-01 root cause: a `merge.union.driver` config replaces git's
// built-in union driver and silently keeps only "ours".
//
// CHANGELOG.md keeps the built-in `union` driver (order there does not matter).
//
// Needs git; if git is unavailable the scenario cases skip (CI/ubuntu always has git).
import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtempSync, writeFileSync, appendFileSync, readFileSync, rmSync, mkdirSync, copyFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const REPO = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const gitOK = spawnSync("git", ["--version"], { stdio: "ignore" }).status === 0;
const opts = { skip: gitOK ? false : "git unavailable here (CI/ubuntu runs it)" };

// A log line as long as the real arch-review entries, unique per tag.
const longLine = (tag) => JSON.stringify({ change: tag, matrix: tag.repeat(Math.ceil(21000 / tag.length)).slice(0, 21000) }) + "\n";
const BASE = '{"n":0}\n' + longLine("base-entry");
const MAIN = longLine("main-pr-197");
const FEATURE = longLine("feature-wp2");
const FEATURE2 = longLine("feature-wp2-second");
const APPEND_ATTR = "log.jsonl merge=append-log\nfeatures/bdd-coverage-log.md merge=append-log\n";
const MARKERS = /^<<<<<<<|^>>>>>>>/m;

// A throwaway repo on branch main with `file` = base committed. install: copy the driver in and run the real
// `--install` (so the relative command it registers is what runs). Call done() in a finally.
function makeRepo({ attr, config = [], install = false, installEnv = {}, file = "log.jsonl", base = BASE }) {
  const dir = mkdtempSync(join(tmpdir(), "append-log-"));
  const g = (...a) => spawnSync("git", ["-C", dir, ...a], { encoding: "utf8" });
  const path = join(dir, file);
  g("init", "-q", "-b", "main");
  for (const [k, v] of [["user.email", "t@t.t"], ["user.name", "t"], ["commit.gpgsign", "false"], ["core.autocrlf", "false"], ...config]) g("config", k, v);
  if (attr) writeFileSync(join(dir, ".gitattributes"), attr);
  let installOut = "";
  if (install) {
    mkdirSync(join(dir, "scripts"));
    copyFileSync(join(REPO, "scripts", "merge-append-log.mjs"), join(dir, "scripts", "merge-append-log.mjs"));
    const r = spawnSync(process.execPath, ["scripts/merge-append-log.mjs", "--install"], { cwd: dir, encoding: "utf8", env: { ...process.env, ...installEnv } });
    installOut = r.stdout + r.stderr;
  }
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, base);
  g("add", "-A"); g("commit", "-qm", "base");
  const commitAppend = (text, msg) => { appendFileSync(path, text); g("add", "-A"); g("commit", "-qm", msg); };
  const read = () => { try { return readFileSync(path, "utf8"); } catch { return ""; /* absent only if the merge deleted it; asserts then fail */ } };
  return { g, path, read, commitAppend, installOut, done: () => rmSync(dir, { recursive: true, force: true }) };
}

// Git for Windows starts a merge driver through its bundled sh. Where that process start fails intermittently
// (seen on the authoring machine), git reports a plain conflict and the driver prints nothing. The driver prints
// a reason on EVERY refusal, so "failed with no driver output" is a launch failure, not a driver verdict: build
// a fresh repo and re-run (at most 3 attempts), noting it. `scenario` returns { status, out, ... }.
function withDriver(t, scenario) {
  for (let attempt = 1; ; attempt++) {
    const r = scenario();
    if (r.status === 0 || r.out.includes("[merge-append-log]") || attempt === 3) return r;
    t.diagnostic(`merge driver did not start (no driver output) on attempt ${attempt}; re-running in a fresh repo`);
  }
}

// base -> (main appends `main`, feature appends `feature`), main published as origin/main, then merge.
// into: "feature" merges main into the branch (the reported loss); "main" merges the branch into main.
function mergeScenario(t, opts) {
  return opts.install ? withDriver(t, () => mergeOnce(opts)) : mergeOnce(opts);
}

// staleHead: also leave origin/HEAD pointing at the old base commit (an un-fetched default-branch pointer).
function mergeOnce({ into = "feature", main = MAIN, feature = FEATURE, featureEdit, staleHead = false, ...repoOpts }) {
  const r = makeRepo(repoOpts);
  try {
    if (staleHead) r.g("update-ref", "refs/remotes/origin/HEAD", "main");
    r.g("checkout", "-q", "-b", "feature");
    if (featureEdit) { writeFileSync(r.path, featureEdit); r.g("add", "-A"); r.g("commit", "-qm", "edit"); } else r.commitAppend(feature, "feature");
    r.g("checkout", "-q", "main");
    r.commitAppend(main, "main-side");
    r.g("update-ref", "refs/remotes/origin/main", "main"); // main is published
    const mainLog = r.read();
    if (into === "feature") r.g("checkout", "-q", "feature");
    const m = r.g("merge", "--no-edit", into === "feature" ? "main" : "feature");
    return { status: m.status, body: r.read(), mainLog, out: m.stdout + m.stderr };
  } finally {
    r.done();
  }
}

test("ROOT CAUSE: a merge.union.driver config replaces the built-in union and silently drops main's line", opts, (t) => {
  const r = mergeScenario(t, { attr: "log.jsonl merge=union\n", config: [["merge.union.driver", "true"]] });
  assert.equal(r.status, 0, "the merge reports success, no conflict");
  assert.ok(!r.body.includes(MAIN), "main's line is lost: this is the 2026-11-01 failure the append-log driver replaces");
});

test("built-in union keeps both lines but puts the branch first, so main's log is not a prefix (why union was replaced)", opts, (t) => {
  const r = mergeScenario(t, { attr: "log.jsonl merge=union\n" });
  assert.equal(r.status, 0);
  assert.ok(r.body.includes(MAIN) && r.body.includes(FEATURE));
  assert.ok(!r.body.startsWith(r.mainLog), "union orders ours (the branch) first; the prefix check would fail");
});

for (const into of ["feature", "main"]) {
  test(`append-log driver: merging ${into === "feature" ? "main into a branch" : "a branch into main"} keeps both long lines with main's log as an exact prefix`, opts, (t) => {
    const r = mergeScenario(t, { attr: APPEND_ATTR, install: true, into });
    assert.equal(r.status, 0, `merge should resolve cleanly:\n${r.out}`);
    assert.ok(r.body.includes(MAIN), "main's line must survive");
    assert.ok(r.body.includes(FEATURE), "the branch's line must survive");
    assert.equal(r.body, r.mainLog + FEATURE, "result is exactly main's log followed by the branch's new line");
  });
}

test("append-log driver orders by origin/main even when origin/HEAD is stale", opts, (t) => {
  const r = mergeScenario(t, { attr: APPEND_ATTR, install: true, into: "main", staleHead: true });
  assert.equal(r.status, 0, r.out);
  assert.equal(r.body, r.mainLog + FEATURE, "a stale origin/HEAD must not put the branch before main");
});

test("append-log driver keeps a markdown entry once when both sides are already upstream", opts, (t) => {
  // The branch picked up main's first entry by another commit; both sides are prefixes of origin/main.
  const base = "# log\n\n## base\n- event: added\n";
  const m1 = "\n## m1\n- event: added\n";
  const r = mergeScenario(t, { attr: APPEND_ATTR, install: true, file: "features/bdd-coverage-log.md", base, main: m1 + "\n## m2\n- event: added\n", feature: m1 });
  assert.equal(r.status, 0, r.out);
  assert.equal(r.body, r.mainLog, "the branch adds nothing new, so the result is main's log exactly");
});

test("append-log driver keeps the order even when a merge.union.driver shadow is present", opts, (t) => {
  const r = mergeScenario(t, { attr: APPEND_ATTR, install: true, config: [["merge.union.driver", "true"]] });
  assert.equal(r.body, r.mainLog + FEATURE);
});

test("append-log driver works for the BDD coverage log (markdown blocks)", opts, (t) => {
  const base = "# BDD coverage log (append-only)\n\n## 2026-10-28 - base\n- event: added\n";
  const main = "\n## 2026-11-01 - main entry\n- event: added\n- audiences: agent\n";
  const feature = "\n## 2026-11-01 - feature entry\n- event: added\n- audiences: agent\n";
  const r = mergeScenario(t, { attr: APPEND_ATTR, install: true, file: "features/bdd-coverage-log.md", base, main, feature });
  assert.equal(r.status, 0, r.out);
  assert.equal(r.body, r.mainLog + feature, "repeated lines like '- audiences: agent' are not deduplicated away");
});

test("append-log driver does not duplicate an entry both sides already carry", opts, (t) => {
  // The branch already holds main's entry (cherry-picked or squash-merged), then adds its own.
  const r = mergeScenario(t, { attr: APPEND_ATTR, install: true, feature: MAIN + FEATURE });
  assert.equal(r.status, 0, r.out);
  assert.equal(r.body, r.mainLog + FEATURE, "main's entry appears once");
});

test("append-log driver keeps a shared entry once when main has added more entries after it", opts, (t) => {
  const MAIN2 = longLine("main-pr-198");
  const r = mergeScenario(t, { attr: APPEND_ATTR, install: true, main: MAIN + MAIN2, feature: MAIN + FEATURE });
  assert.equal(r.status, 0, r.out);
  assert.equal(r.body, r.mainLog + FEATURE, "main's entry appears once and the branch's entry follows main's");
});

test("append-log driver keeps one shared .jsonl entry per copy main holds, not every copy", opts, (t) => {
  // The branch carries main's entry once and adds the same bytes again as its own entry: one copy is shared.
  const r = mergeScenario(t, { attr: APPEND_ATTR, install: true, feature: MAIN + MAIN + FEATURE });
  assert.equal(r.status, 0, r.out);
  assert.equal(r.body, r.mainLog + MAIN + FEATURE);
});

test("append-log driver never deduplicates markdown, even a line main also added", opts, (t) => {
  const base = "# log\n\n## base\n- event: added\n";
  const feature = "- event: added\n";
  const r = mergeScenario(t, { attr: APPEND_ATTR, install: true, file: "features/bdd-coverage-log.md", base, main: "\n## m\n- event: added\n", feature });
  assert.equal(r.status, 0, r.out);
  assert.equal(r.body, r.mainLog + feature);
});

test("append-log driver never drops a new entry whose text already appears in the other side", opts, (t) => {
  // The branch's line is a suffix of main's line, so a substring test would wrongly call it present.
  const feature = '"tail"}\n';
  const r = mergeScenario(t, { attr: APPEND_ATTR, install: true, main: '{"x":"tail"}\n', feature });
  assert.equal(r.status, 0, r.out);
  assert.equal(r.body, r.mainLog + feature);
});

// Build a repo, run `steps(r)` (which returns the git result of the replay), and report { status, out, body, mainLog }.
function replay(t, repoOpts, steps) {
  return withDriver(t, () => {
    const r = makeRepo({ attr: APPEND_ATTR, install: true, ...repoOpts });
    try {
      const { m, mainLog } = steps(r);
      return { status: m.status, out: m.stdout + m.stderr, body: r.read(), mainLog };
    } finally {
      r.done();
    }
  });
}

test("append-log driver: rebasing a markdown entry that repeats a past line keeps it (BDD log)", opts, (t) => {
  const res = replay(t, { file: "features/bdd-coverage-log.md", base: "# log\n\n## base\n- event: added\n" }, (r) => {
    r.g("checkout", "-q", "-b", "feature");
    r.commitAppend("\n## f1\n", "f1"); r.commitAppend("- event: added\n", "f2");
    r.g("checkout", "-q", "main"); r.commitAppend("\n## m\n- event: added\n", "main-side");
    r.g("update-ref", "refs/remotes/origin/main", "main");
    const mainLog = r.read();
    r.g("checkout", "-q", "feature");
    return { m: r.g("rebase", "main"), mainLog };
  });
  assert.equal(res.status, 0, res.out);
  assert.equal(res.body, res.mainLog + "\n## f1\n- event: added\n");
});

test("append-log driver: a stash applied onto a log that moved on keeps both lines", opts, (t) => {
  const res = replay(t, {}, (r) => {
    appendFileSync(r.path, FEATURE);
    r.g("stash", "push", "-q");
    r.commitAppend(MAIN, "main-side");
    r.g("update-ref", "refs/remotes/origin/main", "main"); // the current branch is published, so it goes first
    const mainLog = r.read();
    return { m: r.g("stash", "apply"), mainLog };
  });
  assert.equal(res.status, 0, res.out);
  assert.equal(res.body, res.mainLog + FEATURE);
});

test("append-log driver: a branch that deleted a past entry far from the append conflicts with markers", opts, (t) => {
  // git merge-file would merge this deletion cleanly; the driver must still refuse and mark the file.
  const r = mergeScenario(t, { attr: APPEND_ATTR, install: true, featureEdit: BASE.slice(BASE.indexOf("\n") + 1) + FEATURE });
  assert.notEqual(r.status, 0, "a deleted past entry must surface as a conflict");
  assert.match(r.out, /\[merge-append-log\]/, "the refusal comes from the driver, which names the file and the reason");
  assert.match(r.body, MARKERS);
});

test("append-log driver: rebasing a branch with two log commits onto main keeps all lines, main first", opts, (t) => {
  const res = replay(t, {}, (r) => {
    r.g("checkout", "-q", "-b", "feature");
    r.commitAppend(FEATURE, "f1"); r.commitAppend(FEATURE2, "f2");
    r.g("checkout", "-q", "main"); r.commitAppend(MAIN, "main-side");
    r.g("update-ref", "refs/remotes/origin/main", "main");
    const mainLog = r.read();
    r.g("checkout", "-q", "feature");
    return { m: r.g("rebase", "main"), mainLog };
  });
  assert.equal(res.status, 0, res.out);
  assert.equal(res.body, res.mainLog + FEATURE + FEATURE2);
});

test("append-log driver: cherry-picking a branch commit onto main appends after main's lines", opts, (t) => {
  const res = replay(t, {}, (r) => {
    r.g("checkout", "-q", "-b", "feature"); r.commitAppend(FEATURE, "f1");
    r.g("checkout", "-q", "main"); r.commitAppend(MAIN, "main-side");
    r.g("update-ref", "refs/remotes/origin/main", "main");
    const mainLog = r.read();
    return { m: r.g("cherry-pick", "feature"), mainLog };
  });
  assert.equal(res.status, 0, res.out);
  assert.equal(res.body, res.mainLog + FEATURE);
});

test("append-log driver refuses a side that edited a past entry, and leaves conflict markers (never looks resolved)", opts, (t) => {
  const r = mergeScenario(t, { attr: APPEND_ATTR, install: true, featureEdit: '{"n":"rewritten"}\n' + FEATURE });
  assert.notEqual(r.status, 0, "a history edit must surface as a conflict");
  assert.match(r.out, /\[merge-append-log\]/, "the refusal comes from the driver, which names the file and the reason");
  assert.match(r.body, MARKERS, "the refused file must carry conflict markers so it cannot be `git add`ed as resolved");
});

test("append-log attribute with the driver NOT registered conflicts loudly instead of losing a line", opts, (t) => {
  const r = mergeScenario(t, { attr: APPEND_ATTR });
  assert.notEqual(r.status, 0, "an unregistered driver must fall back to a conflict");
  assert.match(r.body, MARKERS, "conflict markers present");
});

test("WITHOUT any merge attribute the same appends conflict (discriminating control)", opts, (t) => {
  const r = mergeScenario(t, { attr: "" });
  assert.notEqual(r.status, 0);
  assert.match(r.body, MARKERS, "conflict markers present without a driver");
});

test("--install registers the driver and names the scope of a shadowed built-in driver", opts, () => {
  const r = makeRepo({ install: true, config: [["merge.union.driver", "true"]] });
  try {
    assert.equal(r.g("config", "--get", "merge.append-log.driver").stdout.trim(), "node scripts/merge-append-log.mjs %O %A %B %P");
    assert.match(r.installOut, /WARNING: local git config sets merge\.union\.driver/);
    assert.match(r.installOut, /git config --local --unset merge\.union\.driver/);
  } finally {
    r.done();
  }
});

test("--install gives a working hint when the shadow comes from the environment (command scope)", opts, () => {
  const r = makeRepo({ install: true, installEnv: { GIT_CONFIG_COUNT: "1", GIT_CONFIG_KEY_0: "merge.union.driver", GIT_CONFIG_VALUE_0: "true" } });
  try {
    assert.match(r.installOut, /WARNING: command git config sets merge\.union\.driver/);
    assert.match(r.installOut, /GIT_CONFIG_\*/);
    assert.doesNotMatch(r.installOut, /git config --command/, "git has no --command option; that hint would fail");
  } finally {
    r.done();
  }
});

test("git resolves the right merge driver for every shared accumulating file in this repo", opts, () => {
  // Ask git itself (catches a dropped line AND a pattern that stops covering a path).
  const want = {
    "docs/skill-receipts/log.jsonl": "append-log",
    "docs/arch-reviews/log.jsonl": "append-log",
    "features/bdd-coverage-log.md": "append-log",
    "CHANGELOG.md": "union",
  };
  const r = spawnSync("git", ["-C", REPO, "check-attr", "merge", "--", ...Object.keys(want)], { encoding: "utf8" });
  assert.equal(r.status, 0, r.stderr);
  for (const [f, d] of Object.entries(want)) {
    assert.match(r.stdout, new RegExp(f.replace(/[.*+?^${}()|[\]\\]/g, "\\$&") + `: merge: ${d}\\b`), `git must resolve merge=${d} for ${f}:\n${r.stdout}`);
  }
});
