#!/usr/bin/env node
// bootstrap-v2-consumer-gate: readability-grade
/**
 * check-readability - fail when any document in the configured user-facing surface reads ABOVE a maximum
 * grade, by running the usability readability tool over EVERY file in that surface, not one hand-picked file.
 *
 * readability.mjs is the single-file measurer and the ONE owner of the Flesch-Kincaid computation (its prose
 * extraction, its syllable estimate, its grade formula). This gate does NOT re-implement any of that: it walks
 * the surface and runs the real readability --max-grade per file, so a new user-facing doc cannot drift above
 * the grade the operator set by never being named on a command line. The measurement lives in one place; this
 * gate decides WHICH files it runs over and the one threshold they share.
 *
 *   node check-readability.mjs --config <readability.config.json>
 *
 * Config (JSON):
 *   {
 *     "maxGrade": 10,                        // required: the Flesch-Kincaid grade ceiling for the surface
 *     "roots": ["docs/guides", "README.md"], // directories (scanned recursively) and/or single files (non-empty)
 *     "ext": [".md"],                        // file extensions to scan inside a root directory (default [".md"])
 *     "exclude": ["docs/guides/legal"]       // path substrings to skip (optional)
 *   }
 *
 * Exit codes:
 *   0 = every scanned file is at or below maxGrade. Prints how many were scanned and the ceiling.
 *   1 = at least one file reads above maxGrade (readability exit 1). Lists them with their grade.
 *   2 = fail closed: bad usage; missing or non-JSON config; a missing/!numeric maxGrade; no roots; a root
 *       that does not exist; an EMPTY surface (zero matching files); an unreadable file; or readability
 *       failing closed (exit 2, e.g. a file with no countable prose - that cannot be graded, so not a pass).
 *
 * Honest limit: the grade is readability's rule-of-thumb estimate, not a guarantee of being understood. A
 * passing surface means short words and sentences, not clear meaning. Dependency-free (Node built-ins); it
 * shells out to the sibling readability.mjs.
 */
import { readFileSync, readdirSync, existsSync, statSync } from "node:fs";
import { resolve, dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";

function die(msg) { console.error(`[check-readability] FAIL - ${msg}`); process.exit(2); }

const args = process.argv.slice(2);
if (args.includes("-h") || args.includes("--help")) {
  console.log("usage: node check-readability.mjs --config <readability.config.json>");
  process.exit(0);
}
const opt = (n) => { const i = args.indexOf(n); return i >= 0 ? args[i + 1] : undefined; };
const configPath = opt("--config");
if (!configPath) die("missing --config <readability.config.json>");
if (!existsSync(resolve(configPath))) die(`config not found: ${configPath}`);

let cfg;
try { cfg = JSON.parse(readFileSync(resolve(configPath), "utf8")); }
catch (e) { die(`config is not valid JSON (${e.message})`); }

const maxGrade = cfg.maxGrade;
if (typeof maxGrade !== "number" || !Number.isFinite(maxGrade)) die(`config needs a numeric "maxGrade" (the grade ceiling for the surface)`);
const roots = cfg.roots;
if (!Array.isArray(roots) || roots.length === 0) die(`config needs a non-empty "roots" array of directories and/or files to scan`);
const exts = Array.isArray(cfg.ext) && cfg.ext.length ? cfg.ext.map(String) : [".md"];
const exclude = Array.isArray(cfg.exclude) ? cfg.exclude.map(String) : [];

const READABILITY = resolve(dirname(fileURLToPath(import.meta.url)), "readability.mjs");
if (!existsSync(READABILITY)) die(`readability.mjs not found next to this gate at ${READABILITY}`);

const isExcluded = (p) => exclude.some((frag) => p.replace(/\\/g, "/").includes(frag));
const matchesExt = (name) => exts.some((e) => name.endsWith(e));
// A root may be a directory (walked recursively) or a single file (taken as-is, regardless of ext).
function collect(root) {
  const abs = resolve(root);
  if (!existsSync(abs)) die(`root does not exist: ${root}`);
  const st = statSync(abs);
  if (st.isFile()) return isExcluded(abs) ? [] : [abs];
  if (!st.isDirectory()) die(`root is neither a file nor a directory: ${root}`);
  const out = [];
  const walk = (dir) => {
    let ents;
    try { ents = readdirSync(dir, { withFileTypes: true }); }
    catch (e) { die(`cannot read directory ${dir}: ${e.message}`); }
    for (const e of ents) {
      const p = join(dir, e.name);
      if (isExcluded(p)) continue;
      if (e.isDirectory()) walk(p);
      else if (e.isFile() && matchesExt(e.name)) out.push(p);
    }
  };
  walk(abs);
  return out;
}

const files = [...new Set(roots.flatMap(collect))].sort();
if (files.length === 0) {
  die(`no files matching ${JSON.stringify(exts)} under ${JSON.stringify(roots)} (an unscanned surface is not a pass - add docs or widen roots/ext)`);
}

const over = [];
for (const file of files) {
  const r = spawnSync(process.execPath, [READABILITY, file, "--max-grade", String(maxGrade)], { encoding: "utf8" });
  if (r.error) die(`could not run readability on ${file}: ${r.error.message}`);
  if (r.status === 2) die(`readability failed closed on ${file}: ${(r.stderr || r.stdout || "").trim()}`);
  if (r.status === 1) over.push({ file, detail: (r.stdout || r.stderr || "").trim() });
  else if (r.status !== 0) die(`readability returned an unexpected exit ${r.status} on ${file}`);
}

if (over.length) {
  console.error(`[check-readability] FAIL - ${over.length} of ${files.length} scanned file(s) read above grade ${maxGrade}:`);
  for (const f of over) console.error(`  • ${f.file}  ${f.detail}`);
  console.error(`\nRewrite with shorter sentences and simpler words (usability-ux-universal-design/references/content-and-plain-language.md).`);
  process.exit(1);
}

console.log(`[check-readability] OK - ${files.length} file(s) scanned, all at or below grade ${maxGrade}.`);
process.exit(0);
