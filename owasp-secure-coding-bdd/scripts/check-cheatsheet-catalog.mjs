#!/usr/bin/env node
// check-cheatsheet-catalog.mjs — the completeness gate for the per-cheat-sheet OWASP files.
//
// The owasp-secure-coding-bdd skill turns every OWASP cheat sheet into its own reference file under
// references/cheatsheets/<Slug>.md. This gate keeps that catalog honest and lets it grow one cluster at a
// time (a ratchet) without ever shipping an empty or orphaned file:
//
//   - references/cheatsheets-manifest.json is the authoritative list of all sheets (slug, title, url, done).
//   - For every manifest entry with "done": true, the file must exist, carry every required template
//     section, cite at least one source URL, and be listed in SKILL.md's routing index.
//   - Every .md actually in references/cheatsheets/ must correspond to a manifest entry (no orphans), and any
//     file for a sheet must have done:true (a file present but marked not-done is a lie about status).
//   - It reports progress (done / total) so the migration toward all sheets is visible, and fails closed.
//
// Dependency-free. Exit 0 = pass, 1 = catalog violation, 2 = bad usage / unreadable / empty.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const SKILL_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const MANIFEST = path.join(SKILL_DIR, "references", "cheatsheets-manifest.json");
const SHEETS_DIR = path.join(SKILL_DIR, "references", "cheatsheets");
const SKILL_MD = path.join(SKILL_DIR, "SKILL.md");

// Required template sections for every per-sheet file (exact headings).
const REQUIRED_SECTIONS = [
  "## What it is",
  "## The attack it stops",
  "## Controls",
  "## @security scenario",
  "## The real guarantee",
  "## Sources",
];

function die(code, msg) {
  console.error(`check-cheatsheet-catalog: ${msg}`);
  process.exit(code);
}

// The text of one "## Heading" section: from that heading to the next "## " heading (or end of file).
function sectionBlock(body, heading) {
  const start = body.indexOf(heading);
  if (start === -1) return "";
  const after = body.indexOf("\n## ", start + heading.length);
  return after === -1 ? body.slice(start) : body.slice(start, after);
}

let manifest;
try {
  manifest = JSON.parse(fs.readFileSync(MANIFEST, "utf8"));
} catch (e) {
  die(2, `cannot read ${path.relative(SKILL_DIR, MANIFEST)}: ${e.message}`);
}
const sheets = manifest && Array.isArray(manifest.sheets) ? manifest.sheets : null;
if (!sheets || sheets.length === 0) die(2, "manifest has no 'sheets' array, or it is empty (fail closed)");

let skillText = "";
try {
  skillText = fs.readFileSync(SKILL_MD, "utf8");
} catch (e) {
  die(2, `cannot read SKILL.md: ${e.message}`);
}

let filesOnDisk = [];
try {
  filesOnDisk = fs.readdirSync(SHEETS_DIR).filter((f) => f.endsWith(".md"));
} catch (e) {
  // Dir may not exist yet only if nothing is done; if anything is done that is a violation caught below.
  if (e.code !== "ENOENT") die(2, `cannot read ${path.relative(SKILL_DIR, SHEETS_DIR)}: ${e.message}`);
}

const bySlug = new Map(sheets.map((s) => [s.slug, s]));
const violations = [];

// 1. Every done sheet: file exists, has all sections, cites a URL, and is indexed in SKILL.md.
let doneCount = 0;
for (const s of sheets) {
  if (!s.slug) { violations.push(`manifest entry missing a slug: ${JSON.stringify(s)}`); continue; }
  if (!s.done) continue;
  doneCount++;
  const rel = `references/cheatsheets/${s.slug}.md`;
  const abs = path.join(SHEETS_DIR, `${s.slug}.md`);
  let body;
  try {
    body = fs.readFileSync(abs, "utf8");
  } catch {
    violations.push(`${s.slug}: marked done but ${rel} is missing`);
    continue;
  }
  for (const sec of REQUIRED_SECTIONS) {
    if (!body.includes(sec)) violations.push(`${rel}: missing required section "${sec}"`);
  }
  // Sources section must contain at least one http(s) URL.
  const srcIdx = body.indexOf("## Sources");
  const srcBlock = srcIdx === -1 ? "" : body.slice(srcIdx);
  if (!/https?:\/\/\S+/.test(srcBlock)) violations.push(`${rel}: Sources section has no citation URL`);
  // The @security scenario section must hold a REAL executable Gherkin scenario (bdd-comprehensive-testing),
  // not prose: a @security tag plus Scenario: plus Given/When/Then. This is the mandate that using this skill
  // on real code always produces a BDD scenario that actually tests the control.
  const secBlock = sectionBlock(body, "## @security scenario");
  // Scan the section BODY, not the heading: the heading "## @security scenario" itself contains the literal
  // "@security", so scanning the whole block would make the tag check vacuous (always satisfied).
  const secBody = secBlock.slice(secBlock.indexOf("\n") + 1);
  const missingGherkin = ["@security", "Scenario:", "Given", "When", "Then"].filter((kw) => !secBody.includes(kw));
  if (missingGherkin.length) {
    violations.push(`${rel}: @security scenario is not a real Gherkin scenario (missing: ${missingGherkin.join(", ")}). It must be an executable @security scenario per bdd-comprehensive-testing.`);
  }
  // Must be routed from SKILL.md (its path appears in the index).
  if (!skillText.includes(rel)) violations.push(`${rel}: not indexed in SKILL.md (add it to the routing index)`);
}

// 2. No orphan files: every file on disk maps to a manifest entry that is marked done.
for (const f of filesOnDisk) {
  const slug = f.replace(/\.md$/, "");
  const entry = bySlug.get(slug);
  if (!entry) violations.push(`references/cheatsheets/${f}: no manifest entry (orphan; add it to the manifest)`);
  else if (!entry.done) violations.push(`references/cheatsheets/${f}: file present but manifest says done:false (set done:true or remove the file)`);
}

// 3. Index completeness: the SKILL.md routing table must list exactly the manifest's sheets (the table is a
// hand-maintained view of the manifest, so without this the two drift until a sheet becomes done). Every
// manifest slug must be indexed, and every slug the index names must be in the manifest.
const indexedSlugs = new Set();
for (const mm of skillText.matchAll(/references\/cheatsheets\/([A-Za-z0-9_.-]+)\.md/g)) indexedSlugs.add(mm[1]);
for (const s of sheets) {
  if (s.slug && !indexedSlugs.has(s.slug)) violations.push(`${s.slug}: in the manifest but missing from the SKILL.md routing index`);
}
for (const slug of indexedSlugs) {
  if (!bySlug.has(slug)) violations.push(`SKILL.md routing index lists ${slug}, which has no manifest entry`);
}

const total = sheets.length;
if (violations.length) {
  console.error(`\ncheck-cheatsheet-catalog — ${doneCount}/${total} sheets done, ${violations.length} violation(s):\n`);
  for (const v of violations) console.error(`  ✖ ${v}`);
  console.error("");
  process.exit(1);
}
console.log(`check-cheatsheet-catalog — PASS. ${doneCount}/${total} cheat sheets complete, indexed, and cited; no orphans.`);
process.exit(0);
