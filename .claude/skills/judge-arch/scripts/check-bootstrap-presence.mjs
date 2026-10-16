#!/usr/bin/env node
// bootstrap-v2-gate: bootstrap-presence
/**
 * BOOTSTRAP-PRESENCE-001 - a bootstrapped consumer repo must still carry the genesis machinery
 * skeleton (bootstrap-v2, ADR-0045).
 *
 * WHAT: Fails if any of the three skeleton files genesis installs is missing:
 *       - gate-manifest.json                        (the source of truth; parity/aggregator read it)
 *       - .github/workflows/enterprise-gates.yml    (how the gates run, under one required check)
 *       - scripts/ci/check-skill-gate-parity.mjs    (the drift enforcer)
 *       These three are the minimum skeleton: without the manifest there is nothing to enforce, without
 *       the workflow nothing runs, without the parity gate drift is not caught. The OTHER gates are
 *       verified present by the parity gate itself (it checks every script the manifest lists), so this
 *       gate deliberately checks only the skeleton that must exist before parity can even run.
 *
 * HOW:  Resolves the repo root and checks the three paths exist as regular files. It reads
 *       nothing's content and executes nothing - presence only. Complements, does not duplicate,
 *       parity: parity cannot run if the manifest is missing, so this catches the "genesis was reverted
 *       or never ran" case that would otherwise make parity fail closed with a confusing message.
 *
 * WHY:  Genesis is a one-time bootstrap; nothing stops a later PR from deleting the manifest, the
 *       workflow, or the parity gate and quietly turning enforcement off. This is the genesis
 *       presence-check red path in the genesis feature: the skeleton's continued presence is itself a
 *       gate.
 *
 * FIX:  Re-run genesis/reconcile for the pinned version to restore the missing skeleton file, or revert
 *       the change that removed it. If you are intentionally de-bootstrapping the repo, remove this gate
 *       from the manifest in the same change (and expect enforcement to be off).
 *
 * Exit codes: 0 = all skeleton files present; 1 = one or more missing; 2 = fail-closed (the repo root
 * does not exist or cannot be read).
 * Seams for tests: GATE_REPO_ROOT (the consumer repo root to check). Pinned by
 * test/bootstrap-presence.test.mjs.
 */
import { existsSync, statSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = process.env.GATE_REPO_ROOT
  ? resolve(process.env.GATE_REPO_ROOT)
  : resolve(dirname(fileURLToPath(import.meta.url)), "..", "..", "..", "..");

const failClosed = (msg) => {
  console.error(`✖ check-bootstrap-presence (fail-closed): ${msg}`);
  process.exit(2);
};

// Fail closed if the root is not a readable directory: a missing/unreadable root is "cannot verify",
// never a silent pass (an empty skeleton list would otherwise read as "all present").
try {
  if (!existsSync(ROOT) || !statSync(ROOT).isDirectory()) failClosed(`repo root ${ROOT} is not a directory.`);
} catch (e) {
  failClosed(`cannot stat repo root ${ROOT}: ${e.message}.`);
}

// The genesis skeleton: the minimum that must exist before parity can run.
const SKELETON = [
  "gate-manifest.json",
  ".github/workflows/enterprise-gates.yml",
  "scripts/ci/check-skill-gate-parity.mjs",
];

const isFile = (rel) => {
  const abs = resolve(ROOT, rel);
  try {
    return existsSync(abs) && statSync(abs).isFile();
  } catch {
    return false;
  }
};

const missing = SKELETON.filter((rel) => !isFile(rel));

if (missing.length) {
  console.error(`✖ check-bootstrap-presence: the genesis machinery skeleton is incomplete:`);
  for (const rel of missing) console.error(`   • missing ${rel}`);
  console.error(`Run genesis/reconcile for the pinned version to restore it, or revert what removed it.`);
  process.exit(1);
}
console.log(`✓ check-bootstrap-presence: the genesis skeleton is present (${SKELETON.length} files).`);
