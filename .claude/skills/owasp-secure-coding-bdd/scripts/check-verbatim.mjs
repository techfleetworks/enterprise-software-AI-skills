#!/usr/bin/env node
// check-verbatim.mjs - the license-hygiene gate for the per-cheat-sheet OWASP files.
//
// The OWASP Cheat Sheet Series is licensed CC-BY-SA-4.0; this repo's own files are MIT (ADR-0017). The skill
// vendors the exact upstream text into .claude/skills/owasp-secure-coding-bdd/vendor/cheatsheets-src/ (gitignored, fetched by
// `npm run vendor:owasp`) and writes OWN-WORDS per-sheet files under references/cheatsheets/. Short shared runs
// (header names, directive strings, code) are expected and fine; a LONG shared prose run means CC-BY-SA text
// was pasted verbatim into an MIT file, which breaks ShareAlike. During Wave 1, 10 files carried such runs.
//
// This gate catches that before it merges, so it cannot regress across the remaining content waves. For each
// `done` sheet in the manifest that has a vendored source, it tokenizes both the per-sheet file (minus its
// `## Sources` citations) and the vendored source after stripping fenced code, inline code, and URLs, then
// flags any run of >= N (10) consecutive words shared verbatim. Dependency-free and offline.
//
// Exit 0 = clean (prints what was checked). Exit 1 = a file has a long verbatim run (prints the runs).
// Exit 2 = fail closed: bad/empty manifest, vendored source absent (run `npm run vendor:owasp` first), or
// done sheets exist but none could be checked (a vacuous pass would otherwise hide a vendoring failure).
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const SKILL_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const MANIFEST = path.join(SKILL_DIR, "references", "cheatsheets-manifest.json");
const CHEATS = path.join(SKILL_DIR, "references", "cheatsheets");
const SRC = path.join(SKILL_DIR, "vendor", "cheatsheets-src");

// A run of this many consecutive shared words is treated as copied prose, not an incidental overlap.
const N = 10;

// Optional category filter (manifest `category` field), for narrowing during a content wave. CI runs with none.
const category = process.argv[2];

function die(code, msg) {
  console.error(`check-verbatim: ${msg}`);
  process.exit(code);
}

// Strip fenced code, inline code, and URLs from BOTH sides before comparing. Shared code samples and shared
// citation URLs are not copyrighted prose, so they must not false-flag.
const stripCode = (t) =>
  t
    .replace(/```[\s\S]*?```/g, " ")
    .replace(/`[^`]*`/g, " ")
    .replace(/https?:\/\/\S+/g, " ");

// Drop the per-sheet file's `## Sources` section (attribution citations) before comparing: citing the source
// title and URL is required attribution, not a verbatim-prose violation.
const dropSources = (t) => {
  const i = t.indexOf("## Sources");
  return i === -1 ? t : t.slice(0, i);
};

const toks = (t) => stripCode(t).toLowerCase().match(/[a-z0-9]+/g) || [];

// The set of all N-word windows in the source text, for O(1) membership while scanning the per-sheet file.
const grams = (a, n) => {
  const s = new Set();
  for (let i = 0; i + n <= a.length; i++) s.add(a.slice(i, i + n).join(" "));
  return s;
};

let manifest;
try {
  manifest = JSON.parse(fs.readFileSync(MANIFEST, "utf8"));
} catch (e) {
  die(2, `cannot read ${path.relative(SKILL_DIR, MANIFEST)}: ${e.message}`);
}
const allSheets = manifest && Array.isArray(manifest.sheets) ? manifest.sheets : null;
if (!allSheets || allSheets.length === 0) die(2, "manifest has no 'sheets' array, or it is empty (fail closed)");

// Fail closed if the vendored source is not present at all: without it this gate would pass vacuously, which
// is exactly the false-green that lets a verbatim run merge. CI must run `npm run vendor:owasp` first.
let srcFiles = [];
try {
  srcFiles = fs.readdirSync(SRC).filter((f) => f.endsWith(".md"));
} catch (e) {
  if (e.code === "ENOENT") {
    die(2, `vendored source dir is absent (${path.relative(SKILL_DIR, SRC)}). Run \`npm run vendor:owasp\` first.`);
  }
  die(2, `cannot read ${path.relative(SKILL_DIR, SRC)}: ${e.message}`);
}
if (srcFiles.length === 0) {
  die(2, `vendored source dir is empty (${path.relative(SKILL_DIR, SRC)}). Run \`npm run vendor:owasp\` first.`);
}

const doneSheets = allSheets.filter((s) => s.slug && s.done && (!category || s.category === category));

let checked = 0;
const skippedNoSource = [];
const flagged = [];

for (const s of doneSheets) {
  const f = path.join(CHEATS, `${s.slug}.md`);
  const src = path.join(SRC, `${s.slug}_Cheat_Sheet.md`);
  // A done sheet with no per-sheet file is the catalog gate's job (check-cheatsheet-catalog); here we only
  // compare files that exist against a vendored source.
  if (!fs.existsSync(f)) continue;
  if (!fs.existsSync(src)) {
    // Some sheets have no upstream _Cheat_Sheet.md (e.g. an alias/redirect). Nothing to compare against, so
    // there is nothing it could have been copied from in our vendored set. Record it so the skip is visible.
    skippedNoSource.push(s.slug);
    continue;
  }
  checked++;
  const ft = toks(dropSources(fs.readFileSync(f, "utf8")));
  const st = grams(toks(fs.readFileSync(src, "utf8")), N);
  const starts = [];
  for (let i = 0; i + N <= ft.length; i++) {
    if (st.has(ft.slice(i, i + N).join(" "))) starts.push(i);
  }
  // Merge overlapping/consecutive window starts into human-readable ranges.
  const runs = [];
  for (const i of starts) {
    const last = runs[runs.length - 1];
    if (last && i <= last.end + 1) last.end = i;
    else runs.push({ start: i, end: i });
  }
  if (runs.length) flagged.push({ slug: s.slug, runs: runs.map((r) => ft.slice(r.start, r.end + N).join(" ")) });
}

// Fail closed if done sheets exist but none could actually be checked: that means every vendored source was
// missing, i.e. vendoring is broken or name-drifted, and a silent "pass" would hide it.
const doneWithFile = doneSheets.filter((s) => fs.existsSync(path.join(CHEATS, `${s.slug}.md`)));
if (doneWithFile.length > 0 && checked === 0) {
  die(
    2,
    `${doneWithFile.length} done sheet(s) have a file but NONE had a vendored source to check against ` +
      `(skipped: ${skippedNoSource.join(", ") || "none"}). Vendoring looks incomplete; run \`npm run vendor:owasp\`.`
  );
}

if (flagged.length) {
  console.error(`\ncheck-verbatim - ${flagged.length} file(s) contain a shared run of >= ${N} words copied from the CC-BY-SA source:\n`);
  for (const fl of flagged) {
    console.error(`  ✖ references/cheatsheets/${fl.slug}.md - ${fl.runs.length} run(s):`);
    for (const r of fl.runs) console.error(`      "${r}"`);
  }
  console.error(`\nReword these into your own words. Verbatim CC-BY-SA text may not live in the MIT per-sheet files (ADR-0018).\n`);
  process.exit(1);
}

const scope = category ? `category "${category}"` : "all categories";
console.log(
  `check-verbatim - PASS (${scope}). ${checked} done sheet(s) compared against the vendored source; ` +
    `0 shared runs of >= ${N} words.` +
    (skippedNoSource.length ? ` Skipped (no upstream source): ${skippedNoSource.join(", ")}.` : "")
);
process.exit(0);
