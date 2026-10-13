#!/usr/bin/env node
// check-security-coverage.mjs - enforce the OWASP selection flow at the OUTCOME.
//
// The idea (like pattern-selector forcing a pattern): a change that touches a security-relevant surface must
// ship the matching @security BDD scenario, or explicitly waive it with a reason. This gate maps the changed
// code to the cheat sheets that apply and fails when the required @security scenario is not in the shared
// feature index. It cannot know the RIGHT cheat sheet by magic (that stays a judgment call for the dev or
// agent and for judge-arch); what it makes impossible is SILENTLY shipping security-relevant code with no
// scenario testing it.
//
// Usage:
//   node check-security-coverage.mjs --features <dir> [--config <path>] [--waivers <path>] <changed-file...>
// Exit 0 = every triggered surface has its scenario (or a valid waiver); 1 = a gap; 2 = fail closed (bad
// config/usage, or a surface triggered but the features dir is unreadable). Dependency-free, offline.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const SKILL_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const args = process.argv.slice(2);
function opt(name, def) { const i = args.indexOf(name); return i !== -1 && args[i + 1] ? args[i + 1] : def; }
const CONFIG = path.resolve(opt("--config", path.join(SKILL_DIR, "assets", "security-coverage.config.json")));
const FEATURES = opt("--features", null);
const WAIVERS = opt("--waivers", null);
const files = args.filter((a, i) => !a.startsWith("--") && !(i > 0 && args[i - 1].startsWith("--")));

function die(code, msg) { console.error(`check-security-coverage: ${msg}`); process.exit(code); }

let config;
try { config = JSON.parse(fs.readFileSync(CONFIG, "utf8")); }
catch (e) { die(2, `cannot read config ${path.relative(SKILL_DIR, CONFIG)}: ${e.message}`); }
const rules = config && Array.isArray(config.rules) ? config.rules : null;
if (!rules || rules.length === 0) die(2, "config has no 'rules' array, or it is empty (fail closed)");

// Compile each rule's content patterns once (fail closed on a bad regex).
for (const r of rules) {
  r._re = (r.contentMatch || []).map((p) => {
    try { return new RegExp(p, "i"); } catch (e) { die(2, `bad contentMatch /${p}/ in rule "${r.surface}": ${e.message}`); }
  });
  if (!r.surface || !Array.isArray(r.requireTags) || r.requireTags.length === 0 || r._re.length === 0) {
    die(2, `rule "${r.surface || "(unnamed)"}" must have surface, >=1 contentMatch, and >=1 requireTags`);
  }
}

// Which surfaces does the changed code touch?
const triggered = new Map(); // surface -> { rule, byFile:Set }
for (const f of files) {
  let body;
  try { body = fs.readFileSync(f, "utf8"); }
  catch (e) { console.error(`check-security-coverage: WARNING cannot read changed file ${f} (${e.message}); not scanned`); continue; }
  for (const r of rules) {
    if (r._re.some((re) => re.test(body))) {
      if (!triggered.has(r.surface)) triggered.set(r.surface, { rule: r, byFile: new Set() });
      triggered.get(r.surface).byFile.add(f);
    }
  }
}

if (triggered.size === 0) {
  console.log(`check-security-coverage - PASS. No security-relevant surface in ${files.length} changed file(s).`);
  process.exit(0);
}

// The @security tags present in the shared feature index.
const haveTags = new Set();
if (FEATURES) {
  let featFiles = [];
  try { featFiles = fs.readdirSync(FEATURES).filter((f) => f.endsWith(".feature")); }
  catch (e) { die(2, `a security surface was triggered but the features dir is unreadable (${FEATURES}): ${e.message}`); }
  for (const ff of featFiles) {
    const text = fs.readFileSync(path.join(FEATURES, ff), "utf8");
    // Gherkin tags may span several lines in the tag block before a Scenario or Feature. Collect every @-token
    // from any contiguous tag block that carries @security, whether the tags are on one line or several.
    let block = [];
    const flush = () => {
      if (block.length) {
        const joined = block.join(" ");
        if (/\B@security\b/.test(joined)) for (const m of joined.matchAll(/@[A-Za-z0-9:_-]+/g)) haveTags.add(m[0]);
        block = [];
      }
    };
    for (const line of text.split("\n")) {
      const t = line.trim();
      if (t.startsWith("@")) block.push(t);
      else flush();
    }
    flush();
  }
} else {
  die(2, "a security surface was triggered but --features <dir> was not given (cannot verify scenarios; fail closed)");
}

// Waivers: a JSON array of { tag, reason, approvedBy, expires } (the machine-readable part of the decision record).
let waived = new Map();
if (WAIVERS) {
  let w;
  try { w = JSON.parse(fs.readFileSync(WAIVERS, "utf8")); } catch (e) { die(2, `cannot read waivers ${WAIVERS}: ${e.message}`); }
  if (!Array.isArray(w)) die(2, "waivers file must be a JSON array");
  for (const [i, x] of w.entries()) {
    for (const k of ["tag", "reason", "approvedBy", "expires"]) if (!x[k]) die(2, `waiver #${i} missing required field "${k}" (fail closed)`);
    // A blank/whitespace/"."/"tbd" reason or approver is no decision: a security surface must not be waivable
    // by a one-char or placeholder reason. Match the bar every other gate in this repo uses.
    const placeholder = (s) => { const t = String(s).trim(); return t.length < 3 || /^(n\/?a|tbd|tba|todo|fixme|placeholder|soon|later|none|unknown|\?+|-+|\.+|x+)$/i.test(t); };
    if (placeholder(x.reason)) die(2, `waiver #${i} has a blank, too-short, or placeholder reason (a real reason is required to waive a security surface)`);
    if (placeholder(x.approvedBy)) die(2, `waiver #${i} has a blank, too-short, or placeholder approvedBy (name a real approver)`);
    const exp = new Date(x.expires);
    // A present-but-unparseable date must fail closed, not become a permanent waiver (NaN comparisons are
    // always false, so `exp < now` would be false and the waiver would silently never expire).
    if (Number.isNaN(exp.getTime())) die(2, `waiver #${i} has an unparseable "expires" date (${x.expires}); fail closed`);
    if (exp < new Date()) continue; // expired waivers do not count
    waived.set(x.tag, x);
  }
}

const violations = [];
for (const [surface, { rule, byFile }] of triggered) {
  for (const tag of rule.requireTags) {
    if (haveTags.has(tag) || waived.has(tag)) continue;
    violations.push(
      `${surface}: ${[...byFile].join(", ")} touches this surface but no @security scenario tagged ${tag} is in the feature index. ` +
      `Apply ${(rule.sheets || []).join(", ") || "the matching"} cheat sheet(s) and add the scenario, or waive ${tag} with a reason.`
    );
  }
}

if (violations.length) {
  console.error(`\ncheck-security-coverage - FAIL. ${violations.length} security surface(s) without a scenario:\n`);
  for (const v of violations) console.error(`  ✖ ${v}`);
  console.error("");
  process.exit(1);
}
console.log(`check-security-coverage - PASS. ${triggered.size} security surface(s) triggered; all have an @security scenario or a valid waiver.`);
process.exit(0);
