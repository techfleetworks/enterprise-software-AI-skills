// Proves the fix for the recurring post-merge conflicts (ADR-0087): the committed .gitattributes marks the
// append-only logs and CHANGELOG with the built-in `union` merge driver, so when two branches each add an
// entry, git auto-resolves the merge by keeping BOTH sides instead of raising a conflict.
//
// This test builds the real scenario in a throwaway git repo and asserts: (1) WITH `merge=union` the merge
// succeeds and the file carries both added lines and no conflict markers; (2) WITHOUT it the same merge
// conflicts (the discrimination control - so the test fails if the union attribute is ever dropped). It also
// asserts the committed .gitattributes actually names the three shared files.
//
// Needs git; if git is unavailable the scenario cases skip (CI/ubuntu always has git). The committed-attributes
// assertion always runs (it only reads a file).
import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtempSync, writeFileSync, appendFileSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const REPO = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const gitOK = spawnSync("git", ["--version"], { stdio: "ignore" }).status === 0;
const opts = { skip: gitOK ? false : "git unavailable here (CI/ubuntu runs it)" };

// Run a two-branch "both append one line" merge in a fresh repo. `attr` is the .gitattributes content (or "").
// Returns { status, body } of the merge of the second branch into main.
function mergeScenario(attr) {
  const dir = mkdtempSync(join(tmpdir(), "union-"));
  const g = (...a) => spawnSync("git", ["-C", dir, ...a], { encoding: "utf8" });
  try {
    g("init", "-q", "-b", "main");
    g("config", "user.email", "t@t.t");
    g("config", "user.name", "t");
    g("config", "commit.gpgsign", "false");
    if (attr) writeFileSync(join(dir, ".gitattributes"), attr);
    writeFileSync(join(dir, "log.jsonl"), '{"n":0}\n');
    g("add", "-A"); g("commit", "-qm", "base");
    // branch feature: append its own line
    g("checkout", "-q", "-b", "feature");
    appendFileSync(join(dir, "log.jsonl"), '{"n":"feature"}\n');
    g("add", "-A"); g("commit", "-qm", "feature");
    // main: append a different line at the same spot
    g("checkout", "-q", "main");
    appendFileSync(join(dir, "log.jsonl"), '{"n":"main"}\n');
    g("add", "-A"); g("commit", "-qm", "main-side");
    // merge feature into main
    const m = g("merge", "--no-edit", "feature");
    const body = (() => { try { return readFileSync(join(dir, "log.jsonl"), "utf8"); } catch { return ""; } })();
    return { status: m.status, body };
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

test("union driver auto-resolves two appends to a log (the fix)", opts, () => {
  const r = mergeScenario("log.jsonl merge=union\n");
  assert.equal(r.status, 0, "merge should auto-resolve with merge=union");
  assert.match(r.body, /"n":"feature"/, "feature's line kept");
  assert.match(r.body, /"n":"main"/, "main's line kept");
  assert.doesNotMatch(r.body, /^<<<<<<<|^=======|^>>>>>>>/m, "no conflict markers");
});

test("WITHOUT the union attribute the same merge conflicts (discriminating control)", opts, () => {
  const r = mergeScenario(""); // no .gitattributes
  assert.notEqual(r.status, 0, "the same two appends must conflict when union is not set (proves the attribute is what resolves it)");
  assert.match(r.body, /^<<<<<<<|^>>>>>>>/m, "conflict markers present without union");
});

test("git resolves merge=union for all three shared append-only files in this repo", opts, () => {
  // Authoritative: ask git itself what the `merge` attribute resolves to for each real path (the two logs match
  // via the bare `log.jsonl` pattern, CHANGELOG.md by name). This catches a dropped line AND a pattern that
  // stops covering one of the paths, which a regex over the raw file would miss.
  const r = spawnSync("git", ["-C", REPO, "check-attr", "merge", "--",
    "docs/skill-receipts/log.jsonl", "docs/arch-reviews/log.jsonl", "CHANGELOG.md"], { encoding: "utf8" });
  assert.equal(r.status, 0, r.stderr);
  for (const f of ["docs/skill-receipts/log.jsonl", "docs/arch-reviews/log.jsonl", "CHANGELOG.md"]) {
    assert.match(r.stdout, new RegExp(f.replace(/[.*+?^${}()|[\]\\]/g, "\\$&") + ": merge: union"),
      `git must resolve merge=union for ${f}:\n${r.stdout}`);
  }
});
