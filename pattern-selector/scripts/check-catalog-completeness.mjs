#!/usr/bin/env node
/**
 * check-catalog-completeness — the pattern-selector skill's own mechanical gate.
 *
 * A pattern catalog you DECIDE from is only trustworthy if every entry is fully templated and every
 * claim is sourced — otherwise the skill recommends from half-filled, uncited folklore (exactly the
 * failure the two SEO articles this skill replaces exhibit). This gate fails closed when any catalog
 * entry is missing a required template field OR has no primary-source citation. It does NOT judge
 * whether a pattern choice is correct (that is `judge-arch` + the decision record); it keeps the
 * catalog it decides from honest. Dependency-free (Node built-ins).
 *
 *   node check-catalog-completeness.mjs <catalog.md>...
 *
 * An "entry" is a section starting with "### " (the per-pattern heading). Each entry must contain every
 * REQUIRED_FIELD as a "Label:" line (variants accepted) AND at least one citation token in the entry
 * (a URL, a doi:, an ISBN, or a book page like "(p. 322)" / "(322)").
 *
 * Exit 0 = every entry complete + cited. 1 = a gap. 2 = bad usage / unreadable / zero entries.
 */
import { readFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";

function die(msg) { console.error(`[check-catalog-completeness] FAIL — ${msg}`); process.exit(2); }

const files = process.argv.slice(2);
if (files.length === 0) die("no catalog files given. Usage: check-catalog-completeness.mjs <catalog.md>...");

// Required template fields — the single owner of pattern-selector's per-entry template. Each is a label
// that must appear as a "Label:" line in every entry; alternates cover wording variants.
const REQUIRED_FIELDS = [
  { name: "Intent", re: /^\s*Intent\s*:/im },
  { name: "Forces", re: /^\s*(Forces|Problem \/ forces|Problem\/forces)\s*:/im },
  { name: "Best situation", re: /^\s*(Best situation|Best situations|Best when)\s*:/im },
  { name: "Pros", re: /^\s*Pros\s*:/im },
  { name: "Cons", re: /^\s*Cons\s*:/im },
  { name: "Avoid when", re: /^\s*Avoid when\s*:/im },
  { name: "Failure/rot prevented", re: /^\s*Failure\/rot prevented\s*:/im },
  { name: "Misuse", re: /^\s*(Misuse|Misuse anti-pattern|Anti-pattern)\s*:/im },
  { name: "Security trade-off", re: /^\s*Security trade-off\s*:/im },
  { name: "Operational cost", re: /^\s*Operational cost\s*:/im },
  { name: "Adopt safely", re: /^\s*Adopt safely\s*:/im },
  { name: "Modern alternative", re: /^\s*Modern alternative\s*:/im },
  { name: "Verify correct application", re: /^\s*Verify( correct application| it holds)?\s*:/im },
  { name: "Example", re: /^\s*Example\s*:/im },
  { name: "Source(s)", re: /^\s*Sources?\s*(\([^)]*\))?\s*:/im },
];
// A real citation: a URL, a DOI, an ISBN, or a book page reference like "(p. 322)" or "(322)".
const CITATION = /(https?:\/\/\S+|doi:\s*\S+|isbn[\s:-]*[\d-]{10,}|\(p\.?\s*\d+\)|\(\d{2,4}\))/i;

// Split a markdown file into "### " entries, keeping each entry's heading + body.
function entries(md) {
  const out = [];
  const parts = md.split(/^(?=### )/m);
  for (const p of parts) {
    const m = p.match(/^### (.+)$/m);
    if (!m) continue; // intro text before the first entry
    out.push({ title: m[1].trim(), body: p });
  }
  return out;
}

const problems = [];
let totalEntries = 0;
for (const f of files) {
  const fp = resolve(f);
  if (!existsSync(fp)) die(`catalog file not found: ${f}`);
  let md;
  try { md = readFileSync(fp, "utf8"); } catch (e) { die(`could not read ${f} (${e.message})`); }
  const es = entries(md);
  if (es.length === 0) die(`no "### " pattern entries found in ${f} (zero-scan — fail closed)`);
  for (const e of es) {
    totalEntries++;
    const missing = REQUIRED_FIELDS.filter((fld) => !fld.re.test(e.body)).map((fld) => fld.name);
    if (!CITATION.test(e.body)) missing.push("a citation (URL/doi/ISBN/page)");
    if (missing.length) problems.push(`${f} » "${e.title}": missing ${missing.join(", ")}`);
  }
}

if (problems.length) {
  console.error(`[check-catalog-completeness] FAIL — ${problems.length} incomplete/uncited entry(ies):`);
  for (const p of problems) console.error("  • " + p);
  console.error(`\nEvery catalog entry must carry all ${REQUIRED_FIELDS.length} template fields and a primary-source` +
    ` citation (no Wikipedia). Fill the field or cite the source — an uncited pro/con does not ship.`);
  process.exit(1);
}
console.log(`[check-catalog-completeness] OK — ${totalEntries} entr(y/ies) across ${files.length} file(s), all fully templated (${REQUIRED_FIELDS.length} fields) + cited.`);
process.exit(0);
