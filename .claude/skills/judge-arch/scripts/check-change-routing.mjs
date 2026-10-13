#!/usr/bin/env node
// check-change-routing.mjs - route a change to the disciplines it must carry.
//
// The capstone of "loaded is not obeyed": whatever an agent or dev read or skipped, a change that touches a
// given KIND of surface must ship the artifact that proves the matching discipline ran. This gate maps the
// changed and added files to the artifacts they require (an ADR for a new skill or a schema change, a
// discriminating test for a new gate script, an @security scenario for an auth surface, an a11y verdict for a
// UI change) and fails when a required artifact is not part of the same change, unless the rule is waived with
// a reason. It checks PRESENCE and ROUTING only; the artifact's CORRECTNESS stays with the owning gate named
// in `ownerGate` (check-adr, check-migration-safety, check-has-test, check-security-coverage, and so on). What
// it makes impossible is SILENTLY shipping a kind of change with none of its discipline's output. Choosing the
// RIGHT artifact for a novel surface stays a judgment call for the dev and for judge-arch; each gap you find
// becomes one more rule here, so the judgment shrinks over time.
//
// Usage:
//   node check-change-routing.mjs --changed-list a,b,c [--added-list a,b] [--config <path>] [--waivers <path>]
//
// --changed-list : every path changed in the change (added, modified, renamed). Required.
// --added-list   : the subset newly ADDED. Required only when a triggered rule keys on added paths; pass it
//                  (empty is fine) in CI so an added-keyed rule can never be silently left un-evaluated.
//
// Exit 0 = every triggered rule has its required artifacts (or a valid waiver). Exit 1 = a routing gap.
// Exit 2 = fail closed (bad config or usage, or a rule needs the added set but it was not provided).
// Dependency-free, offline.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const SKILL_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const args = process.argv.slice(2);
const opt = (name, def) => { const i = args.indexOf(name); return i !== -1 && args[i + 1] !== undefined ? args[i + 1] : def; };
const hasFlag = (name) => args.indexOf(name) !== -1;
const die = (code, msg) => { console.error(`check-change-routing: ${msg}`); process.exit(code); };

const CONFIG = path.resolve(opt("--config", path.join(SKILL_DIR, "assets", "routing-rules.config.json")));
const WAIVERS = opt("--waivers", null);
const parseList = (s) => (s == null ? [] : String(s).split(",").map((x) => x.trim().split("\\").join("/")).filter(Boolean));
const changedProvided = hasFlag("--changed-list");
const addedProvided = hasFlag("--added-list");
const changed = parseList(opt("--changed-list", null));
const added = parseList(opt("--added-list", null));

if (!changedProvided) die(2, "no --changed-list given (the files this change touches; fail closed).");
if (changed.length === 0) die(2, "--changed-list is empty (fail closed): a change that touches nothing cannot be evaluated.");

// --- glob to regexp (no deps). ** spans directories; * and ? do not cross a slash. ------------------
function globToRe(glob) {
  const g = String(glob).split("\\").join("/");
  let re = "^";
  for (let i = 0; i < g.length; i++) {
    const c = g[i];
    if (c === "*") {
      if (g[i + 1] === "*") { i++; if (g[i + 1] === "/") { i++; re += "(?:.*/)?"; } else re += ".*"; }
      else re += "[^/]*";
    } else if (c === "?") re += "[^/]";
    else if (".+^${}()|[]".includes(c)) re += "\\" + c;
    else re += c;
  }
  return new RegExp(re + "$");
}
const compile = (globs, where) => globs.map((g) => { try { return globToRe(g); } catch (e) { die(2, `bad glob "${g}" in ${where}: ${e.message}`); } });

// --- config ----------------------------------------------------------------------------------------
let config;
try { config = JSON.parse(fs.readFileSync(CONFIG, "utf8")); }
catch (e) { die(2, `cannot read config ${path.relative(SKILL_DIR, CONFIG)}: ${e.message}`); }
const rules = config && Array.isArray(config.rules) ? config.rules : null;
if (!rules || rules.length === 0) die(2, "config has no 'rules' array, or it is empty (fail closed).");

for (const r of rules) {
  if (!r || typeof r !== "object") die(2, "a rule is not an object (fail closed).");
  if (!r.id) die(2, "a rule has no 'id'.");
  r._when = {};
  for (const k of ["added", "changed"]) {
    if (r.when && r.when[k] != null) {
      if (!Array.isArray(r.when[k])) die(2, `rule "${r.id}": when.${k} must be an array.`);
      r._when[k] = compile(r.when[k], `rule "${r.id}" when.${k}`);
    }
  }
  if (!r._when.added && !r._when.changed) die(2, `rule "${r.id}" has no when.added or when.changed (nothing could trigger it).`);
  if (!Array.isArray(r.requires) || r.requires.length === 0) die(2, `rule "${r.id}" has no 'requires' array (a rule that requires nothing is dead).`);
  for (const req of r.requires) {
    if (!req || typeof req !== "object") die(2, `rule "${r.id}" has a requirement that is not an object (fail closed).`);
    if (!req.artifact) die(2, `rule "${r.id}" has a requirement with no 'artifact' name.`);
    req._req = {};
    for (const k of ["added", "changed"]) {
      if (req[k] != null) {
        if (!Array.isArray(req[k])) die(2, `rule "${r.id}" requirement "${req.artifact}": ${k} must be an array.`);
        req._req[k] = compile(req[k], `rule "${r.id}" requirement "${req.artifact}" ${k}`);
      }
    }
    if (!req._req.added && !req._req.changed) die(2, `rule "${r.id}" requirement "${req.artifact}" has no added/changed globs (it could never be satisfied).`);
  }
}

// A rule (or requirement) that keys on ADDED files cannot be evaluated without the added set. Refuse to run
// rather than let it silently never trigger (which would pass vacuously).
const usesAdded = rules.some((r) => r._when.added || r.requires.some((q) => q._req.added));
if (usesAdded && !addedProvided) {
  die(2, "a rule keys on ADDED files but --added-list was not provided (cannot evaluate; fail closed). Pass --added-list (empty is fine).");
}

// --- waivers: JSON array of { rule, reason, approvedBy, expires }. A valid unexpired waiver suppresses its
// rule's requirements. A present-but-unparseable date fails closed (NaN comparisons are always false, so an
// unparseable date would otherwise be a permanent waiver). -----------------------------------------
const waived = new Map();
const waiverSource = WAIVERS
  ? (() => { try { return JSON.parse(fs.readFileSync(WAIVERS, "utf8")); } catch (e) { die(2, `cannot read waivers ${WAIVERS}: ${e.message}`); } })()
  : (config.waivers != null ? config.waivers : []);
if (!Array.isArray(waiverSource)) die(2, "waivers must be a JSON array.");
for (const [i, w] of waiverSource.entries()) {
  if (!w || typeof w !== "object") die(2, `waiver #${i} is not an object (fail closed).`);
  for (const k of ["rule", "reason", "approvedBy", "expires"]) if (!w[k]) die(2, `waiver #${i} missing required field "${k}" (fail closed).`);
  const exp = new Date(w.expires);
  if (Number.isNaN(exp.getTime())) die(2, `waiver #${i} has an unparseable "expires" date (${w.expires}); fail closed.`);
  if (exp < new Date()) continue; // expired waivers do not count
  waived.set(w.rule, w);
}

// --- evaluate --------------------------------------------------------------------------------------
const matchAny = (res, set) => res.some((re) => set.some((f) => re.test(f)));
const triggeredMatch = (bucket) => (bucket.added && matchAny(bucket.added, added)) || (bucket.changed && matchAny(bucket.changed, changed));

const fired = [];
const waivedFired = [];
const violations = [];
for (const r of rules) {
  if (!triggeredMatch(r._when)) continue;
  if (waived.has(r.id)) { waivedFired.push(r.id); continue; }
  fired.push(r.id);
  for (const req of r.requires) {
    if (!triggeredMatch(req._req)) {
      violations.push({ rule: r.id, artifact: req.artifact, hint: req.hint, ownerGate: req.ownerGate });
    }
  }
}

if (violations.length) {
  console.error(`\ncheck-change-routing FAIL. ${violations.length} routing gap(s) in this change:\n`);
  for (const v of violations) {
    let line = `  x rule "${v.rule}" fired but its required artifact "${v.artifact}" is not part of this change. `;
    if (v.hint) line += `${v.hint}. `;
    if (v.ownerGate) line += `Correctness is checked by ${v.ownerGate}. `;
    line += `Add the artifact to this change, or waive rule "${v.rule}" with a reason.`;
    console.error(line);
  }
  console.error("");
  process.exit(1);
}
const waivedNote = waivedFired.length ? ` ${waivedFired.length} waived (${waivedFired.join(", ")}).` : "";
console.log(`check-change-routing PASS. ${fired.length} rule(s) fired; all required artifacts present.${waivedNote}`);
process.exit(0);
