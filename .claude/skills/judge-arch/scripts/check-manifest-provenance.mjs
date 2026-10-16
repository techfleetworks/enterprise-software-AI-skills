#!/usr/bin/env node
// bootstrap-v2-gate: manifest-provenance
/**
 * PROVENANCE-001 - a consumer repo's committed gate-manifest.json must match the published upstream
 * release for the version it pins (bootstrap-v2, ADR-0044).
 *
 * WHAT: Parity (PARITY-001) proves the committed gate scripts match the committed manifest. This gate
 *       proves the committed MANIFEST itself matches the official one the skills repo published for the
 *       pinned version, so an edit that weakens the manifest (drop a gate, flip a required gate to
 *       advisory, point a gate at a weaker script and update its hash to match) is caught - parity
 *       alone would not catch it, because the scripts still match the tampered manifest.
 *
 * HOW:  Reads the committed manifest and the published upstream manifest (a local file the CI workflow
 *       downloaded from the release asset gate-manifest.json on tag v<version>), and compares the
 *       upstream-origin gates: every committed upstream gate must appear in the published manifest with
 *       the SAME id, sha256 and lane, and no published gate may be missing from the committed manifest.
 *       repo-local gates (origin "repo-local", adopted at genesis) are not governed by upstream and are
 *       ignored here. It reads and compares only; it makes NO network calls and executes nothing - the
 *       download is the workflow's job (like the OWASP verbatim gate, which vendors its source first),
 *       so this stays an offline, deterministic CLI tool.
 *
 *       Mode is decided by identity: when this repo IS the upstream repo (GITHUB_REPOSITORY equals the
 *       upstream repo), it runs in ORIGIN mode - the repo that AUTHORS releases. In origin mode an
 *       already-published version must still match (you cannot rewrite 1.2.0's gates while calling it
 *       1.2.0), but a not-yet-published version passes (the origin is legitimately authoring it).
 *       Any other repo runs in CONSUMER mode, where a version with no published release fails closed
 *       (you cannot escape provenance by pinning a version that was never released).
 *
 * WHY:  The manifest is the single source of truth for which gates must run (ADR-0041) and parity binds
 *       the scripts to it (ADR-0042), but nothing yet binds the manifest to the upstream it claims to
 *       come from. The published release asset is the one owner of "what version X's gates are"; this
 *       gate proves the committed copy is faithful to it. This is the forged-manifest red path in the
 *       malicious-actor feature.
 *
 * FIX:  Re-sync the manifest to the published upstream release for the version you pin (copy the
 *       upstream gate-manifest.json), or bump `version` to the upstream release you actually want. Add a
 *       gate you need locally as origin "repo-local" so it is sanctioned without being governed by
 *       upstream. If you meant to change an upstream gate, do it upstream and release a new version.
 *
 * Exit codes: 0 = manifest matches the published upstream (or origin authoring an unreleased version);
 *             1 = the committed manifest diverges from the published upstream (forged/weakened);
 *             2 = fail-closed (cannot read/parse a manifest, cannot reach upstream, or - as a consumer -
 *                 the pinned version has no published release, so provenance cannot be verified).
 * Inputs: GATE_MANIFEST_FILE (committed manifest), GATE_UPSTREAM_REPO (upstream "owner/repo"),
 * GITHUB_REPOSITORY (this repo "owner/repo"; GitHub Actions sets it), GATE_UPSTREAM_FILE (the path the
 * workflow downloaded the published upstream manifest to: file present = that published manifest, path
 * set but file absent = no release published for the version, env unset = provenance misconfigured).
 * A network error while downloading is the workflow's download step to fail, before this gate runs.
 * Pinned by test/manifest-provenance.test.mjs.
 */
import { readFileSync, existsSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..", "..", "..");
const MANIFEST = process.env.GATE_MANIFEST_FILE ? resolve(process.env.GATE_MANIFEST_FILE) : resolve(ROOT, "gate-manifest.json");
const UPSTREAM_REPO = process.env.GATE_UPSTREAM_REPO || "techfleetworks/enterprise-software-AI-skills";
const THIS_REPO = process.env.GITHUB_REPOSITORY || ""; // empty => treated as consumer (the stricter mode)

const failClosed = (msg) => {
  console.error(`✖ check-manifest-provenance (fail-closed): ${msg}`);
  process.exit(2);
};
const fail = (lines) => {
  console.error("✖ check-manifest-provenance: the committed manifest does not match the published upstream release:");
  for (const l of lines) console.error(`   • ${l}`);
  process.exit(1);
};

const readManifest = (file, label) => {
  let m;
  try {
    m = JSON.parse(readFileSync(file, "utf8"));
  } catch (e) {
    failClosed(`cannot read/parse the ${label} manifest ${file}: ${e.message}`);
  }
  if (!m || typeof m !== "object" || !Array.isArray(m.gates)) {
    failClosed(`the ${label} manifest ${file} is not a gate manifest (no gates array).`);
  }
  return m;
};

const committed = readManifest(MANIFEST, "committed");
if (typeof committed.version !== "string" || !/^\d+\.\d+\.\d+$/.test(committed.version)) {
  failClosed(`the committed manifest has no valid semver "version" to pin provenance to.`);
}
const version = committed.version;
const isOrigin = THIS_REPO !== "" && THIS_REPO === UPSTREAM_REPO;

// Resolve the published upstream manifest for this version. The CI workflow downloads the release asset
// to the path in GATE_UPSTREAM_FILE before this gate runs (this gate makes no network call). File
// present = that published manifest; path set but file absent = no release published for this version;
// env unset = provenance is misconfigured (the workflow did not wire the download), which fails closed.
const seam = process.env.GATE_UPSTREAM_FILE;
if (!seam) {
  failClosed(`GATE_UPSTREAM_FILE is not set: the CI workflow must download the upstream release asset for ${version} and point this gate at it (this gate performs no network IO).`);
}
const upstreamFile = resolve(seam);
const published = existsSync(upstreamFile);

if (!published) {
  if (isOrigin) {
    console.log(`✓ check-manifest-provenance: ${UPSTREAM_REPO} is the upstream repo authoring unreleased version ${version} (nothing published to compare yet).`);
    process.exit(0);
  }
  failClosed(`pinned version ${version} has no published release at ${UPSTREAM_REPO} - cannot verify provenance. Pin a released version.`);
}

const upstream = readManifest(upstreamFile, "upstream");
// The whole comparison assumes the workflow downloaded the asset for THIS version. Confirm it, so a
// mis-templated tag or a cached/redirected artifact cannot make the gate compare against a different
// (possibly weaker) release and pass. The gate holds `version`; this one self-check closes the seam.
if (typeof upstream.version !== "string" || upstream.version !== version) {
  failClosed(`the published upstream manifest is for version ${JSON.stringify(upstream.version)}, not the pinned ${version} (wrong release asset handed to the gate).`);
}

// Compare the UPSTREAM-origin gates (origin "repo-local" is adopted locally and not governed here).
const isUpstreamGate = (g) => (g?.origin ?? "upstream") !== "repo-local";
const upById = new Map();
for (const g of upstream.gates) {
  if (typeof g?.id === "string") upById.set(g.id, g);
}
const committedUpstream = committed.gates.filter(isUpstreamGate);
const committedIds = new Set(committedUpstream.map((g) => g.id));
const violations = [];

for (const g of committedUpstream) {
  if (typeof g?.id !== "string" || typeof g?.sha256 !== "string") {
    failClosed(`the committed manifest has a malformed upstream gate entry (id and sha256 must be strings).`);
  }
  const u = upById.get(g.id);
  if (!u) {
    violations.push(`gate "${g.id}": committed as an upstream gate but not present in the published ${version} manifest (unsanctioned insertion - mark it origin "repo-local" if it is a local gate).`);
    continue;
  }
  if (g.sha256 !== u.sha256) {
    violations.push(`gate "${g.id}": sha256 ${String(g.sha256).slice(0, 12)}… != published ${String(u.sha256).slice(0, 12)}… (the manifest points at different gate content than the release).`);
  }
  if ((g.lane ?? "required") !== (u.lane ?? "required")) {
    violations.push(`gate "${g.id}": lane "${g.lane}" != published lane "${u.lane}" (a required upstream gate cannot be downgraded locally).`);
  }
}

for (const u of upstream.gates) {
  if (typeof u?.id === "string" && !committedIds.has(u.id)) {
    violations.push(`gate "${u.id}": required by the published ${version} manifest but missing from the committed manifest (a published gate was dropped).`);
  }
}

// Machinery (the aggregator and the like) is not a gate, but a neutered one turns enforcement off, so it
// is held to the published release the same way gates are: same id set, same sha256, none dropped.
const committedMach = Array.isArray(committed.machinery) ? committed.machinery : [];
const upstreamMach = Array.isArray(upstream.machinery) ? upstream.machinery : [];
const upMachById = new Map();
for (const m of upstreamMach) if (typeof m?.id === "string") upMachById.set(m.id, m);
const committedMachIds = new Set(committedMach.map((m) => m?.id));
for (const m of committedMach) {
  if (typeof m?.id !== "string" || typeof m?.sha256 !== "string") {
    failClosed(`the committed manifest has a malformed machinery entry (id and sha256 must be strings).`);
  }
  const u = upMachById.get(m.id);
  if (!u) {
    violations.push(`machinery "${m.id}": committed but not present in the published ${version} manifest (unsanctioned insertion).`);
    continue;
  }
  if (m.sha256 !== u.sha256) {
    violations.push(`machinery "${m.id}": sha256 ${String(m.sha256).slice(0, 12)}… != published ${String(u.sha256).slice(0, 12)}… (the manifest points at different machinery content than the release).`);
  }
}
for (const u of upstreamMach) {
  if (typeof u?.id === "string" && !committedMachIds.has(u.id)) {
    violations.push(`machinery "${u.id}": required by the published ${version} manifest but missing from the committed manifest (published machinery was dropped).`);
  }
}

if (violations.length) fail(violations);
console.log(`✓ check-manifest-provenance: the committed manifest's ${committedUpstream.length} upstream gate(s) and ${committedMach.length} machinery entry(ies) match the published ${version} release${isOrigin ? " (origin mode)" : ""}.`);
