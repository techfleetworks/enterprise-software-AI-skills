// Step definitions for issue #183's scenarios in features/always-on/skills-formula-every-task.feature and
// features/always-on/skills-apply-every-task.feature.
//
// Every scenario drives the REAL always-on/run-check.mjs against a sandboxed skills dir, so the behavior is
// executed, not narrated: a selected skill that is not installed, a checker that is missing from the current
// folder, and a checker that runs past its time limit must each make run-check BLOCK (exit 2). A no-op
// run-check (always exit 0), or one that skipped a missing checker, flips all three "does not continue /
// does not end" assertions. The Background steps set up the sandbox and record the preconditions that the
// sibling runtime issues (#174 finish check, #175 edit-time load, #177 task records) build on.
import { mkdtempSync, mkdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";
import assert from "node:assert/strict";

const REPO = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..");
const RUNNER = join(REPO, "always-on", "run-check.mjs");

function runCheck(args, cwd) {
  const r = spawnSync(process.execPath, [RUNNER, ...args], { cwd, encoding: "utf8" });
  return { status: r.status, out: (r.stdout || "") + (r.stderr || "") };
}
function installSkillFolder(skillsDir, skill) {
  mkdirSync(join(skillsDir, skill, "scripts"), { recursive: true });
}
function installChecker(skillsDir, skill, script, body) {
  installSkillFolder(skillsDir, skill);
  writeFileSync(join(skillsDir, skill, "scripts", script), body);
}

export default function ({ Given, When, Then, And }) {
  // --- Background (shared) ---
  Given(/^the enterprise skills enforcement is installed for this machine$/, (world) => {
    // A sandboxed skills dir (the "installed" skills) plus an unrelated work folder, so resolution is proven
    // not to depend on the current folder. --skills-dir pins run-check to this sandbox.
    const base = mkdtempSync(join(tmpdir(), "esk183-skills-"));
    world.skillsDir = join(base, "skills");
    mkdirSync(world.skillsDir, { recursive: true });
    world.workDir = mkdtempSync(join(tmpdir(), "esk183-work-"));
    world.enforcementInstalled = true;
  });
  And(/^the skill router maps file patterns to the skills and artifacts they require$/, (world) => {
    // The router (issue #175) maps a changed file to the skills it requires. This slice proves the load/run
    // gate; run-check is the front door that blocks when a required skill or checker cannot be loaded.
    world.router = "file-patterns";
  });
  And(/^the skill router maps changed files to the skills that must apply to them$/, (world) => {
    world.router = "changed-files";
  });
  And(/^every task keeps a task record outside the work folder$/, (world) => {
    // Task records live outside the work folder (issue #177); recorded here as the precondition this slice runs under.
    world.taskRecordOutsideWork = true;
  });

  // --- Scenario: a selected skill that cannot be loaded blocks the task ---
  Given(/^the folder for a selected skill is missing on this machine$/, (world) => {
    // A real skill name, deliberately NOT installed into the sandbox, so its folder is missing.
    world.skill = "release-deployment-safety";
    world.script = "check-migration-safety.mjs";
  });
  When(/^the agent tries to load it$/, (world) => {
    // Loading a skill to use its checker means resolving that checker; run-check is the gate for that.
    world.res = runCheck(["which", world.skill, world.script, "--skills-dir", world.skillsDir], world.workDir);
  });
  Then(/^the task does not continue$/, (world) => {
    assert.equal(world.res.status, 2, `a selected skill that cannot load must BLOCK the task (exit 2)\n${world.res.out}`);
  });
  And(/^the operator is told which skill is missing and the command that installs it$/, (world) => {
    assert.match(world.res.out, new RegExp(world.skill), `the message must name the missing skill\n${world.res.out}`);
    assert.match(world.res.out, /esk-init\.mjs/, `the message must name the install command\n${world.res.out}`);
  });

  // --- Scenario: a missing checker blocks the finish instead of being skipped ---
  Given(/^a skill's checker script cannot be found from the current folder$/, (world) => {
    // The skill folder is installed, but its checker script is NOT, so the skill loads and the checker is missing.
    world.skill = "architectural-decision-records";
    world.script = "check_adr.sh";
    installSkillFolder(world.skillsDir, world.skill);
  });
  When(/^the agent tries to end a task that needs that checker$/, (world) => {
    world.res = runCheck(["run", world.skill, world.script, "--skills-dir", world.skillsDir], world.workDir);
  });
  Then(/^the turn does not end$/, (world) => {
    assert.equal(world.res.status, 2, `a missing or timed-out checker must BLOCK the finish (exit 2)\n${world.res.out}`);
  });
  And(/^the agent is told the full path where the checker is installed$/, (world) => {
    assert.match(world.res.out, /scripts[/\\]check_adr\.sh/, `the message must name the full checker path\n${world.res.out}`);
  });

  // --- Scenario: a checker that runs past its time limit counts as a failure ---
  Given(/^a receipt checker that does not finish within its time limit$/, (world) => {
    world.skill = "demo-receipt-skill";
    world.script = "slow-check.mjs";
    installChecker(world.skillsDir, world.skill, world.script, "setTimeout(() => {}, 10000)"); // hangs ~10s
    world.timeoutMs = "500";
  });
  When(/^the agent tries to end its turn$/, (world) => {
    world.res = runCheck(
      ["run", world.skill, world.script, "--skills-dir", world.skillsDir, "--timeout-ms", world.timeoutMs],
      world.workDir,
    );
  });
  // "Then the turn does not end" is shared with the missing-checker scenario (defined once above).
  And(/^the agent is told the checker timed out, not that the receipt passed$/, (world) => {
    assert.match(world.res.out, /timeout|did not finish/i, `the message must say it timed out\n${world.res.out}`);
    assert.doesNotMatch(world.res.out, /OK - .*passed/, `a timeout must NOT be reported as a pass\n${world.res.out}`);
  });
}
