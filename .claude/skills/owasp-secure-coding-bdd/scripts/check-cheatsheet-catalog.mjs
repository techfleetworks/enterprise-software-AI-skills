#!/usr/bin/env node
// check-cheatsheet-catalog.mjs - the completeness gate for the per-cheat-sheet OWASP files.
//
// The owasp-secure-coding-bdd skill turns every OWASP cheat sheet into its own reference file under
// references/cheatsheets/<Slug>.md. This gate keeps that catalog honest and lets it grow one cluster at a
// time (a ratchet) without ever shipping an empty or orphaned file:
//
//   - references/cheatsheets-manifest.json is the authoritative list of all sheets (slug, title, url, done,
//     and a stack-layer category). It owns the category; SKILL.md's grouped index is a view of it.
//   - For every manifest entry with "done": true, the file must exist, carry every required template
//     section, cite at least one source URL, and be listed in SKILL.md's routing index.
//   - A sheet OWASP has deprecated (manifest "deprecated": true + "supersededBy": "<Slug>") is kept only as a
//     routing pointer: its file must say it is deprecated, link the successor per-sheet file, and cite a source,
//     but it is NOT required to carry the control sections or an @security scenario (there is no control to
//     test); its SKILL.md Status is "deprecated".
//   - Every .md actually in references/cheatsheets/ must correspond to a manifest entry (no orphans), and any
//     file for a sheet must have done:true (a file present but marked not-done is a lie about status).
//   - SKILL.md groups sheets by category under "### <category> (done/total)" headings; the grouping, the
//     counts, which sheet sits under which heading, and each row's done/pending Status must match the
//     manifest, and every sheet must have a category (so the grouped index cannot drift and no sheet slips in
//     uncategorized).
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
  // Deprecated sheets are retained only as routing pointers: OWASP removed the page, so there is no control
  // prose or @security scenario to require (fabricating one would duplicate the successor's). Instead the file
  // must say it is deprecated, link the successor per-sheet file, cite the source, and be indexed; the manifest
  // must name a real successor in "supersededBy".
  if (s.deprecated) {
    if (!s.supersededBy || !bySlug.has(s.supersededBy)) {
      violations.push(`${rel}: deprecated but "supersededBy" is missing or not a manifest slug`);
    } else if (!body.includes(`references/cheatsheets/${s.supersededBy}.md`)) {
      violations.push(`${rel}: deprecated but does not link its successor references/cheatsheets/${s.supersededBy}.md`);
    }
    if (!/deprecat/i.test(body)) violations.push(`${rel}: marked deprecated but the file does not say it is deprecated`);
    const dSrc = body.indexOf("## Sources");
    if (!/https?:\/\/\S+/.test(dSrc === -1 ? "" : body.slice(dSrc))) violations.push(`${rel}: Sources section has no citation URL`);
    if (!skillText.includes(rel)) violations.push(`${rel}: not indexed in SKILL.md (add it to the routing index)`);
    continue;
  }
  for (const sec of REQUIRED_SECTIONS) {
    if (!body.includes(sec)) { violations.push(`${rel}: missing required section "${sec}"`); continue; }
    // A present-but-EMPTY heading is not a real section: require real content below it (not just the heading).
    const block = sectionBlock(body, sec);
    const content = block.slice(block.indexOf("\n") + 1).replace(/\s+/g, " ").trim();
    if (content.length < 30) violations.push(`${rel}: section "${sec}" is present but has no real content below the heading`);
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
  // A real scenario has @security, Scenario:, and Given/When/Then EACH on its own line in order - not a single
  // "Given When Then" line of prose, which would otherwise satisfy a bare substring check.
  const secLines = secBody.split("\n").map((l) => l.trim());
  const hasTag = secBody.includes("@security");
  const hasScenario = secLines.some((l) => /^Scenario(?: Outline| Template)?:/i.test(l));
  const gi = secLines.findIndex((l) => /^Given\b/i.test(l));
  const wi = secLines.findIndex((l) => /^When\b/i.test(l));
  const ti = secLines.findIndex((l) => /^Then\b/i.test(l));
  if (!hasTag || !hasScenario || !(gi >= 0 && wi > gi && ti > wi)) {
    violations.push(`${rel}: @security scenario is not a real multi-line Gherkin scenario (need @security, Scenario:, and Given/When/Then each on its own line in order). It must be an executable @security scenario per bdd-comprehensive-testing.`);
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

// 4. Grouping consistency: the catalog groups sheets by stack-layer `category` under "### <category>
// (done/total)" headings. That grouping, the counts, and which sheet sits under which heading are a derivable
// view of the manifest (the single owner of `category`), so without a gate they drift as sheets are added or
// flipped to done. Every sheet must carry a category (fail closed) so a new one cannot slip in uncategorized.
const manifestGroups = new Map();
for (const s of sheets) {
  if (!s.slug) continue; // already reported above
  if (!s.category) { violations.push(`${s.slug}: manifest entry has no "category" (every sheet must be grouped by stack layer)`); continue; }
  let g = manifestGroups.get(s.category);
  if (!g) { g = { total: 0, done: 0, slugs: new Set() }; manifestGroups.set(s.category, g); }
  g.total++; if (s.done) g.done++; g.slugs.add(s.slug);
}
// Parse every "### <name> (<done>/<total>)" heading in SKILL.md and the sheet files listed beneath it (up to
// the next ### or ## heading). Headings without a (n/n) count - e.g. the threat-model steps - are ignored.
const skillGroups = new Map();
for (const m of skillText.matchAll(/\n### (.+?) \((\d+)\/(\d+)\)[^\n]*\n/g)) {
  const name = m[1].trim();
  const blockStart = m.index + m[0].length;
  const nextH3 = skillText.indexOf("\n### ", blockStart);
  const nextH2 = skillText.indexOf("\n## ", blockStart);
  let end = skillText.length;
  if (nextH3 !== -1) end = Math.min(end, nextH3);
  if (nextH2 !== -1) end = Math.min(end, nextH2);
  const block = skillText.slice(blockStart, end);
  // Parse each table row for its slug and (if present) its done/pending Status cell. Status is also derived
  // from the manifest, so it is checked too: a row could otherwise show the wrong status with the count right.
  const slugs = new Set();
  const status = new Map();
  for (const line of block.split("\n")) {
    const sm = line.match(/references\/cheatsheets\/([A-Za-z0-9_.-]+)\.md/);
    if (!sm) continue;
    slugs.add(sm[1]);
    const st = line.match(/\|\s*(done|pending|deprecated)\s*\|/);
    if (st) status.set(sm[1], st[1]);
  }
  skillGroups.set(name, { done: Number(m[2]), total: Number(m[3]), slugs, status });
}
for (const [cat, mg] of manifestGroups) {
  const sg = skillGroups.get(cat);
  if (!sg) { violations.push(`SKILL.md is missing the "### ${cat} (${mg.done}/${mg.total})" group heading`); continue; }
  if (sg.done !== mg.done || sg.total !== mg.total) {
    violations.push(`SKILL.md "### ${cat}" shows (${sg.done}/${sg.total}) but the manifest has ${mg.done}/${mg.total} for that category`);
  }
  for (const slug of mg.slugs) {
    if (!sg.slugs.has(slug)) { violations.push(`${slug}: manifest category "${cat}" but not listed under that heading in SKILL.md`); continue; }
    const ds = bySlug.get(slug);
    const want = ds.deprecated ? "deprecated" : (ds.done ? "done" : "pending");
    const got = sg.status.get(slug);
    if (got && got !== want) violations.push(`SKILL.md lists ${slug} as "${got}" but the manifest has it ${want}`);
  }
  for (const slug of sg.slugs) if (!mg.slugs.has(slug)) violations.push(`SKILL.md lists ${slug} under "${cat}", but the manifest assigns it a different category`);
}
for (const cat of skillGroups.keys()) if (!manifestGroups.has(cat)) violations.push(`SKILL.md has a "### ${cat}" group with no matching manifest category`);

const total = sheets.length;
if (violations.length) {
  console.error(`\ncheck-cheatsheet-catalog - ${doneCount}/${total} sheets done, ${violations.length} violation(s):\n`);
  for (const v of violations) console.error(`  ✖ ${v}`);
  console.error("");
  process.exit(1);
}
console.log(`check-cheatsheet-catalog - PASS. ${doneCount}/${total} cheat sheets complete, indexed, and cited; no orphans.`);
process.exit(0);
