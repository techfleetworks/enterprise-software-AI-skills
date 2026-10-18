#!/usr/bin/env node
/**
 * UPSTREAM-INTEGRITY-001 - the skills repo's own gate-manifest.json is the single upstream source of
 * truth, and it must never drift from the gate code it ships (bootstrap-v2, ADR-0046).
 *
 * WHAT: Proves, bidirectionally, that the committed root gate-manifest.json and the real gate/machinery
 *       scripts in .claude/skills/<skill>/scripts/ are in exact agreement:
 *       - forward: every upstream gate and every machinery entry in the manifest has a source script that
 *         exists, carries the matching self-declaring marker, hashes to the manifest's sha256, and names a
 *         test that exists;
 *       - reverse (completeness): every source script that carries a bootstrap-v2 marker is listed in the
 *         manifest, with a matching id. So you cannot add a shipped gate without manifesting it, and you
 *         cannot list a gate the code does not actually declare. Drift in either direction is impossible
 *         to merge.
 *
 * HOW:  Reads the manifest, resolves each upstream gate / machinery entry to its source at
 *       .claude/skills/<skill>/scripts/<basename of script>, checks existence + marker + sha256 + test.
 *       Then scans every .claude/skills/<skill>/scripts/*.mjs for the markers
 *       "bootstrap-v2-gate: <id>" and "bootstrap-v2-machinery: <id>" and requires each marked file to be
 *       in the manifest under that id. repo-local gates (origin "repo-local") are adopted by a consumer,
 *       not shipped from here, so they are not expected to have an upstream source and are skipped.
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
 * missing/mismatched marker, or an unmanifested marked script); 2 = fail-closed (manifest missing,
 * unparseable, not a manifest, or the skills dir cannot be read).
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

const MARKER = /bootstrap-v2-(gate|machinery):\s*([a-z0-9-]+)/;
const MARKER_G = /bootstrap-v2-(gate|machinery):\s*([a-z0-9-]+)/g;
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
  if (entry.test !== undefined) {
    if (typeof entry.test !== "string" || !existsSync(resolve(dirname(MANIFEST), entry.test))) {
      violations.push(`${kind} "${entry.id}": test ${entry.test} is missing.`);
    }
  } else if (kind === "gate") {
    violations.push(`gate "${entry.id}": names no test (every gate ships one).`);
  }
};

for (const g of manifest.gates) {
  if ((g?.origin ?? "upstream") === "repo-local") continue; // adopted by a consumer, not shipped from here
  checkEntry(g, "gate");
}
for (const m of Array.isArray(manifest.machinery) ? manifest.machinery : []) checkEntry(m, "machinery");

// --- reverse: every marked source script is in the manifest under that id ---
let skillDirs = [];
try {
  skillDirs = readdirSync(SKILLS_DIR, { withFileTypes: true }).filter((e) => e.isDirectory()).map((e) => e.name);
} catch (e) {
  failClosed(`cannot list skills dir ${SKILLS_DIR}: ${e.message}`);
}
for (const skill of skillDirs) {
  const dir = join(SKILLS_DIR, skill, "scripts");
  let files = [];
  try {
    files = existsSync(dir) ? readdirSync(dir).filter((n) => n.endsWith(".mjs")) : [];
  } catch {
    files = [];
  }
  for (const name of files) {
    const abs = join(dir, name);
    let text;
    try {
      text = readFileSync(abs, "utf8");
    } catch (e) {
      failClosed(`cannot read ${abs}: ${e.message}`);
    }
    // Validate EVERY marker in the file, not just the first: a second marker must not slip an
    // unmanifested id past the completeness check. A shipped script declares exactly one gate/machinery,
    // so more than one distinct marker is itself a violation.
    const matches = [...text.matchAll(MARKER_G)];
    if (matches.length === 0) continue; // not a shipped bootstrap-v2 script; ignored
    const distinct = new Set(matches.map((x) => `${x[1]}:${x[2]}`));
    if (distinct.size > 1) {
      violations.push(`${skill}/scripts/${name} carries ${distinct.size} different bootstrap-v2 markers (${[...distinct].join(", ")}); a shipped script declares exactly one.`);
    }
    for (const mm of matches) {
      const kind = mm[1];
      const id = mm[2];
      const exp = expected.get(id);
      if (!exp) {
        violations.push(`marked ${kind} "${id}" (${skill}/scripts/${name}) is NOT listed in the manifest (unmanifested shipped script).`);
      } else if (exp.kind !== kind) {
        violations.push(`"${id}" (${skill}/scripts/${name}) is marked ${kind} but the manifest lists it as ${exp.kind}.`);
      } else if (resolve(exp.source) !== resolve(abs)) {
        violations.push(`"${id}" is marked in ${skill}/scripts/${name} but the manifest resolves it to ${exp.source}.`);
      }
    }
  }
}

if (violations.length) fail(violations);
const nGates = manifest.gates.filter((g) => (g?.origin ?? "upstream") !== "repo-local").length;
const nMach = Array.isArray(manifest.machinery) ? manifest.machinery.length : 0;
console.log(`✓ check-upstream-manifest-integrity: ${nGates} upstream gate(s) and ${nMach} machinery entry(ies) match their source exactly (markers, hashes, tests).`);
