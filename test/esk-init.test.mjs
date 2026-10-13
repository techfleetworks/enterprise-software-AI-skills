// Discriminating tests for .claude/skills/bootstrap/scripts/esk-init.mjs — the always-on installer.
// It must: plan without writing; install both hooks + marker; be idempotent; merge additively
// (preserve other settings); detect version drift; back up and RESTORE on a failed canary; and fail
// closed on a bad target. The real repo is used as --repo for the happy path; a fake repo with a
// broken emitter drives the restore-on-failure case.
import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtempSync, writeFileSync, mkdirSync, existsSync, readFileSync, readdirSync, rmSync } from "node:fs";
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
