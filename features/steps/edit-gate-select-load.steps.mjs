// Step definitions for issue #175 PR-A (select + load) in features/always-on/skills-formula-every-task.feature
// (Rules "The formula starts by itself", "Step 1 select", "Step 2 load") and skills-apply-every-task.feature
// (reload-after-compaction, required-skill-cannot-be-self-waived).
//
// Every scenario drives the REAL always-on/edit-gate.mjs, always-on/check-task-plan.mjs, or routing-lib.mjs
// against a sandboxed skills dir (world.skillsDir from the shared Background). A no-op gate or validator (always
// exit 0) flips every "does not run / does not end / empty cell / cannot waive" assertion. The shared steps
// "the turn does not end" and "the agent tries to end its turn" live in checker-fail-closed.steps.mjs; the
// shared "the selection marks 6 skills ..." Given lives in task-receipt.steps.mjs.
import { mkdirSync, writeFileSync, readFileSync } from "node:fs";
import { join, dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import assert from "node:assert/strict";
import { loadRoutingConfig, requiredSkillsForPaths } from "../../always-on/routing-lib.mjs";

const REPO = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..");
const CHECK = join(REPO, "always-on", "check-task-plan.mjs");
const GATE = join(REPO, "always-on", "edit-gate.mjs");
const RELOAD = join(REPO, "always-on", "reload-skills.mjs");
const RECORD = join(REPO, "always-on", "record-load.mjs");
const CFG = loadRoutingConfig();
const sha256 = (buf) => createHash("sha256").update(buf).digest("hex");

// The directive's skills (16 minus bootstrap); the sandbox installs these so the selection validator's derived
// skill set matches what a full selection covers.
const SET = [
  "architectural-decision-records", "arch-encode", "bdd-comprehensive-testing", "compliance-data-lifecycle",
  "comprehensive-test-strategy", "enterprise-architecture-standards", "judge-arch", "owasp-secure-coding-bdd",
  "pattern-selector", "release-deployment-safety", "sre-operational-readiness", "universal-accessibility-wcag",
  "universal-browser-device-support", "usability-ux-universal-design", "verifiable-quality-gates",
];
function installSkill(skillsDir, name) {
  mkdirSync(join(skillsDir, name), { recursive: true });
  writeFileSync(join(skillsDir, name, "SKILL.md"), `# ${name}\n\n## The core rule\n\nGuidance for ${name} with enough words to quote here.\n`);
}
function ensureSkills(world) { for (const n of SET) installSkill(world.skillsDir, n); }
function fullSelection() { const s = {}; for (const n of SET) s[n] = { verdict: "applies", reason: `relevant (${n})` }; return s; }
function hashesOf(skillsDir, names) {
  const h = {};
  for (const n of names) h[n] = sha256(readFileSync(join(skillsDir, n, "SKILL.md")));
  return h;
}
function writeJson(dir, name, obj) { const p = join(dir, name); writeFileSync(p, JSON.stringify(obj)); return p; }
function taskPlan(args) { const r = spawnSync(process.execPath, [CHECK, ...args], { encoding: "utf8" }); return { status: r.status, out: (r.stdout || "") + (r.stderr || "") }; }
function editGate(payload, env) { const r = spawnSync(process.execPath, [GATE], { encoding: "utf8", input: JSON.stringify(payload), env: { ...process.env, ...env } }); return { status: r.status, out: (r.stdout || "") + (r.stderr || "") }; }

export default function ({ Given, When, Then, And }) {
  // --- Rule: the formula starts by itself. An edit before selection is held ---
  Given(/^the agent has not written the skill selection for this task$/, (world) => {
    ensureSkills(world);
    world.selectionPath = join(world.workDir, "no-selection-yet.json"); // deliberately not created
  });
  When(/^the agent tries to edit a source file$/, (world) => {
    world.res = editGate({ tool_name: "Write", tool_input: { file_path: "src/feature.ts" } }, { ESK_SELECTION: world.selectionPath, ESK_SKILLS_DIR: world.skillsDir });
  });
  Then(/^the edit does not run$/, (world) => { assert.equal(world.res.status, 2, `the edit must be held\n${world.res.out}`); });
  And(/^the agent is told to write the skill selection first$/, (world) => { assert.match(world.res.out, /write the skill selection/, world.res.out); });

  // --- Rule: Step 1, select ---
  Given(/^the directive lists the skills that apply to code, user interface and platform changes$/, (world) => { ensureSkills(world); });
  When(/^the agent writes the skill selection$/, (world) => {
    world.selObj = world.selObj || fullSelection();
    const p = writeJson(world.workDir, "selection.json", world.selObj);
    world.res = taskPlan(["selection", "--selection", p, "--skills-dir", world.skillsDir, ...(world.changedListArg || [])]);
  });
  Then(/^every listed skill is marked "required", "applies" or "not-applicable"$/, (world) => { assert.equal(world.res.status, 0, world.res.out); });
  And(/^every "applies" and "not-applicable" carries a one-line reason tied to this task$/, (world) => { assert.match(world.res.out, /covers all/, world.res.out); });

  Given(/^the selection does not mention "compliance-data-lifecycle"$/, (world) => {
    ensureSkills(world);
    world.selObj = fullSelection();
    delete world.selObj["compliance-data-lifecycle"];
  });
  // "the finish check runs" = selection, then (if it passes and a load state is set) the load check. One failure
  // holds the turn. Serves silent-skip (selection fails) and applies-but-not-loaded (load fails).
  When(/^the finish check runs$/, (world) => {
    const selPath = writeJson(world.workDir, "selection.json", world.selObj);
    let r = taskPlan(["selection", "--selection", selPath, "--skills-dir", world.skillsDir, ...(world.changedListArg || [])]);
    if (r.status === 0 && world.loadedState) {
      const lp = writeJson(world.workDir, "loaded.json", world.loadedState);
      r = taskPlan(["loaded", "--selection", selPath, "--loaded", lp, "--skills-dir", world.skillsDir]);
    }
    world.res = r;
  });
  And(/^"compliance-data-lifecycle" is named as an empty cell$/, (world) => {
    assert.match(world.res.out, /compliance-data-lifecycle/, world.res.out);
    assert.match(world.res.out, /empty cell|no verdict/, world.res.out);
  });

  Given(/^the task changes a file under "migrations\/"$/, (world) => { ensureSkills(world); world.routerPaths = ["db/migrations/0001_init.sql"]; });
  When(/^the router runs$/, (world) => { world.required = requiredSkillsForPaths(world.routerPaths, CFG); });
  Then(/^"architectural-decision-records" and "release-deployment-safety" are marked "required"$/, (world) => {
    assert.ok(world.required.includes("architectural-decision-records"), world.required.join(","));
    assert.ok(world.required.includes("release-deployment-safety"), world.required.join(","));
  });
  And(/^the agent cannot mark either one "not-applicable"$/, (world) => {
    const sel = fullSelection();
    sel["architectural-decision-records"] = { verdict: "not-applicable", reason: "self-judged fine" };
    const p = writeJson(world.workDir, "selection.json", sel);
    const r = taskPlan(["selection", "--selection", p, "--skills-dir", world.skillsDir, "--changed-list", world.routerPaths.join(",")]);
    assert.equal(r.status, 2, r.out);
    assert.match(r.out, /only the operator can waive/, r.out);
  });

  Given(/^the task changes 1 line of a code comment$/, (world) => {
    ensureSkills(world);
    world.changedListArg = ["--changed-list", "src/widget.ts"]; // a source file -> router requires test + bdd
    const sel = fullSelection();
    for (const n of SET) sel[n] = { verdict: "not-applicable", reason: "a one-line comment change does not engage this skill" };
    // the router-required source skills cannot be not-applicable, so keep them applies
    for (const n of ["comprehensive-test-strategy", "bdd-comprehensive-testing"]) sel[n] = { verdict: "applies", reason: "source changed" };
    world.selObj = sel;
  });
  When(/^the agent ends the task$/, (world) => {
    const p = writeJson(world.workDir, "selection.json", world.selObj);
    world.res = taskPlan(["selection", "--selection", p, "--skills-dir", world.skillsDir, ...(world.changedListArg || [])]);
  });
  Then(/^a selection covering every skill exists$/, (world) => { assert.equal(world.res.status, 0, world.res.out); });
  And(/^most skills may be "not-applicable", each with its reason$/, (world) => { assert.match(world.res.out, /covers all/, world.res.out); });

  Given(/^the task changes only a file type no routing rule names$/, (world) => {
    ensureSkills(world);
    world.changedListArg = ["--changed-list", "notes.txt"];
    world.selObj = fullSelection();
  });
  Then(/^every skill still has a verdict and a reason$/, (world) => { assert.equal(world.res.status, 0, world.res.out); });
  And(/^the empty router result is recorded, not treated as "nothing applies"$/, () => {
    assert.deepEqual(requiredSkillsForPaths(["notes.txt"], CFG), []); // the router ran and returned empty, a real answer
  });

  Given(/^the agent cannot tell from the task whether personal data is touched$/, (world) => { ensureSkills(world); });
  When(/^it writes the verdict for "compliance-data-lifecycle"$/, (world) => {
    world.verdict = { verdict: "applies", reason: "unsure whether personal data is touched, so applying it" };
    world.selObj = fullSelection();
    world.selObj["compliance-data-lifecycle"] = world.verdict;
    const p = writeJson(world.workDir, "selection.json", world.selObj);
    world.res = taskPlan(["selection", "--selection", p, "--skills-dir", world.skillsDir]);
  });
  Then(/^the verdict is "applies"$/, (world) => { assert.equal(world.verdict.verdict, "applies"); assert.equal(world.res.status, 0, world.res.out); });
  And(/^the reason says what was unclear$/, (world) => { assert.match(world.verdict.reason, /unsure|unclear/i); });

  // --- Rule: Step 2, load. selected-skills-loaded uses the shared "selection marks 6 skills" Given ---
  When(/^the agent reaches the planning step$/, (world) => {
    const names = world.selectionNames;
    const sel = {}; for (const n of names) sel[n] = { verdict: "applies", reason: "relevant" };
    world.loadedState = hashesOf(world.skillsDir, names);
    const sp = writeJson(world.workDir, "selection.json", sel);
    const lp = writeJson(world.workDir, "loaded.json", world.loadedState);
    world.res = taskPlan(["loaded", "--selection", sp, "--loaded", lp, "--skills-dir", world.skillsDir]);
  });
  Then(/^all 6 skill texts were loaded in this session with the Skill tool$/, (world) => { assert.equal(world.res.status, 0, world.res.out); });
  And(/^the task record holds the hash of each loaded skill file$/, (world) => {
    assert.equal(Object.keys(world.loadedState).length, 6);
    for (const h of Object.values(world.loadedState)) assert.match(h, /^[0-9a-f]{64}$/);
  });

  Given(/^the selection marks "verifiable-quality-gates" as "applies"$/, (world) => {
    ensureSkills(world);
    world.selObj = fullSelection();
    world.selObj["verifiable-quality-gates"] = { verdict: "applies", reason: "a test file changed" };
  });
  And(/^that skill's text was never loaded in this session$/, (world) => {
    world.loadedState = hashesOf(world.skillsDir, SET);
    delete world.loadedState["verifiable-quality-gates"]; // delivered everything except vqg
  });
  And(/^the agent is told to load the skill and redo the steps that depend on it$/, (world) => {
    assert.match(world.res.out, /verifiable-quality-gates/, world.res.out);
    assert.match(world.res.out, /redo the steps that depend on it/, world.res.out);
  });

  // --- skills-apply: reload after compaction ---
  Given(/^the agent's context was compacted$/, (world) => { ensureSkills(world); world.selObj = fullSelection(); });
  And(/^"verifiable-quality-gates" was never invoked earlier in this session$/, (world) => {
    // after the compaction only prior-used skills came back; vqg (never invoked) is absent from the load-state
    const h = hashesOf(world.skillsDir, SET);
    delete h["verifiable-quality-gates"];
    world.loadedPath = writeJson(world.workDir, "loaded.json", h);
  });
  When(/^the agent's next edit changes a test file the router maps to "verifiable-quality-gates"$/, (world) => {
    const sp = writeJson(world.workDir, "selection.json", world.selObj);
    // 1. the compact reload clears the selected skills from the load-state and NAMES them to re-load (it cannot
    //    inline 20-35 KB bodies into a 10 KB additionalContext, and must not falsely mark them loaded).
    const reload = spawnSync(process.execPath, [RELOAD], { encoding: "utf8", env: { ...process.env, ESK_SELECTION: sp, ESK_SKILLS_DIR: world.skillsDir, ESK_LOADED: world.loadedPath } });
    world.reloadCtx = (JSON.parse(reload.stdout || "{}").hookSpecificOutput || {}).additionalContext || "";
    // 2. prompted by that notice, the agent genuinely re-loads vqg with the Skill tool; record-load captures it.
    spawnSync(process.execPath, [RECORD], { encoding: "utf8", input: JSON.stringify({ tool_name: "Skill", tool_input: { skill: "verifiable-quality-gates" } }), env: { ...process.env, ESK_LOADED: world.loadedPath, ESK_SKILLS_DIR: world.skillsDir } });
    world.loadedState = JSON.parse(readFileSync(world.loadedPath, "utf8"));
  });
  Then(/^the text of "verifiable-quality-gates" is in the agent's context before the edit runs$/, (world) => {
    assert.match(world.reloadCtx, /verifiable-quality-gates/, "the compact reload must name vqg to re-load");
    const cur = sha256(readFileSync(join(world.skillsDir, "verifiable-quality-gates", "SKILL.md")));
    assert.equal(world.loadedState["verifiable-quality-gates"], cur, "after the genuine re-load, vqg's current text is recorded as loaded (in context)");
  });

  // --- skills-apply: a required skill cannot be self-waived ---
  Given(/^the router requires "architectural-decision-records" because an ADR file changed$/, (world) => {
    ensureSkills(world);
    world.changedListArg = ["--changed-list", "docs/adr/0005-choice.md"];
  });
  And(/^the agent's receipt marks that skill "not-applicable"$/, (world) => {
    world.selObj = fullSelection();
    world.selObj["architectural-decision-records"] = { verdict: "not-applicable", reason: "self-judged not needed" };
    world.endTurn = () => {
      const p = writeJson(world.workDir, "selection.json", world.selObj);
      world.res = taskPlan(["selection", "--selection", p, "--skills-dir", world.skillsDir, ...world.changedListArg]);
    };
  });
  And(/^the agent is told only the operator can waive a skill the router requires$/, (world) => {
    assert.match(world.res.out, /only the operator can waive/, world.res.out);
  });
}
