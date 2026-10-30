#!/usr/bin/env node
// check-task-plan - validate a task's skill SELECTION and LOAD state before an edit is allowed (issue #175).
//
// The edit-gate (always-on/edit-gate.mjs) holds a source edit until the task has run the first steps of the
// skills formula: 1 select (every skill gets a verdict, router-required ones cannot be self-waived) and 2 load
// (every required/applies skill's text was delivered THIS session, keyed by the skill file's current hash). The
// plan step (step 3) is a separate mode added by PR-B of this issue. This script is the testable core the
// scenarios drive; the hook wraps it.
//
//   node check-task-plan.mjs selection --selection <file.json> --skills-dir <dir> [--changed-list <csv>] [--waivers <csv>]
//   node check-task-plan.mjs loaded    --selection <file.json> --loaded <state.json> --skills-dir <dir>
//
// Exit 0 = the step is satisfied. Exit 2 = HOLD / fail closed (a missing verdict or reason, a router-required
// skill marked not-applicable without an operator waiver, a selected skill whose text was not loaded this
// session, or malformed input). A hold blocks the edit; there is no soft failure.
//
// Dependency-free, offline. Reuses the versioned router (routing-lib.mjs), a sibling.
import { readFileSync, existsSync, statSync, readdirSync } from "node:fs";
import { resolve, join } from "node:path";
import { createHash } from "node:crypto";
import { loadRoutingConfig, requiredSkillsForPaths } from "./routing-lib.mjs";

const VERDICTS = new Set(["required", "applies", "not-applicable"]);
const SAFE_NAME = /^[A-Za-z0-9._-]+$/;
const isSafeName = (v) => SAFE_NAME.test(v) && v !== "." && v !== "..";
const sha256 = (buf) => createHash("sha256").update(buf).digest("hex");

const argv = process.argv.slice(2);
const mode = argv[0];
const opt = (n, d) => { const i = argv.indexOf(n); return i >= 0 && argv[i + 1] !== undefined && !argv[i + 1].startsWith("--") ? argv[i + 1] : d; };
const parseList = (s) => (s == null ? null : String(s).split(",").map((x) => x.trim().split("\\").join("/")).filter(Boolean));

const USAGE = `check-task-plan - validate a task's skill selection and load state (issue #175).
  node check-task-plan.mjs selection --selection <file.json> --skills-dir <dir> [--changed-list <csv>] [--waivers <csv>]
  node check-task-plan.mjs loaded    --selection <file.json> --loaded <state.json> --skills-dir <dir>
exit: 0 satisfied, 2 HOLD / fail closed.`;
if (argv.includes("--help") || argv.includes("-h") || !mode) { console.log(USAGE); process.exit(mode ? 0 : 2); }

// Fail closed = HOLD the edit. One place, so a missing verdict / unloaded skill / self-waive can never pass.
function hold(msg) { console.error(`[check-task-plan] HOLD - ${msg}`); process.exit(2); }

function loadJson(path, label) {
  if (!path) hold(`${label} path is required.`);
  const abs = resolve(path);
  if (!existsSync(abs) || !statSync(abs).isFile()) hold(`${label} not found: ${abs}`);
  try { return JSON.parse(readFileSync(abs, "utf8")); }
  catch (e) { hold(`${label} is not valid JSON: ${e.message}`); }
}

// The directive's skill set: dirs under skills-dir holding a SKILL.md, minus bootstrap (the installer). Derived,
// so it cannot drift from the real skills.
function skillSet(skillsDir) {
  if (!existsSync(skillsDir) || !statSync(skillsDir).isDirectory()) hold(`skills dir not found: ${skillsDir}`);
  let names;
  try {
    names = readdirSync(skillsDir, { withFileTypes: true })
      .filter((e) => e.isDirectory() && e.name !== "bootstrap" && existsSync(join(skillsDir, e.name, "SKILL.md")))
      .map((e) => e.name).sort();
  } catch (e) { hold(`cannot read skills dir ${skillsDir}: ${e.message}`); }
  if (!names.length) hold(`no skills found under ${skillsDir} (fail closed; a read glitch must not look like an empty set).`);
  return names;
}

// Router-required skills for the task's changed files (empty when no --changed-list is given; the empty result
// is a real answer, not "nothing applies").
function routerRequired(changed) {
  if (!changed || !changed.length) return { skills: [], ran: changed != null };
  let cfg;
  try { cfg = loadRoutingConfig(); } catch (e) { hold(e.message); }
  return { skills: requiredSkillsForPaths(changed, cfg), ran: true };
}

const selectionObj = () => {
  const sel = loadJson(opt("--selection"), "selection");
  if (!sel || typeof sel !== "object" || Array.isArray(sel)) hold("the selection must be a JSON object of skill -> {verdict, reason}.");
  for (const name of Object.keys(sel)) if (!isSafeName(name)) hold(`unsafe skill name "${name}" in the selection (no path separators, no traversal).`);
  return sel;
};

if (mode === "selection") {
  const skillsDir = resolve(opt("--skills-dir", ".claude/skills"));
  const skills = skillSet(skillsDir);
  const sel = selectionObj();
  const changed = parseList(opt("--changed-list", null));
  const waivers = new Set(parseList(opt("--waivers", null)) || []);
  const required = routerRequired(changed);

  // 1. completeness: every directive skill has a verdict. A skill left out is the "empty cell" that fails.
  for (const name of skills) {
    const e = sel[name];
    if (!e || !VERDICTS.has(e.verdict)) {
      hold(`skill "${name}" has no verdict in the selection (an omitted or invalid skill is an empty cell: mark it required, applies, or not-applicable with a reason).`);
    }
    // 2. applies / not-applicable must carry a one-line reason tied to the task.
    if (e.verdict !== "required" && (!e.reason || !String(e.reason).trim())) {
      hold(`skill "${name}" is "${e.verdict}" but has no reason (every applies/not-applicable verdict needs a one-line reason).`);
    }
  }
  // 3. a router-required skill cannot be self-waived to not-applicable; only an operator waiver (--waivers) frees it.
  for (const name of required.skills) {
    const e = sel[name];
    if (e && e.verdict === "not-applicable" && !waivers.has(name)) {
      hold(`the router requires "${name}" (a changed file matches a routing rule), so it cannot be marked not-applicable; only the operator can waive a router-required skill.`);
    }
  }
  const rn = required.ran ? `router required ${required.skills.length} skill(s)` : "router not run (no --changed-list)";
  console.log(`[check-task-plan] OK - selection covers all ${skills.length} skill(s) with a verdict and reason; ${rn}. A human must still review the judgment.`);
  process.exit(0);
}

if (mode === "loaded") {
  const skillsDir = resolve(opt("--skills-dir", ".claude/skills"));
  skillSet(skillsDir); // validates the dir; also the source of truth for hashes below
  const sel = selectionObj();
  const loaded = loadJson(opt("--loaded"), "loaded state");
  if (!loaded || typeof loaded !== "object" || Array.isArray(loaded)) hold("the loaded state must be a JSON object of skill -> sha256.");

  // Every skill marked required or applies must have had its CURRENT text delivered this session: loaded[skill]
  // must equal the current sha256 of its SKILL.md. A stale delivery (old hash) does not count, so a skill whose
  // text changed since it was last loaded is treated as not loaded.
  const need = Object.entries(sel).filter(([, e]) => e && (e.verdict === "required" || e.verdict === "applies")).map(([n]) => n);
  for (const name of need) {
    if (!isSafeName(name)) hold(`unsafe skill name "${name}".`);
    const skillFile = join(skillsDir, name, "SKILL.md");
    if (!existsSync(skillFile) || !statSync(skillFile).isFile()) hold(`selected skill "${name}" has no installed SKILL.md at ${skillFile}.`);
    const current = sha256(readFileSync(skillFile));
    if (loaded[name] !== current) {
      hold(`skill "${name}" is "${sel[name].verdict}" but its text was not loaded this session (load it with the Skill tool and redo the steps that depend on it).`);
    }
  }
  console.log(`[check-task-plan] OK - all ${need.length} required/applies skill(s) were loaded this session (current text). A human must still review the work.`);
  process.exit(0);
}

hold(`unknown mode "${mode}" (expected selection | loaded). Run with --help.`);
