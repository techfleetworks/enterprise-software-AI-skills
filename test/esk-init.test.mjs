// Discriminating tests for .claude/skills/bootstrap/scripts/esk-init.mjs — the always-on installer.
// It must: plan without writing; install both hooks + marker; be idempotent; merge additively
// (preserve other settings); detect version drift; back up and RESTORE on a failed canary; and fail
// closed on a bad target. The real repo is used as --repo for the happy path; a fake repo with a
// broken emitter drives the restore-on-failure case.
import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtempSync, writeFileSync, mkdirSync, existsSync, readFileSync, readdirSync, rmSync, cpSync, chmodSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const REPO = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const ESK = resolve(REPO, ".claude/skills/bootstrap/scripts/esk-init.mjs");
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
// A standalone skills repo (the always-on files copied from REPO) so the emitter can live UNDER a target.
function fakeSkillsRepo() {
  const dir = mkdtempSync(join(tmpdir(), "esk-skills-"));
  cpSync(join(REPO, "always-on"), join(dir, "always-on"), { recursive: true });
  writeFileSync(join(dir, "package.json"), JSON.stringify({ name: "skills", version: VERSION }) + "\n");
  return dir;
}
const gitInit = (dir) => spawnSync("git", ["init", "-q", dir], { encoding: "utf8" });
function ourHookText(settings, event) {
  const groups = readJson(settings).hooks?.[event] || [];
  for (const g of groups) for (const h of g.hooks || []) {
    const s = (h.args || []).map(String).join(" ") + " " + String(h.command || "");
    if (s.includes("emit-directive.mjs")) return s;
  }
  return "";
}
function ourHook(settings, event) {
  const groups = readJson(settings).hooks?.[event] || [];
  return groups.some((g) => (g.hooks || []).some((h) => (h.args || []).some((a) => String(a).includes("emit-directive.mjs")) || String(h.command || "").includes("emit-directive.mjs")));
}

// --- portability: committed hooks must not hardcode a machine path (ADR-0051) ---
test("writes a portable ${CLAUDE_PROJECT_DIR} hook when the emitter is inside the target repo", () => {
  const repo = fakeSkillsRepo();
  const settings = join(repo, ".claude", "settings.json");
  const r = spawnSync(process.execPath, [ESK, "--repo", repo, "--settings", settings, "--yes"], { encoding: "utf8" });
  assert.equal(r.status, 0, (r.stdout || "") + (r.stderr || ""));
  const s = ourHookText(settings, "SessionStart");
  assert.match(s, /\$\{CLAUDE_PROJECT_DIR\}\/always-on\/emit-directive\.mjs/, "hook uses the portable repo-relative path");
  assert.doesNotMatch(s, /esk-skills-/, "hook does not contain the machine-specific absolute clone path");
});

test("REFUSES (2) to write a machine-specific path into a git-tracked settings.json", () => {
  const target = mkdtempSync(join(tmpdir(), "esk-gitrepo-"));
  gitInit(target);
  const settings = join(target, ".claude", "settings.json"); // tracked (no .gitignore)
  const r = spawnSync(process.execPath, [ESK, "--repo", REPO, "--settings", settings, "--yes"], { encoding: "utf8" });
  assert.equal(r.status, 2, "must fail closed on the committed-footgun case");
  assert.match((r.stdout || "") + (r.stderr || ""), /refusing to write a machine-specific/i);
  assert.equal(existsSync(settings), false, "nothing written when refused");
});

test("allows a machine-specific path when the settings file is gitignored", () => {
  const target = mkdtempSync(join(tmpdir(), "esk-gitignored-"));
  gitInit(target);
  writeFileSync(join(target, ".gitignore"), ".claude/settings.local.json\n");
  const settings = join(target, ".claude", "settings.local.json");
  const r = spawnSync(process.execPath, [ESK, "--repo", REPO, "--settings", settings, "--yes"], { encoding: "utf8" });
  assert.equal(r.status, 0, (r.stdout || "") + (r.stderr || ""));
  assert.ok(ourHookText(settings, "SessionStart").includes("emit-directive.mjs"), "hook written to the gitignored local file");
});

test("--allow-absolute overrides the refusal for a git-tracked settings.json", () => {
  const target = mkdtempSync(join(tmpdir(), "esk-allowabs-"));
  gitInit(target);
  const settings = join(target, ".claude", "settings.json");
  const r = spawnSync(process.execPath, [ESK, "--repo", REPO, "--settings", settings, "--yes", "--allow-absolute"], { encoding: "utf8" });
  assert.equal(r.status, 0, (r.stdout || "") + (r.stderr || ""));
  assert.ok(ourHookText(settings, "SessionStart").includes("emit-directive.mjs"), "hook written under override");
});

test("--personal NEVER writes a ${CLAUDE_PROJECT_DIR} hook, even when the emitter sits under the target (ADR-0051 F1, discriminating)", () => {
  // The repo-under-home layout: the settings file is INSIDE the skills repo (so the emitter path-tests as
  // "under the target"), but --personal means a user-level (~/.claude) install where ${CLAUDE_PROJECT_DIR}
  // has no meaning and would resolve to a dead path. Personal must therefore get the ABSOLUTE emitter path.
  // The pre-fix code computed emitterUnderTarget from path containment alone and would write the broken
  // portable form here; this test fails without the `!personal` guard.
  const repo = fakeSkillsRepo();
  const settings = join(repo, ".claude", "settings.json"); // under the repo, but a --personal install
  const r = spawnSync(process.execPath, [ESK, "--repo", repo, "--settings", settings, "--personal", "--yes"], { encoding: "utf8" });
  assert.equal(r.status, 0, (r.stdout || "") + (r.stderr || ""));
  const s = ourHookText(settings, "SessionStart");
  assert.ok(s.includes("emit-directive.mjs"), "hook installed");
  assert.doesNotMatch(s, /\$\{CLAUDE_PROJECT_DIR\}/, "a --personal install must NOT use the repo-relative placeholder");
  assert.ok(s.includes(repo), "a --personal install uses the absolute emitter path");
});

test("a USER-LEVEL target reached WITHOUT --personal (plain --settings ~/.claude) is also NOT portable (ADR-0051 F1 completeness, discriminating)", () => {
  // The sibling leak: --personal is just a shortcut for --settings ~/.claude/settings.json. Keying the
  // portable-vs-absolute decision on the FLAG rather than the TARGET let `--settings <home>/.claude --yes`
  // (no --personal) write a dead ${CLAUDE_PROJECT_DIR} hook into a user-level file under the repo-under-home
  // layout. We point the child's homedir() at a fake home (USERPROFILE/HOME) and clone the skills repo UNDER
  // it, so the emitter path-tests as "under the target". The fix keys on the resolved target == ~/.claude,
  // so this must get the ABSOLUTE path. Reverting to the flag check writes the placeholder and fails here.
  const fakeHome = mkdtempSync(join(tmpdir(), "esk-home-"));
  const repo = join(fakeHome, "skills-clone");
  cpSync(join(REPO, "always-on"), join(repo, "always-on"), { recursive: true });
  writeFileSync(join(repo, "package.json"), JSON.stringify({ name: "skills", version: VERSION }) + "\n");
  const settings = join(fakeHome, ".claude", "settings.json"); // the user-level file, but NO --personal flag
  const env = { ...process.env, USERPROFILE: fakeHome, HOME: fakeHome };
  const r = spawnSync(process.execPath, [ESK, "--repo", repo, "--settings", settings, "--yes"], { encoding: "utf8", env });
  assert.equal(r.status, 0, (r.stdout || "") + (r.stderr || ""));
  const s = ourHookText(settings, "SessionStart");
  assert.ok(s.includes("emit-directive.mjs"), "hook installed");
  assert.doesNotMatch(s, /\$\{CLAUDE_PROJECT_DIR\}/, "a user-level target must NOT use the repo-relative placeholder, even without --personal");
  assert.ok(s.includes(repo), "a user-level install uses the absolute emitter path");
});

test("a user-level target whose DRIVE-LETTER CASE differs from homedir() is still NOT portable (ADR-0051 win32 casing, discriminating)", () => {
  // Windows is case-insensitive and Git Bash emits lowercase drive letters, so settingsDir and ~/.claude can
  // differ by only `c:` vs `C:`. A plain === would then read the ~/.claude target as "not user-level" and write
  // a dead ${CLAUDE_PROJECT_DIR} hook. The fix case-folds on win32. This test only means anything on win32
  // (the bug is win32-only), so it no-ops elsewhere. --repo and --settings share the lowercased drive (so the
  // emitter path-tests as under the target), while homedir() keeps the OS casing — exactly the leak shape.
  if (process.platform !== "win32") return;
  const lc = (p) => p.replace(/^([A-Za-z]):/, (m, d) => d.toLowerCase() + ":");
  const fakeHome = mkdtempSync(join(tmpdir(), "esk-case-")); // OS casing (upper drive)
  const repo = join(fakeHome, "skills-clone");
  cpSync(join(REPO, "always-on"), join(repo, "always-on"), { recursive: true });
  writeFileSync(join(repo, "package.json"), JSON.stringify({ name: "skills", version: VERSION }) + "\n");
  const settings = join(fakeHome, ".claude", "settings.json");
  const env = { ...process.env, USERPROFILE: fakeHome, HOME: fakeHome }; // homedir() keeps upper drive
  const r = spawnSync(process.execPath, [ESK, "--repo", lc(repo), "--settings", lc(settings), "--yes"], { encoding: "utf8", env });
  assert.equal(r.status, 0, (r.stdout || "") + (r.stderr || ""));
  const s = ourHookText(settings, "SessionStart");
  assert.ok(s.includes("emit-directive.mjs"), "hook installed");
  assert.doesNotMatch(s, /\$\{CLAUDE_PROJECT_DIR\}/, "a drive-case mismatch must not de-portabilize a user-level target");
});

test("the committed-footgun DRY RUN prints the plan + a warning and exits 0 (does not refuse until --yes) (ADR-0051 F2)", () => {
  // The documented default (no --yes) is a dry run. It must preview the plan and warn that --yes would refuse,
  // not exit 2 out of nowhere. The pre-fix guard ran at module load with no --yes condition and killed the
  // dry run with exit 2.
  const target = mkdtempSync(join(tmpdir(), "esk-footgun-plan-"));
  gitInit(target);
  const settings = join(target, ".claude", "settings.json"); // tracked
  const r = spawnSync(process.execPath, [ESK, "--repo", REPO, "--settings", settings], { encoding: "utf8" });
  const out = (r.stdout || "") + (r.stderr || "");
  assert.equal(r.status, 0, out);
  assert.match(out, /dry run/i, "a dry run must still print the plan");
  assert.match(out, /would REFUSE/i, "the plan must warn that --yes would refuse");
  assert.equal(existsSync(settings), false, "a dry run writes nothing");
});

test("--shell powershell also writes the portable ${CLAUDE_PROJECT_DIR} form when the emitter is under the target (ADR-0051 F4)", () => {
  const repo = fakeSkillsRepo();
  const settings = join(repo, ".claude", "settings.json");
  const r = spawnSync(process.execPath, [ESK, "--repo", repo, "--settings", settings, "--shell", "powershell", "--yes"], { encoding: "utf8" });
  assert.equal(r.status, 0, (r.stdout || "") + (r.stderr || ""));
  const s = ourHookText(settings, "SessionStart");
  assert.match(s, /\$\{CLAUDE_PROJECT_DIR\}\/always-on\/emit-directive\.mjs/, "shell-form command must use the portable path");
  assert.doesNotMatch(s, /esk-skills-/, "shell-form command must not hardcode the machine clone path");
});

// --- plan (default) writes nothing -------------------------------------------
test("default mode is a dry run: prints a plan and writes nothing", () => {
  const r = run([]);
  assert.equal(r.status, 0, r.out);
  assert.equal(existsSync(r.settings), false, "settings.json must not be created in plan mode");
  assert.equal(existsSync(r.marker), false);
  assert.match(r.out, /dry run/i);
});

test("resolves the repo root from its own location with no --repo (default invocation, discriminating)", () => {
  // Run the REAL installer with NO --repo, in plan mode, so it must find the repo by walking up from its own
  // path. The documented one-line command relies on this; a hardcoded "../.." broke it when the skill moved
  // under .claude/skills/, and no test caught it because every other test passes --repo explicitly.
  const dir = mkdtempSync(join(tmpdir(), "esk-defrepo-"));
  const settings = join(dir, ".claude", "settings.json");
  const r = spawnSync(process.execPath, [ESK, "--settings", settings], { encoding: "utf8" });
  const out = (r.stdout || "") + (r.stderr || "");
  assert.doesNotMatch(out, /could not find the always-on files/, "default repoRoot resolution must find the repo");
  assert.equal(r.status, 0, out);
  assert.match(out, /plan/i);
});

test("the documented install runs end-to-end with NO --repo (self-locating), hermetically (structural)", () => {
  // The exact shape of the documented global command, minus --personal so the settings target stays in a
  // temp dir. No --repo: the installer must locate its OWN repo. This proves the documented one-liner
  // actually works end-to-end, so a future move or refactor that breaks it fails CI, not a user's machine.
  const dir = mkdtempSync(join(tmpdir(), "esk-doc-"));
  const settings = join(dir, ".claude", "settings.json");
  const tgt = join(dir, "home", "skills");
  const r = spawnSync(process.execPath, [ESK, "--settings", settings, "--skills", "--skills-target", tgt, "--yes"], { encoding: "utf8" });
  const out = (r.stdout || "") + (r.stderr || "");
  assert.equal(r.status, 0, out);
  assert.doesNotMatch(out, /could not find the always-on files/);
  assert.ok(existsSync(join(tgt, "judge-arch", "SKILL.md")), "the real repo's skills must be mirrored via the self-located root");
  const m = JSON.parse(readFileSync(join(dir, ".claude", ".esk-installed"), "utf8"));
  assert.ok(m.skills && m.skills.names.includes("judge-arch"), "marker records the mirrored skills");
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

// --- upgrading a LEGACY copy-based install in place (no duplicate) ------------
test("reconcile UPGRADES a legacy inline hook in place instead of adding a duplicate", () => {
  const dir = mkdtempSync(join(tmpdir(), "esk-legacy-"));
  const settings = join(dir, ".claude", "settings.json");
  mkdirSync(dirname(settings), { recursive: true });
  // the pre-#50 copy-based hook: reads $HOME/.claude/enterprise-skills-always-on.md via bash
  const legacy = {
    type: "command", shell: "bash", timeout: 15,
    command: 'node -e \'process.stdout.write(require("fs").readFileSync(process.argv[1],"utf8"))\' "$HOME/.claude/enterprise-skills-always-on.md"',
  };
  writeFileSync(settings, JSON.stringify({ hooks: { SessionStart: [{ hooks: [legacy] }], SubagentStart: [{ hooks: [legacy] }] } }, null, 2));
  assert.equal(runOn(settings, ["--check"]).status, 1, "a legacy install with no marker must read as drift");
  assert.equal(runOn(settings, ["--yes"]).status, 0);
  // exactly one of ours per event, now exec form pointing at emit-directive.mjs, no leftover inline hook
  assert.equal(countOur(settings, "SessionStart"), 1);
  const after = readJson(settings).hooks.SessionStart.flatMap((g) => g.hooks);
  assert.ok(after.some((h) => (h.args || []).some((a) => String(a).includes("emit-directive.mjs"))), "must be the new exec-form hook");
  assert.ok(!after.some((h) => String(h.command || "").includes("readFileSync")), "the legacy inline hook must be gone, not duplicated");
  assert.equal(runOn(settings, ["--check"]).status, 0);
});

// --- do not de-portabilize an existing committed ${CLAUDE_PROJECT_DIR} hook ----
test("reconcile leaves an existing portable ${CLAUDE_PROJECT_DIR} hook alone (no absolute-path rewrite)", () => {
  const dir = mkdtempSync(join(tmpdir(), "esk-portable-"));
  const settings = join(dir, ".claude", "settings.json");
  mkdirSync(dirname(settings), { recursive: true });
  const portable = (event) => ({ hooks: [{ type: "command", command: "node", args: ["${CLAUDE_PROJECT_DIR}/always-on/emit-directive.mjs", event], timeout: 10 }] });
  writeFileSync(settings, JSON.stringify({ hooks: { SessionStart: [portable("SessionStart")], SubagentStart: [portable("SubagentStart")] } }, null, 2));
  assert.equal(runOn(settings, ["--yes"]).status, 0);
  const h = readJson(settings).hooks.SessionStart[0].hooks[0];
  assert.ok(h.args.some((a) => String(a).includes("${CLAUDE_PROJECT_DIR}")), "must keep the portable form, not rewrite to an absolute path");
  assert.equal(countOur(settings, "SessionStart"), 1, "no duplicate added");
});

// --- a foreign hook that only MENTIONS the directive filename is not ours ------
test("a foreign hook that merely references the directive filename is NOT treated as ours", () => {
  const dir = mkdtempSync(join(tmpdir(), "esk-foreign-"));
  const settings = join(dir, ".claude", "settings.json");
  mkdirSync(dirname(settings), { recursive: true });
  // a custom hook that cats the directive for some other purpose (no inline node reader)
  const foreign = { type: "command", command: 'cat always-on/enterprise-skills-always-on.md | wc -l' };
  writeFileSync(settings, JSON.stringify({ hooks: { SessionStart: [{ hooks: [foreign] }] } }, null, 2));
  assert.equal(runOn(settings, ["--yes"]).status, 0);
  const cmds = readJson(settings).hooks.SessionStart.flatMap((g) => g.hooks).map((h) => h.command);
  assert.ok(cmds.some((c) => String(c).includes("wc -l")), "the foreign hook must be preserved, not replaced");
  assert.ok(ourHook(settings, "SessionStart"), "our hook must be added alongside it");
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

// === --skills: mirror the repo's skills into a discovery location (ADR-0029) ====================
// Opt-in + --skills-target so these are hermetic (never touch a real ~/.claude/skills). A fake repo with a
// controllable skill set drives the reconcile/removal/version cases; the real repo proves real content mirrors.
function fakeRepo(skills, version = "1.0.0") {
  const repo = mkdtempSync(join(tmpdir(), "esk-fakerepo-sk-"));
  mkdirSync(join(repo, "always-on"), { recursive: true });
  writeFileSync(join(repo, "always-on", "emit-directive.mjs"),
    'process.stdout.write(JSON.stringify({hookSpecificOutput:{hookEventName:"SessionStart",additionalContext:"Enterprise engineering skills directive"}}));\n');
  writeFileSync(join(repo, "always-on", "enterprise-skills-always-on.md"), "Enterprise engineering skills");
  writeFileSync(join(repo, "package.json"), JSON.stringify({ version }));
  for (const s of skills) {
    const d = join(repo, ".claude", "skills", s);
    mkdirSync(d, { recursive: true });
    writeFileSync(join(d, "SKILL.md"), `---\nname: ${s}\ndescription: "fake ${s}"\n---\n# ${s}\n`);
  }
  return repo;
}
function skArea() {
  const dir = mkdtempSync(join(tmpdir(), "esk-sk-"));
  return { dir, settings: join(dir, ".claude", "settings.json"), marker: join(dir, ".claude", ".esk-installed"), tgt: join(dir, "home", "skills") };
}
function runSK(repo, tgt, settings, extra) {
  const r = spawnSync(process.execPath, [ESK, "--repo", repo, "--settings", settings, "--skills", "--skills-target", tgt, ...extra], { encoding: "utf8" });
  return { status: r.status, out: (r.stdout || "") + (r.stderr || "") };
}

test("a hook-only install (no --skills) records NO skills in the marker (opt-in, discriminating)", () => {
  const r = run(["--yes"]);
  assert.equal(JSON.parse(readFileSync(r.marker, "utf8")).skills, undefined, "skills must be opt-in");
});

test("--skills plan (no --yes) writes nothing to the skills target (safe by default)", () => {
  const repo = fakeRepo(["alpha", "beta"]);
  const a = skArea();
  const r = runSK(repo, a.tgt, a.settings, []);
  assert.equal(r.status, 0, r.out);
  assert.equal(existsSync(a.tgt), false, "no skills may be written in plan mode");
  assert.match(r.out, /mirror 2 skill/i);
});

test("--yes --skills mirrors every skill and records them in the marker", () => {
  const repo = fakeRepo(["alpha", "beta"]);
  const a = skArea();
  assert.equal(runSK(repo, a.tgt, a.settings, ["--yes"]).status, 0);
  assert.ok(existsSync(join(a.tgt, "alpha", "SKILL.md")), "alpha mirrored");
  assert.ok(existsSync(join(a.tgt, "beta", "SKILL.md")), "beta mirrored");
  const m = JSON.parse(readFileSync(a.marker, "utf8"));
  assert.deepEqual([...m.skills.names].sort(), ["alpha", "beta"]);
  assert.equal(m.skills.target, a.tgt);
  assert.equal(existsSync(join(a.tgt, "alpha.esk-tmp")), false, "no temp residue after a successful mirror");
});

test("the REAL repo mirrors all 17 skills (happy path on real content)", () => {
  const a = skArea();
  assert.equal(runSK(REPO, a.tgt, a.settings, ["--yes"]).status, 0);
  const dirs = readdirSync(a.tgt, { withFileTypes: true }).filter((e) => e.isDirectory() && !e.name.endsWith(".esk-tmp"));
  assert.ok(dirs.length >= 17, `expected at least 17 skills mirrored, got ${dirs.length}`);
  assert.ok(existsSync(join(a.tgt, "judge-arch", "SKILL.md")));
});

test("the clean copy skips heavy/ignored subdirs (vendor, node_modules) — discriminating", () => {
  const repo = fakeRepo(["gamma"]);
  const g = join(repo, ".claude", "skills", "gamma");
  mkdirSync(join(g, "vendor"), { recursive: true }); writeFileSync(join(g, "vendor", "big.txt"), "CC-BY-SA text");
  mkdirSync(join(g, "node_modules"), { recursive: true }); writeFileSync(join(g, "node_modules", "x.js"), "dep");
  mkdirSync(join(g, "references"), { recursive: true }); writeFileSync(join(g, "references", "r.md"), "ref");
  const a = skArea();
  assert.equal(runSK(repo, a.tgt, a.settings, ["--yes"]).status, 0);
  assert.ok(existsSync(join(a.tgt, "gamma", "SKILL.md")), "SKILL.md copied");
  assert.ok(existsSync(join(a.tgt, "gamma", "references", "r.md")), "references copied");
  assert.equal(existsSync(join(a.tgt, "gamma", "vendor")), false, "vendor must be skipped");
  assert.equal(existsSync(join(a.tgt, "gamma", "node_modules")), false, "node_modules must be skipped");
});

test("a second --yes --skills is a no-op, and --check --skills passes after install", () => {
  const repo = fakeRepo(["alpha"]);
  const a = skArea();
  assert.equal(runSK(repo, a.tgt, a.settings, ["--yes"]).status, 0);
  assert.match(runSK(repo, a.tgt, a.settings, ["--yes"]).out, /nothing to change/i);
  assert.equal(runSK(repo, a.tgt, a.settings, ["--check"]).status, 0);
});

test("--check --skills reports skills-not-mirrored as drift even when the hook is clean (discriminating)", () => {
  const repo = fakeRepo(["alpha"]);
  const a = skArea();
  // install the hook ONLY (no --skills) so the hook is clean and the only possible drift is skills
  assert.equal(spawnSync(process.execPath, [ESK, "--repo", repo, "--settings", a.settings, "--yes"], { encoding: "utf8" }).status, 0);
  const r = runSK(repo, a.tgt, a.settings, ["--check"]);
  assert.equal(r.status, 1, r.out);
  assert.match(r.out, /were not mirrored/i, "must isolate skills drift, not just match the hook header");
});

test("reconcile REMOVES a skill dropped from the repo, but NEVER a foreign one (discriminating)", () => {
  const repo = fakeRepo(["alpha", "beta"]);
  const a = skArea();
  assert.equal(runSK(repo, a.tgt, a.settings, ["--yes"]).status, 0);
  mkdirSync(join(a.tgt, "foreign"), { recursive: true });
  writeFileSync(join(a.tgt, "foreign", "SKILL.md"), "---\nname: foreign\n---\n");
  rmSync(join(repo, ".claude", "skills", "beta"), { recursive: true, force: true });
  writeFileSync(join(repo, "package.json"), JSON.stringify({ version: "1.0.1" }));
  assert.equal(runSK(repo, a.tgt, a.settings, ["--yes"]).status, 0);
  assert.ok(existsSync(join(a.tgt, "alpha", "SKILL.md")), "alpha (still in repo) kept");
  assert.equal(existsSync(join(a.tgt, "beta")), false, "beta (dropped from repo, was ours) removed");
  assert.ok(existsSync(join(a.tgt, "foreign", "SKILL.md")), "foreign (never ours) must be untouched");
});

test("a mirrored skill deleted from the target is drift and is restored on reconcile (discriminating)", () => {
  const repo = fakeRepo(["alpha", "beta"]);
  const a = skArea();
  assert.equal(runSK(repo, a.tgt, a.settings, ["--yes"]).status, 0);
  rmSync(join(a.tgt, "alpha"), { recursive: true, force: true });
  assert.equal(runSK(repo, a.tgt, a.settings, ["--check"]).status, 1, "a missing mirrored skill is drift");
  assert.equal(runSK(repo, a.tgt, a.settings, ["--yes"]).status, 0);
  assert.ok(existsSync(join(a.tgt, "alpha", "SKILL.md")), "the missing skill is restored");
});

test("a repo version bump is skills drift, and a reconcile re-mirrors + bumps the record (discriminating)", () => {
  const repo = fakeRepo(["alpha"], "1.0.0");
  const a = skArea();
  assert.equal(runSK(repo, a.tgt, a.settings, ["--yes"]).status, 0);
  writeFileSync(join(repo, "package.json"), JSON.stringify({ version: "2.0.0" }));
  assert.equal(runSK(repo, a.tgt, a.settings, ["--check"]).status, 1, "behind-version skills must read as drift");
  assert.equal(runSK(repo, a.tgt, a.settings, ["--yes"]).status, 0);
  assert.equal(JSON.parse(readFileSync(a.marker, "utf8")).skills.version, "2.0.0");
});

test("a content change inside an installed skill at the SAME version is drift and is re-mirrored (ADR-0039, discriminating)", () => {
  // The reported bug: a git pull that edits or ADDS a file inside an already-installed skill, with the package
  // version unchanged, left the installer reporting "nothing to change" so the new file never reached the target.
  // This is the exact PR #72 scenario (a new scripts/ file added to judge-arch at version 0.1.0). The pre-fix
  // code (version/target/missing-top-level-SKILL.md checks only) would FAIL every assertion below.
  const repo = fakeRepo(["alpha"], "1.0.0");
  const a = skArea();
  assert.equal(runSK(repo, a.tgt, a.settings, ["--yes"]).status, 0);
  assert.ok(existsSync(join(a.tgt, "alpha", "SKILL.md")), "baseline mirror");

  // 1) ADD a new file inside the existing skill, version UNCHANGED (still 1.0.0)
  const scriptsDir = join(repo, ".claude", "skills", "alpha", "scripts");
  mkdirSync(scriptsDir, { recursive: true });
  writeFileSync(join(scriptsDir, "new-tool.mjs"), "// added inside an installed skill, same version\n");
  let chk = runSK(repo, a.tgt, a.settings, ["--check"]);
  assert.equal(chk.status, 1, "a same-version content ADD must read as drift: " + chk.out);
  assert.match(chk.out, /changed in the repo since install/i);
  assert.equal(runSK(repo, a.tgt, a.settings, ["--yes"]).status, 0);
  assert.ok(existsSync(join(a.tgt, "alpha", "scripts", "new-tool.mjs")), "the added file must reach the target after reconcile");
  // and it settles back to a no-op (the fast path is preserved, not removed)
  assert.match(runSK(repo, a.tgt, a.settings, ["--yes"]).out, /nothing to change/i);
  assert.equal(runSK(repo, a.tgt, a.settings, ["--check"]).status, 0, "clean after re-mirror");

  // 2) EDIT an existing file inside the skill, version still UNCHANGED
  writeFileSync(join(repo, ".claude", "skills", "alpha", "SKILL.md"), "---\nname: alpha\ndescription: edited\n---\n# alpha edited\n");
  chk = runSK(repo, a.tgt, a.settings, ["--check"]);
  assert.equal(chk.status, 1, "a same-version content EDIT must read as drift: " + chk.out);
  assert.equal(runSK(repo, a.tgt, a.settings, ["--yes"]).status, 0);
  assert.match(readFileSync(join(a.tgt, "alpha", "SKILL.md"), "utf8"), /alpha edited/, "the edit must reach the target");
});

test("the fingerprint ignores skipped subdirs: a change under vendor/node_modules is NOT drift (discriminating)", () => {
  // The signature must cover exactly what the mirror copies. vendor/ and node_modules/ are skipped by the mirror,
  // so a change there must not force a re-mirror (that would churn on the gitignored OWASP text that some machines
  // have fetched and others have not). This pins the signature's skip set to the mirror's skip set.
  const repo = fakeRepo(["alpha"], "1.0.0");
  const a = skArea();
  assert.equal(runSK(repo, a.tgt, a.settings, ["--yes"]).status, 0);
  const vendorDir = join(repo, ".claude", "skills", "alpha", "vendor");
  mkdirSync(vendorDir, { recursive: true });
  writeFileSync(join(vendorDir, "big.txt"), "CC-BY-SA text that only exists on some machines\n");
  assert.equal(runSK(repo, a.tgt, a.settings, ["--check"]).status, 0, "a change under a skipped subdir must NOT read as drift");
  assert.match(runSK(repo, a.tgt, a.settings, ["--yes"]).out, /nothing to change/i);
});

test("an unreadable skills source fails closed and does NOT wipe the mirror (V1, discriminating)", () => {
  const repo = fakeRepo(["alpha", "beta"]);
  const a = skArea();
  assert.equal(runSK(repo, a.tgt, a.settings, ["--yes"]).status, 0);
  // make the repo's skills dir unreadable: replace it with a FILE so readdirSync throws (portable across OSes)
  rmSync(join(repo, ".claude", "skills"), { recursive: true, force: true });
  writeFileSync(join(repo, ".claude", "skills"), "not a directory");
  const r = runSK(repo, a.tgt, a.settings, ["--yes"]);
  assert.notEqual(r.status, 0, "an unreadable source must fail closed, not exit 0");
  assert.ok(existsSync(join(a.tgt, "alpha", "SKILL.md")), "alpha must NOT be wiped by a source read error");
  assert.ok(existsSync(join(a.tgt, "beta", "SKILL.md")), "beta must NOT be wiped by a source read error");
});

// --- PR4: --check / canary truthfulness (#135, #136, #137, #138) -------------------------------------------

// #137: the drift fix-command names the REAL script path and the scope it checked, not bootstrap/scripts/...
test("ISSUE-137: --check drift prints the real esk-init path and the scope checked", () => {
  const r = run(["--check"]); // fresh (uninstalled) target -> drift
  assert.equal(r.status, 1);
  assert.match(r.out, /skills[/\\]bootstrap[/\\]scripts[/\\]esk-init\.mjs/, "fix command must use the real .claude/skills path");
  assert.match(r.out, /repo \(\.\/\.claude\) scope|personal \(~\/\.claude\) scope/, "must name the scope it checked");
});

// #136: --check from a DIFFERENT clone than the hook was installed from reports drift (not a false OK).
test("ISSUE-136: --check from a clone the hook does not point at reports drift", () => {
  const { settings } = run(["--yes"]);             // installs from REPO; marker.repo = REPO
  const other = fakeSkillsRepo();                   // a different clone
  const r = runOn(settings, ["--check"], other);   // --check as if from the other clone
  assert.equal(r.status, 1, "must drift when the hook points at a different clone");
  assert.match(r.out, /different clone/);
});

// #135: --check reports drift when this clone has uncommitted always-on/ edits (unreleased text would ship).
test("ISSUE-135: --check reports drift on uncommitted always-on/ edits", (t) => {
  if (spawnSync("git", ["--version"]).status !== 0) { t.skip("git unavailable"); return; }
  const repo = fakeSkillsRepo();
  gitInit(repo);
  spawnSync("git", ["-C", repo, "add", "-A"]);
  spawnSync("git", ["-C", repo, "-c", "user.email=t@t", "-c", "user.name=t", "commit", "-qm", "init"]);
  const settings = join(repo, ".claude", "settings.json");
  assert.equal(runOn(settings, ["--yes"], repo).status, 0, "install should succeed on a clean clone");
  const em = join(repo, "always-on", "emit-directive.mjs");
  writeFileSync(em, readFileSync(em, "utf8") + "\n// dirty-for-test\n"); // harmless; emitter still works
  const r = runOn(settings, ["--check"], repo);
  assert.equal(r.status, 1, "uncommitted always-on/ edits must drift");
  assert.match(r.out, /uncommitted changes under always-on/);
});

// #138: the canary runs the CONFIGURED hook entry, so a broken emitter the entry points at is caught by --check.
test("ISSUE-138: --check canary runs the configured entry and catches a broken emitter", () => {
  const repo = fakeSkillsRepo();
  const settings = join(repo, ".claude", "settings.json");
  assert.equal(runOn(settings, ["--yes"], repo).status, 0, "install should succeed");
  writeFileSync(join(repo, "always-on", "emit-directive.mjs"), "process.exit(3);\n"); // break the configured hook target
  const r = runOn(settings, ["--check"], repo);
  assert.equal(r.status, 1, "a broken configured hook command must fail the canary");
  assert.match(r.out, /hook command/, "the drift must name the configured hook command");
});

// --- ISSUE-130: a reconcile never silently deletes local content under a mirrored skill, re-mirrors only -----
// changed skills, and --check --skills sees a drifted TARGET copy.
function skillsSource(names) {
  const dir = mkdtempSync(join(tmpdir(), "esk-skillsrc-"));
  cpSync(join(REPO, "always-on"), join(dir, "always-on"), { recursive: true }); // a REAL emitter so the canary passes
  writeFileSync(join(dir, "package.json"), JSON.stringify({ name: "skills", version: VERSION }) + "\n");
  for (const n of names) {
    mkdirSync(join(dir, ".claude", "skills", n), { recursive: true });
    writeFileSync(join(dir, ".claude", "skills", n, "SKILL.md"), `---\nname: ${n}\n---\n# ${n}\n`);
  }
  return dir;
}
function installSkills(src, target) {
  const settings = join(src, ".claude", "settings.json");
  const r = spawnSync(process.execPath, [ESK, "--repo", src, "--settings", settings, "--yes", "--skills", "--skills-target", target], { encoding: "utf8" });
  return { status: r.status, out: (r.stdout || "") + (r.stderr || ""), settings };
}

test("ISSUE-130: a CLEAN, source-unchanged skill is left untouched (no spurious backup) when a DIFFERENT skill changes", () => {
  // Only beta's source changes; alpha is a clean mirror and its source is unchanged. alpha must NOT be re-mirrored
  // or backed up - a reconcile touches only what changed, and the backup path must never fire for a clean target
  // (that would be noise and would mean clean/stale copies are mis-read as diverged). A diverged skill IS backed
  // up and re-mirrored - that is covered by the next test and the pre-signature test.
  const src = skillsSource(["alpha", "beta"]);
  const target = mkdtempSync(join(tmpdir(), "esk-tgt-"));
  assert.equal(installSkills(src, target).status, 0);
  writeFileSync(join(src, ".claude", "skills", "beta", "SKILL.md"), "---\nname: beta\n---\n# beta changed\n"); // only beta's source changes
  const r = installSkills(src, target);
  assert.equal(r.status, 0, r.out);
  assert.equal(readdirSync(target).filter((n) => n.startsWith("alpha.esk-local-")).length, 0, "a clean, unchanged skill must not get a spurious backup: " + r.out);
  assert.match(readFileSync(join(target, "alpha", "SKILL.md"), "utf8"), /#\s*alpha/, "alpha's content stays its clean source");
});

test("ISSUE-130: a local file inside a skill that IS re-mirrored is BACKED UP, not deleted (discriminating)", () => {
  const src = skillsSource(["alpha", "beta"]);
  const target = mkdtempSync(join(tmpdir(), "esk-tgt-"));
  assert.equal(installSkills(src, target).status, 0);
  writeFileSync(join(target, "alpha", "LOCAL-notes.md"), "team notes\n");                                       // local addition inside alpha
  writeFileSync(join(src, ".claude", "skills", "alpha", "SKILL.md"), "---\nname: alpha\n---\n# alpha changed\n"); // alpha's source changes -> alpha is re-mirrored
  const r = installSkills(src, target);
  assert.equal(r.status, 0, r.out);
  assert.match(readFileSync(join(target, "alpha", "SKILL.md"), "utf8"), /alpha changed/, "alpha was re-mirrored to the new source");
  const backups = readdirSync(target).filter((n) => n.startsWith("alpha.esk-local-"));
  assert.equal(backups.length, 1, "the diverged target must be backed up before replacing: " + r.out);
  assert.ok(existsSync(join(target, backups[0], "LOCAL-notes.md")), "the local file must be preserved in the backup");
});

test("ISSUE-130: --check --skills reports a mirrored skill whose TARGET copy drifted from what was installed (discriminating)", () => {
  const src = skillsSource(["alpha", "beta"]);
  const target = mkdtempSync(join(tmpdir(), "esk-tgt-"));
  const { settings } = installSkills(src, target);
  const checkArgs = [ESK, "--repo", src, "--settings", settings, "--check", "--skills", "--skills-target", target];
  assert.equal(spawnSync(process.execPath, checkArgs, { encoding: "utf8" }).status, 0, "clean install must pass --check --skills");
  writeFileSync(join(target, "alpha", "SKILL.md"), "---\nname: alpha\n---\n# a stale/older copy\n"); // target drifts; source unchanged
  const r = spawnSync(process.execPath, checkArgs, { encoding: "utf8" });
  const out = (r.stdout || "") + (r.stderr || "");
  assert.equal(r.status, 1, "a drifted TARGET copy must be reported, not read as OK: " + out);
  assert.match(out, /on disk differ|alpha/, out);
});

// --- ISSUE-130 review findings: the data-loss guarantee must hold on the transitions the first cut missed ----
test("ISSUE-130 (review F1): first reconcile after a PRE-SIGNATURE marker backs up local content, not delete it (discriminating)", () => {
  const src = skillsSource(["alpha", "beta"]);
  const target = mkdtempSync(join(tmpdir(), "esk-tgt-"));
  installSkills(src, target);
  // Simulate an install from a version that recorded skills.names but NOT skills.signatures (every earlier install).
  const markerPath = join(src, ".claude", ".esk-installed");
  const m = JSON.parse(readFileSync(markerPath, "utf8"));
  delete m.skills.signatures;
  writeFileSync(markerPath, JSON.stringify(m, null, 2));
  writeFileSync(join(target, "alpha", "LOCAL-notes.md"), "team notes\n"); // local addition; SOURCE unchanged
  const r = installSkills(src, target);
  assert.equal(r.status, 0, r.out);
  const backups = readdirSync(target).filter((n) => n.startsWith("alpha.esk-local-"));
  assert.equal(backups.length, 1, "a pre-signature reconcile must back up the diverged target (no baseline to compare): " + r.out);
  assert.ok(existsSync(join(target, backups[0], "LOCAL-notes.md")), "the local file must be preserved in the backup");
});

test("ISSUE-130 (review F2): --check --skills drift is cleared by --yes (self-healing, discriminating)", () => {
  const src = skillsSource(["alpha", "beta"]);
  const target = mkdtempSync(join(tmpdir(), "esk-tgt-"));
  const { settings } = installSkills(src, target);
  const checkArgs = [ESK, "--repo", src, "--settings", settings, "--check", "--skills", "--skills-target", target];
  writeFileSync(join(target, "alpha", "SKILL.md"), "---\nname: alpha\n---\n# hand-edited\n"); // target drifts; source unchanged
  assert.equal(spawnSync(process.execPath, checkArgs, { encoding: "utf8" }).status, 1, "a drifted target must be reported red");
  assert.equal(installSkills(src, target).status, 0, "--yes must succeed");
  assert.equal(spawnSync(process.execPath, checkArgs, { encoding: "utf8" }).status, 0, "--yes must CLEAR the drift (the gate's own remedy must work)");
  assert.ok(readdirSync(target).some((n) => n.startsWith("alpha.esk-local-")), "the hand-edit must have been backed up, not lost");
});

test("ISSUE-130 (review F3): a present-but-unreadable target STOPS the reconcile instead of replacing it", () => {
  // Portable guard: chmod 000 enforces on POSIX (Linux CI as a non-root user); on Windows/root it is a no-op, so
  // the case cannot be exercised here and is honestly skipped. The die still ships and is proven on CI.
  const src = skillsSource(["alpha"]);
  const target = mkdtempSync(join(tmpdir(), "esk-tgt-"));
  installSkills(src, target);
  writeFileSync(join(src, ".claude", "skills", "alpha", "SKILL.md"), "---\nname: alpha\n---\n# changed\n"); // force a reconcile of alpha
  const alphaDir = join(target, "alpha");
  let enforced = false;
  try { chmodSync(alphaDir, 0o000); try { readdirSync(alphaDir); } catch { enforced = true; } } catch { /* chmod not permitted here */ }
  if (!enforced) { try { chmodSync(alphaDir, 0o755); } catch { /* best-effort */ } return; } // honest skip
  const r = installSkills(src, target);
  try { chmodSync(alphaDir, 0o755); } catch { /* best-effort: restore so cleanup can remove it */ }
  assert.notEqual(r.status, 0, "an unreadable target must stop the run, not be replaced blindly: " + r.out);
});

// --- ISSUE-140: --help / -h print usage and exit 0; an unknown flag (typo) is rejected, not silently ignored ---
test("ISSUE-140: --help prints usage and exits 0 without acting", () => {
  const r = spawnSync(process.execPath, [ESK, "--help"], { encoding: "utf8" });
  assert.equal(r.status, 0, (r.stdout || "") + (r.stderr || ""));
  assert.match(r.stdout, /Usage:/);
});
test("ISSUE-140: a typo'd flag (--persnal) is rejected with exit 2, not fallen back to repo scope", () => {
  const dir = mkdtempSync(join(tmpdir(), "esk-help-"));
  const r = spawnSync(process.execPath, [ESK, "--repo", REPO, "--settings", join(dir, ".claude", "settings.json"), "--persnal", "--yes"], { encoding: "utf8" });
  assert.equal(r.status, 2, "an unknown flag must fail closed, so a scope typo can't silently pick the wrong target");
  assert.match((r.stdout || "") + (r.stderr || ""), /unknown flag/);
});

test("ISSUE-140: the documented --dry-run alias is still accepted (plan mode, exit 0, writes nothing)", () => {
  // esk-init's header documents --dry-run as a no-op alias for the default plan mode; the unknown-flag guard
  // must not reject it (judge-arch finding). Discriminating: dropping --dry-run from KNOWN makes this exit 2.
  const dir = mkdtempSync(join(tmpdir(), "esk-dry-"));
  const settings = join(dir, ".claude", "settings.json");
  const r = spawnSync(process.execPath, [ESK, "--repo", REPO, "--settings", settings, "--dry-run"], { encoding: "utf8" });
  assert.equal(r.status, 0, (r.stdout || "") + (r.stderr || ""));
  assert.equal(existsSync(settings), false, "--dry-run must write nothing (it is the plan-only default)");
});
