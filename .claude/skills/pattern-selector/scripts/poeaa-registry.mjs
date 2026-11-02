// poeaa-registry - the one reader of references/poeaa-registry.json (ADR-0106).
//
// The registry owns every PoEAA page fact. This module loads it, checks its shape, and finds PoEAA
// citations in text, so the catalog gate (check-catalog-completeness.mjs) and the edit-time plan check
// (always-on/check-task-plan.mjs) apply the same rule instead of two copies of it. Dependency-free.
import { readFileSync, existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

export const DEFAULT_REGISTRY = join(dirname(fileURLToPath(import.meta.url)), "..", "references", "poeaa-registry.json");
export const PATTERN_COUNT = 51;
export const CHAPTERS = { first: 1, last: 18, firstCatalog: 9 };

// Load and parse. Throws an Error whose message names the path; the caller decides how to fail closed.
export function loadRegistry(path = DEFAULT_REGISTRY) {
  if (!existsSync(path)) throw new Error(`PoEAA registry not found: ${path}`);
  let doc;
  try { doc = JSON.parse(readFileSync(path, "utf8")); }
  catch (e) { throw new Error(`PoEAA registry is not readable JSON: ${path} (${e.message})`); }
  if (!doc || !Array.isArray(doc.patterns)) throw new Error(`PoEAA registry has no "patterns" array: ${path}`);
  return doc.patterns;
}

// Shape and order problems, as messages. Empty means valid. Pages must rise in catalog order, because the
// book prints its patterns in that order; an out-of-order page is a typo.
export function validateRegistry(rows) {
  const problems = [];
  if (!Array.isArray(rows)) return ["the registry is not a list of patterns"];
  if (rows.length !== PATTERN_COUNT) problems.push(`the registry must hold exactly ${PATTERN_COUNT} patterns, found ${rows.length}`);
  const seen = new Set();
  const forms = new Set();
  let prev = null;
  for (const [i, r] of rows.entries()) {
    const at = r && typeof r.name === "string" && r.name.trim() ? `"${r.name}"` : `row ${i + 1}`;
    if (!r || typeof r.name !== "string" || !r.name.trim()) { problems.push(`${at} has no name`); continue; }
    if (seen.has(r.name)) problems.push(`${at} appears more than once`);
    seen.add(r.name);
    if (r.aliases !== undefined && (!Array.isArray(r.aliases) || r.aliases.some((a) => typeof a !== "string" || !a.trim()))) problems.push(`${at} has aliases that are not a list of names`);
    for (const f of [r.name, ...(Array.isArray(r.aliases) ? r.aliases : [])]) {
      if (typeof f !== "string") continue;
      if (forms.has(norm(f)) && f !== r.name) problems.push(`${at} has the alias "${f}", which another row already uses`);
      forms.add(norm(f));
    }
    if (!Number.isInteger(r.chapter) || r.chapter < CHAPTERS.firstCatalog || r.chapter > CHAPTERS.last) problems.push(`${at} has chapter ${r.chapter}, not ${CHAPTERS.firstCatalog} to ${CHAPTERS.last}`);
    if (!Number.isInteger(r.page) || r.page < 1) problems.push(`${at} has no printed page`);
    if (!Number.isInteger(r.hits) || r.hits < 1) problems.push(`${at} has no cross-reference hit count`);
    if (typeof r.heading !== "string" || !r.heading.trim()) problems.push(`${at} has no heading`);
    if (r.status !== "covered" && r.status !== "declined") problems.push(`${at} has status "${r.status}", not covered or declined`);
    if (r.status === "declined" && (typeof r.reason !== "string" || !r.reason.trim())) problems.push(`${at} is declined, and a declined pattern needs a reason`);
    if (prev && Number.isInteger(r.page) && Number.isInteger(prev.page) && r.page <= prev.page) problems.push(`${at} at page ${r.page} is out of order (after "${prev.name}" at ${prev.page})`);
    if (prev && Number.isInteger(r.chapter) && Number.isInteger(prev.chapter) && r.chapter < prev.chapter) problems.push(`${at} in chapter ${r.chapter} is out of order (after "${prev.name}" in chapter ${prev.chapter})`);
    prev = r;
  }
  return problems;
}

// --- finding citations ------------------------------------------------------------------------------------
//
// A pattern is matched by its registry name or an alias (the catalog's own spelling, such as
// "Model-View-Controller (MVC)" or "Null Object"), ignoring case, and with a space or a hyphen between words.
// Names are tried longest first, so "Table Data Gateway (144)" resolves to Table Data Gateway, never to
// Gateway, and "Data Mapper (165)" to Data Mapper, never to Mapper. A page may be written "(322)", "( 322 )",
// or "(p. 322)".

// Options for text where every "<Name> (<number>)" is meant as a page: a Source field, a prefixed citation, or
// an agent's record. Elsewhere the default counts only three digits, since the book's pages have three and a
// year such as "(2002)" in prose is not a citation.
export const ANY_PAGE = Object.freeze({ minDigits: 1, maxDigits: 6 });

const esc = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
function norm(s) { return String(s).toLowerCase().replace(/[\s-]+/g, " ").trim(); }
const forms = (rows) => rows.flatMap((r) => [r.name, ...(Array.isArray(r.aliases) ? r.aliases : [])].map((f) => ({ f, row: r })));

// The registry row a written name refers to (by name or alias, any case, space or hyphen), or undefined.
export function resolveName(name, rows) {
  const n = norm(name);
  const hit = forms(rows).find((x) => norm(x.f) === n);
  return hit && hit.row;
}

// Every "<pattern> (<page>)" token in text: { name (the registry name), written, page, row, end }.
export function namedPageTokens(text, rows, { minDigits = 3, maxDigits = 3 } = {}) {
  const all = forms(rows).sort((a, b) => b.f.length - a.f.length);
  const alt = all.map((x) => x.f.trim().split(/[\s-]+/).map(esc).join("[\\s-]+")).join("|");
  const re = new RegExp(`(?<![A-Za-z-])(${alt})\\s*\\(\\s*(?:pp?\\.\\s*)?(\\d{${minDigits},${maxDigits}})\\s*\\)`, "gi");
  const out = [];
  for (const m of text.matchAll(re)) {
    const row = resolveName(m[1], rows);
    out.push({ name: row.name, written: m[1].replace(/\s+/g, " "), page: Number(m[2]), row, end: m.index + m[1].length });
  }
  return out;
}

// Wrong-page tokens: each { name, cited, page } where the cited page is not the registry page.
export function wrongPages(text, rows, opts) {
  return namedPageTokens(text, rows, opts)
    .filter((t) => t.page !== t.row.page) // mutation-target: page-compare
    .map((t) => ({ name: t.name, cited: t.page, page: t.row.page }));
}

// Prefixed citations "Fowler, *PoEAA*, <X>" (or the full title): a chapter "ch. <n>", or the pattern name
// written right after the prefix, with or without a page. The name is the run of words up to the page or to
// punctuation, so "Repositry (322) and Unit of Work" yields "Repositry" with page 322.
const PREFIX = /Fowler(?:\s+et\s+al\.?)?,\s*\*?(?:PoEAA|Patterns of Enterprise Application Architecture)\*?,\s*/gi;
export function prefixedCitations(text) {
  const out = [];
  for (const m of text.matchAll(PREFIX)) {
    const rest = text.slice(m.index + m[0].length);
    // "ch. <n>" with no number is the citation form written out (the catalog header), not a citation.
    const ch = /^ch(?:apter|\.)\s*(\d+)?/i.exec(rest);
    if (ch) { if (ch[1] !== undefined) out.push({ kind: "chapter", chapter: Number(ch[1]) }); continue; }
    const nm = /^([A-Za-z][\w-]*(?:\s+(?:of|\(?[A-Z][\w-]*\)?))*)(?:\s*\(\s*(?:pp?\.\s*)?(\d+)\s*\))?/.exec(rest);
    if (nm) out.push({ kind: "pattern", name: nm[1].replace(/\s+/g, " "), page: nm[2] === undefined ? null : Number(nm[2]) });
  }
  return out;
}

export const chapterOk = (n) => Number.isInteger(n) && n >= CHAPTERS.first && n <= CHAPTERS.last;

// Title-case "<Name> (<NNN>)" tokens whose name is no registry pattern: "Florble (100)", "Repositry (322)".
// For an agent's pattern decision, where such a token is meant as a PoEAA citation. Only three-digit pages
// count (the book's), and a name with no lowercase letter is an acronym ("PR (415)", "ADR (106)"), not a pattern.
export function unknownNamedTokens(text, rows) {
  const known = new Set(namedPageTokens(text, rows, ANY_PAGE).map((t) => t.end));
  const out = [];
  for (const m of text.matchAll(/(?<![A-Za-z-])((?:[A-Z][A-Za-z-]*\s+)*[A-Z][A-Za-z-]*)\s*\(\s*(?:pp?\.\s*)?(\d{3})\s*\)/g)) {
    if (known.has(m.index + m[1].length) || !/[a-z]/.test(m[1])) continue;
    out.push({ name: m[1].replace(/\s+/g, " "), page: Number(m[2]) });
  }
  return out;
}
