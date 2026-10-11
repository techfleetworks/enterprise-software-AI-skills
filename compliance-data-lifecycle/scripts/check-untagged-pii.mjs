#!/usr/bin/env node
/**
 * check-untagged-pii — fail when a PII-looking schema column is not classified in the data map.
 *
 * The structural half of compliance-data-lifecycle's "maintain a data inventory / map" rule
 * (references/data-classification-and-retention.md): every data element gets a class on creation.
 * This gate scans SQL schema/migrations for columns whose NAME looks like personal data and requires
 * each to be declared in the data map, so you can't add an `email`/`ssn`/`dob` column and silently
 * leave it unclassified (which breaks deletion, export, and audits downstream). Dependency-free.
 *
 *   node check-untagged-pii.mjs --map data-map.json <schema-file-or-dir>...
 *
 * The data map is JSON — either {"users.email":"restricted", ...} or
 * [{"field":"users.email","class":"restricted","basis":"...","retention":"..."}].
 * A field key is "table.column" or a bare "column". Recognized classes:
 *   public | internal | confidential | restricted | not-personal
 * A false positive (a name that looks like PII but isn't — e.g. `company_name`) is resolved the
 * honest way: DECLARE it in the map as `not-personal`. That records the decision instead of hiding it.
 *
 * Exit 0 = every PII-looking column is classified. 1 = one or more undeclared. 2 = bad usage / IO.
 *
 * Scope (honest): it reads column NAMES from `CREATE TABLE` blocks and `ADD COLUMN`, line-oriented
 * (one column per line, as migrations are normally written); a single-line CREATE TABLE or a non-SQL
 * ORM schema is out of scope. The name heuristic is tunable (PII_INDICATORS) and errs toward
 * flagging — the map is where the truth is recorded.
 */
import { readFileSync, readdirSync, statSync, existsSync } from "node:fs";
import { join, extname, resolve } from "node:path";

function die(msg) { console.error(`[check-untagged-pii] FAIL — ${msg}`); process.exit(2); }

const args = process.argv.slice(2);
const mapIdx = args.indexOf("--map");
if (mapIdx === -1 || !args[mapIdx + 1]) die("missing --map <data-map.json>");
const mapPath = resolve(args[mapIdx + 1]);
const paths = args.filter((_, i) => i !== mapIdx && i !== mapIdx + 1);
if (paths.length === 0) die("no schema paths given. Usage: check-untagged-pii.mjs --map data-map.json <paths...>");

const CLASSES = new Set(["public", "internal", "confidential", "restricted", "not-personal"]);

// --- load + validate the data map --------------------------------------------
if (!existsSync(mapPath)) die(`data map not found: ${mapPath}`);
let rawMap;
try { rawMap = JSON.parse(readFileSync(mapPath, "utf8")); }
catch (e) { die(`data map is not valid JSON (${e.message})`); }

const declared = new Map(); // normalized field key -> class
function declare(field, cls) {
  if (!cls || !CLASSES.has(String(cls).toLowerCase())) {
    die(`data map entry "${field}" has an invalid class "${cls}" (use: ${[...CLASSES].join(", ")})`);
  }
  declared.set(String(field).toLowerCase(), String(cls).toLowerCase());
}
if (Array.isArray(rawMap)) {
  for (const e of rawMap) { if (!e || !e.field) die("array data map entries need a \"field\""); declare(e.field, e.class); }
} else if (rawMap && typeof rawMap === "object") {
  for (const [f, cls] of Object.entries(rawMap)) declare(f, cls);
} else die("data map must be a JSON object or array");

// --- PII name heuristic (tunable; applied to the separator-normalized column name) ----------------
const PII_INDICATORS = [
  /email/, /phone|mobile|telephone/, /\bssn\b|social security/, /passport/, /national id/, /tax id/,
  /\bdob\b|date of birth|birth date|birthday/, /first name|last name|full name|surname|given name|maiden/,
  /\baddress\b|street|postcode|post code|\bzip\b|zipcode/, /ip address/, /credit card|card number|\bcvv\b|\biban\b/,
  /latitude|longitude|\blat\b|\blng\b|coordinates/, /drivers licen[sc]e|driver licen[sc]e/,
  /\bgender\b|ethnicit|\brace\b|religion|biometric|\bhealth\b|medical/,
];
const normalize = (name) => name.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
const looksLikePII = (name) => { const n = normalize(name); return PII_INDICATORS.some((re) => re.test(n)); };

// --- collect columns from SQL (line-oriented) --------------------------------
const CONSTRAINT = /^\s*(constraint|primary|foreign|unique|check|exclude|like|partition|index)\b/i;
function collectColumns(sql, file) {
  const out = []; // {table, column, line}
  const lines = sql.split(/\r?\n/);
  let table = null, depth = 0;
  for (let i = 0; i < lines.length; i++) {
    const raw = lines[i].replace(/--.*$/, ""); // drop line comment
    const createM = raw.match(/create\s+table\s+(?:if\s+not\s+exists\s+)?"?([\w.]+)"?\s*\(/i);
    if (createM) {
      table = createM[1];
      depth = (raw.match(/\(/g) || []).length - (raw.match(/\)/g) || []).length;
      continue;
    }
    if (table) {
      if (!CONSTRAINT.test(raw)) {
        const colM = raw.match(/^\s*"?([A-Za-z_]\w*)"?\s+\S/);
        if (colM) out.push({ table, column: colM[1], line: i + 1 });
      }
      depth += (raw.match(/\(/g) || []).length - (raw.match(/\)/g) || []).length;
      if (depth <= 0) table = null; // left the CREATE TABLE block
      continue;
    }
    const addM = raw.match(/\balter\s+table\s+"?([\w.]+)"?[\s\S]*?\badd\s+(?:column\s+)?"?([A-Za-z_]\w*)"?/i);
    if (addM) out.push({ table: addM[1], column: addM[2], line: i + 1 });
  }
  return out.map((c) => ({ ...c, file }));
}

// --- gather .sql files -------------------------------------------------------
function collect(p) {
  if (!existsSync(p)) die(`path does not exist: ${p}`);
  return statSync(p).isDirectory()
    ? readdirSync(p).flatMap((n) => collect(join(p, n)))
    : extname(p).toLowerCase() === ".sql" ? [p] : [];
}
const files = paths.flatMap(collect);
if (files.length === 0) die("no .sql files found in the given path(s) (zero-scan — fail closed)");

// --- check every PII-looking column is declared ------------------------------
const problems = [];
let piiCount = 0;
for (const f of files) {
  let sql;
  try { sql = readFileSync(f, "utf8"); } catch (e) { die(`could not read ${f} (${e.message})`); }
  for (const { table, column, line } of collectColumns(sql, f)) {
    if (!looksLikePII(column)) continue;
    piiCount++;
    const full = `${table}.${column}`.toLowerCase();
    if (declared.has(full) || declared.has(column.toLowerCase())) continue;
    problems.push({ file: f, line, field: `${table}.${column}` });
  }
}

if (problems.length) {
  console.error(`[check-untagged-pii] FAIL — ${problems.length} PII-looking column(s) not in the data map (${mapPath}):`);
  for (const p of problems) console.error(`  • ${p.file}:${p.line}  ${p.field}`);
  console.error(`\nClassify each in the data map (public|internal|confidential|restricted), or — if it is not personal\n` +
    `data despite the name — declare it as "not-personal" to record that decision.`);
  process.exit(1);
}
console.log(`[check-untagged-pii] OK — ${files.length} .sql file(s), ${piiCount} PII-looking column(s), all classified in the data map.`);
process.exit(0);
