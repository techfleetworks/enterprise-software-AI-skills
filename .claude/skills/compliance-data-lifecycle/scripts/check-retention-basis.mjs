#!/usr/bin/env node
/**
 * check-retention-basis - fail when a personal-data entry in the data map has no lawful basis or no
 * retention period.
 *
 * The structural half of compliance-data-lifecycle's privacy obligations: GDPR Article 6 requires a
 * lawful basis for every processing of personal data, and Article 5(1)(e) (storage limitation)
 * requires that personal data be kept no longer than necessary. The same obligations recur in the US
 * state laws and other regimes (minimization + retention limits). This gate reads the committed data
 * map (the one `check-untagged-pii.mjs` already enforces exists) and requires every entry that is NOT
 * `not-personal` to declare a non-empty `basis` (or `lawfulBasis`) and a non-empty `retention`, so you
 * cannot classify a personal column and then never decide why you hold it or when it is deleted.
 * Dependency-free (Node built-ins), vendor-neutral.
 *
 *   node check-retention-basis.mjs --map data-map.json
 *
 * The data map is the same JSON `check-untagged-pii.mjs` reads: an array of
 * [{"field":"users.email","class":"restricted","basis":"contract","retention":"account life + 30d"}]
 * or an object {"users.email": {"class":"restricted","basis":"...","retention":"..."}}. A terse
 * {"users.email":"restricted"} entry has nowhere to record a basis or retention, so a personal field
 * in that form fails this gate: use the object form. A `not-personal` entry is exempt (there is no
 * personal data to hold a basis or a retention for).
 *
 * A placeholder (empty, `n/a`, `tbd`, `todo`, `?`, `none`, `unknown`, or under 3 characters) does NOT
 * count as a decision, the same way a reason-less waiver does not count elsewhere in this repo.
 *
 * Exit 0 = every personal entry has a basis and a retention. 1 = one or more gaps. 2 = bad usage / IO.
 */
import { readFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";

function die(msg) { console.error(`[check-retention-basis] FAIL - ${msg}`); process.exit(2); }

const args = process.argv.slice(2);
const mapIdx = args.indexOf("--map");
if (mapIdx === -1 || !args[mapIdx + 1]) die("missing --map <data-map.json>. Usage: check-retention-basis.mjs --map data-map.json");
const mapPath = resolve(args[mapIdx + 1]);

if (!existsSync(mapPath)) die(`data map not found: ${mapPath}`);
let rawMap;
try { rawMap = JSON.parse(readFileSync(mapPath, "utf8")); }
catch (e) { die(`data map is not valid JSON (${e.message})`); }

const CLASSES = new Set(["public", "internal", "confidential", "restricted", "not-personal"]);
// A value that records no real decision. Mirrors the "reason must be real" bar used by the other gates.
const PLACEHOLDER = /^(n\/?a|tbd|tba|todo|fixme|placeholder|soon|later|none|unknown|\?+|-+|\.+|x+)$/i;
const missing = (v) => {
  const s = (v == null ? "" : String(v)).trim();
  return s.length < 3 || PLACEHOLDER.test(s);
};

// Normalize both map shapes to {field, class, basis, retention}.
const entries = [];
if (Array.isArray(rawMap)) {
  for (const e of rawMap) {
    if (!e || typeof e !== "object") die(`array entry is not an object: ${JSON.stringify(e)}`);
    entries.push({ field: e.field, class: e.class, basis: e.basis ?? e.lawfulBasis, retention: e.retention });
  }
} else if (rawMap && typeof rawMap === "object") {
  for (const [field, v] of Object.entries(rawMap)) {
    if (v && typeof v === "object") entries.push({ field, class: v.class, basis: v.basis ?? v.lawfulBasis, retention: v.retention });
    else entries.push({ field, class: v, basis: undefined, retention: undefined }); // terse class-only form
  }
} else {
  die("data map must be a JSON array or object");
}

const problems = [];
let personal = 0;
for (const e of entries) {
  const field = e.field ? String(e.field) : "(unnamed)";
  const cls = e.class == null ? "" : String(e.class).toLowerCase();
  if (!CLASSES.has(cls)) die(`entry "${field}" has an invalid or missing class "${e.class}" (use: ${[...CLASSES].join(", ")})`);
  if (cls === "not-personal") {
    // Mirror the ADR-0010 guard in check-untagged-pii: a bare (table-less) "not-personal" would
    // exempt that column name in EVERY table, a blanket waiver that could silently clear real PII
    // elsewhere. Both gates must treat the shared map identically, so fail closed here too.
    if (!String(field).includes(".")) {
      die(`entry "${field}" is "not-personal" with a bare key - qualify it as table.column ` +
        `(e.g. support.email) so the exemption can't blanket-clear a same-named personal column in another table`);
    }
    continue; // exempt: no personal data to hold a basis or retention for
  }
  personal++;
  if (missing(e.basis)) problems.push({ field, what: "lawful basis (basis/lawfulBasis)", why: "GDPR Art 6 needs a lawful basis for every processing of personal data" });
  if (missing(e.retention)) problems.push({ field, what: "retention period", why: "GDPR Art 5(1)(e) storage limitation: state how long it is kept and when it is deleted" });
}

if (problems.length) {
  console.error(`[check-retention-basis] FAIL - ${problems.length} personal-data entr(y/ies) missing a basis or retention:`);
  for (const p of problems) console.error(`  • ${p.field}: missing ${p.what} - ${p.why}`);
  console.error(`\nAdd the missing field(s) to the data map, using the object form ` +
    `{"class":..., "basis":..., "retention":...}. A "not-personal" entry is exempt.`);
  process.exit(1);
}
console.log(`[check-retention-basis] OK - ${personal} personal-data entr(y/ies), each with a lawful basis and a retention period.`);
process.exit(0);
