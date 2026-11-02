#!/usr/bin/env node
// bootstrap-v2-upstream-only: upstream-manifest-integrity
/**
 * UPSTREAM-INTEGRITY-001 - the skills repo's own gate-manifest.json is the single upstream source of
 * truth, and it must never drift from the gate code it ships (bootstrap-v2, ADR-0046).
 *
 * WHAT: Proves, bidirectionally, that the committed root gate-manifest.json and the real gate/machinery
 *       scripts in .claude/skills/<skill>/scripts/ are in exact agreement. Every consumer-facing checker
 *       (ANY .mjs under a skill's scripts/, at any depth) declares its SCOPE with exactly one marker:
 *         - bootstrap-v2-gate            an installable, stack-agnostic gate, listed in manifest.gates;
 *         - bootstrap-v2-consumer-gate   a gate that needs the consumer's own input (its features/, its
 *                                        review log, its axe run), listed in manifest.consumerRequiredGates;
 *         - bootstrap-v2-upstream-only   a check that governs only THIS authoring repo, in NEITHER list;
 *         - bootstrap-v2-machinery       a non-gate runner, listed in manifest.machinery;
 *         - bootstrap-v2-helper          a shipped script that is NOT a gate (a library, runner, generator,
 *                                        installer, scaffold, or reference tool), in no manifest section.
 *       - forward: every gate / consumer-gate / machinery entry in the manifest has a source script that
 *         exists, carries the matching marker, hashes to the manifest's sha256, and names a test that exists;
 *       - reverse (completeness): every marked source is listed under its scope's section (upstream-only and
 *         helper are listed in none, and MUST NOT appear in any); and every .mjs is classified by exactly one
 *         marker WHATEVER ITS NAME, so a gate can never escape the manifest by not being named check-* (the
 *         ADR-0109 F1 fix). Drift in any direction is impossible to merge.
 *
 * HOW:  Reads the manifest, resolves each gate / consumer-gate / machinery entry to its source at
 *       .claude/skills/<skill>/scripts/<basename of script>, checks existence + marker + sha256 + test.
 *       Then RECURSES every .claude/skills/<skill>/scripts/ tree and, for each .mjs, reads its scope marker
 *       (a comment line that is ONLY the marker, so a marker-shaped string inside code never counts) and
 *       requires: each marked gate/consumer-gate/machinery file to be in its manifest section under that id;
 *       each upstream-only or helper file to be in no section; and each UNMARKED .mjs to be a violation (an
 *       unclassified shipped script). repo-local gates (origin "repo-local") are adopted by a consumer, not
 *       shipped from here, so they are not expected to have an upstream source and are skipped.
 *
 * WHY:  Option 1 of the genesis design: one manifest is the truth that provenance checks, the release
 *       publishes, and genesis copies from. That is only fail-proof if the manifest cannot silently
 *       diverge from the actual gate code. The self-declaring marker plus this bidirectional check make
 *       "the manifest says X but the code is Y" a red state, not a latent hole, at the source of truth.
 *
 * FIX:  If a sha256 mismatches, recompute it from the source script and update the manifest in the same
 *       commit as the script change. If a marked script is missing from the manifest, add it (or remove
 *       the marker if it is not a shipped gate). If a manifest entry has no marked source, add the marker
 *       to the source or remove the entry. If a test is missing, add it (every gate ships one).
 *
 * Exit codes: 0 = manifest and source agree exactly; 1 = drift (sha256 mismatch, missing source/test,
 * missing/mismatched marker, an unmanifested marked script, an UNCLASSIFIED check-*.mjs, or an
 * upstream-only gate wrongly listed in the manifest); 2 = fail-closed (manifest missing, unparseable, not
 * a manifest, or the skills dir cannot be read).
 * Seams for tests: GATE_MANIFEST_FILE (manifest path), GATE_SKILLS_DIR (the .claude/skills dir).
 * Pinned by test/upstream-manifest-integrity.test.mjs.
 */
import { readFileSync, readdirSync, existsSync, statSync } from "node:fs";
import { createHash } from "node:crypto";
import { resolve, dirname, basename, join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..", "..", "..");
const MANIFEST = process.env.GATE_MANIFEST_FILE ? resolve(process.env.GATE_MANIFEST_FILE) : resolve(ROOT, "gate-manifest.json");
const SKILLS_DIR = process.env.GATE_SKILLS_DIR ? resolve(process.env.GATE_SKILLS_DIR) : resolve(ROOT, ".claude", "skills");

const failClosed = (msg) => {
  console.error(`✖ check-upstream-manifest-integrity (fail-closed): ${msg}`);
  process.exit(2);
};
const fail = (lines) => {
  console.error("✖ check-upstream-manifest-integrity: the manifest and the gate code disagree:");
  for (const l of lines) console.error(`   • ${l}`);
  process.exit(1);
};

let manifest;
try {
  manifest = JSON.parse(readFileSync(MANIFEST, "utf8"));
} catch (e) {
  failClosed(`cannot read/parse ${MANIFEST}: ${e.message}`);
}
if (!manifest || typeof manifest !== "object" || !Array.isArray(manifest.gates)) {
  failClosed(`${MANIFEST} is not a gate manifest (no gates array).`);
}
try {
  if (!existsSync(SKILLS_DIR) || !statSync(SKILLS_DIR).isDirectory()) failClosed(`skills dir ${SKILLS_DIR} is not a directory.`);
} catch (e) {
  failClosed(`cannot read skills dir ${SKILLS_DIR}: ${e.message}`);
}

// A scope marker is a comment line that is ONLY the marker, so the scan never matches a marker-shaped
// string inside code (this file's own regex literals, an error message, a "<id>" doc example). Anchored
// per line with the m flag. The five scopes: gate + consumer-gate + upstream-only + machinery (the runners),
// and helper (a shipped script that is NOT a gate: a library, runner, generator, installer, scaffold, or
// reference tool). Every .mjs a skill ships under scripts/ declares one, so none can escape by its name.
const MARKER_RE = "^[ \\t]*//[ \\t]*bootstrap-v2-(gate|machinery|consumer-gate|upstream-only|helper):[ \\t]*([a-z0-9-]+)[ \\t]*$";
const MARKER = new RegExp(MARKER_RE, "m");
const MARKER_G = new RegExp(MARKER_RE, "gm");
const sourceOf = (entry) => {
  if (typeof entry?.skill !== "string" || typeof entry?.script !== "string") return null;
  return join(SKILLS_DIR, entry.skill, "scripts", basename(entry.script));
};

const violations = [];
// Expected marker for each manifest id: kind + id, so the reverse scan can match exactly.
const expected = new Map(); // id -> { kind, sha256, source }

// --- forward: every manifest upstream gate + machinery entry has a faithful, marked, tested source ---
const checkEntry = (entry, kind) => {
  if (typeof entry?.id !== "string" || typeof entry?.script !== "string" || typeof entry?.sha256 !== "string") {
    failClosed(`a ${kind} entry is malformed (id, script, sha256 must be strings).`);
  }
  const src = sourceOf(entry);
  if (!src) {
    violations.push(`${kind} "${entry.id}": no skill/script to resolve a source from.`);
    return;
  }
  // An id is unique across ALL sections: two entries sharing one id would make the reverse scan's membership
  // check depend on processing order (last write wins) and print a misleading "marked X but listed as Y". Fail
  // closed on the collision instead (ADR-0109 F4).
  if (expected.has(entry.id)) {
    failClosed(`manifest id "${entry.id}" appears in more than one section (${expected.get(entry.id).kind} and ${kind}); ids must be unique across gates, consumerRequiredGates, and machinery.`);
  }
  expected.set(entry.id, { kind, sha256: entry.sha256, source: src });
  if (!existsSync(src)) {
    violations.push(`${kind} "${entry.id}": source ${src} does not exist.`);
    return;
  }
  let bytes;
  try {
    bytes = readFileSync(src);
  } catch (e) {
    failClosed(`cannot read source ${src} for ${kind} "${entry.id}": ${e.message}.`);
  }
  // Hash LINE-ENDING-STABLY (ADR-0058): normalize CRLF to LF before hashing so the manifest sha matches on
  // Windows (CRLF working tree) and Linux/CI (LF). The marker match below uses the raw bytes (regex is
  // line-ending-agnostic), so only the hash is normalized.
  const actual = createHash("sha256").update(bytes.toString("utf8").replace(/\r\n/g, "\n")).digest("hex");
  if (actual !== entry.sha256) {
    violations.push(`${kind} "${entry.id}": source sha256 ${actual.slice(0, 12)}… != manifest ${String(entry.sha256).slice(0, 12)}… (update the manifest hash in the same commit as the script).`);
  }
  const m = bytes.toString("utf8").match(MARKER);
  if (!m) {
    violations.push(`${kind} "${entry.id}": source carries no bootstrap-v2 marker (add "// bootstrap-v2-${kind}: ${entry.id}").`);
  } else if (m[1] !== kind || m[2] !== entry.id) {
    violations.push(`${kind} "${entry.id}": source marker is "${m[1]}: ${m[2]}", expected "${kind}: ${entry.id}".`);
  }
  const needsTest = kind === "gate" || kind === "consumer-gate";
  if (entry.test !== undefined) {
    const testPath = resolve(dirname(MANIFEST), entry.test);
    if (typeof entry.test !== "string" || !existsSync(testPath)) {
      violations.push(`${kind} "${entry.id}": test ${entry.test} is missing.`);
    } else if (needsTest && typeof entry.testSha256 !== "string") {
      // #123 + ADR-0109 F2: a gate AND a consumer-gate must pin its discrimination TEST's content (testSha256),
      // not just name the file, so a hollowed always-pass test is caught the same way a neutered gate script is.
      // The consumer-gates' tests already run in THIS repo's CI, so the pin protects them here too, not only once
      // genesis installs them downstream.
      violations.push(`${kind} "${entry.id}": no testSha256 (every gate and consumer-gate must pin its discrimination test's hash; add it in the same commit as the test).`);
    } else if (typeof entry.testSha256 === "string") {
      // Verify the pinned test hash wherever it is present (required for both a gate and a consumer-gate).
      let tbytes;
      try { tbytes = readFileSync(testPath); } catch (e) { failClosed(`cannot read test ${testPath} for ${kind} "${entry.id}": ${e.message}.`); }
      const actualTest = createHash("sha256").update(tbytes.toString("utf8").replace(/\r\n/g, "\n")).digest("hex");
      if (actualTest !== entry.testSha256) {
        violations.push(`${kind} "${entry.id}": test ${entry.test} sha256 ${actualTest.slice(0, 12)}… != manifest testSha256 ${String(entry.testSha256).slice(0, 12)}… (recompute it from the test in the same commit as the test change).`);
      }
    }
  } else if (needsTest) {
    violations.push(`${kind} "${entry.id}": names no test (every gate ships one).`);
  }
  // A consumer-gate must declare its acceptance contract: what the consumer repo has to provide for it to pass
  // (its features/, its review log, its axe run). It is recorded, not executed here; genesis reads it later.
  if (kind === "consumer-gate" && (typeof entry.acceptance !== "string" || !entry.acceptance.trim())) {
    violations.push(`consumer-gate "${entry.id}": no acceptance contract (add a non-empty "acceptance" describing what the consumer must provide).`);
  }
};

for (const g of manifest.gates) {
  if ((g?.origin ?? "upstream") === "repo-local") continue; // adopted by a consumer, not shipped from here
  checkEntry(g, "gate");
}
for (const m of Array.isArray(manifest.machinery) ? manifest.machinery : []) checkEntry(m, "machinery");
// Consumer-required gates (ADR-0109): bound to their source exactly like gates, but kept in their own manifest
// section because they are not installed as blocking upstream gates here (they need the consumer's own input).
for (const c of Array.isArray(manifest.consumerRequiredGates) ? manifest.consumerRequiredGates : []) checkEntry(c, "consumer-gate");

// --- reverse + completeness: EVERY shipped .mjs declares its scope, and every gate/consumer-gate/machinery
// marker is in the manifest (ADR-0109) ---
let skillDirs = [];
try {
  skillDirs = readdirSync(SKILLS_DIR, { withFileTypes: true }).filter((e) => e.isDirectory()).map((e) => e.name);
} catch (e) {
  failClosed(`cannot list skills dir ${SKILLS_DIR}: ${e.message}`);
}
// Every .mjs a skill ships under scripts/, found by RECURSING subdirectories (ADR-0109 F3) so a nested script
// cannot escape the scan. Returns { skill, rel (skill-relative, forward slashes), abs }.
function scriptsUnder(skill) {
  const root = join(SKILLS_DIR, skill, "scripts");
  const out = [];
  const walk = (dir) => {
    let ents = [];
    try { ents = existsSync(dir) ? readdirSync(dir, { withFileTypes: true }) : []; } catch { ents = []; }
    for (const e of ents) {
      const abs = join(dir, e.name);
      if (e.isDirectory()) walk(abs);
      else if (e.isFile() && e.name.endsWith(".mjs")) out.push({ skill, rel: `scripts/${abs.slice(root.length + 1).replace(/\\/g, "/")}`, abs });
    }
  };
  walk(root);
  return out;
}
for (const skill of skillDirs) {
  for (const { rel, abs } of scriptsUnder(skill)) {
    let text;
    try {
      text = readFileSync(abs, "utf8");
    } catch (e) {
      failClosed(`cannot read ${abs}: ${e.message}`);
    }
    // Validate EVERY marker in the file, not just the first: a second marker must not slip an unmanifested id
    // past the completeness check. A shipped script declares exactly one scope, so more than one distinct marker
    // is itself a violation.
    const matches = [...text.matchAll(MARKER_G)];
    if (matches.length === 0) {
      // Completeness (ADR-0109, F1): every shipped script declares its scope, whatever its name. An unmarked
      // .mjs is the exact hole this closes - a gate (e.g. one not named check-*) the manifest never accounts for.
      // A genuine non-gate marks itself bootstrap-v2-helper; it is then declared, not silently skipped.
      violations.push(`${skill}/${rel} ships with NO bootstrap-v2 scope marker; classify it with one of: gate, consumer-gate, upstream-only, machinery, or helper (ADR-0109). A gate cannot escape the manifest by not being named check-*.`);
      continue;
    }
    const distinct = new Set(matches.map((x) => `${x[1]}:${x[2]}`));
    if (distinct.size > 1) {
      violations.push(`${skill}/${rel} carries ${distinct.size} different bootstrap-v2 markers (${[...distinct].join(", ")}); a shipped script declares exactly one.`);
    }
    for (const mm of matches) {
      const kind = mm[1];
      const id = mm[2];
      if (kind === "upstream-only" || kind === "helper") {
        // Not a manifest gate: upstream-only is a check that governs only this repo; helper is not a gate at all
        // (a library, runner, generator, installer, scaffold, or reference tool). Either way it must appear in NO
        // manifest section - listing it would ship it to a consumer as a blocking gate.
        if (expected.has(id)) {
          violations.push(`"${id}" (${skill}/${rel}) is marked ${kind} but is listed in the manifest as ${expected.get(id).kind}; a ${kind} script is never a shipped gate (remove it from the manifest or change its marker).`);
        }
        continue;
      }
      const exp = expected.get(id);
      if (!exp) {
        violations.push(`marked ${kind} "${id}" (${skill}/${rel}) is NOT listed in the manifest (unmanifested shipped gate).`);
      } else if (exp.kind !== kind) {
        violations.push(`"${id}" (${skill}/${rel}) is marked ${kind} but the manifest lists it as ${exp.kind}.`);
      } else if (resolve(exp.source) !== resolve(abs)) {
        violations.push(`"${id}" is marked in ${skill}/${rel} but the manifest resolves it to ${exp.source}.`);
      }
    }
  }
}

if (violations.length) fail(violations);
const nGates = manifest.gates.filter((g) => (g?.origin ?? "upstream") !== "repo-local").length;
const nMach = Array.isArray(manifest.machinery) ? manifest.machinery.length : 0;
const nConsumer = Array.isArray(manifest.consumerRequiredGates) ? manifest.consumerRequiredGates.length : 0;
console.log(`✓ check-upstream-manifest-integrity: ${nGates} upstream gate(s), ${nConsumer} consumer-required gate(s) and ${nMach} machinery entry(ies) match their source exactly (markers, hashes, tests), and every shipped .mjs under a skill's scripts/ is classified (ADR-0109).`);
