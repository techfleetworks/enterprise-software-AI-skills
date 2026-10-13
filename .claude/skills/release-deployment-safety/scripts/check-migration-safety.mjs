#!/usr/bin/env node
/**
 * check-migration-safety - flag unsafe SQL migration patterns before they ship.
 *
 * The structural half of release-deployment-safety's expand/contract rule: it fails (exit 1) when a
 * migration contains a change that breaks a running old instance or takes a blocking lock, so the
 * "never release a breaking schema change in one step" rule can't be skipped by accident. Each rule
 * enforces a lock-taking / break-old-instance item from the "Rules for specific changes" / "Never"
 * list in references/zero-downtime-db-migrations.md. Dependency-free (Node built-ins), vendor-neutral.
 *
 *   node check-migration-safety.mjs <file-or-dir>...   # scan .sql files (dirs scanned recursively)
 *
 * Suppressing a deliberate, reviewed exception (e.g. a contract-phase DROP that is backed up and
 * announced): put an inline comment ON OR BEFORE the statement (within the same statement - i.e. after
 * the previous `;`; a trailing comment after the statement's own `;` binds to the NEXT statement) -
 *   -- migration-safety:ignore <reason>              (suppress every rule for that statement)
 *   -- migration-safety:ignore=drop-table <reason>   (suppress one rule for that statement)
 * The reason is REQUIRED; a bare `ignore` with no reason does NOT suppress (an unexplained waiver is
 * not a waiver - mirrors the arch-gate waiver discipline).
 *
 * Scope / limitations (honest): this is a regex/statement linter, not a SQL parser. It does NOT
 * detect a one-shot `UPDATE` backfill (no row-count signal in the text). A `;` inside a string
 * literal or a `$$ … $$` function body can mis-split, and a forbidden keyword inside such a span can
 * over-flag - but the direction is ALWAYS over-flag (a real top-level unsafe statement is never
 * hidden); use the inline ignore for those. A dialect/format quirk can likewise over- or under-match.
 *
 * Exit 0 = clean. 1 = one or more unsuppressed unsafe patterns. 2 = bad usage / unreadable input.
 */
import { readFileSync, readdirSync, statSync, existsSync } from "node:fs";
import { join, extname } from "node:path";

function die(msg) { console.error(`[check-migration-safety] FAIL - ${msg}`); process.exit(2); }

const inputs = process.argv.slice(2);
if (inputs.length === 0) die("no paths given. Usage: check-migration-safety.mjs <file-or-dir>...");

// --- collect .sql files -------------------------------------------------------
function collect(p) {
  if (!existsSync(p)) die(`path does not exist: ${p}`);
  const st = statSync(p);
  if (st.isDirectory()) return readdirSync(p).flatMap((n) => collect(join(p, n)));
  return extname(p).toLowerCase() === ".sql" ? [p] : [];
}
const files = inputs.flatMap(collect);
if (files.length === 0) die("no .sql files found in the given path(s) (zero-scan - fail closed)");

// --- rules: each is tested against ONE comment-stripped statement -------------
// `unless` (when present and found) clears the match - this is what a plain forbidden-regex engine
// can't express (e.g. NOT NULL is fine *with* a DEFAULT), which is why this gate is its own script.
const RULES = [
  { name: "drop-table", re: /\bDROP\s+TABLE\b/i,
    why: "destructive. Contract in a LATER release, after a backup + a confirmation gate + an explicit call-out." },
  { name: "truncate", re: /\bTRUNCATE\b/i,
    why: "destructive and usually irreversible. Requires a backup + confirmation gate + call-out." },
  { name: "drop-column", re: /\bDROP\s+COLUMN\b/i,
    why: "stop writing, stop reading, deploy, THEN drop in a later release (confirm nothing reads it first)." },
  { name: "rename-column", re: /\bRENAME\s+(COLUMN|TO)\b/i,
    why: "a direct rename breaks running old code instantly. Add new → dual-write → backfill → switch → drop old." },
  // MySQL/MariaDB dialect: CHANGE renames (and may retype) a column; MODIFY retypes one. Both are the
  // dialect's forms of the destructive rename/type-change above, which the Postgres-shaped rules miss.
  { name: "mysql-change-column", re: /\bCHANGE\s+(COLUMN\s+)?\S/i,
    why: "MySQL CHANGE renames a column (breaking old code) and can rewrite its type under lock. Add new → dual-write → backfill → switch → drop old." },
  { name: "mysql-modify-column", re: /\bMODIFY\s+(COLUMN\s+)?\S/i,
    why: "MySQL MODIFY changes a column's type in place, rewriting + locking the table and breaking old code. Add a new column → backfill → switch → drop." },
  // `(?!CONSTRAINT\b)` so this fires only on ADD COLUMN … NOT NULL, not on ADD CONSTRAINT … CHECK
  // (col IS NOT NULL) - the latter is the skill's own safe 3-step and is handled by fk-check-not-valid.
  { name: "add-not-null-no-default", re: /\bADD\s+(COLUMN\s+)?(?!CONSTRAINT\b)[^;]*\bNOT\s+NULL\b/i, unless: /\b(DEFAULT|GENERATED|NOT\s+VALID)\b/i,
    why: "NOT NULL without a DEFAULT on a populated table fails/locks. Add it nullable or with a default, then tighten." },
  { name: "set-not-null-direct", re: /\bSET\s+NOT\s+NULL\b/i,
    why: "a bare SET NOT NULL scans the whole table under lock. Use the 3-step CHECK … NOT VALID → VALIDATE → SET NOT NULL - and because the final SET NOT NULL is textually identical, suppress it with an inline ignore noting the prior validated CHECK." },
  // Require ALTER COLUMN <name> TYPE adjacency so a column literally named "type" isn't mistaken for a type change.
  { name: "alter-column-type", re: /\bALTER\s+COLUMN\s+\S+\s+(SET\s+DATA\s+)?TYPE\b/i,
    why: "an in-place type change rewrites + locks the table and breaks old code. Add a new column → backfill → switch → drop." },
  { name: "fk-check-not-valid", re: /\bADD\s+(CONSTRAINT\s+\S+\s+)?(CHECK|FOREIGN\s+KEY)\b/i, unless: /\bNOT\s+VALID\b/i,
    why: "adding a CHECK or FOREIGN KEY validates existing rows under lock. Add it NOT VALID, then VALIDATE CONSTRAINT in a separate step (Postgres)." },
  { name: "index-not-concurrent", re: /\bCREATE\s+(UNIQUE\s+)?INDEX\b/i, unless: /\bCONCURRENTLY\b/i,
    why: "a non-CONCURRENT index build takes an ACCESS EXCLUSIVE lock that blocks writes. Use CREATE INDEX CONCURRENTLY (Postgres). (For a brand-new table this is safe - suppress with a reason.)" },
];

// Strip block comments then line comments, so rules never match commented-out SQL.
const stripComments = (s) => s.replace(/\/\*[\s\S]*?\*\//g, " ").replace(/--[^\n]*/g, " ");

// Find ignore directives in a statement's RAW text (before stripping). Returns {all, rules:Set}.
// Scanned per LINE so the required reason must sit on the directive's own line - otherwise a bare
// `ignore` could swallow the next line's SQL as its "reason" and silently suppress a real violation.
function ignores(rawStmt) {
  const out = { all: false, rules: new Set() };
  const re = /--\s*migration-safety:ignore(?:=([\w-]+))?\s+(\S.*)$/i;
  for (const line of rawStmt.split(/\r?\n/)) {
    const m = line.match(re);
    if (!m) continue;
    const reason = (m[2] || "").trim();
    if (reason.length < 3) continue; // unexplained ignore does not suppress
    if (m[1]) out.rules.add(m[1].toLowerCase()); else out.all = true;
  }
  return out;
}

// Split a file into statements on ';', tracking the 1-based line where each begins. A ';' extends its
// statement to the END OF ITS LINE, so a trailing `-- …` comment on the same line (incl. a trailing
// `-- migration-safety:ignore`) binds to the statement it follows, not to the next one.
function statements(text) {
  const out = [];
  let start = 0, line = 1, startLine = 1;
  for (let i = 0; i < text.length; i++) {
    if (text[i] === "\n") { line++; continue; }
    if (text[i] === ";") {
      let j = i + 1;
      while (j < text.length && text[j] !== "\n") j++; // absorb the rest of this line (trailing comment)
      out.push({ raw: text.slice(start, j), line: startLine });
      if (j < text.length) { line++; start = j + 1; startLine = line; } // skip the newline; next stmt is on the next line
      else start = j; // EOF, no trailing newline
      i = j; // resume after the newline (the loop's i++ moves to j+1)
    }
  }
  if (start < text.length && text.slice(start).trim()) out.push({ raw: text.slice(start), line: startLine });
  return out;
}

const problems = [];
for (const f of files) {
  let text;
  try { text = readFileSync(f, "utf8"); }
  catch (e) { die(`could not read ${f} (${e.message})`); }
  for (const stmt of statements(text)) {
    // Strip comments, then blank single-quoted string literals so a DDL keyword inside a string (a DEFAULT or
    // CHECK value like 'change requested') cannot trip a rule. No rule matches string CONTENT, only keywords.
    const sql = stripComments(stmt.raw).replace(/'(?:[^']|'')*'/g, "''");
    if (!sql.trim()) continue;
    const ig = ignores(stmt.raw);
    if (ig.all) continue;
    for (const rule of RULES) {
      if (!rule.re.test(sql)) continue;
      if (rule.unless && rule.unless.test(sql)) continue;
      if (ig.rules.has(rule.name)) continue;
      problems.push({ file: f, line: stmt.line, rule: rule.name, why: rule.why });
    }
  }
}

if (problems.length) {
  console.error(`[check-migration-safety] FAIL - ${problems.length} unsafe migration pattern(s):`);
  for (const p of problems) console.error(`  • ${p.file}:${p.line}  [${p.rule}] ${p.why}`);
  console.error(`\nFix with the expand/contract sequence (references/zero-downtime-db-migrations.md), or - for a\n` +
    `deliberate, backed-up, announced change - add an inline "-- migration-safety:ignore <reason>" to that statement.`);
  process.exit(1);
}
console.log(`[check-migration-safety] OK - ${files.length} .sql file(s) scanned, no unsafe patterns.`);
process.exit(0);
