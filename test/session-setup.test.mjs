// Tests for always-on/session-setup.mjs (issue #174 PR-B). The SessionStart self-test must: stay silent when
// enforcement is off; announce the per-session paths when on; and WARN (tamper-visible) when an enforcement hook is
// missing from settings. A no-op self-test (never warns) flips the missing-hook case.
import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtempSync, mkdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const REPO = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const HOOK = join(REPO, "always-on", "session-setup.mjs");

// A settings.json wiring all six enforcement hooks (basenames under the right events; session-setup matches by
// basename). Drop one by passing `omit`.
function settingsWith(omit) {
  const H = (name) => ({ hooks: [{ type: "command", command: "node", args: [`x/${name}`] }] });
  const all = {
    SessionStart: [H("session-setup.mjs"), H("reload-skills.mjs")],
    PreToolUse: [H("edit-gate.mjs")],
    PostToolUse: [H("record-load.mjs")],
    Stop: [H("finish-check.mjs")],
    SubagentStop: [H("subagent-check.mjs")],
  };
  if (omit === "Stop") all.Stop = [];
  return { hooks: all };
}
function runSetup({ enforce = true, settings, sessionId = "sess-1", waivers } = {}) {
  const projectDir = mkdtempSync(join(tmpdir(), "esk-ss-"));
  if (settings) { mkdirSync(join(projectDir, ".claude"), { recursive: true }); writeFileSync(join(projectDir, ".claude", "settings.json"), JSON.stringify(settings)); }
  const home = join(projectDir, "esk");
  if (waivers) { mkdirSync(join(home, "waivers"), { recursive: true }); writeFileSync(join(home, "waivers", `${sessionId}.json`), JSON.stringify(waivers)); }
  const env = { ...process.env, CLAUDE_PROJECT_DIR: projectDir, ESK_HOME: home };
  if (enforce) env.ESK_ENFORCE = "1"; else delete env.ESK_ENFORCE;
  const r = spawnSync(process.execPath, [HOOK], { input: JSON.stringify({ hook_event_name: "SessionStart", session_id: sessionId }), encoding: "utf8", env });
  return { status: r.status, out: r.stdout || "", err: r.stderr || "" };
}

test("enforcement off: the hook stays silent (exit 0, no output)", () => {
  const r = runSetup({ enforce: false, settings: settingsWith() });
  assert.equal(r.status, 0);
  assert.equal(r.out.trim(), "");
});

test("enforcement on, all hooks present: announces the per-session paths, no warning", () => {
  const r = runSetup({ enforce: true, settings: settingsWith() });
  assert.equal(r.status, 0);
  const ctx = JSON.parse(r.out).hookSpecificOutput.additionalContext;
  assert.match(ctx, /enforcement is ON/i);
  assert.match(ctx, /task record:/);
  assert.match(ctx, /sess-1\.json/); // the per-session record path is named
  assert.doesNotMatch(ctx, /ENFORCEMENT WARNING/);
});

test("enforcement on, a hook removed: WARNS and names the missing hook (tamper-visible) - discriminating", () => {
  const r = runSetup({ enforce: true, settings: settingsWith("Stop") });
  assert.equal(r.status, 0);
  const ctx = JSON.parse(r.out).hookSpecificOutput.additionalContext;
  assert.match(ctx, /ENFORCEMENT WARNING/);
  assert.match(ctx, /Stop -> finish-check\.mjs/);
});

test("enforcement on: an operator waiver in effect is SURFACED at session start (forged-waiver detection) - discriminating", () => {
  const r = runSetup({ enforce: true, settings: settingsWith(), waivers: [{ step: "review", by: "operator", reason: "hotfix" }] });
  assert.equal(r.status, 0);
  const ctx = JSON.parse(r.out).hookSpecificOutput.additionalContext;
  assert.match(ctx, /OPERATOR WAIVERS IN EFFECT/);
  assert.match(ctx, /review \(by: operator; reason: hotfix\)/);
});

test("enforcement on, no waivers: no waiver banner is shown", () => {
  const r = runSetup({ enforce: true, settings: settingsWith() });
  const ctx = JSON.parse(r.out).hookSpecificOutput.additionalContext;
  assert.doesNotMatch(ctx, /OPERATOR WAIVERS IN EFFECT/);
});

test("enforcement on, no settings file anywhere: every required hook is reported missing", () => {
  const r = runSetup({ enforce: true, settings: null });
  assert.equal(r.status, 0);
  const ctx = JSON.parse(r.out).hookSpecificOutput.additionalContext;
  assert.match(ctx, /ENFORCEMENT WARNING/);
  assert.match(ctx, /edit-gate\.mjs/);
  assert.match(ctx, /finish-check\.mjs/);
});
