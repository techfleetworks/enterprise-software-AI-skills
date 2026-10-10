#!/usr/bin/env node
// check-skill-evidence-contract — every skill must carry the shared evidence contract.
//
// For each SKILL.md it requires (per evidence-discipline.md §5):
//   (a) a section titled exactly "## Evidence & skeptical assessment (required)",
//   (b) a link to the canonical contract (evidence-discipline.md),
//   (c) an "evidence ledger" requirement in its Definition of done.
// Fail-closed. A shrink-only allowlist grandfathers skills not yet retrofitted; names come off it as
// each skill adopts the contract, so compliance tightens monotonically to 100%.
//
//   node check-skill-evidence-contract.mjs [root] [--allowlist path]
//
// Exit 0 = every non-allowlisted skill complies. Exit 1 = a gap, or missing input (zero skills, no
// allowlist file).
import { readFileSync, readdirSync, existsSync } from "node:fs";
import { join, resolve, relative, sep } from "node:path";

const die = (m) => { console.error(`[check-skill-evidence-contract] FAIL — ${m}`); process.exit(1); };

const args = process.argv.slice(2);
const root = resolve(args.find((a) => !a.startsWith("--")) ?? ".");
const ai = args.indexOf("--allowlist");
const allowlistPath = resolve(ai >= 0 ? args[ai + 1] : join(root, "skeptical-audit/scripts/skill-evidence-allowlist.json"));

const IGNORE = new Set(["node_modules", ".git", "dist", "build"]);
function findSkills(dir) {
  const out = [];
  let entries;
  try { entries = readdirSync(dir, { withFileTypes: true }); } catch { return out; }
  for (const e of entries) {
    if (e.isDirectory()) { if (!IGNORE.has(e.name)) out.push(...findSkills(join(dir, e.name))); }
    else if (e.name === "SKILL.md") out.push(join(dir, e.name));
  }
  return out;
}

const skillFiles = findSkills(root).sort();
if (skillFiles.length === 0) die(`no SKILL.md found under ${root} (zero-scan; fail closed).`);
if (!existsSync(allowlistPath)) die(`allowlist not found: ${allowlistPath} (create it — an empty [] means "all skills must comply").`);
let allow;
try { allow = new Set(JSON.parse(readFileSync(allowlistPath, "utf8"))); }
catch (e) { die(`allowlist is not valid JSON (${e.message}).`); }

const HEADING = /^##\s+Evidence & skeptical assessment \(required\)\s*$/m;
const CONTRACT = "evidence-discipline.md";
const LEDGER = /evidence ledger/i;
const idOf = (file) => (relative(root, file.replace(/[/\\]SKILL\.md$/, "")).split(sep).join("/") || ".");

const required = [];
const exemptNowCompliant = [];
const problems = [];
for (const f of skillFiles) {
  const id = idOf(f);
  const src = readFileSync(f, "utf8");
  const ok = HEADING.test(src) && src.includes(CONTRACT) && LEDGER.test(src);
  if (allow.has(id)) { if (ok) exemptNowCompliant.push(id); continue; }
  required.push(id);
  if (!ok) {
    const miss = [];
    if (!HEADING.test(src)) miss.push("no '## Evidence & skeptical assessment (required)' section");
    if (!src.includes(CONTRACT)) miss.push("no link to evidence-discipline.md");
    if (!LEDGER.test(src)) miss.push("no 'evidence ledger' in its Definition of done");
    problems.push(`${id}: ${miss.join("; ")}`);
  }
}

if (problems.length || exemptNowCompliant.length) {
  if (problems.length) {
    console.error(`[check-skill-evidence-contract] FAIL — ${problems.length} skill(s) missing the evidence contract:`);
    for (const p of problems) console.error("  • " + p);
    console.error(`Add the section (see skeptical-audit/references/evidence-discipline.md §5), or — only for a` +
      ` pre-existing skill — add its id to ${relative(root, allowlistPath).split(sep).join("/")} (shrink-only; burn it down).`);
  }
  if (exemptNowCompliant.length) {
    // Enforce shrink-only mechanically: a skill that already complies may NOT sit on the allowlist.
    // This is what stops anyone grandfathering a compliant skill back onto the list to make the gate
    // vacuously pass — the ratchet can only tighten.
    console.error(`[check-skill-evidence-contract] FAIL — ${exemptNowCompliant.length} skill(s) already comply but are ` +
      `still on the allowlist; the allowlist is shrink-only, so REMOVE them: ${exemptNowCompliant.join(", ")}`);
  }
  process.exit(1);
}
console.log(`[check-skill-evidence-contract] OK — ${skillFiles.length} skill(s): ${required.length} compliant, ${allow.size} on the shrink-only allowlist.`);
process.exit(0);
