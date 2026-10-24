#!/usr/bin/env node
// bootstrap-v2-gate: reference-links
// check-reference-links.mjs - fail when a doc points at a reference file that does not exist.
//
// The structural guard against a whole class of rot: a skill (or ADR, or README) names a `.md` reference
// file that was renamed or deleted, leaving a dangling pointer a reader follows into nothing. It was built
// after a cleanup deleted a cluster of reference files that four other skills and an ADR still linked to.
// This gate walks every Markdown file in the tree and collects the set of `.md` files that actually exist. A
// Markdown INLINE-LINK target (`](path.md)`) is resolved RELATIVE TO THE CITING FILE and case-sensitively: it
// must point at a real file, so a dangling link is caught even when another file shares its basename elsewhere.
// A PROSE mention of a `.md` name (e.g. "see owasp's `authentication-session.md`") is checked by EXISTENCE of
// its basename anywhere in the tree, because cross-skill prose pointers are not resolvable from the citer's
// folder. It does not check that linked content still says what the citer claims.
//
// What it must NOT flag: filenames a skill tells an ADOPTER to create in their own repo (AGENTS.md,
// SECURITY.md, decisions.md, architecture.md, copilot-instructions.md), template placeholders
// (NNNN-*.md), vendored/build/temp paths, and deliberate one-off examples. Universal non-reference names
// are ignored by default; a deliberate example is marked at its source with an inline `link-check:ignore`;
// a repo can extend the ignore sets with an optional `reference-links.config.json` at --root.
//
// Usage:
//   node check-reference-links.mjs [--root <dir>] [--config <path>]
// ROOT precedence: --root, else $GATE_REPO_ROOT (the env the generated CI workflow sets), else the repo root
// relative to this script.
//
// Exit 0 = every prose basename exists and every link target resolves. Exit 1 = one or more dangling
// references. Exit 2 = fail closed (bad --root, a config present but malformed, or a path that could not be
// read so coverage is unproven). Dependency-free, offline.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url));
// scripts/ -> judge-arch/ -> skills/ -> .claude/ -> repo root
const REPO_ROOT = path.resolve(SCRIPT_DIR, "..", "..", "..", "..");
const args = process.argv.slice(2);
const opt = (name, def) => { const i = args.indexOf(name); return i !== -1 && args[i + 1] !== undefined ? args[i + 1] : def; };
const die = (code, msg) => { console.error(`check-reference-links: ${msg}`); process.exit(code); };

// ROOT precedence: an explicit --root, else GATE_REPO_ROOT (the env the generated CI workflow sets so every
// gate finds the repo root, honoured by check-bootstrap-presence too), else the script-relative repo root. A
// gate run with neither --root nor GATE_REPO_ROOT from a consumer's scripts/ci copy would otherwise scan two
// levels above the repo (#121a).
const ROOT = path.resolve(opt("--root", process.env.GATE_REPO_ROOT || REPO_ROOT));
let rootStat;
try { rootStat = fs.statSync(ROOT); } catch (e) { die(2, `cannot stat --root ${ROOT}: ${e.message}`); }
if (!rootStat.isDirectory()) die(2, `--root ${ROOT} is not a directory (fail closed).`);

// --ignore <relpath> (repeatable): a directory, anchored to --root, whose own docs are NOT scanned as citers
// but ARE still indexed as link targets. Used for a vendored skills tree (.claude/skills) that travels into a
// consumer: its docs must not be flagged, yet a consumer doc may legitimately point at a vendored .md. Anchored,
// so a decoy like src/.claude/skills elsewhere is still scanned. The path lives in the manifest invoke
// (parity/provenance-locked), so a consumer cannot widen it to hide its own dangling links (#118).
const ignorePaths = args.reduce((acc, a, i) =>
  (a === "--ignore" && args[i + 1] && !args[i + 1].startsWith("--")
    ? [...acc, args[i + 1].replace(/\\/g, "/").replace(/\/+$/, "")] : acc), []);
const isIgnoredRel = (rel) => ignorePaths.some((ig) => rel === ig || rel.startsWith(ig + "/"));

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

// Unreadable paths are collected and fail the gate CLOSED (exit 2) rather than being skipped silently: a
// directory the walk cannot read, or a .md the scan cannot read, means coverage is UNPROVEN, so the gate must
// not report green. An ENOENT on a directory is a benign race (a file vanished between listing and walking)
// and is ignored. (#121b, matching arch-gate's fail-closed read handling.)
const scanErrors = [];
function walk(dir, out) {
  let entries;
  try { entries = fs.readdirSync(dir, { withFileTypes: true }); }
  catch (e) { if (e.code !== "ENOENT") scanErrors.push(`cannot read directory ${path.relative(ROOT, dir) || dir}: ${e.message}`); return; }
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
// EVERY .md is indexed as a target, including those under an --ignore path, so a doc that correctly points at
// a file in the ignored (e.g. vendored) tree is not falsely flagged.
const existing = new Set(mdFiles.map((f) => path.basename(f).toLowerCase()));

// The set of `.md` paths that exist, RELATIVE TO ROOT and CASE-SENSITIVELY (forward-slash normalized). A
// Markdown inline-link target is resolved against this set from the citing file's directory, so a dangling
// link to docs/missing/README.md is not cleared merely because some other README.md exists elsewhere, and the
// result does not depend on a case-insensitive filesystem. Prose mentions keep the basename set above. (#147)
const existingPaths = new Set(mdFiles.map((f) => path.relative(ROOT, f).replace(/\\/g, "/")));

// Scan as CITERS only the files NOT under an --ignore path: the vendored skills tree is indexed above, but its
// own docs are not evaluated for dangling links here (#118).
const citers = mdFiles.filter((f) => !isIgnoredRel(path.relative(ROOT, f).replace(/\\/g, "/")));

// A `.md` token: a path/filename of word chars, dot, slash, dash, ending in `.md`, not followed by more word
// chars (so `foo.md5` is not a hit). The char class excludes `)` and backtick, so `](refs/foo.md)` and
// `` `foo.md` `` both yield a clean token.
const TOKEN_RE = /[A-Za-z0-9_./-]+\.md(?![A-Za-z0-9])/gi;
const segs = (token) => token.split("/").filter(Boolean);

// True when position `idx` on a (logical) line falls inside a backtick inline-code span: an odd number of
// backticks precede it. Used so a `](path)` written as an EXAMPLE inside backticks is treated as example text,
// not a live Markdown link. Single-backtick spans are the common doc case; a multi-backtick fence on one
// logical line is rare and would at worst fall back to the lenient basename rule, never a false pass.
const inInlineCode = (s, idx) => {
  let ticks = 0;
  for (let i = 0; i < idx && i < s.length; i++) if (s[i] === "`") ticks++;
  return ticks % 2 === 1;
};

const violations = [];
for (const file of citers) {
  let text;
  try { text = fs.readFileSync(file, "utf8"); }
  catch (e) { scanErrors.push(`cannot read ${path.relative(ROOT, file)}: ${e.message}`); continue; }
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
      // A Markdown inline-link target `](path)` is resolved RELATIVE TO THE CITING FILE, case-sensitively, so
      // it is caught when it does not point at a real file even if another file shares its basename elsewhere.
      // A prose mention (anything not written as a link target) keeps the documented basename-existence rule,
      // because cross-skill prose pointers ("owasp's `foo.md`") are not resolvable from the citer's folder.
      // A `](path)` that appears INSIDE a backtick inline-code span is example text showing link syntax, not a
      // live link (a doc about Markdown-link hygiene legitimately shows one), so it is NOT resolved as a link;
      // it falls back to the lenient basename rule, exactly as a backtick-wrapped mention always has.
      const isLinkTarget = before === "(" && line[m.index - 2] === "]" && !inInlineCode(line, m.index);
      if (isLinkTarget) {
        const rel = path.relative(ROOT, path.resolve(path.dirname(file), token)).replace(/\\/g, "/");
        if (rel.startsWith("..")) continue;            // resolves outside the tree; not a repo reference to judge
        if (!existingPaths.has(rel)) {
          violations.push({ file: path.relative(ROOT, file), line: lineNo, token, link: true });
        }
        continue;
      }
      if (!existing.has(base.toLowerCase())) {
        violations.push({ file: path.relative(ROOT, file), line: lineNo, token });
      }
    }
  }
}

// Fail CLOSED first: an unreadable directory or file means the scan was incomplete, so the gate cannot
// honestly report green even if nothing dangling was found in what it could read (#121b).
if (scanErrors.length) {
  console.error(`\ncheck-reference-links FAIL (fail-closed). ${scanErrors.length} path(s) could not be read, so link coverage is unproven:\n`);
  for (const e of scanErrors) console.error(`  x ${e}`);
  console.error(`\nFix the unreadable path(s) (a lock, a permission, a bad mount) and re-run; the gate will not report green on an incomplete scan.\n`);
  process.exit(2);
}
if (violations.length) {
  console.error(`\ncheck-reference-links FAIL. ${violations.length} dangling reference(s):\n`);
  for (const v of violations) {
    if (v.link) console.error(`  x ${v.file}:${v.line}  ->  ${v.token}  (Markdown link target does not resolve to a file, relative to ${v.file})`);
    else console.error(`  x ${v.file}:${v.line}  ->  ${v.token}  (no file named ${path.basename(v.token)} exists in the repo)`);
  }
  console.error(`\nFix: repoint each to an existing file; if it is a deliberate example, add 'link-check:ignore' on that line; if it is a filename adopters create, add it to reference-links.config.json.\n`);
  process.exit(1);
}
console.log(`check-reference-links PASS. Scanned ${citers.length} Markdown file(s)${ignorePaths.length ? ` (indexed ${mdFiles.length}; ${mdFiles.length - citers.length} under --ignore scanned as targets only)` : ""}; every referenced .md exists.`);
process.exit(0);
