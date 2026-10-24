// Discriminating tests for check-reference-links.mjs - the gate that fails when a doc points at a .md
// reference file that does not exist in the tree. Each case proves the gate DISCRIMINATES: it PASSES a tree
// whose references all resolve and FAILS one with a dangling reference, and it honors the ignore mechanisms
// (built-in defaults, inline marker, config extension) without going blind to a real dangling link.
import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtempSync, mkdirSync, writeFileSync, existsSync, chmodSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const REPO = resolve(dirname(fileURLToPath(import.meta.url)), "..");
// Resolve the gate the way CI runs it: a vendoring consumer keeps the gate at scripts/ci (its GATE_DIR path,
// which the workflow sets) AND drops a copy under .claude/skills that must NOT be the one tested. Prefer the
// GATE_DIR / scripts-ci copy; fall back to the upstream skill copy (this repo has no scripts/ci). This is the
// same 3-way resolution the other 10 gate tests got in 1.2.1; reference-links was the one left behind (#117).
const UPSTREAM = resolve(REPO, ".claude/skills/judge-arch/scripts/check-reference-links.mjs");
const CI_DIR = process.env.GATE_DIR || resolve(process.cwd(), "scripts/ci");
const CONSUMER = resolve(CI_DIR, "check-reference-links.mjs");
const GATE = [CONSUMER, UPSTREAM].find((p) => existsSync(p)) ?? UPSTREAM;

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

test("gate resolution: tests the scripts/ci (GATE_DIR) copy CI runs, not a vendored .claude/skills copy (#117, #112)", () => {
  // In a consumer that vendors the skills both copies exist; the discrimination test must exercise the
  // scripts/ci copy the aggregator runs. Upstream has no scripts/ci, so this is a no-op pass there.
  if (existsSync(CONSUMER)) assert.equal(GATE, CONSUMER, "must test the scripts/ci (GATE_DIR) gate, not the .claude/skills copy");
});

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

// ISSUE-118: --ignore <dir> skips that dir as CITERS (its docs are not evaluated) but still INDEXES it as link
// targets, so a vendored skills tree does not red the gate yet a consumer doc may point into it.
test("ISSUE-118: --ignore skips a dir as citers but still indexes it as targets", () => {
  const root = tree({
    "doc.md": "see `vendored.md` for details.",                    // points INTO the ignored tree (must resolve)
    "skills/x/vendored.md": "I link to `nope.md`, which is missing.", // dangling link INSIDE the ignored tree
  });
  const r = spawnSync(process.execPath, [GATE, "--root", root, "--ignore", "skills"], { encoding: "utf8" });
  assert.equal(r.status, 0, "ignored-tree docs are not scanned, and are still indexed as targets\n" + (r.stdout || "") + (r.stderr || ""));
  const r2 = spawnSync(process.execPath, [GATE, "--root", root], { encoding: "utf8" });
  assert.equal(r2.status, 1, "without --ignore the dangling link inside the tree is caught (discriminating)");
  assert.match((r2.stdout || "") + (r2.stderr || ""), /nope\.md/);
});

test("ISSUE-118: a dangling link OUTSIDE the ignored dir is still flagged", () => {
  const root = tree({ "doc.md": "see `gone.md`.", "skills/x/real.md": "ok" });
  const r = spawnSync(process.execPath, [GATE, "--root", root, "--ignore", "skills"], { encoding: "utf8" });
  assert.equal(r.status, 1, "a dangling link outside the ignored dir must still be caught");
  assert.match((r.stdout || "") + (r.stderr || ""), /gone\.md/);
});

// --- ISSUE-147: a Markdown link target resolves relative to the citer, case-sensitively -----------------
// Before the fix a link target was matched only by lowercased basename, so a dangling link to
// docs/missing/README.md passed as soon as ANY readme.md existed anywhere in the tree. Now a `](path)` target
// resolves from the citing file's folder. Each "fails" case is discriminating: reverting re-passes it.
test("ISSUE-147: a dangling link target FAILS even when another file shares its basename elsewhere (exit 1)", () => {
  const root = tree({
    "index.md": "See the [missing guide](docs/missing/README.md).\n",
    "other/readme.md": "# unrelated, different case, elsewhere\n",
  });
  const r = run(root);
  assert.equal(r.status, 1, (r.stdout || "") + (r.stderr || ""));
  assert.match((r.stdout || "") + (r.stderr || ""), /README\.md/);
});
test("ISSUE-147: a same-case basename elsewhere does not clear a dangling link target (exit 1)", () => {
  const root = tree({
    "index.md": "See the [missing guide](docs/missing/README.md).\n",
    "other/README.md": "# unrelated\n",
  });
  assert.equal(run(root).status, 1, "a README.md elsewhere must not satisfy a link to docs/missing/README.md");
});
test("ISSUE-147: a link target that DOES resolve relative to the citer passes (exit 0)", () => {
  const root = tree({
    "index.md": "See the [guide](docs/real/guide.md).\n",
    "docs/real/guide.md": "# here\n",
  });
  assert.equal(run(root).status, 0, (run(root).stdout || "") + (run(root).stderr || ""));
});
test("ISSUE-147: a `](x.md)` shown INSIDE backticks is example text, not a live link (basename rule) (exit 0, discriminating)", () => {
  // A doc about link hygiene shows link syntax inside backticks. That must NOT be resolved as a live link; it
  // falls back to the lenient basename rule. Reverting the backtick-skip resolves `guide.md` from the citer's
  // folder (where it does not exist) and fails — so this case is discriminating. (This is the regression that
  // the fresh-context review caught on this PR's own ADR.)
  const root = tree({
    "doc.md": "Write a Markdown link as `](guide.md)` inline.\n",
    "deep/guide.md": "# exists by basename, elsewhere\n",
  });
  assert.equal(run(root).status, 0, (run(root).stdout || "") + (run(root).stderr || ""));
});

// --- ISSUE-121: GATE_REPO_ROOT is honoured, and an unreadable file fails closed ------------------------
test("ISSUE-121a: GATE_REPO_ROOT is used as the root when no --root is given (discriminating)", () => {
  // The dangling link lives under the dir named by GATE_REPO_ROOT; the default script-relative root would scan
  // the skills repo instead and miss it. Reverting (env ignored) scans elsewhere and this passes → test fails.
  const root = tree({ "a.md": "see `gone.md`." });
  const r = spawnSync(process.execPath, [GATE], { env: { ...process.env, GATE_REPO_ROOT: root }, encoding: "utf8" });
  assert.equal(r.status, 1, (r.stdout || "") + (r.stderr || ""));
  assert.match((r.stdout || "") + (r.stderr || ""), /gone\.md/);
});
test("ISSUE-121a: an explicit --root overrides GATE_REPO_ROOT", () => {
  const good = tree({ "a.md": "see `b.md`.", "b.md": "x" });
  const bad = tree({ "a.md": "see `gone.md`." });
  const r = spawnSync(process.execPath, [GATE, "--root", good], { env: { ...process.env, GATE_REPO_ROOT: bad }, encoding: "utf8" });
  assert.equal(r.status, 0, "explicit --root wins over the env\n" + (r.stdout || "") + (r.stderr || ""));
});
test("ISSUE-121b: an unreadable .md file fails the gate CLOSED (exit 2) — coverage unproven", () => {
  // Portable guard: chmod 000 enforces on POSIX (Linux CI as a non-root user); on Windows (or as root) the OS
  // does not make the file unreadable, so the case cannot be exercised here and is honestly skipped. The fix
  // still ships and is proven on CI. Without the fix, an unreadable file is silently skipped and counted clean.
  const root = tree({ "a.md": "see `b.md`.", "b.md": "x", "locked.md": "# locked\n" });
  const locked = join(root, "locked.md");
  let enforced = false;
  try {
    chmodSync(locked, 0o000);
    try { readFileSync(locked, "utf8"); } catch { enforced = true; }
  } catch { /* chmod not permitted on this platform */ }
  if (!enforced) return; // honest skip; Linux CI enforces it
  const r = run(root);
  chmodSync(locked, 0o644); // restore so temp cleanup can remove it
  assert.equal(r.status, 2, (r.stdout || "") + (r.stderr || ""));
});
