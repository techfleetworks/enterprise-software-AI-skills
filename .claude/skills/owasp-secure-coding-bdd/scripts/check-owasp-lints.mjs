#!/usr/bin/env node
/**
 * check-owasp-lints - fail on two high-signal, low-false-positive secure-coding mistakes.
 *
 * The structural half of owasp-secure-coding-bdd for the two defects that are reliably detectable in
 * source text (unlike most of the skill, which needs threat-modeling + BDD). Dependency-free.
 *
 *   node check-owasp-lints.mjs <file-or-dir>...
 *
 * Rules (each traces to a skill reference):
 *   jwt-alg-none - a JWT algorithm literal of "none" (references/cheatsheets/JSON_Web_Token.md:
 *                       "Refuse unsecured tokens … rejects `alg` set to `none`").
 *   cookie-insecure - a cookie set without HttpOnly + Secure + SameSite all present in the call /
 *                       header (references/cheatsheets/Session_Management.md: use `HttpOnly`, `Secure`,
 *                       and `SameSite`). Checks `.cookie(...)` / `setCookie(...)` / `setHeader(...Set-Cookie...)`
 *                       call spans and raw `Set-Cookie:` header string literals.
 *
 * SSRF is deliberately NOT a text lint here: the skill's own structural control is a network egress
 * proxy with no route to internal infra (references/cheatsheets/Server_Side_Request_Forgery_Prevention.md) -
 * the network layer is what holds when an application-layer check is bypassed. A regex over outbound calls would be mostly false
 * positives; SSRF is enforced by that egress architecture + a @security BDD scenario, not this gate.
 *
 * Suppress a reviewed exception with an inline `// owasp-lint:ignore[=rule] <reason>` (or `#` comment)
 * on a line within the finding's span; a reason is REQUIRED (an unexplained ignore does not suppress).
 *
 * Exit 0 = clean. 1 = one or more findings. 2 = bad usage / unreadable input.
 */
import { readFileSync, readdirSync, statSync, existsSync } from "node:fs";
import { join, extname } from "node:path";

function die(msg) { console.error(`[check-owasp-lints] FAIL - ${msg}`); process.exit(2); }

const inputs = process.argv.slice(2);
if (inputs.length === 0) die("no paths given. Usage: check-owasp-lints.mjs <file-or-dir>...");

const CODE_EXT = new Set([".js", ".jsx", ".ts", ".tsx", ".mjs", ".cjs", ".py", ".go", ".rb", ".java", ".php", ".cs"]);
const IGNORE_DIRS = new Set(["node_modules", ".git", "dist", "build", "coverage", "out", ".next", "vendor"]);

function collect(p) {
  if (!existsSync(p)) die(`path does not exist: ${p}`);
  const st = statSync(p);
  if (st.isDirectory()) {
    const base = p.split(/[\\/]/).pop();
    if (IGNORE_DIRS.has(base)) return [];
    return readdirSync(p).flatMap((n) => collect(join(p, n)));
  }
  return CODE_EXT.has(extname(p).toLowerCase()) ? [p] : [];
}
const files = inputs.flatMap(collect);
if (files.length === 0) die("no source files found in the given path(s) (zero-scan - fail closed)");

// Blank out comments (keep length + newlines so offsets/lines stay aligned) for RULE matching.
// Ignore directives are read from the RAW text first, so blanking comments never hides them.
// `#` is a line comment only in Python/Ruby - applying it to JS/TS/etc. would over-blank a `#private`
// field or `#`-token and hide a real finding later on the same line, so gate it by extension.
const HASH_COMMENT_EXT = new Set([".py", ".rb"]);
function blankComments(s, ext) {
  let out = s
    .replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, " "))
    .replace(/(^|[^:])\/\/[^\n]*/g, (m, p1) => p1 + " ".repeat(m.length - p1.length));
  if (HASH_COMMENT_EXT.has(ext)) {
    out = out.replace(/(^|\s)#[^\n]*/g, (m, p1) => p1 + " ".repeat(m.length - p1.length));
  }
  return out;
}

const lineAt = (text, idx) => text.slice(0, idx).split("\n").length;

// Balanced span from the '(' at openIdx → index just past the matching ')'. Falls back to +400 chars.
function parenSpanEnd(text, openIdx) {
  let depth = 0;
  for (let i = openIdx; i < text.length && i < openIdx + 4000; i++) {
    if (text[i] === "(") depth++;
    else if (text[i] === ")") { depth--; if (depth === 0) return i + 1; }
  }
  return Math.min(text.length, openIdx + 400);
}

const JWT_ALG_NONE = /\b(alg|algorithm|algorithms)\b["'`]?\s*[:=]\s*(\[[^\]]*["'`]none["'`][^\]]*\]|["'`]none["'`])/ig;
const COOKIE_CALL = /\.(cookie|setCookie|cookies\.set)\s*\(|setHeader\s*\(\s*["'`]set-cookie/ig;
const SETCOOKIE_STR = /["'`]\s*set-cookie\s*:[^"'`]*["'`]/ig;
const hasFlag = (s, re) => re.test(s);

function findingsFor(blanked) {
  const out = []; // {rule, index, end, missing?}
  let m;
  JWT_ALG_NONE.lastIndex = 0;
  while ((m = JWT_ALG_NONE.exec(blanked))) out.push({ rule: "jwt-alg-none", index: m.index, end: m.index + m[0].length });

  COOKIE_CALL.lastIndex = 0;
  while ((m = COOKIE_CALL.exec(blanked))) {
    const open = blanked.indexOf("(", m.index);
    const end = open >= 0 ? parenSpanEnd(blanked, open) : m.index + 400;
    const span = blanked.slice(open >= 0 ? open : m.index, end);
    // For .cookie()/.setCookie()/.cookies.set() (m[1] defined) the flags live in the options OBJECT as
    // identifier keys, so strip string literals first: a flag word inside the cookie NAME or value
    // (e.g. res.cookie('session_secure', t)) must NOT satisfy the check. For the setHeader Set-Cookie form
    // (m[1] undefined) the flags live inside the header STRING, so test the span as-is.
    const optionsForm = m[1] !== undefined;
    const testOn = optionsForm ? span.replace(/'(?:[^'\\]|\\.)*'|"(?:[^"\\]|\\.)*"|`(?:[^`\\]|\\.)*`/g, '""') : span;
    const missing = ["HttpOnly", "Secure", "SameSite"].filter((f) => !new RegExp(f, "i").test(testOn));
    if (missing.length) out.push({ rule: "cookie-insecure", index: m.index, end, missing });
  }
  SETCOOKIE_STR.lastIndex = 0;
  while ((m = SETCOOKIE_STR.exec(blanked))) {
    const missing = ["HttpOnly", "Secure", "SameSite"].filter((f) => !new RegExp(f, "i").test(m[0]));
    if (missing.length) out.push({ rule: "cookie-insecure", index: m.index, end: m.index + m[0].length, missing });
  }
  return out;
}

// An ignore on any line within [startLine, endLine] of the finding suppresses it (reason required).
function ignoredLines(raw) {
  const all = new Map(); // lineNo -> Set(rules) | "all"
  const re = /(?:\/\/|#)\s*owasp-lint:ignore(?:=([\w-]+))?\s+(\S.*)$/i;
  raw.split(/\r?\n/).forEach((line, i) => {
    const mm = line.match(re);
    if (!mm) return;
    const reason = (mm[2] || "").trim();
    if (reason.length < 3) return;
    const entry = all.get(i + 1) || new Set();
    entry.add(mm[1] ? mm[1].toLowerCase() : "*");
    all.set(i + 1, entry);
  });
  return all;
}

const problems = [];
for (const f of files) {
  let raw;
  try { raw = readFileSync(f, "utf8"); } catch (e) { die(`could not read ${f} (${e.message})`); }
  const blanked = blankComments(raw, extname(f).toLowerCase());
  const ign = ignoredLines(raw);
  for (const fd of findingsFor(blanked)) {
    const startLine = lineAt(blanked, fd.index);
    const endLine = lineAt(blanked, fd.end);
    // An ignore on ANY line within the finding's span suppresses it (matches the documented contract,
    // so a reviewer can put the directive on the natural line inside a multi-line cookie call).
    let suppressed = false;
    for (let L = startLine; L <= endLine && !suppressed; L++) {
      const ig = ign.get(L);
      if (ig && (ig.has("*") || ig.has(fd.rule))) suppressed = true;
    }
    if (suppressed) continue;
    problems.push({ file: f, line: startLine, rule: fd.rule, missing: fd.missing });
  }
}

if (problems.length) {
  console.error(`[check-owasp-lints] FAIL - ${problems.length} finding(s):`);
  for (const p of problems) {
    const extra = p.rule === "cookie-insecure" ? ` (missing: ${p.missing.join(", ")})` : "";
    const why = p.rule === "jwt-alg-none" ? "JWT alg \"none\" - pin the expected algorithm server-side; never accept alg:none"
      : "cookie set without HttpOnly+Secure+SameSite";
    console.error(`  • ${p.file}:${p.line}  [${p.rule}] ${why}${extra}`);
  }
  console.error(`\nFix the code, or add an inline "// owasp-lint:ignore <reason>" on a line in the finding's span.`);
  process.exit(1);
}
console.log(`[check-owasp-lints] OK - ${files.length} source file(s) scanned, no jwt-alg-none or insecure-cookie findings.`);
process.exit(0);
