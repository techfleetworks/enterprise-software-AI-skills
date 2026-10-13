#!/usr/bin/env node
// check-reference-links.mjs - fail when a doc points at a reference file that does not exist.
//
// The structural guard against a whole class of rot: a skill (or ADR, or README) names a `.md` reference
// file that was renamed or deleted, leaving a dangling pointer a reader follows into nothing. It was built
// after a cleanup deleted a cluster of reference files that four other skills and an ADR still linked to.
// This gate walks every Markdown file in the tree, collects the set of `.md` files that actually exist, and
// fails if any doc references a `.md` basename that is not in that set. It checks EXISTENCE only: that the
// named file is somewhere in the tree. It does not check that a cross-skill prose pointer resolves to the
// right directory (those are written as prose, e.g. "see owasp's `authentication-session.md`", not as
// clickable relative links), nor that the linked content still says what the citer claims.
//
// What it must NOT flag: filenames a skill tells an ADOPTER to create in their own repo (AGENTS.md,
// SECURITY.md, decisions.md, architecture.md, copilot-instructions.md), template placeholders
// (NNNN-*.md), vendored/build/temp paths, and deliberate one-off examples. Universal non-reference names
// are ignored by default; a deliberate example is marked at its source with an inline `link-check:ignore`;
// a repo can extend the ignore sets with an optional `reference-links.config.json` at --root.
//
// Usage:
//   node check-reference-links.mjs [--root <dir>] [--config <path>]
//
// Exit 0 = every referenced `.md` basename exists in the tree. Exit 1 = one or more dangling references.
// Exit 2 = fail closed (bad --root, or a config that is present but malformed). Dependency-free, offline.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url));
// scripts/ -> judge-arch/ -> skills/ -> .claude/ -> repo root
const REPO_ROOT = path.resolve(SCRIPT_DIR, "..", "..", "..", "..");
const args = process.argv.slice(2);
const opt = (name, def) => { const i = args.indexOf(name); return i !== -1 && args[i + 1] !== undefined ? args[i + 1] : def; };
const die = (code, msg) => { console.error(`check-reference-links: ${msg}`); process.exit(code); };

const ROOT = path.resolve(opt("--root", REPO_ROOT));
let rootStat;
try { rootStat = fs.statSync(ROOT); } catch (e) { die(2, `cannot stat --root ${ROOT}: ${e.message}`); }
if (!rootStat.isDirectory()) die(2, `--root ${ROOT} is not a directory (fail closed).`);

// Directories we never scan, index, or resolve a token into: build output, vendored third-party text,
// sibling git worktrees, the git dir, the OS temp dir, and the deliberately-broken fixtures the tests spawn.
const IGNORE_DIRS = new Set(["node_modules", ".git", "vendor", "worktrees", "discriminate-fixtures", "fixtures", "tmp"]);

// Universal non-reference names: filenames a skill instructs an ADOPTER to create in their own repo, and ADR
// template placeholders. These are legitimate prose mentions, never links to an in-tree reference file.
const DEFAULT_IGNORE_BASENAMES = new Set(["AGENTS.md", "SECURITY.md", "decisions.md", "architecture.md", "copilot-instructions.md"]);
const DEFAULT_IGNORE_PATTERNS = ["NNNN-*.md"];

// Optional config at --root extends (never replaces) the defaults. Present-but-malformed fails closed.
const configPath = path.resolve(opt("--config", path.join(ROOT, "reference-links.config.json")));
const ignoreBasenames = new Set(DEFAULT_IGNORE_BASENAMES);
let ignorePatterns = [...DEFAULT_IGNORE_PATTERNS];
if (fs.existsSync(configPath)) {
  let cfg;
  try { cfg = JSON.parse(fs.readFileSync(configPath, "utf8")); } catch (e) { die(2, `cannot parse config ${path.relative(ROOT, configPath)}: ${e.message}`); }
  if (cfg == null || typeof cfg !== "object" || Array.isArray(cfg)) die(2, "config must be a JSON object (fail closed).");
  if (cfg.ignoreBasenames != null) {
    if (!Array.isArray(cfg.ignoreBasenames)) die(2, "config.ignoreBasenames must be an array.");
    for (const b of cfg.ignoreBasenames) ignoreBasenames.add(String(b));
  }
  if (cfg.ignorePatterns != null) {
    if (!Array.isArray(cfg.ignorePatterns)) die(2, "config.ignorePatterns must be an array.");
    ignorePatterns = ignorePatterns.concat(cfg.ignorePatterns.map(String));
  }
}

// Compile a basename glob (only `*` is special; it matches any run of non-slash chars). Case-insensitive, so
// a template placeholder like `NNNN-*.md` also covers MADR's lowercase `nnnn-title.md`.
const patternRes = ignorePatterns.map((g) => {
  let re = "^";
  for (const c of String(g)) re += c === "*" ? "[^/]*" : ".+^${}()|[]\\?".includes(c) ? "\\" + c : c;
  return new RegExp(re + "$", "i");
});
const patternIgnored = (base) => patternRes.some((re) => re.test(base));

function walk(dir, out) {
  let entries;
  try { entries = fs.readdirSync(dir, { withFileTypes: true }); } catch { return; }
  for (const e of entries) {
    const full = path.join(dir, e.name);
    if (e.isDirectory()) { if (!IGNORE_DIRS.has(e.name)) walk(full, out); }
    else if (e.isFile() && e.name.toLowerCase().endsWith(".md")) out.push(full);
  }
}

const mdFiles = [];
walk(ROOT, mdFiles);

// The set of `.md` basenames that exist anywhere in the tree. Existence is checked by basename because the
// repo's cross-skill references are prose pointers ("owasp's `foo.md`"), not paths resolvable from the citer.
const existing = new Set(mdFiles.map((f) => path.basename(f).toLowerCase()));

// A `.md` token: a path/filename of word chars, dot, slash, dash, ending in `.md`, not followed by more word
// chars (so `foo.md5` is not a hit). The char class excludes `)` and backtick, so `](refs/foo.md)` and
// `` `foo.md` `` both yield a clean token.
const TOKEN_RE = /[A-Za-z0-9_./-]+\.md(?![A-Za-z0-9])/gi;
const segs = (token) => token.split("/").filter(Boolean);

const violations = [];
for (const file of mdFiles) {
  let text;
  try { text = fs.readFileSync(file, "utf8"); } catch { continue; }
  const rawLines = text.split(/\r?\n/);
  // Join hyphen soft-wraps so a wrapped path is tokenized whole and still EVALUATED (never skipped): a line
  // ending in a word char + `-` continues into the next line (Markdown wrap of a long hyphenated path). The
  // join fires only on that exact shape, so a stray trailing dash can never swallow a real reference on the
  // next line. Each logical line keeps the physical line number where it began.
  const logical = [];
  for (let i = 0; i < rawLines.length; i++) {
    let joined = rawLines[i];
    const startLine = i + 1;
    while (/[A-Za-z0-9]-\s*$/.test(joined) && i + 1 < rawLines.length) {
      joined = joined.replace(/\s*$/, "") + rawLines[i + 1].replace(/^\s*/, "");
      i++;
    }
    logical.push({ text: joined, line: startLine });
  }
  for (const { text: line, line: lineNo } of logical) {
    if (line.includes("link-check:ignore")) continue;
    let m;
    TOKEN_RE.lastIndex = 0;
    while ((m = TOKEN_RE.exec(line)) !== null) {
      const token = m[0];
      const before = line[m.index - 1];
      // `before === "/"` is the per-token URL/absolute-path guard: a token glued to a `/` on its left is the
      // tail of a URL (after `https://`) or an absolute path, not a repo reference. It is scoped to the token,
      // so a real dangling reference elsewhere on a line that also holds a URL is still evaluated.
      if (before === "/") continue;
      if (before === ">") continue;                      // placeholder remnant (e.g. `<subject>-audit.md`)
      if (token.startsWith("-")) continue;               // leading-dash fragment
      if (token.startsWith("/")) continue;               // absolute path (shell example)
      if (segs(token).some((s) => IGNORE_DIRS.has(s))) continue; // vendored/build/temp path
      const base = path.basename(token);
      if (ignoreBasenames.has(base) || patternIgnored(base)) continue;
      if (!existing.has(base.toLowerCase())) {
        violations.push({ file: path.relative(ROOT, file), line: lineNo, token });
      }
    }
  }
}

if (violations.length) {
  console.error(`\ncheck-reference-links FAIL. ${violations.length} dangling reference(s) to a .md file that does not exist in the tree:\n`);
  for (const v of violations) {
    console.error(`  x ${v.file}:${v.line}  ->  ${v.token}  (no file named ${path.basename(v.token)} exists in the repo)`);
  }
  console.error(`\nFix: repoint each to an existing file; if it is a deliberate example, add 'link-check:ignore' on that line; if it is a filename adopters create, add it to reference-links.config.json.\n`);
  process.exit(1);
}
console.log(`check-reference-links PASS. Scanned ${mdFiles.length} Markdown file(s); every referenced .md exists.`);
process.exit(0);
