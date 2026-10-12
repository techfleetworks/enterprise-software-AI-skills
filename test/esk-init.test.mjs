// Discriminating tests for bootstrap/scripts/esk-init.mjs — the always-on installer.
// It must: plan without writing; install both hooks + marker; be idempotent; merge additively
// (preserve other settings); detect version drift; back up and RESTORE on a failed canary; and fail
// closed on a bad target. The real repo is used as --repo for the happy path; a fake repo with a
// broken emitter drives the restore-on-failure case.
import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtempSync, writeFileSync, mkdirSync, existsSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const REPO = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const ESK = resolve(REPO, "bootstrap/scripts/esk-init.mjs");
const VERSION = JSON.parse(readFileSync(join(REPO, "package.json"), "utf8")).version;

function run(extra, { repo = REPO } = {}) {
  const dir = mkdtempSync(join(tmpdir(), "esk-"));
  const settings = join(dir, ".claude", "settings.json");
  const r = spawnSync(process.execPath, [ESK, "--repo", repo, "--settings", settings, ...extra], { encoding: "utf8" });
  return { status: r.status, out: (r.stdout || "") + (r.stderr || ""), dir, settings, marker: join(dir, ".claude", ".esk-installed") };
}
function runOn(settings, extra, repo = REPO) {
  const r = spawnSync(process.execPath, [ESK, "--repo", repo, "--settings", settings, ...extra], { encoding: "utf8" });
  return { status: r.status, out: (r.stdout || "") + (r.stderr || "") };
}
function readJson(p) { return JSON.parse(readFileSync(p, "utf8")); }
function ourHook(settings, event) {
  const groups = readJson(settings).hooks?.[event] || [];
  return groups.some((g) => (g.hooks || []).some((h) => (h.args || []).some((a) => String(a).includes("emit-directive.mjs")) || String(h.command || "").includes("emit-directive.mjs")));
}

// --- plan (default) writes nothing -------------------------------------------
test("default mode is a dry run: prints a plan and writes nothing", () => {
  const r = run([]);
  assert.equal(r.status, 0, r.out);
  assert.equal(existsSync(r.settings), false, "settings.json must not be created in plan mode");
  assert.equal(existsSync(r.marker), false);
  assert.match(r.out, /dry run/i);
});

// --- apply installs both hooks + marker --------------------------------------
test("--yes installs both SessionStart and SubagentStart hooks and the marker", () => {
  const r = run(["--yes"]);
  assert.equal(r.status, 0, r.out);
  assert.ok(ourHook(r.settings, "SessionStart"), "SessionStart hook missing");
  assert.ok(ourHook(r.settings, "SubagentStart"), "SubagentStart hook missing");
  assert.equal(readJson(r.marker).version, VERSION);
  // exec form by default: command node + args
  const h = readJson(r.settings).hooks.SessionStart[0].hooks[0];
  assert.equal(h.command, "node");
  assert.ok(h.args.some((a) => a.includes("emit-directive.mjs")));
});

// --- idempotent + --check -----------------------------------------------------
test("a second --yes is a no-op, and --check passes after install", () => {
  const r = run(["--yes"]);
  assert.equal(runOn(r.settings, ["--yes"]).status, 0);
  const again = runOn(r.settings, ["--yes"]);
  assert.match(again.out, /nothing to change/i);
  assert.equal(runOn(r.settings, ["--check"]).status, 0, "check should pass after install");
});

test("--check FAILS (exit 1) before anything is installed (discriminating)", () => {
  const r = run(["--check"]);
  assert.equal(r.status, 1, r.out);
  assert.match(r.out, /drift|no .*hook|no .esk-installed/i);
});

// --- additive merge preserves other settings ---------------------------------
test("install merges additively: other hooks and keys are preserved", () => {
  const dir = mkdtempSync(join(tmpdir(), "esk-merge-"));
  const settings = join(dir, ".claude", "settings.json");
  mkdirSync(dirname(settings), { recursive: true });
  writeFileSync(settings, JSON.stringify({
    model: "opus",
    hooks: { SessionStart: [{ hooks: [{ type: "command", command: "echo hi" }] }] },
  }, null, 2));
  assert.equal(runOn(settings, ["--yes"]).status, 0);
  const s = readJson(settings);
  assert.equal(s.model, "opus", "unrelated key must be preserved");
  // the pre-existing echo hook must still be there, plus ours
  const cmds = s.hooks.SessionStart.flatMap((g) => g.hooks.map((h) => h.command));
  assert.ok(cmds.includes("echo hi"), "pre-existing hook must be preserved");
  assert.ok(ourHook(settings, "SessionStart"));
  assert.ok(existsSync(settings + ".esk.bak"), "a backup must be written before merging");
});

// --- version-aware reconcile -------------------------------------------------
test("a marker behind the repo version is drift, and --yes bumps it", () => {
  const r = run(["--yes"]);
  // simulate an older install by rewriting the marker to an old version
  writeFileSync(r.marker, JSON.stringify({ version: "0.0.1", installedAt: "old" }));
  assert.equal(runOn(r.settings, ["--check"]).status, 1, "behind-version must read as drift");
  assert.equal(runOn(r.settings, ["--yes"]).status, 0);
  assert.equal(readJson(r.marker).version, VERSION, "marker must be bumped to the repo version");
});

// --- PowerShell form ---------------------------------------------------------
test("--shell powershell writes a shell-form hook and still verifies", () => {
  const r = run(["--yes", "--shell", "powershell"]);
  assert.equal(r.status, 0, r.out);
  const h = readJson(r.settings).hooks.SessionStart[0].hooks[0];
  assert.equal(h.shell, "powershell");
  assert.ok(String(h.command).includes("emit-directive.mjs"));
  assert.equal(runOn(r.settings, ["--check"]).status, 0);
});

// --- fail closed on a bad target ---------------------------------------------
test("fails closed (exit 2) when the target settings.json is not valid JSON", () => {
  const dir = mkdtempSync(join(tmpdir(), "esk-bad-"));
  const settings = join(dir, ".claude", "settings.json");
  mkdirSync(dirname(settings), { recursive: true });
  writeFileSync(settings, "{ not json");
  assert.equal(runOn(settings, ["--yes"]).status, 2);
});
test("fails closed (exit 2) when --repo has no always-on files", () => {
  const empty = mkdtempSync(join(tmpdir(), "esk-norepo-"));
  const r = run(["--yes"], { repo: empty });
  assert.equal(r.status, 2, r.out);
});

// --- duplicate hooks: detected as drift, collapsed on reconcile --------------
function countOur(settings, event) {
  const groups = readJson(settings).hooks?.[event] || [];
  let c = 0;
  for (const g of groups) for (const h of (g.hooks || [])) {
    if ((h.args || []).some((a) => String(a).includes("emit-directive.mjs")) || String(h.command || "").includes("emit-directive.mjs")) c++;
  }
  return c;
}
test("two of our hooks is drift, and --yes collapses them to one (discriminating)", () => {
  const dir = mkdtempSync(join(tmpdir(), "esk-dup-"));
  const settings = join(dir, ".claude", "settings.json");
  mkdirSync(dirname(settings), { recursive: true });
  writeFileSync(settings, JSON.stringify({ hooks: { SessionStart: [
    { hooks: [{ type: "command", command: "node", args: ["a/emit-directive.mjs", "SessionStart"] }] },
    { hooks: [{ type: "command", command: "node", args: ["b/emit-directive.mjs", "SessionStart"] }] },
  ] } }, null, 2));
  const chk = runOn(settings, ["--check"]);
  assert.equal(chk.status, 1, "duplicates must read as drift");
  assert.match(chk.out, /duplicate/i);
  assert.equal(runOn(settings, ["--yes"]).status, 0);
  assert.equal(countOur(settings, "SessionStart"), 1, "duplicates must be collapsed to one");
  assert.equal(runOn(settings, ["--check"]).status, 0);
});

// --- a malformed non-array event value must not be silently dropped -----------
test("fails closed (exit 2) on a malformed non-array hooks.SessionStart, instead of dropping it", () => {
  const dir = mkdtempSync(join(tmpdir(), "esk-malformed-"));
  const settings = join(dir, ".claude", "settings.json");
  mkdirSync(dirname(settings), { recursive: true });
  writeFileSync(settings, JSON.stringify({ hooks: { SessionStart: { stray: "value" } } }, null, 2));
  const r = runOn(settings, ["--yes"]);
  assert.equal(r.status, 2, r.out);
  // the malformed value must still be there (not silently overwritten)
  assert.deepEqual(readJson(settings).hooks.SessionStart, { stray: "value" });
});

// --- restore-on-failure: a canary that fails must undo the write -------------
test("a failed canary restores settings.json and does NOT write the marker (discriminating)", () => {
  // Build a fake repo whose emitter emits JSON WITHOUT the directive phrase, so the canary fails.
  const fake = mkdtempSync(join(tmpdir(), "esk-fakerepo-"));
  mkdirSync(join(fake, "always-on"), { recursive: true });
  writeFileSync(join(fake, "always-on", "emit-directive.mjs"),
    'process.stdout.write(JSON.stringify({hookSpecificOutput:{hookEventName:"SessionStart",additionalContext:"nope not it"}}));\n');
  writeFileSync(join(fake, "always-on", "enterprise-skills-always-on.md"), "placeholder");
  writeFileSync(join(fake, "package.json"), JSON.stringify({ version: "9.9.9" }));

  const dir = mkdtempSync(join(tmpdir(), "esk-restore-"));
  const settings = join(dir, ".claude", "settings.json");
  mkdirSync(dirname(settings), { recursive: true });
  const original = { model: "keepme", hooks: {} };
  writeFileSync(settings, JSON.stringify(original, null, 2));

  const r = spawnSync(process.execPath, [ESK, "--repo", fake, "--settings", settings, "--yes"], { encoding: "utf8" });
  assert.equal(r.status, 2, (r.stdout || "") + (r.stderr || ""));
  assert.match((r.stdout || "") + (r.stderr || ""), /canary|restore/i);
  assert.deepEqual(readJson(settings), original, "settings.json must be restored to its original content");
  assert.equal(existsSync(join(dir, ".claude", ".esk-installed")), false, "marker must NOT be written on failure");
});
test("a failed canary on a NEW file removes the file it created (does not leave a stray one)", () => {
  const fake = mkdtempSync(join(tmpdir(), "esk-fakerepo2-"));
  mkdirSync(join(fake, "always-on"), { recursive: true });
  writeFileSync(join(fake, "always-on", "emit-directive.mjs"),
    'process.stdout.write(JSON.stringify({hookSpecificOutput:{hookEventName:"SessionStart",additionalContext:"nope"}}));\n');
  writeFileSync(join(fake, "always-on", "enterprise-skills-always-on.md"), "placeholder");
  writeFileSync(join(fake, "package.json"), JSON.stringify({ version: "9.9.9" }));
  const dir = mkdtempSync(join(tmpdir(), "esk-newfile-"));
  const settings = join(dir, ".claude", "settings.json");
  const r = spawnSync(process.execPath, [ESK, "--repo", fake, "--settings", settings, "--yes"], { encoding: "utf8" });
  assert.equal(r.status, 2, (r.stdout || "") + (r.stderr || ""));
  assert.equal(existsSync(settings), false, "a new settings.json created then failed must be removed, not left as a stray");
  assert.equal(existsSync(join(dir, ".claude", ".esk-installed")), false);
});
