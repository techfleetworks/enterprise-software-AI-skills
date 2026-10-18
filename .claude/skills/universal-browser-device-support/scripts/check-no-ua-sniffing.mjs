#!/usr/bin/env node
// bootstrap-v2-gate: no-ua-sniffing
/**
 * check-no-ua-sniffing - fail when code branches on the browser's user-agent instead of detecting a
 * feature.
 *
 * The structural half of universal-browser-device-support's core rule: feature-detect, never UA-sniff.
 * Branching on a brand string (navigator.userAgent, navigator.vendor, or a /Chrome|Safari|.../ test)
 * rots as browsers change, is spoofable, and silently misses engines you did not list. This gate scans
 * JS and TS source and fails (exit 1) when it finds the user-agent sniffing surface, so the rule cannot
 * be skipped by accident. Dependency-free (Node built-ins), vendor-neutral.
 *
 *   node check-no-ua-sniffing.mjs <file-or-dir>...   # scans .js/.jsx/.ts/.tsx/.mjs/.cjs (dirs recurse)
 *
 * Rules:
 *   ua-api         a read of navigator.userAgent / vendor / appVersion / platform / userAgentData.
 *   ua-brand-test  a line that both names a browser brand token (MSIE, Chrome, Safari, Firefox, Edg,
 *                  OPR, Gecko, WebKit, ...) and tests it (.test(, .match(, .indexOf(, .includes(, ==).
 *
 * A legitimate exception (one-off analytics capture, a documented quirk workaround with a fallback) is
 * suppressed with an inline comment on the flagged line or the line directly above it:
 *   // ua-sniff:ignore <reason>              (suppress every rule for that line)
 *   // ua-sniff:ignore=ua-api <reason>       (suppress one rule for that line)
 * The reason is REQUIRED (an unexplained ignore does not suppress), mirroring the repo's other gates.
 *
 * Scope (honest): this catches the sniffing *surface*; it cannot prove a feature-detection fallback is
 * correct (that is for judge-arch and tests). It is a line/regex linter, not a JS parser, so it errs
 * toward over-flagging; use the inline ignore for a reviewed exception.
 *
 * Exit 0 = no unsuppressed UA sniffing. 1 = one or more findings. 2 = bad usage / unreadable / no files.
 */
import { readFileSync, readdirSync, statSync, existsSync } from "node:fs";
import { join, extname, resolve, sep } from "node:path";

function die(msg) { console.error(`[check-no-ua-sniffing] FAIL - ${msg}`); process.exit(2); }

// --allow-empty: when the aggregator scans the WHOLE repo (an invoke-fixed scope, not a dev-chosen path),
// zero matching files means "nothing to check" and must PASS. A dev cannot abuse it (invoke lives in the
// parity/provenance-protected manifest). Without the flag, an explicit path matching nothing still fails closed.
// --ignore <relpath> (repeatable): skip a directory the gate must never lint - the gate infrastructure
// itself (scripts/ci), which legitimately contains UA strings in its own docstring. The paths are fixed in
// the manifest `invoke` (parity/provenance-protected), so a dev cannot widen them to hide product code.
const rawArgs = process.argv.slice(2);
const allowEmpty = rawArgs.includes("--allow-empty");
const ignorePaths = [];
const inputs = [];
for (let i = 0; i < rawArgs.length; i++) {
  const a = rawArgs[i];
  if (a === "--allow-empty") continue;
  if (a === "--ignore") {
    const v = rawArgs[++i];
    if (v === undefined) die("--ignore requires a path argument");
    ignorePaths.push(resolve(process.cwd(), v));
    continue;
  }
  inputs.push(a);
}
if (inputs.length === 0) die("no paths given. Usage: check-no-ua-sniffing.mjs [--allow-empty] [--ignore <relpath>]... <file-or-dir>...");
const isIgnored = (abs) => ignorePaths.some((ig) => abs === ig || abs.startsWith(ig + sep));

const EXTS = new Set([".js", ".jsx", ".ts", ".tsx", ".mjs", ".cjs"]);
// Skip the usual non-product dirs AND test directories: test files carry intentional patterns (a fixture may
// use navigator.userAgent on purpose to test a fallback), so scanning them produces false positives. Product
// code lives outside these; this matches standard linter behavior and the node_modules/dist skips above.
const IGNORE_DIRS = new Set(["node_modules", ".git", "dist", "build", "coverage", "vendor", "test", "tests", "__tests__", "spec"]);
function collect(p) {
  if (!existsSync(p)) die(`path does not exist: ${p}`);
  if (isIgnored(resolve(process.cwd(), p))) return [];
  const st = statSync(p);
  if (st.isDirectory()) {
    const base = p.split(/[/\\]/).pop();
    if (IGNORE_DIRS.has(base)) return [];
    return readdirSync(p).flatMap((n) => collect(join(p, n)));
  }
  return EXTS.has(extname(p).toLowerCase()) ? [p] : [];
}
const files = inputs.flatMap(collect);
if (files.length === 0) {
  if (allowEmpty) { console.log("[check-no-ua-sniffing] OK - no JS/TS source files to scan (--allow-empty; whole-repo scope)."); process.exit(0); }
  die("no JS/TS source files found in the given path(s) (zero-scan - fail closed)");
}

const UA_API = /\bnavigator\s*\.\s*(userAgent|vendor|appVersion|platform|userAgentData)\b/;
const BRAND = /\b(MSIE|Trident|Edge|Edg|EdgA|EdgiOS|Chrome|Chromium|CriOS|Firefox|FxiOS|Safari|OPR|Opera|Gecko|WebKit|Windows NT|Macintosh|iPhone|iPad|Android)\b/;
const TESTOP = /\.(test|match|exec|indexOf|includes|search|startsWith)\s*\(|[=!]==?\s*['"]|['"]\s*[=!]==?/;

// Strip comments from a line for CODE matching (so a brand token in a comment is not flagged).
const stripComments = (s) => s.replace(/\/\*.*?\*\//g, " ").replace(/\/\/.*$/, " ");

// An ignore directive in a comment; reason (>= 3 chars after trimming) required.
const IGNORE = /(?:\/\/|\/\*)\s*ua-sniff:ignore(?:=([\w-]+))?\s+(\S[^*]*?)\s*(?:\*\/|$)/i;
function ignoreOf(rawLine) {
  const m = rawLine.match(IGNORE);
  if (!m) return null;
  if ((m[2] || "").trim().length < 3) return null;
  return { all: !m[1], rule: m[1] ? m[1].toLowerCase() : null };
}
// A directive on the line ABOVE only counts when that line is comment-only (no code). Otherwise a
// trailing ignore on one statement would also silently suppress a real sniff on the next line.
function lineAboveIgnore(prevRaw) {
  if (!prevRaw) return null;
  const ig = ignoreOf(prevRaw);
  if (!ig) return null;
  return stripComments(prevRaw).trim().length === 0 ? ig : null;
}

const problems = [];
for (const f of files) {
  let text;
  try { text = readFileSync(f, "utf8"); }
  catch (e) { die(`could not read ${f} (${e.message})`); }
  const lines = text.split(/\r?\n/);
  for (let i = 0; i < lines.length; i++) {
    const raw = lines[i];
    const code = stripComments(raw);
    const hits = [];
    if (UA_API.test(code)) hits.push("ua-api");
    if (BRAND.test(code) && TESTOP.test(code)) hits.push("ua-brand-test");
    if (hits.length === 0) continue;
    // A directive on this line, or a comment-only directive on the line directly above, suppresses.
    const ig = ignoreOf(raw) || lineAboveIgnore(lines[i - 1]);
    for (const rule of hits) {
      if (ig && (ig.all || ig.rule === rule)) continue;
      problems.push({ file: f, line: i + 1, rule });
    }
  }
}

if (problems.length) {
  console.error(`[check-no-ua-sniffing] FAIL - ${problems.length} user-agent sniffing site(s):`);
  for (const p of problems) console.error(`  • ${p.file}:${p.line}  [${p.rule}]`);
  console.error(`\nFeature-detect instead (@supports in CSS, capability checks like 'IntersectionObserver' in window).\n` +
    `For a reviewed exception, add an inline "// ua-sniff:ignore <reason>" on the line or the line above.`);
  process.exit(1);
}
console.log(`[check-no-ua-sniffing] OK - ${files.length} source file(s) scanned, no user-agent sniffing.`);
process.exit(0);
