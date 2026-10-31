// Step definitions for issue #174 PR-B (the installer wiring, the SessionStart self-test, and operator waivers).
// Every scenario drives the REAL scripts: esk-init.mjs (register/check the enforcement hooks), session-setup.mjs
// (the tamper-visible self-test), and finish-check.mjs (operator-only waivers). Shared steps "the turn does not end"
// (checker-fail-closed) and "the finish check runs" (edit-gate) are reused; this file adds its own driver steps.
import { spawnSync } from "node:child_process";
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, cpSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { createHash } from "node:crypto";
import assert from "node:assert/strict";

const REPO = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..");
const ESK = join(REPO, ".claude", "skills", "bootstrap", "scripts", "esk-init.mjs");
const SESSION_SETUP = join(REPO, "always-on", "session-setup.mjs");
const FC = join(REPO, "always-on", "finish-check.mjs");
const QUOTE = "This is a sentence with at least eight exact words to quote here.";
const sha256 = (b) => createHash("sha256").update(b).digest("hex");
const fwd = (p) => p.split("\\").join("/");
const readJson = (p) => JSON.parse(readFileSync(p, "utf8"));

function fakeRepo() {
  const dir = mkdtempSync(join(tmpdir(), "esk-174b-"));
  cpSync(join(REPO, "always-on"), join(dir, "always-on"), { recursive: true });
  cpSync(join(REPO, ".claude", "skills", "bootstrap"), join(dir, ".claude", "skills", "bootstrap"), { recursive: true });
  writeFileSync(join(dir, "package.json"), JSON.stringify({ name: "skills", version: "1.3.1" }) + "\n");
  return dir;
}
function hasHook(settings, event, basename) {
  const groups = (readJson(settings).hooks || {})[event] || [];
  return groups.some((g) => (g.hooks || []).some((h) => ((h.args || []).map(String).join(" ") + " " + String(h.command || "")).includes(basename)));
}
function installEnforce(world) {
  const repo = fakeRepo();
  const settings = join(repo, ".claude", "settings.json");
  const r = spawnSync(process.execPath, [ESK, "--repo", repo, "--settings", settings, "--yes", "--enforce"], { encoding: "utf8" });
  world.inst = { repo, settings, status: r.status, out: (r.stdout || "") + (r.stderr || "") };
  assert.equal(r.status, 0, world.inst.out);
}
function removeStopHook(settings) {
  const s = readJson(settings);
  s.hooks.Stop = (s.hooks.Stop || []).filter((g) => !JSON.stringify(g).includes("finish-check.mjs"));
  writeFileSync(settings, JSON.stringify(s, null, 2));
}
function runSessionSetup(world) {
  const env = { ...process.env, ESK_ENFORCE: "1", CLAUDE_PROJECT_DIR: world.inst.repo, ESK_HOME: join(world.inst.repo, "esk") };
  const r = spawnSync(process.execPath, [SESSION_SETUP], { input: JSON.stringify({ hook_event_name: "SessionStart", session_id: "sess-1" }), encoding: "utf8", env });
  world.ss = r.stdout ? JSON.parse(r.stdout).hookSpecificOutput.additionalContext : "";
}

// --- finish-check waiver driver: a task with the review step missing, plus an operator waivers file ---
function buildWaiverTask(world) {
  const base = mkdtempSync(join(tmpdir(), "esk-wv-"));
  const skillsDir = join(base, "skills");
  mkdirSync(join(skillsDir, "comprehensive-test-strategy"), { recursive: true });
  writeFileSync(join(skillsDir, "comprehensive-test-strategy", "SKILL.md"), `# comprehensive-test-strategy\n\n## The core rule\n\n${QUOTE}\n`);
  const work = join(base, "work"); mkdirSync(work, { recursive: true });
  const srcAbs = join(work, "feature.ts"); writeFileSync(srcAbs, "export const x = 1;\n");
  const src = fwd(srcAbs);
  const transcript = join(base, "t.jsonl");
  writeFileSync(transcript, JSON.stringify({ type: "tool_use", name: "Write", input: { file_path: src } }) + "\n");
  const receipt = join(base, "r.jsonl");
  writeFileSync(receipt, JSON.stringify({ task_id: "t1", changed_files: [{ path: src, sha256: sha256(Buffer.from("export const x = 1;\n")) }], skills: [{ name: "comprehensive-test-strategy", verdict: "applied", heading: "the-core-rule", quote: QUOTE, files: [src] }] }) + "\n");
  // the review step is MISSING from the record (freshContext false), so only a waiver can let the turn end
  const record = { task_id: "t1", session_id: "s1", steps: ["select", "load", "plan", "build", "prove", "encode", "receipt"], build: { testsChanged: true, newChecks: [], coverage: {} }, prove: { ledger: true, claimLintExit: 0, checkers: [] }, review: { freshContext: false }, encode: { findings: [] }, receiptPath: receipt };
  const recPath = join(base, "rec.json"); writeFileSync(recPath, JSON.stringify(record));
  const waivers = join(base, "waivers.json");
  world.wv = { base, skillsDir, transcript, receipt, recPath, waivers };
  world.runFC = () => {
    const env = { ...process.env, ESK_TASK_RECORD: recPath, ESK_RECEIPT: receipt, ESK_SKILLS_DIR: skillsDir, ESK_WAIVERS_FILE: waivers };
    const r = spawnSync(process.execPath, [FC], { input: JSON.stringify({ transcript_path: transcript, session_id: "s1" }), encoding: "utf8", env });
    world.res = { status: r.status, out: (r.stdout || "") + (r.stderr || "") };
  };
}

export default function ({ Given, When, Then, And }) {
  // --- install / summary ---
  Given(/^the operator installs the enterprise skills with enforcement on$/, (world) => installEnforce(world));
  Then(/^the edit-gate, finish-check, record-load and session-setup hooks are all registered$/, (world) => {
    assert.ok(hasHook(world.inst.settings, "PreToolUse", "edit-gate.mjs"));
    assert.ok(hasHook(world.inst.settings, "Stop", "finish-check.mjs"));
    assert.ok(hasHook(world.inst.settings, "SubagentStop", "subagent-check.mjs"));
    assert.ok(hasHook(world.inst.settings, "PostToolUse", "record-load.mjs"));
    assert.ok(hasHook(world.inst.settings, "SessionStart", "session-setup.mjs"));
  });
  And(/^the enforcement flag is set so the hooks are live, not dormant$/, (world) => assert.equal(readJson(world.inst.settings).env.ESK_ENFORCE, "1"));
  Then(/^the installer prints a one-line summary that the formula is now held, not just delivered$/, (world) => assert.match(world.inst.out, /held, not just delivered/i));

  // --- self-test / tamper ---
  Given(/^enforcement is on but the finish-check hook is missing from settings$/, (world) => { installEnforce(world); removeStopHook(world.inst.settings); });
  Given(/^enforcement was installed and then an enforcement hook was removed$/, (world) => { installEnforce(world); removeStopHook(world.inst.settings); });
  When(/^a new session starts$/, (world) => runSessionSetup(world));
  Then(/^the session is warned that an enforcement hook is not registered$/, (world) => assert.match(world.ss, /ENFORCEMENT WARNING/));
  Then(/^the session is warned that enforcement was changed$/, (world) => assert.match(world.ss, /ENFORCEMENT WARNING/));
  And(/^the missing hook is named$/, (world) => assert.match(world.ss, /finish-check\.mjs/));
  And(/^the removed hook is named$/, (world) => assert.match(world.ss, /Stop -> finish-check\.mjs/));
  When(/^the install is checked$/, (world) => {
    const r = spawnSync(process.execPath, [ESK, "--repo", world.inst.repo, "--settings", world.inst.settings, "--check", "--enforce"], { encoding: "utf8" });
    world.chk = { status: r.status, out: (r.stdout || "") + (r.stderr || "") };
  });
  Then(/^the check fails and names the removed hook$/, (world) => { assert.equal(world.chk.status, 1, world.chk.out); assert.match(world.chk.out, /Stop -> finish-check\.mjs/); });
  And(/^re-running the installer restores it$/, (world) => {
    const r = spawnSync(process.execPath, [ESK, "--repo", world.inst.repo, "--settings", world.inst.settings, "--yes", "--enforce"], { encoding: "utf8" });
    assert.equal(r.status, 0, (r.stdout || "") + (r.stderr || ""));
    assert.ok(hasHook(world.inst.settings, "Stop", "finish-check.mjs"));
  });

  // --- operator waivers ---
  Given(/^a task is missing the review step$/, (world) => buildWaiverTask(world));
  And(/^the operator recorded a waiver for the review step with a reason$/, (world) => writeFileSync(world.wv.waivers, JSON.stringify([{ step: "review", by: "operator", reason: "accepted risk for this hotfix" }])));
  And(/^only an agent-authored waiver \(not an operator one\) exists$/, (world) => writeFileSync(world.wv.waivers, JSON.stringify([{ step: "review", by: "agent", reason: "trust me" }])));
  And(/^a waiver for the review step exists but has no reason$/, (world) => writeFileSync(world.wv.waivers, JSON.stringify([{ step: "review", by: "operator" }])));
  When(/^the finish check runs for that task$/, (world) => world.runFC());
  Then(/^the turn ends$/, (world) => assert.equal(world.res.status, 0, world.res.out));
  And(/^the review step is still reported missing$/, (world) => assert.match(world.res.out, /review step is missing/));

  // --- security: a crafted session id cannot escape the per-session store ---
  Given(/^a session id that contains path traversal$/, (world) => { world.badSession = "../escape"; });
  When(/^the enforcement resolves its per-session paths$/, (world) => {
    // Drive the REAL finish-check with enforcement on and the crafted session id, with no explicit record path so
    // the path MUST be derived from the session id (which must be rejected, not used to escape the base store).
    const base = mkdtempSync(join(tmpdir(), "esk-trav-"));
    const skillsDir = join(base, "skills"); mkdirSync(skillsDir, { recursive: true });
    const work = join(base, "work"); mkdirSync(work, { recursive: true });
    writeFileSync(join(work, "f.ts"), "export const x = 1;\n");
    const transcript = join(base, "t.jsonl");
    writeFileSync(transcript, JSON.stringify({ type: "tool_use", name: "Write", input: { file_path: fwd(join(work, "f.ts")) } }) + "\n");
    const env = { ...process.env, ESK_ENFORCE: "1", ESK_HOME: join(base, "esk"), ESK_SKILLS_DIR: skillsDir };
    delete env.ESK_TASK_RECORD; delete env.ESK_RECEIPT; delete env.ESK_WAIVERS_FILE;
    const r = spawnSync(process.execPath, [FC], { input: JSON.stringify({ transcript_path: transcript, session_id: world.badSession }), encoding: "utf8", env });
    world.res = { status: r.status, out: (r.stdout || "") + (r.stderr || "") };
  });
  Then(/^no path is derived from it$/, (world) => assert.match(world.res.out, /no usable session id|failing closed/));
  And(/^the enforcement fails closed instead of writing outside the store$/, (world) => assert.equal(world.res.status, 2, world.res.out));
}
