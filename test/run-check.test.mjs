// Discriminating tests for always-on/run-check.mjs (issue #183).
//
// The load-bearing cases, each of which a no-op or a naive rewrite of run-check flips:
//   - a MISSING checker must BLOCK (exit 2) and name the install path, never skip or pass;
//   - a checker that TIMES OUT must BLOCK (exit 2) as a timeout, never a pass;
//   - a checker that FAILS must surface its real exit (exit 1), which a `| tail` pipe would have hidden as 0;
//   - an unsafe skill/script name must BLOCK before any filesystem access (no path traversal);
//   - a passing checker resolved from an UNRELATED working folder still runs (location-free resolution).
import { test } from "node:test";
import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import { writeFileSync, mkdtempSync, mkdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const REPO = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const RUNNER = join(REPO, "always-on", "run-check.mjs");
const REAL_SKILLS = join(REPO, ".claude", "skills");

// Run run-check.mjs; return { code, out } with stdout+stderr merged. cwd defaults to a throwaway dir so the
// test proves resolution does NOT depend on the current folder.
function run(args, cwd) {
  const dir = cwd || mkdtempSync(join(tmpdir(), "run-check-cwd-"));
  try {
    const out = execFileSync(process.execPath, [RUNNER, ...args], { cwd: dir, stdio: "pipe", encoding: "utf8" });
    return { code: 0, out };
  } catch (e) {
    return { code: e.status ?? 1, out: (e.stdout || "") + (e.stderr || "") };
  }
}

// Build a temp skills root holding one fake skill with one scripts/<name> checker of the given body.
function fakeSkills({ skill = "demo-skill", script = "checker.mjs", body = "process.exit(0)" } = {}) {
  const rootsParent = mkdtempSync(join(tmpdir(), "run-check-skills-"));
  const skillsDir = join(rootsParent, "skills");
  mkdirSync(join(skillsDir, skill, "scripts"), { recursive: true });
  writeFileSync(join(skillsDir, skill, "scripts", script), body);
  return { skillsDir, skill, script };
}

test("which: resolves an existing REAL checker from an unrelated folder (exit 0, absolute path)", () => {
  const r = run(["which", "architectural-decision-records", "check_adr.sh", "--skills-dir", REAL_SKILLS]);
  assert.equal(r.code, 0, r.out);
  assert.match(r.out.trim(), /check_adr\.sh$/);
});

test("run: a passing checker resolved via --skills-dir runs and reports OK with an evidence hash (exit 0)", () => {
  const { skillsDir, skill, script } = fakeSkills({ body: "console.log('all good'); process.exit(0)" });
  const r = run(["run", skill, script, "--skills-dir", skillsDir]);
  assert.equal(r.code, 0, r.out);
  assert.match(r.out, /all good/);
  assert.match(r.out, /\[run-check\] OK/);
  assert.match(r.out, /checker-output-sha256=/);
});

test("run: a checker that FAILS surfaces exit 1 (NOT masked to 0 the way `| tail` would) - discriminating", () => {
  const { skillsDir, skill, script } = fakeSkills({ body: "console.log('2 problems found'); process.exit(1)" });
  const r = run(["run", skill, script, "--skills-dir", skillsDir]);
  assert.equal(r.code, 1, r.out); // a naive `checker | tail` would have exited 0 here
  assert.match(r.out, /2 problems found/);
});

test("run: a MISSING checker BLOCKS (exit 2) and names the install command - discriminating", () => {
  const { skillsDir, skill } = fakeSkills({ script: "present.mjs" });
  const r = run(["run", skill, "absent.mjs", "--skills-dir", skillsDir]);
  assert.equal(r.code, 2, r.out);
  assert.match(r.out, /BLOCK/);
  assert.match(r.out, /esk-init\.mjs/);
});

test("run: a skill that is NOT installed BLOCKS (exit 2) and names the install command", () => {
  const { skillsDir } = fakeSkills();
  const r = run(["run", "no-such-skill", "checker.mjs", "--skills-dir", skillsDir]);
  assert.equal(r.code, 2, r.out);
  assert.match(r.out, /not installed/);
  assert.match(r.out, /esk-init\.mjs/);
});

test("run: a checker that TIMES OUT BLOCKS as a timeout (exit 2), never a pass - discriminating", () => {
  // Hangs ~10s; the 500ms limit must stop it and report a timeout.
  const { skillsDir, skill, script } = fakeSkills({ body: "setTimeout(() => {}, 10000)" });
  const r = run(["run", skill, script, "--skills-dir", skillsDir, "--timeout-ms", "500"]);
  assert.equal(r.code, 2, r.out);
  assert.match(r.out, /TIMEOUT|did not finish/);
});

test("unsafe skill name with a path separator or .. BLOCKS before any filesystem access (exit 2)", () => {
  for (const bad of ["../evil", "foo/bar", ".."]) {
    const r = run(["which", bad, "check.mjs", "--skills-dir", REAL_SKILLS]);
    assert.equal(r.code, 2, `${bad}: ${r.out}`);
    assert.match(r.out, /unsafe skill name/);
  }
});

test("unsafe script name with a path separator BLOCKS (exit 2)", () => {
  const r = run(["which", "architectural-decision-records", "scripts/check_adr.sh", "--skills-dir", REAL_SKILLS]);
  assert.equal(r.code, 2, r.out);
  assert.match(r.out, /unsafe script name/);
});

test("an unsupported checker extension BLOCKS (exit 2)", () => {
  const r = run(["which", "demo", "notes.txt", "--skills-dir", REAL_SKILLS]);
  assert.equal(r.code, 2, r.out);
  assert.match(r.out, /unsupported checker/);
});

test("an unknown command BLOCKS (exit 2)", () => {
  const r = run(["frobnicate", "a", "b.mjs"]);
  assert.equal(r.code, 2, r.out);
  assert.match(r.out, /unknown command/);
});

test("no command at all is a usage error (exit 2, fail closed)", () => {
  const r = run([]);
  assert.equal(r.code, 2, r.out);
  assert.match(r.out, /usage:/);
});

test("--help prints usage and exits 0", () => {
  const out = execFileSync(process.execPath, [RUNNER, "--help"], { encoding: "utf8" });
  assert.match(out, /usage:/);
});

test("pass-through args after -- reach the checker and are not parsed as our options", () => {
  const { skillsDir, skill, script } = fakeSkills({
    body: "console.log('argv:' + process.argv.slice(2).join(',')); process.exit(0)",
  });
  const r = run(["run", skill, script, "--skills-dir", skillsDir, "--", "--max-grade", "7"]);
  assert.equal(r.code, 0, r.out);
  assert.match(r.out, /argv:--max-grade,7/);
});

// The pipe hazard this runner exists to defeat, pinned as a characterization: a shell pipe reports the LAST
// command's exit, so a failing checker piped into another command reads as success. run-check never pipes, so
// its failing-checker test above returns 1 where this returns 0. (Tolerant: some shells/configs differ.)
test("characterization: a shell pipe hides a failing checker's exit code (the bug run-check avoids)", () => {
  const piped = spawnSync(`"${process.execPath}" -e "process.exit(1)" | sort`, { shell: true, encoding: "utf8" });
  // The pipe's status is the tail command's (0), not the failing node's (1): that is exactly the masking.
  assert.notEqual(piped.status, 1, `expected the pipe to mask exit 1, got status ${piped.status}`);
});
