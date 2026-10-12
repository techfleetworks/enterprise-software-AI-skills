// Discriminating tests for always-on/emit-directive.mjs, the hardened always-on hook emitter.
// Both events emit JSON (SubagentStart ignores plain stdout; JSON is one code path). It resolves the
// directive as its own sibling by default, strips control characters, and when the directive is missing
// it warns loudly AND still injects a fallback NOTICE and exits 0 (so a broken install is visible, never
// a silent no-op that turns enforcement off).
import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const REPO = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const EMIT = resolve(REPO, "always-on/emit-directive.mjs");

function run(args, env) {
  const r = spawnSync(process.execPath, [EMIT, ...args], { encoding: "utf8", env: { ...process.env, ...(env || {}) } });
  return { status: r.status, out: r.stdout || "", err: r.stderr || "" };
}
function ctx(out) { return JSON.parse(out).hookSpecificOutput; }

// --- SessionStart ------------------------------------------------------------
test("SessionStart emits JSON with hookEventName SessionStart and the directive text (exit 0)", () => {
  const r = run(["SessionStart"]);
  assert.equal(r.status, 0, r.err);
  const h = ctx(r.out);
  assert.equal(h.hookEventName, "SessionStart");
  assert.match(h.additionalContext, /Enterprise engineering skills/);
  assert.match(h.additionalContext, /mandatory for every task/);
});
test("an explicit directive path is read into additionalContext", () => {
  const dir = mkdtempSync(join(tmpdir(), "emit-"));
  const f = join(dir, "d.md");
  writeFileSync(f, "CUSTOM DIRECTIVE BODY");
  assert.equal(ctx(run(["SessionStart", f]).out).additionalContext, "CUSTOM DIRECTIVE BODY");
});
test("the default directive path is the sibling file (no path arg, no $HOME)", () => {
  const h = ctx(run(["SessionStart"]).out);
  assert.ok(h.additionalContext.length > 200, "expected the real sibling directive content");
});

// --- SubagentStart -----------------------------------------------------------
test("SubagentStart emits JSON with hookEventName SubagentStart (plain stdout would be ignored)", () => {
  const h = ctx(run(["SubagentStart"]).out);
  assert.equal(h.hookEventName, "SubagentStart");
  assert.match(h.additionalContext, /Enterprise engineering skills/);
});
test("the event arg is forgiving: 'subagent' maps to SubagentStart, anything else to SessionStart", () => {
  assert.equal(ctx(run(["subagent"]).out).hookEventName, "SubagentStart");
  assert.equal(ctx(run(["session"]).out).hookEventName, "SessionStart");
  assert.equal(ctx(run([]).out).hookEventName, "SessionStart");
});

// --- ESK_DIRECTIVE override --------------------------------------------------
test("ESK_DIRECTIVE env var overrides the path", () => {
  const dir = mkdtempSync(join(tmpdir(), "emit-env-"));
  const f = join(dir, "env.md");
  writeFileSync(f, "ENV DIRECTIVE");
  assert.equal(ctx(run(["SessionStart"], { ESK_DIRECTIVE: f }).out).additionalContext, "ENV DIRECTIVE");
});

// --- control characters stripped ---------------------------------------------
test("ANSI escape and control characters are stripped from the injected text (discriminating)", () => {
  const dir = mkdtempSync(join(tmpdir(), "emit-ansi-"));
  const f = join(dir, "ansi.md");
  writeFileSync(f, "before\u001B[31mRED\u001B[0m\u0007after");
  const out = ctx(run(["SessionStart", f]).out).additionalContext;
  assert.equal(out, "beforeREDafter");
  assert.doesNotMatch(out, /\u001B/);
});

// --- over-limit directive: truncated, but visibly so (not silently clipped) ---
test("an over-limit directive is truncated with a visible in-context NOTICE, not silently (discriminating)", () => {
  const dir = mkdtempSync(join(tmpdir(), "emit-trunc-"));
  const f = join(dir, "big.md");
  writeFileSync(f, "A".repeat(15000)); // over the 10,000-character hook cap
  const r = run(["SessionStart", f]);
  assert.equal(r.status, 0, r.err);
  const h = ctx(r.out);
  assert.match(h.additionalContext, /TRUNCATED/, "truncation must be visible to the agent, not only on stderr");
  assert.ok(h.additionalContext.length <= 10000, `must stay within the cap, got ${h.additionalContext.length}`);
  assert.match(r.err, /over the 10000-character/, "still warns on stderr for human logs");
});

// --- missing directive: loud, not silent (the whole point) -------------------
test("a missing directive warns on stderr, injects a fallback NOTICE, and exits 0 (discriminating)", () => {
  const r = run(["SessionStart", join(tmpdir(), "does-not-exist-esk.md")]);
  assert.equal(r.status, 0, "must never block the session");
  assert.match(r.err, /WARNING/);
  assert.match(r.err, /not being enforced/i);
  assert.match(ctx(r.out).additionalContext, /MISSING/);
});
test("a missing directive in SubagentStart still returns valid JSON with the fallback", () => {
  const h = ctx(run(["SubagentStart", join(tmpdir(), "nope-esk.md")]).out);
  assert.equal(h.hookEventName, "SubagentStart");
  assert.match(h.additionalContext, /MISSING/);
});

// --- the committed directive names every skill (coverage, not just a stub) ---
test("the committed directive names all 16 skills (coverage check, discriminating)", () => {
  const text = ctx(run(["SessionStart"]).out).additionalContext;
  const skills = [
    "enterprise-architecture-standards", "pattern-selector", "architectural-decision-records",
    "owasp-secure-coding-bdd", "bdd-comprehensive-testing", "comprehensive-test-strategy",
    "release-deployment-safety", "sre-operational-readiness", "compliance-data-lifecycle",
    "judge-arch", "arch-encode", "verifiable-quality-gates", "skeptical-audit",
    "universal-browser-device-support", "universal-accessibility-wcag", "usability-ux-universal-design",
  ];
  const missing = skills.filter((s) => !text.includes(s));
  assert.deepEqual(missing, [], `directive is missing skills: ${missing.join(", ")}`);
});
