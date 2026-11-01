#!/usr/bin/env node
/**
 * check-catalog-completeness, the pattern-selector skill's own mechanical gate.
 *
 * A pattern catalog you DECIDE from is only trustworthy if every entry is fully filled in and every claim
 * is sourced. Otherwise the skill recommends from half-filled, uncited folklore (the failure the SEO
 * articles this skill replaces exhibit). This gate fails closed when any catalog entry is missing a
 * required template field, leaves a field empty, or has no primary-source citation. It does not judge
 * whether a pattern choice is correct (that is judge-arch plus the decision record); it keeps the catalog
 * honest. Dependency-free (Node built-ins).
 *
 *   node check-catalog-completeness.mjs [--registry <poeaa-registry.json>] [--also-scan <file>]... <catalog.md>...
 *
 * PoEAA citations are checked against the page registry (references/poeaa-registry.json, ADR-0106), not
 * just found: every "<pattern> (<page>)" token must carry the registry page, "Fowler, *PoEAA*, <pattern>"
 * must name a registry pattern and give its page, "Fowler, *PoEAA*, ch. <n>" must name chapter 1 to 18, a
 * Source that names PoEAA needs one of those (the ISBN alone is not enough), and every registry pattern
 * marked covered must have a catalog heading. --also-scan files (the chooser) get the citation checks only.
 * Run it on all catalog files together, since coverage is checked across them.
 *
 * An "entry" starts at a "### " heading that is NOT inside a fenced code block. Each entry must contain
 * every required field as a "Label:" line (not inside a fence), with real content after it (on the same
 * line, or in the lines/code-fence that follow before the next field or entry), plus at least one citation
 * token (a non-Wikipedia URL, a doi:, an ISBN, or a book page like "(p. 322)" / "p. 322"). A bare
 * parenthesized number like "(1994)" is not a citation (it is usually a year).
 *
 * Exit 0 = every entry complete + cited. 1 = a gap or a wrong citation. 2 = bad usage / unreadable /
 * zero entries / no registry.
 */
import { readFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";
import { DEFAULT_REGISTRY, ANY_PAGE, loadRegistry, validateRegistry, wrongPages, prefixedCitations, namedPageTokens, chapterOk, resolveName } from "./poeaa-registry.mjs";

function die(msg) { console.error(`[check-catalog-completeness] FAIL: ${msg}`); process.exit(2); }

const USAGE = "Usage: check-catalog-completeness.mjs [--registry <poeaa-registry.json>] [--also-scan <file>]... <catalog.md>...";
const files = [];
const alsoScan = [];
let registryPath = DEFAULT_REGISTRY;
const argv = process.argv.slice(2);
for (let i = 0; i < argv.length; i++) {
  if (argv[i] === "--registry" || argv[i] === "--also-scan") {
    if (argv[i + 1] === undefined || argv[i + 1].startsWith("--")) die(`${argv[i]} needs a path. ${USAGE}`);
    if (argv[i] === "--registry") registryPath = resolve(argv[++i]); else alsoScan.push(argv[++i]);
  } else if (argv[i].startsWith("--")) die(`unknown option ${argv[i]}. ${USAGE}`);
  else files.push(argv[i]);
}
if (files.length === 0) die(`no catalog files given. ${USAGE}`);

let registry;
try { registry = loadRegistry(registryPath); } catch (e) { die(`${e.message} (the PoEAA page registry is required; fail closed)`); }

// Required fields = the single owner of pattern-selector's per-entry template. Each is a label the entry
// must carry; alternates cover wording variants. Content is checked separately (see fieldFilled).
const REQUIRED_FIELDS = [
  { name: "Intent", re: /^\s*Intent\s*:/i },
  { name: "Forces", re: /^\s*(Forces|Problem \/ forces|Problem\/forces)\s*:/i },
  { name: "Best situation", re: /^\s*(Best situation|Best situations|Best when)\s*:/i },
  { name: "Pros", re: /^\s*Pros\s*:/i },
  { name: "Cons", re: /^\s*Cons\s*:/i },
  { name: "Avoid when", re: /^\s*Avoid when\s*:/i },
  { name: "Failure/rot prevented", re: /^\s*Failure\/rot prevented\s*:/i },
  { name: "Misuse", re: /^\s*(Misuse|Misuse anti-pattern|Anti-pattern)\s*:/i },
  { name: "Security trade-off", re: /^\s*Security trade-off\s*:/i },
  { name: "Operational cost", re: /^\s*Operational cost\s*:/i },
  { name: "Adopt safely", re: /^\s*Adopt safely\s*:/i },
  { name: "Modern alternative", re: /^\s*Modern alternative\s*:/i },
  { name: "Verify correct application", re: /^\s*Verify( correct application| it holds)?\s*:/i },
  { name: "Example", re: /^\s*Example\s*:/i },
  { name: "Source(s)", re: /^\s*Sources?\s*(\([^)]*\))?\s*:/i },
];
// A real citation: a non-Wikipedia URL, a DOI, an ISBN, or a book page ("(p. 322)" / "p. 322" / "pp. 12-15").
// The page form demands parentheses or a period after p, so a latency string like "p99"/"p95" (which naturally
// appears in the Operational-cost and Security-trade-off fields) is NOT mistaken for a citation.
const CITATION = /(https?:\/\/(?!\S*wikipedia\.org)\S+|doi:\s*\S+|isbn[\s:-]*[\dxX-]{10,}|\(pp?\.?\s*\d+\)|\bpp?\.\s*\d+\b)/i;

const isFenceDelim = (line) => /^\s*```/.test(line);
const isAnyLabel = (line) => REQUIRED_FIELDS.some((f) => f.re.test(line));

// Per-line "inside a fenced code block?" mask. The ``` delimiter lines are marked true too, so a label or
// a "### " written inside a fence is never mistaken for a real one.
function fenceMask(lines) {
  const mask = [];
  let inFence = false;
  for (const l of lines) {
    if (isFenceDelim(l)) { mask.push(true); inFence = !inFence; }
    else mask.push(inFence);
  }
  return mask;
}

// Split into entries at "### " headings that are NOT inside a fence. Each entry keeps its lines + mask.
function entries(md) {
  const lines = md.split(/\r?\n/);
  const mask = fenceMask(lines);
  const out = [];
  let cur = null;
  for (let k = 0; k < lines.length; k++) {
    if (!mask[k] && /^### /.test(lines[k])) {
      cur = { title: lines[k].replace(/^###\s+/, "").trim(), lines: [], mask: [] };
      out.push(cur);
    }
    if (cur) { cur.lines.push(lines[k]); cur.mask.push(mask[k]); }
  }
  return out;
}

// A field is "filled" when its label line (not in a fence) is followed by real content: after the colon on
// the same line, OR on the following lines (code-fence content counts) up to the next field label / entry.
function fieldFilled(entry, labelRe) {
  const { lines, mask } = entry;
  let i = -1;
  for (let k = 0; k < lines.length; k++) { if (!mask[k] && labelRe.test(lines[k])) { i = k; break; } }
  if (i < 0) return "missing"; // label absent
  const after = lines[i].slice(lines[i].indexOf(":") + 1);
  if (/\S/.test(after)) return "ok";
  for (let k = i + 1; k < lines.length; k++) {
    if (!mask[k] && (/^###\s/.test(lines[k]) || isAnyLabel(lines[k]))) break; // reached the next field/entry
    if (/\S/.test(lines[k])) return "ok"; // content on a following line (incl. a code fence)
  }
  return "empty";
}

// The text of one field: its label line after the colon, plus following lines up to the next field, heading,
// or "---" rule (an entry's lines run on to the next "### ", so a "## section" heading can follow its last field).
function fieldText(entry, labelRe) {
  const { lines, mask } = entry;
  const i = lines.findIndex((l, k) => !mask[k] && labelRe.test(l));
  if (i < 0) return "";
  const out = [lines[i].slice(lines[i].indexOf(":") + 1)];
  for (let k = i + 1; k < lines.length; k++) {
    if (!mask[k] && (/^#{1,6}\s/.test(lines[k]) || /^---\s*$/.test(lines[k]) || isAnyLabel(lines[k]))) break;
    out.push(lines[k]);
  }
  return out.join("\n");
}

const SOURCE_RE = REQUIRED_FIELDS.find((f) => f.name === "Source(s)").re;
const NAMES_POEAA = /PoEAA|Patterns of Enterprise Application Architecture|0-321-12742-0/i;
const wrongPageMsg = (f, w) => `${f}: "${w.name}" cites page ${w.cited}, but the registry page is ${w.page}`;

// Every PoEAA citation in one file's text, compared with the registry. Returns problem messages.
function citationProblems(f, text) {
  const out = new Set();
  for (const w of wrongPages(text, registry)) out.add(wrongPageMsg(f, w));
  for (const c of prefixedCitations(text)) {
    if (c.kind === "chapter") {
      if (!chapterOk(c.chapter)) out.add(`${f}: "ch. ${c.chapter}" is not a PoEAA chapter (the book has chapters 1 to 18)`);
      continue;
    }
    const row = resolveName(c.name, registry);
    if (!row) out.add(`${f}: "${c.name}" is not in the PoEAA registry (check the spelling against references/poeaa-registry.json)`);
    else if (c.page === null) out.add(`${f}: the citation "Fowler, *PoEAA*, ${c.name}" has no page (write "${row.name} (${row.page})")`);
    // A prefixed page of any length (for example "(17)") goes through the same comparison as the bare tokens.
    else for (const w of wrongPages(`${c.name} (${c.page})`, registry, ANY_PAGE)) out.add(wrongPageMsg(f, w));
  }
  return [...out];
}

// A Source names a place in PoEAA when it has a pattern page, or a prefixed chapter in range. A chapter of
// another book, or a bare "ch. 42", does not count.
const placesPoeaa = (t) => namedPageTokens(t, registry, ANY_PAGE).length > 0 ||
  prefixedCitations(t).some((c) => c.kind === "chapter" && chapterOk(c.chapter));

const problems = [];
const headings = [];
let totalEntries = 0;
const readText = (f) => {
  const fp = resolve(f);
  if (!existsSync(fp)) die(`catalog file not found: ${f}`);
  try { return readFileSync(fp, "utf8"); } catch (e) { die(`could not read ${f} (${e.message})`); }
};
for (const p of validateRegistry(registry)) problems.push(`${registryPath}: ${p}`);
for (const f of alsoScan) problems.push(...citationProblems(f, readText(f)));
for (const f of files) {
  const md = readText(f);
  problems.push(...citationProblems(f, md));
  const es = entries(md);
  if (es.length === 0) die(`no "### " pattern entries found in ${f} (zero-scan, fail closed)`);
  for (const e of es) {
    totalEntries++;
    const gaps = [];
    for (const fld of REQUIRED_FIELDS) {
      const r = fieldFilled(e, fld.re);
      if (r === "missing") gaps.push(fld.name);
      else if (r === "empty") gaps.push(`${fld.name} (empty)`);
    }
    // A PoEAA pattern page or chapter is a book page citation too (its correctness is checked in citationProblems).
    const text = e.lines.join("\n");
    if (!CITATION.test(text) && !(NAMES_POEAA.test(text) && placesPoeaa(text))) gaps.push("a citation (URL/doi/ISBN/page, not Wikipedia)");
    // A Source naming PoEAA must say where in the book: a pattern page or a chapter. The ISBN alone is not enough.
    const source = fieldText(e, SOURCE_RE);
    if (NAMES_POEAA.test(source) && !placesPoeaa(source)) {
      gaps.push(`a PoEAA source needs a pattern page or a chapter (write "Fowler, *PoEAA*, <Pattern> (<page>)" or "Fowler, *PoEAA*, ch. <n>")`);
    }
    // In a Source every "<pattern> (<number>)" is a page, so a page of any length is compared, not only three digits.
    for (const w of wrongPages(source, registry, ANY_PAGE)) problems.push(wrongPageMsg(f, w));
    if (gaps.length) problems.push(`${f} » "${e.title}": missing ${gaps.join(", ")}`);
    headings.push(e.title);
  }
}

// Coverage: a registry pattern marked covered must have a catalog heading that starts with its heading text
// (before the ", <cluster>" suffix). A silent gap is the failure this catches.
const hasHeading = (h) => headings.some((t) => t === h || t.startsWith(`${h},`));
const covered = registry.filter((r) => r && r.status === "covered");
for (const r of covered) {
  if (!hasHeading(r.heading)) problems.push(`"${r.name}" is covered in the registry but missing from the catalog (no "### ${r.heading}" heading)`);
}

if (problems.length) {
  const unique = [...new Set(problems)]; // a Source page is checked twice (file scan and Source scan)
  console.error(`[check-catalog-completeness] FAIL: ${unique.length} problem(s):`);
  for (const p of unique) console.error("  • " + p);
  console.error(`\nEvery catalog entry must carry all ${REQUIRED_FIELDS.length} template fields (with content)` +
    ` and a primary-source citation (no Wikipedia), and every PoEAA citation must match the page registry.` +
    ` Fill the field, fix the page, or cite the source; an uncited or miscited pro/con does not ship.`);
  process.exit(1);
}
console.log(`[check-catalog-completeness] OK: ${totalEntries} entr(y/ies) across ${files.length} file(s), all fully templated (${REQUIRED_FIELDS.length} fields with content) + cited;` +
  ` PoEAA citations match the registry (${covered.length} covered, ${registry.length - covered.length} declined with a reason).`);
process.exit(0);
