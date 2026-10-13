#!/usr/bin/env node
// check-skill-receipt - a change does not ship a credible "I applied the skills" claim unless a grounded,
// complete, append-only receipt proves it. See docs/specs/skill-application-receipt.md and ADR-0038.
//
// For one change (one receipt entry), this gate enforces GROUNDING, not truth:
//   a. Completeness - every skill (derived from .claude/skills, minus bootstrap) has an entry with a valid
//      status (applied | not-applicable). Kills "it never even considered skill X".
//   b. Anchor existence - every `applied` entry's anchors resolve: the cited skill file exists INSIDE the
//      skills dir (path-traversal rejected) and the cited heading is really a heading in it.
//   c. Quote match - every `applied` entry carries >= 1 quote of >= 8 exact words that appears verbatim in
//      one of its cited skill files. The OWASP verbatim gate in reverse: prove you read it.
//   d. Diff binding - every `applied` entry's `where` files are in the actual change diff (needs --changed-list).
//   e. Routing coupling - if a surface rule fires (a UI change, an auth change), the coupled skill(s) must be
//      `applied`, not `not-applicable` (needs --changed-list). Removes the mark-everything-N/A escape.
//   f. Human-review attestation present - the receipts dir carries the verbatim banner and every entry has a
//      `humanReviewed` field a human fills. The gate checks PRESENCE; it never fabricates its truth.
//   g. Fail closed on missing/malformed/incomplete input, and the committed log must be a clean append.
//
// What it CANNOT do: verify the receipt is TRUE (the guidance was really applied) or that it was applied WELL.
// That is irreducible. A grounded receipt plus a HUMAN REVIEW is the guarantee; the gate is only the grounding.
//
//   node check-skill-receipt.mjs [--receipt docs/skill-receipts/log.jsonl] [--change <ref>] \
//        [--changed-list a,b,c] [--skills-dir .claude/skills] [--config <coupling.json>] [--base <base-log>]
//
// --change omitted = validate the LAST entry (the one just appended). --changed-list omitted = diff binding and
// coupling are DISCLOSED as not-checked (they need the diff), the rest still runs. --base omitted = append-only
// disclosed as not-checked unless RECEIPT_REQUIRE_LOG_BASE is set (then it fails closed).
//
// Exit 0 = grounded + complete. Exit 1 = a grounding gap (incomplete, bad anchor, quote miss, diff/coupling,
// history drift). Exit 2 = fail closed (missing/malformed input, invalid status, unknown skill, empty field,
// traversal, bad config). Dependency-free, offline.
import { readFileSync, existsSync, readdirSync, statSync, realpathSync } from "node:fs";
import { resolve, join, dirname, relative, sep } from "node:path";

const MIN_QUOTE_WORDS = 8;
const STATUSES = new Set(["applied", "not-applicable"]);
const BANNER = "This receipt is the agent's self-report. A human must review the work against the diff. It does not prove the work was done or done well.";

const args = process.argv.slice(2);
const opt = (n, d) => { const i = args.indexOf(n); return i >= 0 && args[i + 1] !== undefined ? args[i + 1] : d; };
const die2 = (m) => { console.error(`[check-skill-receipt] FAIL (closed) - ${m}`); process.exit(2); };
const parseList = (s) => (s == null ? null : String(s).split(",").map((x) => x.trim().split("\\").join("/")).filter(Boolean));

const receiptPath = resolve(opt("--receipt", "docs/skill-receipts/log.jsonl"));
const skillsDir = resolve(opt("--skills-dir", ".claude/skills"));
const configPath = resolve(opt("--config", join(skillsDir, "judge-arch", "assets", "skill-receipt.config.json")));
const change = opt("--change", null);
const basePath = opt("--base", null);
const changed = parseList(opt("--changed-list", null)); // null = not provided

// --- the skill set: dirs under skills-dir holding a SKILL.md, minus bootstrap (the installer, not a per-change
// discipline). Derived, so it is accurate by construction and cannot drift from the real skills. --------------
if (!existsSync(skillsDir) || !statSync(skillsDir).isDirectory()) die2(`skills dir not found: ${skillsDir}`);
let skillsReal;
try { skillsReal = realpathSync(skillsDir); } catch (e) { die2(`cannot resolve skills dir ${skillsDir}: ${e.message}`); }
const EXCLUDE = new Set(["bootstrap"]);
let skillSet;
try {
  skillSet = readdirSync(skillsDir, { withFileTypes: true })
    .filter((e) => e.isDirectory() && !EXCLUDE.has(e.name) && existsSync(join(skillsDir, e.name, "SKILL.md")))
    .map((e) => e.name).sort();
} catch (e) { die2(`cannot read skills dir ${skillsDir}: ${e.message}`); }
if (skillSet.length === 0) die2(`no skills found under ${skillsDir} (fail closed; a read glitch must not look like an empty set).`);

// --- the receipt log -----------------------------------------------------------------------------------------
if (!existsSync(receiptPath)) die2(`receipt log not found: ${receiptPath}`);
const raw = readFileSync(receiptPath, "utf8");
if (!raw.trim()) die2(`receipt log is empty: ${receiptPath}`);

// Append-only: the committed log must be a clean append to the base revision. Disclose exactly what was checked.
let logNote;
if (basePath) {
  if (!existsSync(basePath)) die2(`--base given but not found: ${basePath} - cannot verify append-only (fail closed).`);
  const base = readFileSync(basePath, "utf8");
  if (base && !raw.startsWith(base)) { console.error("[check-skill-receipt] FAIL - receipt log is not append-only; a prior entry was edited or removed (history must be immutable)."); process.exit(1); }
  logNote = "append-only verified";
} else if (process.env.RECEIPT_REQUIRE_LOG_BASE) {
  die2("RECEIPT_REQUIRE_LOG_BASE is set but no --base given - cannot verify append-only. In CI pass --base (e.g. git show origin/main:docs/skill-receipts/log.jsonl > base.jsonl).");
} else {
  logNote = "append-only NOT verified (pass --base to check history)";
}

const lines = raw.split(/\r?\n/).filter((l) => l.trim());
let entries;
try { entries = lines.map((l) => JSON.parse(l)); }
catch (e) { die2(`a receipt log line is not valid JSON: ${e.message}`); }

const entry = change ? [...entries].reverse().find((e) => e && e.change === change) : entries[entries.length - 1];
if (!entry) die2(change ? `no receipt whose change == "${change}" (fail closed).` : "no receipt entry found (fail closed).");
if (!entry.change || !String(entry.change).trim()) die2("the receipt entry has no `change` key (fail closed).");
if (!("humanReviewed" in entry)) die2("the receipt entry is missing the required `humanReviewed` field (null is allowed; a human fills it). The gate checks presence, not truth.");
if (!entry.skills || typeof entry.skills !== "object" || Array.isArray(entry.skills)) die2("the receipt entry has no `skills` object (fail closed).");

// --- the human-review banner must be present where a reader sees it ------------------------------------------
const receiptsReadme = join(dirname(receiptPath), "README.md");
const bannerText = existsSync(receiptsReadme) ? readFileSync(receiptsReadme, "utf8") : "";
if (!norm(bannerText).includes(norm(BANNER))) {
  die2(`the human-review banner is not present in ${relative(process.cwd(), receiptsReadme)}. It must carry, verbatim: "${BANNER}"`);
}

// --- coupling config (policy as data): surface globs -> skills that a firing surface forces to `applied` -----
let coupling = [];
if (existsSync(configPath)) {
  let cfg;
  try { cfg = JSON.parse(readFileSync(configPath, "utf8")); } catch (e) { die2(`cannot parse coupling config ${configPath}: ${e.message}`); }
  if (cfg == null || typeof cfg !== "object" || !Array.isArray(cfg.rules)) die2("coupling config must be an object with a `rules` array (fail closed).");
  for (const r of cfg.rules) {
    if (!r || !Array.isArray(r.when) || r.when.length === 0 || !Array.isArray(r.requires) || r.requires.length === 0) die2("a coupling rule needs non-empty `when` and `requires` arrays (fail closed).");
    for (const s of r.requires) if (!skillSet.includes(s)) die2(`coupling rule requires unknown skill "${s}" (not in ${skillsDir}; fail closed).`);
    coupling.push({ id: r.id || r.when.join("|"), when: r.when.map(globToRe), requires: r.requires });
  }
}

const problems = [];
const add = (p) => problems.push(p);

// --- a. completeness + per-entry validity --------------------------------------------------------------------
for (const name of Object.keys(entry.skills)) {
  if (!skillSet.includes(name)) die2(`receipt names unknown skill "${name}" (not a skill under ${skillsDir}; fail closed).`);
}
for (const name of skillSet) {
  const s = entry.skills[name];
  if (!s) { add(`skill "${name}" has no receipt entry (incomplete: every skill must be applied or not-applicable)`); continue; }
  if (!STATUSES.has(s.status)) die2(`skill "${name}" has invalid or missing status "${s.status}" (must be applied | not-applicable; fail closed).`);
  if (!nonEmpty(s.why)) die2(`skill "${name}" has an empty "why" (every entry must say why; fail closed).`);
  if (s.status === "not-applicable") continue; // b/c/d do not apply; only `why` is required (spec 8c)

  // applied: require the grounding fields, non-empty
  for (const k of ["what"]) if (!nonEmpty(s[k])) die2(`applied skill "${name}" has an empty "${k}" (fail closed).`);
  for (const k of ["where", "anchors", "quotes"]) if (!Array.isArray(s[k]) || s[k].length === 0) die2(`applied skill "${name}" needs a non-empty "${k}" array (fail closed).`);

  // b. anchor existence (path-traversal AND symlink-escape rejected), and gather the cited SECTIONS (the text
  // under each cited heading, never the whole file and never the YAML frontmatter) for the quote match. The
  // quote must come from the guidance you cited, not from the description an agent sees without opening the body.
  let citedText = "";
  for (const anchor of s.anchors) {
    const hash = String(anchor).indexOf("#");
    if (hash < 0) die2(`applied skill "${name}": anchor "${anchor}" has no #heading (fail closed).`);
    const relPath = String(anchor).slice(0, hash).trim();
    const headingSlug = String(anchor).slice(hash + 1).trim().toLowerCase();
    const abs = resolve(skillsDir, relPath);
    // path-traversal defense (lexical): the resolved path MUST stay inside the skills dir.
    if (abs !== skillsDir && !abs.startsWith(skillsDir + sep)) die2(`applied skill "${name}": anchor path "${relPath}" resolves outside the skills dir (traversal rejected; fail closed).`);
    if (!existsSync(abs) || !statSync(abs).isFile()) { add(`skill "${name}": anchor file "${relPath}" does not exist`); continue; }
    // symlink-escape defense (canonical): follow symlinks and re-check containment, so a committed symlink
    // inside the skills dir cannot point the cited file at content outside the tree.
    let real;
    try { real = realpathSync(abs); } catch (e) { die2(`applied skill "${name}": cannot resolve anchor file "${relPath}" (${e.message}; fail closed).`); }
    if (real !== skillsReal && !real.startsWith(skillsReal + sep)) die2(`applied skill "${name}": anchor file "${relPath}" resolves (via a symlink) outside the skills dir (rejected; fail closed).`);
    const text = readFileSync(real, "utf8");
    const section = sectionText(text, headingSlug);
    if (section == null) { add(`skill "${name}": anchor heading "#${headingSlug}" is not a heading in ${relPath}`); continue; }
    citedText += "\n" + section;
  }

  // c. quote match: each quote (>= MIN_QUOTE_WORDS words) must appear verbatim in the cited SECTION text
  const haystack = norm(citedText);
  for (const q of s.quotes) {
    const words = String(q).trim().split(/\s+/).filter(Boolean);
    if (words.length < MIN_QUOTE_WORDS) { add(`skill "${name}": quote "${truncate(q)}" is only ${words.length} words (need >= ${MIN_QUOTE_WORDS} exact words to ground it)`); continue; }
    if (!haystack.includes(norm(q))) add(`skill "${name}": quote "${truncate(q)}" does not appear under any cited heading (fabricated, misquoted, or from a different section or the frontmatter)`);
  }

  // d. diff binding: the `where` files must be in the change (only when the diff was provided)
  if (changed) {
    for (const w of s.where) {
      const wf = String(w).split("\\").join("/");
      if (!changed.includes(wf)) add(`skill "${name}": "where" file "${wf}" is not in the change diff (claimed application to a file the change does not touch)`);
    }
  }
}

// --- e. routing coupling: a firing surface forces `applied` (only when the diff was provided) ----------------
let couplingNote;
if (changed && coupling.length) {
  for (const rule of coupling) {
    const fired = changed.some((f) => rule.when.some((re) => re.test(f)));
    if (!fired) continue;
    for (const req of rule.requires) {
      const s = entry.skills[req];
      if (!s || s.status !== "applied") add(`coupling rule "${rule.id}" fired (a matching file changed) but skill "${req}" is not "applied" (a triggered surface cannot be marked not-applicable)`);
    }
  }
  couplingNote = "diff binding + coupling checked";
} else {
  couplingNote = changed ? "coupling config empty" : "diff binding + coupling NOT checked (pass --changed-list)";
}

if (problems.length) {
  console.error(`[check-skill-receipt] FAIL - ${problems.length} grounding gap(s) for change "${entry.change}":`);
  for (const p of problems) console.error("  • " + p);
  process.exit(1);
}
console.log(`[check-skill-receipt] OK - receipt for "${entry.change}" is complete (${skillSet.length} skills), ` +
  `grounded (anchors resolve, quotes >= ${MIN_QUOTE_WORDS} words verbatim), banner present; ${couplingNote}; ${logNote}. ` +
  `A human must still review the work against the diff.`);
process.exit(0);

// --- helpers -------------------------------------------------------------------------------------------------
function nonEmpty(v) { return v != null && String(v).trim() !== ""; }
function norm(s) { return String(s).replace(/\s+/g, " ").trim(); }
function truncate(s) { const t = String(s); return t.length > 50 ? t.slice(0, 47) + "..." : t; }
// The text under one heading: from the matched heading line to the next heading of equal-or-higher level (or
// end of file). Returns null if no heading slugifies to `slug`. Frontmatter sits before any heading, so it is
// never included; a quote must come from the cited section, not from the file at large.
function sectionText(md, slug) {
  const lines = md.split(/\r?\n/);
  let start = -1, level = 0;
  for (let i = 0; i < lines.length; i++) {
    const m = /^(#{1,6})\s+(.*?)\s*#*\s*$/.exec(lines[i]);
    if (m && slugify(m[2]) === slug) { start = i; level = m[1].length; break; }
  }
  if (start < 0) return null;
  let end = lines.length;
  for (let i = start + 1; i < lines.length; i++) {
    const m = /^(#{1,6})\s+/.exec(lines[i]);
    if (m && m[1].length <= level) { end = i; break; }
  }
  return lines.slice(start, end).join("\n");
}
function slugify(text) {
  return String(text).toLowerCase().replace(/`/g, "").replace(/[^\w\s-]/g, "").trim().replace(/\s+/g, "-");
}
function globToRe(glob) {
  const g = String(glob).split("\\").join("/");
  let re = "^";
  for (let i = 0; i < g.length; i++) {
    const c = g[i];
    if (c === "*") { if (g[i + 1] === "*") { i++; if (g[i + 1] === "/") { i++; re += "(?:.*/)?"; } else re += ".*"; } else re += "[^/]*"; }
    else if (c === "?") re += "[^/]";
    else if (".+^${}()|[]".includes(c)) re += "\\" + c;
    else re += c;
  }
  return new RegExp(re + "$");
}
