#!/usr/bin/env node
/**
 * compare-gate-runs - compare a BASE gate run against a CHANGED gate run and report NEW failures,
 * in a way that is STRUCTURALLY UNABLE to report a false "clean" (reference implementation).
 *
 * The failure this exists to stop (observed in an audit): a side-effect comparison read a status
 * field ("ok"/"passed") that NO gate record actually had, so "passed in base, failed in changed"
 * could never be true and the run was called "0 new failures - CLEAN" by a check that could not have
 * found one. In the same run a gate failing in BOTH builds got worse (420 -> 430 problems) and a
 * pass-or-fail comparison could not see it.
 *
 * Two rules, both enforced here:
 *   1. Compare only on fields PROVEN PRESENT. If the chosen status field is absent from a record this
 *      comparison must read, that is an ERROR (exit 2, naming the field), never an empty status that
 *      silently counts as "no change". It prints NO new-failure count in that case.
 *   2. For gates that are RED in both builds, compare problem COUNTS (or per-case lists). Any increase
 *      is a NEW failure until explained. A both-red gate with no comparable count is "unverifiable"
 *      and blocks "clean", because last-line-only records cannot prove a gate did not get worse.
 *
 *   node compare-gate-runs.mjs --base base.json --changed changed.json
 *        [--status-field exit] [--pass-value 0] [--count-field problems] [--id-field gate]
 *
 * Input: each of base.json / changed.json is a JSON array of gate records. A record is an object
 * identified by the id field (default "gate"). Pass/fail is read from the status field (default
 * "exit"); a record passes when status === pass-value (default 0, numeric). Worsening is read from
 * the count field (default "problems") when present on a both-red gate.
 *
 * Exit 0 = clean: comparison ran, every field it needed was present, and there are no new failures,
 *   no worsening, and no gate that vanished. Only then does it print the "0 new failures" / clean line.
 * Exit 1 = a difference that blocks clean: a new failure, a worsened red gate, a both-red gate whose
 *   worsening cannot be verified (no count), or a gate present in base but dropped from the changed run.
 * Exit 2 = fail-closed: bad args, unreadable/invalid input, a record missing its id, the status field
 *   absent from a record the comparison must read, or either run having zero gate records (a comparison
 *   that compared nothing cannot be clean).
 */
import { readFileSync } from "node:fs";
import { createHash } from "node:crypto";

function die(msg) {
  console.error(`[compare-gate-runs] FAIL - ${msg}`);
  process.exit(2);
}

// --- args --------------------------------------------------------------------
const argv = process.argv.slice(2);
function opt(name, dflt) {
  const i = argv.indexOf(name);
  if (i === -1) return dflt;
  const v = argv[i + 1];
  if (v === undefined || v.startsWith("--")) die(`option ${name} needs a value`);
  return v;
}
const basePath = opt("--base");
const changedPath = opt("--changed");
if (!basePath || !changedPath) die("both --base <file> and --changed <file> are required");
const idField = opt("--id-field", "gate");
const statusField = opt("--status-field", "exit");
const countField = opt("--count-field", "problems");
const passRaw = opt("--pass-value", "0");
// pass-value compares by JSON value, so "0" means the number 0, not the string "0".
let passValue;
try { passValue = JSON.parse(passRaw); } catch { passValue = passRaw; }

// --- load --------------------------------------------------------------------
function load(path, label) {
  let raw;
  try { raw = readFileSync(path, "utf8"); }
  catch (e) { die(`cannot read ${label} run ${path}: ${e.message}`); }
  let arr;
  try { arr = JSON.parse(raw); }
  catch (e) { die(`${label} run ${path} is not valid JSON: ${e.message}`); }
  if (!Array.isArray(arr)) die(`${label} run ${path} must be a JSON array of gate records`);
  const map = new Map();
  for (const rec of arr) {
    if (rec === null || typeof rec !== "object" || Array.isArray(rec)) die(`${label} run has a record that is not an object`);
    if (!(idField in rec)) die(`${label} run has a record with no "${idField}" (id) field: ${JSON.stringify(rec).slice(0, 120)}`);
    const id = String(rec[idField]);
    if (map.has(id)) die(`${label} run has two records for gate "${id}"; gate ids must be unique`);
    map.set(id, rec);
  }
  return map;
}
const base = load(basePath, "base");
const changed = load(changedPath, "changed");

// Fail closed on a zero-record run, matching the repo's zero-scan idiom (bdd-run, check-bdd-executed):
// an empty changed run compared nothing, and an empty base has no prior state to compare against, so
// neither can honestly be called "clean".
if (base.size === 0 || changed.size === 0) {
  die(`a run has zero gate records (base=${base.size}, changed=${changed.size}); a comparison that compared nothing cannot be clean`);
}

// --- rule 1: the status field must be PROVEN PRESENT on every record we compare ------------------
// We compare every gate in the changed run (what shipped), plus every base gate (to catch a gate
// that vanished). Any record missing the status field is an error that names the field, and we print
// NO count: a missing field is not an empty status.
const missingStatus = [];
for (const [id, rec] of changed) if (!(statusField in rec)) missingStatus.push(`changed:${id}`);
for (const [id, rec] of base) if (!(statusField in rec)) missingStatus.push(`base:${id}`);
if (missingStatus.length) {
  const total = changed.size + base.size;
  die(
    `status field "${statusField}" is absent from ${missingStatus.length} of ${total} gate record(s) ` +
      `(${missingStatus.slice(0, 8).join(", ")}${missingStatus.length > 8 ? ", ..." : ""}). ` +
      `A missing field is an error, not an empty status: cannot compute pass/fail, so no new-failure count is reported. ` +
      `Record the real status field in every gate record, or pass --status-field <name>.`
  );
}

const passed = (rec) => rec[statusField] === passValue;

// --- new failures: passed in base (or absent), failed in changed ---------------------------------
const newFailures = [];
for (const [id, rec] of changed) {
  if (passed(rec)) continue;
  const b = base.get(id);
  if (!b || passed(b)) newFailures.push({ id, wasInBase: !!b });
}

// --- worsening inside gates that are RED in both builds ------------------------------------------
// A both-red gate can still get worse. Compare the count field; if it is absent we CANNOT prove it
// did not worsen, so it is "unverifiable" and blocks clean (last-line-only records are the smell).
const worsened = [];
const unverifiable = [];
for (const [id, rec] of changed) {
  if (passed(rec)) continue;
  const b = base.get(id);
  if (!b || passed(b)) continue; // not both-red; handled as a new failure above
  const hasC = countField in rec && countField in b;
  if (!hasC) { unverifiable.push(id); continue; }
  const bc = Number(b[countField]);
  const cc = Number(rec[countField]);
  if (!Number.isFinite(bc) || !Number.isFinite(cc)) { unverifiable.push(id); continue; }
  if (cc > bc) worsened.push({ id, base: bc, changed: cc, delta: cc - bc });
}

// --- dropped gates: present in base, gone from the changed run -----------------------------------
// A gate that vanished between builds is a difference that blocks clean: a silently removed or renamed
// gate (green or red) is exactly a false-clean vector, so it must be explained, never counted as "no
// new failures".
const dropped = [];
for (const [id, rec] of base) {
  if (!changed.has(id)) dropped.push({ id, baseStatus: passed(rec) ? "passed" : "failed" });
}

// --- report ------------------------------------------------------------------
const lines = [];
const scope = `base=${base.size} gate(s), changed=${changed.size} gate(s); status field "${statusField}" present on all; pass when ${statusField} === ${JSON.stringify(passValue)}`;
const problems = newFailures.length + worsened.length + unverifiable.length + dropped.length;

if (newFailures.length) {
  lines.push(`NEW failures (passed in base, failed in changed): ${newFailures.length}`);
  for (const n of newFailures) lines.push(`  - ${n.id}${n.wasInBase ? "" : " (new gate)"}`);
}
if (dropped.length) {
  lines.push(`DROPPED (present in base, gone from the changed run): ${dropped.length}`);
  for (const d of dropped) lines.push(`  - ${d.id} (was ${d.baseStatus} in base; a vanished gate must be explained, not read as clean)`);
}
if (worsened.length) {
  lines.push(`WORSENED (red in both builds, more problems in changed): ${worsened.length}`);
  for (const w of worsened) lines.push(`  - ${w.id}: ${w.base} -> ${w.changed} (+${w.delta} new ${countField})`);
}
if (unverifiable.length) {
  lines.push(`UNVERIFIABLE (red in both builds, no "${countField}" count to compare): ${unverifiable.length}`);
  for (const u of unverifiable) lines.push(`  - ${u} (records keep no per-case list or count; cannot prove it did not get worse)`);
}

if (problems === 0) {
  // Clean, and we are allowed to say so: the comparison ran and every needed field was present.
  const out = `[compare-gate-runs] OK - 0 new failures. ${scope}.`;
  const hash = createHash("sha256").update(out).digest("hex").slice(0, 12);
  console.log(out);
  console.log(`[compare-gate-runs] evidence: output-sha256=${hash}`);
  process.exit(0);
}

console.error(`[compare-gate-runs] FAIL - ${problems} difference(s) block a "clean" verdict. ${scope}.`);
for (const l of lines) console.error(l);
console.error(
  `\nThis change is NOT clean until each item above is explained (a stated, reviewed reason) or fixed. ` +
    `A "clean" or "0 new failures" claim may only cite a run of this script that exited 0.`
);
process.exit(1);
