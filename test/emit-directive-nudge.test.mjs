// Proves emit-directive.mjs injects the auto-sync nudge (ADR-0054) into the SessionStart context when the
// install marker is behind the repo, does NOT inject it for a SubagentStart, honors ESK_NUDGE_DISABLE, and
// clears the nudge state when in sync. Fully hermetic: it builds a throwaway "repo" (a copy of the emitter +
// sync-nudge + a stub directive + a package.json whose version it controls) and points the child's homedir()
// at a fake dir, so neither the real repo version nor a real ~/.claude nor the real repo-local marker can
// affect it. The test FAILS if the emitter stops nudging on drift or starts nudging a subagent or in-sync.
import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtempSync, mkdirSync, writeFileSync, copyFileSync, existsSync, readFileSync, rmSync } from "node:fs";
import { resolve, join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { tmpdir } from "node:os";

const REPO = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const created = [];

// Build a throwaway repo: always-on/{emit-directive.mjs, sync-nudge.mjs, directive}, and a package.json with
// the given version. Returns the path to the copied emitter.
function fakeRepo(version) {
  const root = mkdtempSync(join(tmpdir(), "nudge-repo-"));
  created.push(root);
  mkdirSync(join(root, "always-on"), { recursive: true });
  copyFileSync(join(REPO, "always-on", "emit-directive.mjs"), join(root, "always-on", "emit-directive.mjs"));
  copyFileSync(join(REPO, "always-on", "sync-nudge.mjs"), join(root, "always-on", "sync-nudge.mjs"));
  writeFileSync(join(root, "always-on", "enterprise-skills-always-on.md"), "Enterprise engineering skills, always on.\nThis is a stub directive for the test.");
  writeFileSync(join(root, "package.json"), JSON.stringify({ name: "fake", version }) + "\n");
  return { root, emit: join(root, "always-on", "emit-directive.mjs") };
}
// A fake home, optionally with a marker pointing at a given repo root and version.
function fakeHome(marker) {
  const home = mkdtempSync(join(tmpdir(), "nudge-home-"));
  created.push(home);
  mkdirSync(join(home, ".claude"), { recursive: true });
  if (marker) writeFileSync(join(home, ".claude", ".esk-installed"), JSON.stringify({ version: marker.version, repo: marker.repo, settings: "x", form: "exec" }) + "\n");
  return home;
}
function emit(emitPath, event, home, extraEnv) {
  const env = { ...process.env, USERPROFILE: home, HOME: home, ...(extraEnv || {}) };
  const r = spawnSync(process.execPath, [emitPath, event], { encoding: "utf8", env });
  const ctx = (() => { try { return JSON.parse(r.stdout).hookSpecificOutput.additionalContext; } catch { return ""; } })();
  return { status: r.status, ctx };
}

test("SessionStart with a BEHIND marker injects the loud sync nudge (discriminating)", () => {
  const { root, emit: e } = fakeRepo("1.1.0");
  const home = fakeHome({ version: "1.0.0", repo: root });
  const { status, ctx } = emit(e, "SessionStart", home);
  assert.equal(status, 0);
  assert.match(ctx, /OUT OF DATE/, "the behind-version nudge must be injected");
  assert.match(ctx, /1\.0\.0/);
  assert.match(ctx, /1\.1\.0/);
  assert.match(ctx, /Enterprise engineering skills/, "the directive still follows the nudge");
  const state = JSON.parse(readFileSync(join(home, ".claude", ".esk-nudge.json"), "utf8"));
  assert.equal(state.count, 1);
  assert.equal(state.forVersion, "1.1.0");
});

test("SubagentStart does NOT inject the nudge even when behind (no subagent spam)", () => {
  const { root, emit: e } = fakeRepo("1.1.0");
  const home = fakeHome({ version: "1.0.0", repo: root });
  const { ctx } = emit(e, "SubagentStart", home);
  assert.doesNotMatch(ctx, /OUT OF DATE/, "subagents must not get the nudge");
  assert.match(ctx, /Enterprise engineering skills/, "the directive is still emitted to the subagent");
});

test("ESK_NUDGE_DISABLE suppresses the nudge even when behind (the test escape hatch)", () => {
  const { root, emit: e } = fakeRepo("1.1.0");
  const home = fakeHome({ version: "1.0.0", repo: root });
  const { ctx } = emit(e, "SessionStart", home, { ESK_NUDGE_DISABLE: "1" });
  assert.doesNotMatch(ctx, /OUT OF DATE/, "ESK_NUDGE_DISABLE must turn the nudge off");
  assert.match(ctx, /Enterprise engineering skills/);
});

test("SessionStart in sync injects NO nudge and clears any prior state", () => {
  const { root, emit: e } = fakeRepo("1.1.0");
  const home = fakeHome({ version: "1.1.0", repo: root });
  writeFileSync(join(home, ".claude", ".esk-nudge.json"), JSON.stringify({ forVersion: "1.0.0", count: 7 }) + "\n");
  const { ctx } = emit(e, "SessionStart", home);
  assert.doesNotMatch(ctx, /OUT OF DATE/, "an in-sync install must not be nudged");
  assert.equal(existsSync(join(home, ".claude", ".esk-nudge.json")), false, "stale nudge state must be cleared on sync");
});

test("SessionStart with NO marker injects no nudge (not installed via the installer)", () => {
  const { emit: e } = fakeRepo("1.1.0");
  const home = fakeHome(null); // no marker anywhere, and the fake repo has no repo-local marker either
  const { ctx } = emit(e, "SessionStart", home);
  assert.doesNotMatch(ctx, /OUT OF DATE/);
  assert.match(ctx, /Enterprise engineering skills/);
});

test("a marker for a DIFFERENT repo does not drive this repo's nudge (Finding 2)", () => {
  const { root, emit: e } = fakeRepo("1.1.0");
  // marker names some OTHER repo, behind version. It must be ignored (no false nudge), because .repo != root
  // and it is not a legacy no-repo marker.
  const home = fakeHome({ version: "0.0.1", repo: "/some/other/repo" });
  const { ctx } = emit(e, "SessionStart", home);
  assert.doesNotMatch(ctx, /OUT OF DATE/, "a marker naming a different repo must be ignored");
});

process.on("exit", () => {
  for (const d of created) { try { rmSync(d, { recursive: true, force: true }); } catch { /* best-effort */ } }
});
