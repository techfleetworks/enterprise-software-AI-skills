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
 *   node check-catalog-completeness.mjs <catalog.md>...
 *
 * An "entry" starts at a "### " heading that is NOT inside a fenced code block. Each entry must contain
 * every required field as a "Label:" line (not inside a fence), with real content after it (on the same
 * line, or in the lines/code-fence that follow before the next field or entry), plus at least one citation
 * token (a non-Wikipedia URL, a doi:, an ISBN, or a book page like "(p. 322)" / "p. 322"). A bare
 * parenthesized number like "(1994)" is not a citation (it is usually a year).
 *
 * Exit 0 = every entry complete + cited. 1 = a gap. 2 = bad usage / unreadable / zero entries.
 */
import { readFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";

function die(msg) { console.error(`[check-catalog-completeness] FAIL: ${msg}`); process.exit(2); }

const files = process.argv.slice(2);
if (files.length === 0) die("no catalog files given. Usage: check-catalog-completeness.mjs <catalog.md>...");

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

const problems = [];
let totalEntries = 0;
for (const f of files) {
  const fp = resolve(f);
  if (!existsSync(fp)) die(`catalog file not found: ${f}`);
  let md;
  try { md = readFileSync(fp, "utf8"); } catch (e) { die(`could not read ${f} (${e.message})`); }
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
    if (!CITATION.test(e.lines.join("\n"))) gaps.push("a citation (URL/doi/ISBN/page, not Wikipedia)");
    if (gaps.length) problems.push(`${f} » "${e.title}": missing ${gaps.join(", ")}`);
  }
}

if (problems.length) {
  console.error(`[check-catalog-completeness] FAIL: ${problems.length} incomplete/uncited entry(ies):`);
  for (const p of problems) console.error("  • " + p);
  console.error(`\nEvery catalog entry must carry all ${REQUIRED_FIELDS.length} template fields (with content)` +
    ` and a primary-source citation (no Wikipedia). Fill the field or cite the source, an uncited pro/con does not ship.`);
  process.exit(1);
}
console.log(`[check-catalog-completeness] OK: ${totalEntries} entr(y/ies) across ${files.length} file(s), all fully templated (${REQUIRED_FIELDS.length} fields with content) + cited.`);
process.exit(0);
