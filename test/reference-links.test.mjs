// Discriminating tests for check-reference-links.mjs - the gate that fails when a doc points at a .md
// reference file that does not exist in the tree. Each case proves the gate DISCRIMINATES: it PASSES a tree
// whose references all resolve and FAILS one with a dangling reference, and it honors the ignore mechanisms
// (built-in defaults, inline marker, config extension) without going blind to a real dangling link.
import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtempSync, mkdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const REPO = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const GATE = resolve(REPO, ".claude/skills/judge-arch/scripts/check-reference-links.mjs");

// Build an isolated tree: a map of relative-path -> file contents. Returns the root dir.
function tree(files) {
  const root = mkdtempSync(join(tmpdir(), "reflink-"));
  for (const [rel, content] of Object.entries(files)) {
    const full = join(root, rel);
    mkdirSync(dirname(full), { recursive: true });
    writeFileSync(full, content);
  }
  return root;
}
const run = (root) => spawnSync(process.execPath, [GATE, "--root", root], { encoding: "utf8" });

test("PASSES when every referenced .md exists", () => {
  const root = tree({ "a.md": "see `b.md` for more.", "b.md": "hello" });
  const r = run(root);
  assert.equal(r.status, 0, (r.stdout || "") + (r.stderr || ""));
});

test("FAILS on a dangling reference to a missing file (discriminating)", () => {
  const root = tree({ "a.md": "see `gone.md` for more.", "b.md": "hello" });
  const r = run(root);
  assert.equal(r.status, 1, (r.stdout || "") + (r.stderr || ""));
  assert.match((r.stdout || "") + (r.stderr || ""), /gone\.md/);
});

test("FAILS on a dangling reference with an UPPERCASE extension (case-insensitive, discriminating)", () => {
  const root = tree({ "a.md": "see `GHOST.MD` for more.", "b.md": "hello" });
  const r = run(root);
  assert.equal(r.status, 1, (r.stdout || "") + (r.stderr || ""));
  assert.match((r.stdout || "") + (r.stderr || ""), /GHOST\.MD/i);
});

test("resolves a reference by basename anywhere in the tree (cross-directory prose pointer)", () => {
  const root = tree({ "x/a.md": "see owasp's `refs/target.md`.", "y/refs/target.md": "hi" });
  const r = run(root);
  assert.equal(r.status, 0, (r.stdout || "") + (r.stderr || ""));
});

test("ignores a built-in adopter filename (AGENTS.md) that is not in the tree", () => {
  const root = tree({ "a.md": "create an `AGENTS.md` in your repo root." });
  const r = run(root);
  assert.equal(r.status, 0, (r.stdout || "") + (r.stderr || ""));
});

test("ignores the NNNN-*.md template placeholder by default", () => {
  const root = tree({ "a.md": "name it `NNNN-my-decision.md`." });
  const r = run(root);
  assert.equal(r.status, 0, (r.stdout || "") + (r.stderr || ""));
});

test("an inline link-check:ignore suppresses a deliberate example on that line", () => {
  const root = tree({ "a.md": "for example `made-up-example.md` <!-- link-check:ignore -->" });
  const r = run(root);
  assert.equal(r.status, 0, (r.stdout || "") + (r.stderr || ""));
});

test("does not flag a .md inside a URL", () => {
  const root = tree({ "a.md": "download https://example.com/docs/missing.md now." });
  const r = run(root);
  assert.equal(r.status, 0, (r.stdout || "") + (r.stderr || ""));
});

test("STILL flags a dangling ref that shares a line with a URL (fail-open guard, discriminating)", () => {
  const root = tree({ "a.md": "See https://owasp.org and our `deleted-ref.md` guide." });
  const r = run(root);
  assert.equal(r.status, 1, (r.stdout || "") + (r.stderr || ""));
  assert.match((r.stdout || "") + (r.stderr || ""), /deleted-ref\.md/);
});

test("does not flag a hyphen-wrapped path fragment on a continuation line", () => {
  const root = tree({ "a.md": "the file `test-pyramid-\nand-types.md` is big.", "test-pyramid-and-types.md": "x" });
  const r = run(root);
  assert.equal(r.status, 0, (r.stdout || "") + (r.stderr || ""));
});

test("STILL flags a dangling ref wrapped across a hyphen-ending line (fail-open guard, discriminating)", () => {
  // `foo-bar-gone.md` does not exist; wrapped as `foo-bar-` + `gone.md`. The joined token must be evaluated,
  // not skipped as a wrap fragment.
  const root = tree({ "a.md": "the file `foo-bar-\ngone.md` is missing." });
  const r = run(root);
  assert.equal(r.status, 1, (r.stdout || "") + (r.stderr || ""));
  assert.match((r.stdout || "") + (r.stderr || ""), /foo-bar-gone\.md/);
});

test("config extends the ignore set; the same reference fails without the config (discriminating)", () => {
  const without = tree({ "a.md": "see `custom-adopter-file.md`." });
  assert.equal(run(without).status, 1, "missing file must fail without a config ignore");
  const withCfg = tree({
    "a.md": "see `custom-adopter-file.md`.",
    "reference-links.config.json": JSON.stringify({ ignoreBasenames: ["custom-adopter-file.md"] }),
  });
  assert.equal(run(withCfg).status, 0, (run(withCfg).stdout || "") + (run(withCfg).stderr || ""));
});

test("fails closed (exit 2) when --root does not exist", () => {
  const r = spawnSync(process.execPath, [GATE, "--root", join(tmpdir(), "no-such-dir-xyz-12345")], { encoding: "utf8" });
  assert.equal(r.status, 2);
});

test("fails closed (exit 2) on a malformed config", () => {
  const root = tree({ "a.md": "see `b.md`.", "b.md": "x", "reference-links.config.json": "{ not json" });
  const r = run(root);
  assert.equal(r.status, 2, (r.stdout || "") + (r.stderr || ""));
});

// Enforcement against the real repo: this is what makes the gate blocking through the existing required `test`
// check (no separate CI workflow). The whole tree must have zero dangling references at all times.
test("the real repository has no dangling references", () => {
  const r = spawnSync(process.execPath, [GATE], { encoding: "utf8" });
  assert.equal(r.status, 0, (r.stdout || "") + (r.stderr || ""));
});
