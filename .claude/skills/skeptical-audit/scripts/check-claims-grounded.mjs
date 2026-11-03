#!/usr/bin/env node
// bootstrap-v2-consumer-gate: claims-grounded
/**
 * check-claims-grounded - fail when any document in the configured "findings" surface carries an
 * untagged factual claim or a hedge word, by running the skeptical-audit claim-lint over EVERY file
 * in that surface, not one hand-picked file.
 *
 * This is the repo gate behind skeptical-audit's evidence discipline. claim-lint.mjs is the single-file
 * smoke alarm and the ONE owner of what an untagged claim is (its hedge list, its claim patterns, its
 * evidence states). This gate does NOT re-implement any of that: it walks the surface and runs the real
 * claim-lint --strict per file, so a new findings/review doc cannot escape review by never being named on
 * a command line. The detection lives in one place; this gate decides WHICH files it runs over.
 *
 *   node check-claims-grounded.mjs --config <claims-grounded.config.json>
 *
 * Config (JSON):
 *   {
 *     "roots": ["docs/findings", "docs/audit"],   // directories whose tree is scanned recursively (non-empty)
 *     "ext": [".md"],                              // file extensions to scan (default [".md"])
 *     "exclude": ["docs/findings/templates"]       // path substrings to skip (optional)
 *   }
 *
 * Exit codes:
 *   0 = every scanned file is clean (claim-lint --strict exit 0). Prints how many were scanned.
 *   1 = at least one file carries an untagged claim or hedge (claim-lint --strict exit 1). Lists them.
 *   2 = fail closed: bad usage; missing or non-JSON config; no roots; a root that does not exist; an
 *       EMPTY surface (zero matching files - an unscanned surface is not a pass); an unreadable file; or
 *       claim-lint itself failing closed (exit 2) on any file.
 *
 * Honest limit: this gate is exactly as precise as claim-lint - a smoke alarm, not a judge. It inherits
 * claim-lint's false positives and negatives; it does not add detection, it removes the "which files"
 * escape hatch. Dependency-free (Node built-ins); it shells out to the sibling claim-lint.mjs.
 */
import { readFileSync, readdirSync, existsSync, statSync } from "node:fs";
import { resolve, dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";

function die(msg) { console.error(`[check-claims-grounded] FAIL - ${msg}`); process.exit(2); }

const args = process.argv.slice(2);
if (args.includes("-h") || args.includes("--help")) {
  console.log("usage: node check-claims-grounded.mjs --config <claims-grounded.config.json>");
  process.exit(0);
}
const opt = (n) => { const i = args.indexOf(n); return i >= 0 ? args[i + 1] : undefined; };
const configPath = opt("--config");
if (!configPath) die("missing --config <claims-grounded.config.json>");
if (!existsSync(resolve(configPath))) die(`config not found: ${configPath}`);

let cfg;
try { cfg = JSON.parse(readFileSync(resolve(configPath), "utf8")); }
catch (e) { die(`config is not valid JSON (${e.message})`); }

const roots = cfg.roots;
if (!Array.isArray(roots) || roots.length === 0) die(`config needs a non-empty "roots" array of directories to scan`);
const exts = Array.isArray(cfg.ext) && cfg.ext.length ? cfg.ext.map(String) : [".md"];
const exclude = Array.isArray(cfg.exclude) ? cfg.exclude.map(String) : [];

// The one owner of claim detection, resolved next to this gate so the gate does not re-implement it.
const CLAIM_LINT = resolve(dirname(fileURLToPath(import.meta.url)), "claim-lint.mjs");
if (!existsSync(CLAIM_LINT)) die(`claim-lint.mjs not found next to this gate at ${CLAIM_LINT}`);

// Walk each root's tree, collecting files whose extension matches and whose path is not excluded. A root
// that does not exist is a fail-closed error, never a silently empty scan.
const isExcluded = (p) => exclude.some((frag) => p.replace(/\\/g, "/").includes(frag));
const matchesExt = (name) => exts.some((e) => name.endsWith(e));
function collect(root) {
  const abs = resolve(root);
  if (!existsSync(abs)) die(`root does not exist: ${root}`);
  if (!statSync(abs).isDirectory()) die(`root is not a directory: ${root}`);
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

const flagged = [];
for (const file of files) {
  const r = spawnSync(process.execPath, [CLAIM_LINT, file, "--strict"], { encoding: "utf8" });
  if (r.error) die(`could not run claim-lint on ${file}: ${r.error.message}`);
  if (r.status === 2) die(`claim-lint failed closed on ${file}: ${(r.stderr || r.stdout || "").trim()}`);
  if (r.status === 1) flagged.push({ file, detail: (r.stdout || "").trim() });
  else if (r.status !== 0) die(`claim-lint returned an unexpected exit ${r.status} on ${file}`);
}

if (flagged.length) {
  console.error(`[check-claims-grounded] FAIL - ${flagged.length} of ${files.length} scanned file(s) carry an untagged claim or hedge:`);
  for (const f of flagged) {
    console.error(`  • ${f.file}`);
    for (const line of f.detail.split("\n").filter(Boolean)) console.error(`      ${line}`);
  }
  console.error(`\nTag each factual claim with an evidence state, or remove the hedge (skeptical-audit/references/evidence-discipline.md).`);
  process.exit(1);
}

console.log(`[check-claims-grounded] OK - ${files.length} file(s) scanned under ${JSON.stringify(roots)}, 0 untagged claims.`);
process.exit(0);
