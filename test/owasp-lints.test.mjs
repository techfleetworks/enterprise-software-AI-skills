// Discriminating tests for .claude/skills/owasp-secure-coding-bdd/scripts/check-owasp-lints.mjs.
// jwt-alg-none and cookie-insecure must FAIL on the vulnerable form and PASS on the hardened form.
import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtempSync, writeFileSync, mkdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const REPO = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const CHECK = resolve(REPO, ".claude/skills/owasp-secure-coding-bdd/scripts/check-owasp-lints.mjs");

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
