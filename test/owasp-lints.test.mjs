// Discriminating tests for .claude/skills/owasp-secure-coding-bdd/scripts/check-owasp-lints.mjs.
// jwt-alg-none and cookie-insecure must FAIL on the vulnerable form and PASS on the hardened form.
import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtempSync, writeFileSync, mkdirSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const REPO = resolve(dirname(fileURLToPath(import.meta.url)), "..");
// Resolve the gate in EITHER layout (upstream .claude/skills/<skill>/scripts, or a consumer's scripts/ci),
// because this test is copied verbatim into a consumer and must find the gate wherever it lives.
const UPSTREAM = resolve(REPO, ".claude/skills/owasp-secure-coding-bdd/scripts/check-owasp-lints.mjs");
// Resolve the gate to the copy CI actually runs, not a vendored .claude/skills copy (issue #112). A consumer
// keeps the gate at scripts/ci/check-owasp-lints.mjs (its GATE_DIR path, which the workflow sets); vendoring the skills also
// drops a copy under .claude/skills that must NOT be the one tested. Prefer the GATE_DIR copy; fall back to the
// upstream skill copy (this repo has no scripts/ci).
const CI_DIR = process.env.GATE_DIR || resolve(REPO, "scripts/ci");
const CONSUMER = resolve(CI_DIR, "check-owasp-lints.mjs");
const CHECK = [CONSUMER, UPSTREAM].find((p) => existsSync(p)) ?? UPSTREAM;
test("gate resolution: tests the scripts/ci (GATE_DIR) copy CI runs, not a vendored .claude/skills copy (issue #112)", () => {
  // In a consumer that vendors the skills both copies exist; the discrimination test must exercise the
  // scripts/ci copy the aggregator runs. Upstream has no scripts/ci, so this is a no-op pass there.
  if (existsSync(CONSUMER)) assert.equal(CHECK, CONSUMER, "must test the scripts/ci (GATE_DIR) gate, not the .claude/skills copy");
});

function run(code, ext = "js") {
  const dir = mkdtempSync(join(tmpdir(), "owasp-"));
  const f = join(dir, `src.${ext}`);
  writeFileSync(f, code);
  const r = spawnSync(process.execPath, [CHECK, f], { encoding: "utf8" });
  return { status: r.status, out: (r.stdout || "") + (r.stderr || "") };
}

// --- jwt-alg-none ------------------------------------------------------------
test("FLAGS algorithms: ['none'] (discriminating)", () => {
  const r = run("const o = { algorithms: ['none'] };\n");
  assert.equal(r.status, 1, r.out);
  assert.match(r.out, /jwt-alg-none/);
});
test("FLAGS a JSON \"alg\":\"none\" header", () => {
  assert.equal(run('const h = {"alg":"none"};\n').status, 1);
});
test("PASSES a pinned algorithm (algorithms: ['HS256']) (discriminating)", () => {
  assert.equal(run("jwt.verify(t, k, { algorithms: ['HS256'] });\n").status, 0);
});
test("does NOT flag alg:'none' inside a comment (comment-stripped, no false positive)", () => {
  assert.equal(run("// never use alg: 'none' here\nconst x = 1;\n").status, 0);
});

// --- cookie-insecure ---------------------------------------------------------
test("PASSES res.cookie(...) with HttpOnly+Secure+SameSite", () => {
  assert.equal(run("res.cookie('sid', v, { httpOnly: true, secure: true, sameSite: 'lax' });\n").status, 0);
});
test("FLAGS res.cookie(...) missing Secure (discriminating; names the missing flag)", () => {
  const r = run("res.cookie('sid', v, { httpOnly: true, sameSite: 'lax' });\n");
  assert.equal(r.status, 1, r.out);
  assert.match(r.out, /cookie-insecure/);
  assert.match(r.out, /Secure/);
});
test("FLAGS a cookie whose flag words are only in the NAME, not the options (evasion, discriminating)", () => {
  const r = run("res.cookie('session_httponly_secure_samesite', token);\n");
  assert.equal(r.status, 1, r.out);
  assert.match(r.out, /cookie-insecure/);
});
test("FLAGS a raw Set-Cookie header string with no flags", () => {
  assert.equal(run("res.setHeader('Set-Cookie', 'sid=abc; Path=/');\n").status, 1);
});
test("PASSES a Set-Cookie header string that has all flags", () => {
  assert.equal(run("res.setHeader('Set-Cookie', 'sid=abc; Path=/; HttpOnly; Secure; SameSite=Lax');\n").status, 0);
});

// --- ignore directive --------------------------------------------------------
test("an ignore WITH a reason suppresses (exit 0)", () => {
  assert.equal(run("const o = { algorithms: ['none'] }; // owasp-lint:ignore legacy verifier, tracked in TICKET-1\n").status, 0);
});
test("a bare ignore with NO reason does NOT suppress (discriminating)", () => {
  assert.equal(run("const o = { algorithms: ['none'] }; // owasp-lint:ignore\n").status, 1);
});
test("a targeted ignore=rule suppresses only that rule", () => {
  assert.equal(run("const o = { algorithms: ['none'] }; // owasp-lint:ignore=jwt-alg-none accepted risk, see ADR\n").status, 0);
});

// --- fixes from the fresh-context review -------------------------------------
test("an ignore INSIDE a multi-line cookie call is honored (span-wide, #1 discriminating)", () => {
  const code = "res.cookie('sid', v, {\n  httpOnly: true // owasp-lint:ignore reviewed exception, legacy flow\n});\n";
  assert.equal(run(code).status, 0, run(code).out);
});
test("FLAGS a 2-arg res.cookie(name, val) with no options at all", () => {
  assert.equal(run("res.cookie('sid', v);\n").status, 1);
});
test("does NOT over-blank a JS `#private` field — alg:none on the same line is still caught (#3)", () => {
  const code = "class C {\n  #x = 1; const o = { algorithms: ['none'] };\n}\n";
  const r = run(code, "js");
  assert.equal(r.status, 1, r.out);
  assert.match(r.out, /jwt-alg-none/);
});
test("still strips a Python `#` comment (alg:none in a .py comment is not flagged)", () => {
  assert.equal(run("x = 1  # algorithms: ['none'] is wrong\n", "py").status, 0);
});
test("the shared-options-object idiom is a (documented) false positive, suppressible inline", () => {
  // Honest: flags of a variable-passed opts object can't be seen textually → flagged, resolved by ignore.
  const bad = "const opts = { httpOnly: true, secure: true, sameSite: 'lax' };\nres.cookie('sid', v, opts);\n";
  assert.equal(run(bad).status, 1); // documented limitation
  const ok = "const opts = { httpOnly: true, secure: true, sameSite: 'lax' };\nres.cookie('sid', v, opts); // owasp-lint:ignore flags via shared opts object\n";
  assert.equal(run(ok).status, 0); // the sanctioned escape works
});

// --- fail closed / scope -----------------------------------------------------
test("fails closed (exit 2) when no source files are found", () => {
  const dir = mkdtempSync(join(tmpdir(), "owasp-empty-"));
  mkdirSync(join(dir, "sub"));
  const r = spawnSync(process.execPath, [CHECK, join(dir, "sub")], { encoding: "utf8" });
  assert.equal(r.status, 2);
});
test("ignores a non-code file (e.g. .md) — zero-scan fail closed", () => {
  const dir = mkdtempSync(join(tmpdir(), "owasp-md-"));
  writeFileSync(join(dir, "README.md"), "alg: 'none'\n");
  const r = spawnSync(process.execPath, [CHECK, dir], { encoding: "utf8" });
  assert.equal(r.status, 2); // no code files → zero-scan
});

// --- whole-repo travelling scope: --allow-empty + --ignore -------------------
// When the gate travels into a consumer the aggregator scans the whole tree ("."), which always contains the
// copied gate infra under scripts/ci (whose own scripts carry insecure-cookie / alg:none examples) and may be
// empty of source. These flags make that scope safe: --allow-empty passes a genuinely empty scan, --ignore
// skips ONLY the resolved gate-infra dir, and the paths are manifest-locked so a dev cannot widen them.
function tree(files) {
  const dir = mkdtempSync(join(tmpdir(), "owasp-tree-"));
  for (const [rel, src] of Object.entries(files)) {
    const f = join(dir, rel);
    mkdirSync(dirname(f), { recursive: true });
    writeFileSync(f, src);
  }
  return dir;
}
function runIn(cwd, args) {
  const r = spawnSync(process.execPath, [CHECK, ...args], { cwd, encoding: "utf8" });
  return { status: r.status, out: (r.stdout || "") + (r.stderr || "") };
}

test("--allow-empty makes a zero-source scan PASS (exit 0) instead of failing closed", () => {
  assert.equal(runIn(tree({ "README.md": "# docs\n" }), ["--allow-empty", "."]).status, 0);
});
test("WITHOUT --allow-empty a zero-source scan still fails closed (exit 2, discriminating)", () => {
  assert.equal(runIn(tree({ "README.md": "# docs\n" }), ["."]).status, 2);
});
test("--ignore scripts/ci skips the gate infra but still scans product code", () => {
  const dir = tree({
    "scripts/ci/check-owasp-lints.mjs": "const o = { algorithms: ['none'] }; // the gate's own docstring\n",
    "src/clean.js": "export const x = 1;\n",
  });
  assert.equal(runIn(dir, ["--allow-empty", "--ignore", "scripts/ci", "."]).status, 0);
});
test("--ignore does NOT suppress a violation in product code (discriminating)", () => {
  const dir = tree({
    "scripts/ci/gate.mjs": "const o = { algorithms: ['none'] };\n",
    "src/bad.js": "const o = { algorithms: ['none'] };\n",
  });
  const r = runIn(dir, ["--allow-empty", "--ignore", "scripts/ci", "."]);
  assert.equal(r.status, 1, r.out);
  assert.match(r.out, /src[\\/]bad\.js/);
});
test("--ignore is anchored at cwd: a decoy src/scripts/ci is NOT skipped (anti-evasion)", () => {
  const dir = tree({ "src/scripts/ci/sneaky.js": "const o = { algorithms: ['none'] };\n" });
  const r = runIn(dir, ["--allow-empty", "--ignore", "scripts/ci", "."]);
  assert.equal(r.status, 1, r.out);
  assert.match(r.out, /sneaky\.js/);
});
test("--ignore with no path argument fails usage (exit 2)", () => {
  assert.equal(runIn(tree({ "src/clean.js": "export const x = 1;\n" }), ["--ignore"]).status, 2);
});
