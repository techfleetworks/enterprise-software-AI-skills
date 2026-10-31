// Discriminating tests for the --enforce wiring in esk-init.mjs (issue #174 PR-B). --enforce must register the five
// enforcement hooks (session-setup + reload-skills on SessionStart, edit-gate on PreToolUse, record-load on
// PostToolUse, finish-check on Stop AND SubagentStop) and set env ESK_ENFORCE=1, idempotently, while a PLAIN install
// writes NONE of them (opt-in). A no-op wiring (enforcement ignored) flips tests 1-2; a non-idempotent one flips 4.
// Uses a clean fakeSkillsRepo (a copy of always-on/, NOT a git repo) so the emitter is under the target (portable
// hooks, no --allow-absolute) and the uncommitted-tree drift check does not fire during --check.
import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtempSync, writeFileSync, mkdirSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const REPO = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const ESK = resolve(REPO, ".claude/skills/bootstrap/scripts/esk-init.mjs");
const VERSION = JSON.parse(readFileSync(join(REPO, "package.json"), "utf8")).version;
const { cpSync } = await import("node:fs");

function fakeSkillsRepo() {
  const dir = mkdtempSync(join(tmpdir(), "esk-enf-"));
  cpSync(join(REPO, "always-on"), join(dir, "always-on"), { recursive: true });
  writeFileSync(join(dir, "package.json"), JSON.stringify({ name: "skills", version: VERSION }) + "\n");
  return dir;
}
function esk(repo, settings, extra) {
  const r = spawnSync(process.execPath, [ESK, "--repo", repo, "--settings", settings, ...extra], { encoding: "utf8" });
  return { status: r.status, out: (r.stdout || "") + (r.stderr || "") };
}
const readJson = (p) => JSON.parse(readFileSync(p, "utf8"));
function hasHook(settings, event, basename, matcher) {
  const groups = readJson(settings).hooks?.[event] || [];
  return groups.some((g) => (g.matcher || undefined) === (matcher || undefined) && (g.hooks || []).some((h) => {
    const s = (h.args || []).map(String).join(" ") + " " + String(h.command || "");
    return s.includes(basename);
  }));
}
const REQUIRED = [
  ["SessionStart", "session-setup.mjs", undefined],
  ["SessionStart", "reload-skills.mjs", "compact"],
  ["PreToolUse", "edit-gate.mjs", "Write|Edit|MultiEdit|NotebookEdit"],
  ["PostToolUse", "record-load.mjs", "Skill"],
  ["Stop", "finish-check.mjs", undefined],
  ["SubagentStop", "finish-check.mjs", undefined],
];

test("a PLAIN install writes NO enforcement hooks and no ESK_ENFORCE (opt-in, discriminating)", () => {
  const repo = fakeSkillsRepo();
  const settings = join(repo, ".claude", "settings.json");
  assert.equal(esk(repo, settings, ["--yes"]).status, 0);
  const s = readJson(settings);
  assert.equal(s.env?.ESK_ENFORCE, undefined);
  for (const [event, base, matcher] of REQUIRED) assert.equal(hasHook(settings, event, base, matcher), false, `${event}/${base} should be absent in a plain install`);
  // the directive hook IS present
  assert.ok(hasHook(settings, "SessionStart", "emit-directive.mjs", undefined));
});

test("--yes --enforce registers all six enforcement hooks + ESK_ENFORCE=1, and --check passes", () => {
  const repo = fakeSkillsRepo();
  const settings = join(repo, ".claude", "settings.json");
  assert.equal(esk(repo, settings, ["--yes", "--enforce"]).status, 0);
  const s = readJson(settings);
  assert.equal(s.env.ESK_ENFORCE, "1");
  for (const [event, base, matcher] of REQUIRED) assert.ok(hasHook(settings, event, base, matcher), `${event}/${base} should be registered`);
  // directive hooks are still present (enforcement is additive)
  assert.ok(hasHook(settings, "SessionStart", "emit-directive.mjs", undefined));
  assert.ok(hasHook(settings, "SubagentStart", "emit-directive.mjs", undefined));
  const c = esk(repo, settings, ["--check", "--enforce"]);
  assert.equal(c.status, 0, c.out);
});

test("--enforce preserves a foreign hook and merges env", () => {
  const repo = fakeSkillsRepo();
  const settings = join(repo, ".claude", "settings.json");
  mkdirSync(dirname(settings), { recursive: true });
  writeFileSync(settings, JSON.stringify({ hooks: { PreToolUse: [{ matcher: "Bash", hooks: [{ type: "command", command: "echo foreign" }] }] }, env: { FOO: "bar" } }));
  assert.equal(esk(repo, settings, ["--yes", "--enforce"]).status, 0);
  const s = readJson(settings);
  assert.equal(s.env.FOO, "bar");
  assert.equal(s.env.ESK_ENFORCE, "1");
  assert.ok(JSON.stringify(s.hooks.PreToolUse).includes("foreign"), "foreign Bash hook must be preserved");
  assert.ok(hasHook(settings, "PreToolUse", "edit-gate.mjs", "Write|Edit|MultiEdit|NotebookEdit"));
});

test("a second --yes --enforce is a no-op (idempotent)", () => {
  const repo = fakeSkillsRepo();
  const settings = join(repo, ".claude", "settings.json");
  assert.equal(esk(repo, settings, ["--yes", "--enforce"]).status, 0);
  const before = readFileSync(settings, "utf8");
  const second = esk(repo, settings, ["--yes", "--enforce"]);
  assert.equal(second.status, 0);
  assert.match(second.out, /nothing to change/i);
  assert.equal(readFileSync(settings, "utf8"), before, "a second enforce install must not rewrite the file");
});

test("--check reports a REMOVED enforcement hook as drift (exit 1, names it) - discriminating", () => {
  const repo = fakeSkillsRepo();
  const settings = join(repo, ".claude", "settings.json");
  assert.equal(esk(repo, settings, ["--yes", "--enforce"]).status, 0);
  // simulate tampering: drop the Stop finish-check hook
  const s = readJson(settings);
  s.hooks.Stop = (s.hooks.Stop || []).filter((g) => !JSON.stringify(g).includes("finish-check.mjs"));
  writeFileSync(settings, JSON.stringify(s, null, 2));
  const c = esk(repo, settings, ["--check", "--enforce"]);
  assert.equal(c.status, 1, c.out);
  assert.match(c.out, /Stop -> finish-check\.mjs/);
});

test("once enforced (marker.enforce), a plain --yes keeps enforcement on (does not drop it)", () => {
  const repo = fakeSkillsRepo();
  const settings = join(repo, ".claude", "settings.json");
  assert.equal(esk(repo, settings, ["--yes", "--enforce"]).status, 0);
  // a later reconcile WITHOUT --enforce must not remove the enforcement wiring
  assert.equal(esk(repo, settings, ["--yes"]).status, 0);
  const s = readJson(settings);
  assert.equal(s.env.ESK_ENFORCE, "1");
  for (const [event, base, matcher] of REQUIRED) assert.ok(hasHook(settings, event, base, matcher), `${event}/${base} must survive a plain reconcile`);
});
