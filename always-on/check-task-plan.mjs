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
//   node check-task-plan.mjs plan      --selection <file.json> --plans <file.json> --skills-dir <dir>
//
// Exit 0 = the step is satisfied. Exit 2 = HOLD / fail closed (a missing verdict or reason, a router-required
// skill marked not-applicable without an operator waiver, a selected skill whose text was not loaded this
// session, a required planning record that is missing or incomplete, or malformed input). A hold blocks the
// edit; there is no soft failure.
//
// Dependency-free, offline. Reuses the versioned router (routing-lib.mjs), a sibling. The plan mode does a fast
// structural check of each planning record (the deep ADR gate stays check_adr; this is the edit-time pre-check).
import { readFileSync, existsSync, statSync, readdirSync } from "node:fs";
import { resolve, join } from "node:path";
import { createHash } from "node:crypto";
import { loadRoutingConfig, requiredSkillsForPaths } from "./routing-lib.mjs";

const VERDICTS = new Set(["required", "applies", "not-applicable"]);
const SAFE_NAME = /^[A-Za-z0-9._-]+$/;
// Which skills define a step-3 planning record. A required/applies skill here must have its record complete
// before a source edit. The other skills apply through tests and review, not a distinct planning document.
const SKILL_TO_RECORD = {
  "pattern-selector": "pattern-decision",
  "owasp-secure-coding-bdd": "threat-model",
  "bdd-comprehensive-testing": "bdd-matrix",
  "architectural-decision-records": "adr",
  "compliance-data-lifecycle": "data-lifecycle",
  "release-deployment-safety": "reversibility",
  "sre-operational-readiness": "service-readiness",
  "enterprise-architecture-standards": "arch-standards",
  "universal-accessibility-wcag": "a11y-verdict",
  "universal-browser-device-support": "browser-verdict",
  "usability-ux-universal-design": "usability-verdict",
};
const isSafeName = (v) => SAFE_NAME.test(v) && v !== "." && v !== "..";
const sha256 = (buf) => createHash("sha256").update(buf).digest("hex");

const argv = process.argv.slice(2);
const mode = argv[0];
const opt = (n, d) => { const i = argv.indexOf(n); return i >= 0 && argv[i + 1] !== undefined && !argv[i + 1].startsWith("--") ? argv[i + 1] : d; };
const parseList = (s) => (s == null ? null : String(s).split(",").map((x) => x.trim().split("\\").join("/")).filter(Boolean));

const USAGE = `check-task-plan - validate a task's skill selection, load state, and planning records (issue #175).
  node check-task-plan.mjs selection --selection <file.json> --skills-dir <dir> [--changed-list <csv>] [--waivers <csv>]
  node check-task-plan.mjs loaded    --selection <file.json> --loaded <state.json> --skills-dir <dir>
  node check-task-plan.mjs plan      --selection <file.json> --plans <file.json> --skills-dir <dir>
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

if (mode === "plan") {
  const skillsDir = resolve(opt("--skills-dir", ".claude/skills"));
  skillSet(skillsDir); // validates the dir
  const sel = selectionObj();
  const plans = loadJson(opt("--plans"), "plans");
  if (!plans || typeof plans !== "object" || Array.isArray(plans)) hold("the plans must be a JSON object of record-type -> record.");

  // Every required/applies skill that defines a planning record must have it, complete, before a source edit.
  const need = Object.entries(sel)
    .filter(([n, e]) => e && (e.verdict === "required" || e.verdict === "applies") && SKILL_TO_RECORD[n])
    .map(([n]) => n);
  for (const name of need) {
    const rt = SKILL_TO_RECORD[name];
    const rec = plans[rt];
    if (rec == null) hold(`skill "${name}" is ${sel[name].verdict} but its ${rt} planning record is missing; the source edit is held until it exists.`);
    const problem = validateRecord(rt, rec);
    if (problem) hold(`skill "${name}": the ${rt} record is incomplete - ${problem}.`);
  }
  console.log(`[check-task-plan] OK - ${need.length} planning record(s) present and complete. A human must still review that the plan is sound.`);
  process.exit(0);
}

hold(`unknown mode "${mode}" (expected selection | loaded | plan). Run with --help.`);

// --- planning-record validators (fast structural checks; the deep ADR gate stays check_adr) ------------------
function str(v) { return typeof v === "string" && v.trim() !== ""; }
function arr(v) { return Array.isArray(v) && v.length > 0; }
function evid(o) { return o && typeof o === "object" && (o.evidenceState === "observed" || o.evidenceState === "proven"); }

function validateRecord(rt, rec) {
  if (rt === "adr") return validateAdr(rec);
  if (rec == null || typeof rec !== "object" || Array.isArray(rec)) return "the record is not an object";
  switch (rt) {
    case "pattern-decision": {
      const req = ["forces", "forcesEvidence", "lifetimeForces", "costOfDeferring", "decision", "pros", "cons", "failurePrevented", "securityTradeoff", "operationalCost", "simplerAlternative", "adoptSafely", "verify", "verificationStatus"];
      for (const f of req) if (!str(rec[f])) return `missing "${f}"`;
      return null;
    }
    case "threat-model": {
      if (!str(rec.surface)) return `missing the surface in scope`;
      if (!arr(rec.threats)) return `names no threats`;
      for (const t of rec.threats) {
        if (!t || !str(t.name)) return `a threat has no name`;
        if (!str(t.category)) return `threat "${t.name}" names no category (e.g. STRIDE)`;
        if (!str(t.cheatSheet)) return `threat "${t.name}" maps to no OWASP cheat sheet`;
        if (!str(t.control)) return `threat "${t.name}" has no control`;
        if (!str(t.scenario)) return `the control for "${t.name}" has no @security scenario (not-assessed, never a pass)`;
      }
      return null;
    }
    case "bdd-matrix": {
      if (!arr(rec.audiences)) return `records no audiences`;
      if (!arr(rec.cells)) return `records no use-case by audience cells`;
      for (const c of rec.cells) {
        if (!c || !str(c.useCase) || !str(c.audience)) return `a matrix cell is missing its use case or audience`;
        if (!str(c.scenario) && !str(c.na)) return `cell "${c.useCase || "?"}/${c.audience || "?"}" is neither a written scenario nor a recorded N/A`;
      }
      return null;
    }
    case "data-lifecycle": {
      if (!str(rec.dataClass)) return `missing the data class`;
      if (!str(rec.retentionBasis)) return `missing the retention basis`;
      if (!rec.deletion || !str(rec.deletion.claim)) return `missing a deletion claim`;
      if (!evid(rec.deletion)) return `the deletion claim must be "observed" or "proven", not inferred`;
      return null;
    }
    case "reversibility": {
      if (!rec.reversibility || !str(rec.reversibility.claim)) return `missing a reversibility claim`;
      if (!evid(rec.reversibility)) return `the reversibility claim must be "observed" or "proven"`;
      if (rec.safeToShip === true && !evid(rec.reversibility)) return `"safe to ship" is claimed while reversibility is below "observed"`;
      return null;
    }
    case "service-readiness": {
      if (!arr(rec.slis)) return `records no service level indicators`;
      if (!arr(rec.alerts)) return `records no alerts`;
      if (!str(rec.runbook)) return `missing a runbook`;
      if (!evid(rec.alertFires)) return `the "an alert fires" claim must be "observed" or "proven"`;
      return null;
    }
    case "a11y-verdict":
    case "browser-verdict":
    case "usability-verdict": {
      if (!str(rec.claim)) return `missing the verdict`;
      if (!evid(rec)) return `each measurable claim must be "observed" or "proven"`;
      return null;
    }
    case "arch-standards": {
      if (!arr(rec.standards)) return `names no standards applied in the code`;
      if (!arr(rec.claims)) return `records no load or resilience claims`;
      for (const c of rec.claims) {
        if (!c || !str(c.claim)) return `a claim is empty`;
        if (!str(c.measurement) && !evid(c)) return `claim "${c.claim}" points to no measurement or test`;
      }
      return null;
    }
    default:
      return `unknown record type "${rt}"`;
  }
}

// ADR: a fast structural pre-check (check_adr is the authoritative gate). rec is a path string, or
// { path, confirmationFiles: [...] }. Catches a missing file, an unfilled placeholder, a missing MADR section,
// and a dead link to a cited confirmation file (the audit's "cites a measurement file that did not exist").
function validateAdr(rec) {
  const path = typeof rec === "string" ? rec : (rec && rec.path);
  if (!str(path)) return `missing the ADR path`;
  const abs = resolve(path);
  if (!existsSync(abs) || !statSync(abs).isFile()) return `the ADR file "${path}" does not exist`;
  const text = readFileSync(abs, "utf8");
  if (/PLACEHOLDER|\bTODO\b|\bTBD\b|\bXXX\b|\{\{/.test(text)) return `the ADR has an unfilled placeholder`;
  if (!/##\s*Context/i.test(text)) return `the ADR has no Context section`;
  if (!/status\s*[:=]/i.test(text)) return `the ADR has no Status`;
  if (!/Considered Options/i.test(text)) return `the ADR names no Considered Options`;
  if (!/##\s*(Consequences|Decision Outcome)/i.test(text)) return `the ADR records no Consequences`;
  const cites = (rec && typeof rec === "object" && Array.isArray(rec.confirmationFiles)) ? rec.confirmationFiles : [];
  for (const f of cites) if (!existsSync(resolve(f))) return `the ADR cites "${f}", which does not exist (dead link)`;
  return null;
}
