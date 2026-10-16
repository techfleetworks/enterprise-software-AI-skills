// Proves check-manifest-provenance (PROVENANCE-001, bootstrap-v2) actually detects: it builds a
// committed manifest and a stand-in "published upstream" manifest (via the GATE_UPSTREAM_FILE seam),
// runs the real gate, and asserts exit codes - a faithful copy → 0, each forge/weaken class (sha256
// mismatch, lane downgrade, unsanctioned insertion, dropped published gate) → 1, and fail-closed → 2
// (no published release as a consumer, malformed committed or upstream manifest). It also pins the two
// mode-dependent paths: origin authoring an unreleased version → 0, origin rewriting a published
// version → 1, and a repo-local gate is ignored by provenance → 0. The test FAILS if the gate stops
// detecting (discrimination), so a neutralized gate cannot pass.
import { test } from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtempSync, writeFileSync, rmSync } from "node:fs";
import { resolve, join } from "node:path";
import { tmpdir } from "node:os";

const GUARD = resolve(process.cwd(), ".claude/skills/judge-arch/scripts/check-manifest-provenance.mjs");
const UPSTREAM = "techfleetworks/enterprise-software-AI-skills";
const created = [];

const gate = (over = {}) => ({
  id: over.id ?? "alpha",
  script: `scripts/ci/check-${over.id ?? "alpha"}.mjs`,
  sha256: over.sha256 ?? "a".repeat(64),
  test: `test/${over.id ?? "alpha"}.test.mjs`,
  lane: over.lane ?? "required",
  ...(over.origin ? { origin: over.origin } : {}),
});

const manifest = (gates, version = "1.2.0") => JSON.stringify({ version, gates, aggregator: { requiredCheck: "gate" } });

/**
 * Build a fixture. committed / upstream are manifest JSON strings (or null). publishUpstream=false
 * points the seam at a non-existent file (no release published). repo = GITHUB_REPOSITORY.
 */
function fixture({ committed, upstream, publishUpstream = true, repo = "someorg/consumer-repo" } = {}) {
  const root = mkdtempSync(join(tmpdir(), "prov-"));
  created.push(root);
  const committedPath = join(root, "gate-manifest.json");
  if (committed !== null) writeFileSync(committedPath, committed);
  const upstreamPath = join(root, "upstream-manifest.json");
  if (publishUpstream && upstream !== null) writeFileSync(upstreamPath, upstream);
  return { committedPath, upstreamPath, repo, publishUpstream };
}

function run(f) {
  const env = {
    ...process.env,
    GATE_MANIFEST_FILE: f.committedPath,
    GATE_UPSTREAM_REPO: UPSTREAM,
    GITHUB_REPOSITORY: f.repo,
    // present-and-missing is how the gate learns "no release published for this version"
    GATE_UPSTREAM_FILE: f.publishUpstream ? f.upstreamPath : join(f.committedPath, "..", "no-such-release.json"),
  };
  try {
    execFileSync("node", [GUARD], { stdio: "pipe", env });
    return 0;
  } catch (e) {
    return e.status ?? 1;
  }
}

test("PROV: passes (0) when the committed manifest matches the published upstream", () => {
  const g = [gate({ sha256: "b".repeat(64) })];
  assert.equal(run(fixture({ committed: manifest(g), upstream: manifest(g) })), 0);
});

test("PROV: FLAGS (1) a gate whose sha256 differs from the published manifest (weakened script)", () => {
  const committed = [gate({ sha256: "c".repeat(64) })];
  const upstream = [gate({ sha256: "d".repeat(64) })];
  assert.equal(run(fixture({ committed: manifest(committed), upstream: manifest(upstream) })), 1);
});

test("PROV: FLAGS (1) a required gate downgraded to advisory locally", () => {
  const committed = [gate({ lane: "advisory" })];
  const upstream = [gate({ lane: "required" })];
  assert.equal(run(fixture({ committed: manifest(committed), upstream: manifest(upstream) })), 1);
});

test("PROV: FLAGS (1) an upstream-origin gate not present in the published manifest (insertion)", () => {
  const committed = [gate({ id: "alpha" }), gate({ id: "evil" })];
  const upstream = [gate({ id: "alpha" })];
  assert.equal(run(fixture({ committed: manifest(committed), upstream: manifest(upstream) })), 1);
});

test("PROV: FLAGS (1) a published gate dropped from the committed manifest", () => {
  const committed = [gate({ id: "alpha" })];
  const upstream = [gate({ id: "alpha" }), gate({ id: "beta" })];
  assert.equal(run(fixture({ committed: manifest(committed), upstream: manifest(upstream) })), 1);
});

test("PROV: does NOT flag a repo-local gate absent from the published manifest (no false positive)", () => {
  const committed = [gate({ id: "alpha" }), gate({ id: "local-only", origin: "repo-local" })];
  const upstream = [gate({ id: "alpha" })];
  assert.equal(run(fixture({ committed: manifest(committed), upstream: manifest(upstream) })), 0);
});

test("PROV: fails CLOSED (2) as a consumer when the pinned version has no published release", () => {
  const g = [gate()];
  assert.equal(run(fixture({ committed: manifest(g), publishUpstream: false })), 2);
});

test("PROV: fails CLOSED (2) on a malformed committed manifest (no gates array)", () => {
  assert.equal(run(fixture({ committed: JSON.stringify({ version: "1.2.0" }), upstream: manifest([gate()]) })), 2);
});

test("PROV: fails CLOSED (2) on a malformed published upstream manifest (no gates array)", () => {
  assert.equal(run(fixture({ committed: manifest([gate()]), upstream: JSON.stringify({ version: "1.2.0" }) })), 2);
});

test("PROV: fails CLOSED (2) when the committed manifest has no valid semver version", () => {
  const g = [gate()];
  assert.equal(run(fixture({ committed: manifest(g, "not-a-version"), upstream: manifest(g) })), 2);
});

test("PROV: fails CLOSED (2) when the upstream manifest is for a different version (wrong asset)", () => {
  const g = [gate()];
  assert.equal(run(fixture({ committed: manifest(g, "1.2.0"), upstream: manifest(g, "1.3.0") })), 2);
});

test("PROV: fails CLOSED (2) when GATE_UPSTREAM_FILE is unset (provenance not wired by the workflow)", () => {
  const f = fixture({ committed: manifest([gate()]), upstream: manifest([gate()]) });
  const env = { ...process.env, GATE_MANIFEST_FILE: f.committedPath, GATE_UPSTREAM_REPO: UPSTREAM, GITHUB_REPOSITORY: f.repo };
  delete env.GATE_UPSTREAM_FILE;
  let code = 0;
  try {
    execFileSync("node", [GUARD], { stdio: "pipe", env });
  } catch (e) {
    code = e.status ?? 1;
  }
  assert.equal(code, 2);
});

test("PROV: FLAGS (1) machinery whose sha256 differs from the published manifest", () => {
  const g = [gate({ sha256: "b".repeat(64) })];
  const mach = (hash) => [{ id: "runner", skill: "judge-arch", script: "scripts/ci/run-manifest-gates.mjs", sha256: hash, test: "test/run.test.mjs" }];
  const committed = JSON.stringify({ version: "1.2.0", gates: g, machinery: mach("c".repeat(64)), aggregator: { requiredCheck: "enterprise-gates" } });
  const upstream = JSON.stringify({ version: "1.2.0", gates: g, machinery: mach("d".repeat(64)), aggregator: { requiredCheck: "enterprise-gates" } });
  assert.equal(run(fixture({ committed, upstream })), 1);
});

test("PROV: FLAGS (1) when published machinery is dropped from the committed manifest", () => {
  const g = [gate({ sha256: "b".repeat(64) })];
  const committed = JSON.stringify({ version: "1.2.0", gates: g, aggregator: { requiredCheck: "enterprise-gates" } });
  const upstream = JSON.stringify({ version: "1.2.0", gates: g, machinery: [{ id: "runner", skill: "judge-arch", script: "scripts/ci/run-manifest-gates.mjs", sha256: "d".repeat(64), test: "test/run.test.mjs" }], aggregator: { requiredCheck: "enterprise-gates" } });
  assert.equal(run(fixture({ committed, upstream })), 1);
});

test("PROV: fails CLOSED (2) on a malformed committed machinery entry (sha256 missing)", () => {
  const g = [gate({ sha256: "b".repeat(64) })];
  const committed = JSON.stringify({ version: "1.2.0", gates: g, machinery: [{ id: "runner", skill: "judge-arch", script: "scripts/ci/run-manifest-gates.mjs" }], aggregator: { requiredCheck: "enterprise-gates" } });
  const upstream = JSON.stringify({ version: "1.2.0", gates: g, machinery: [{ id: "runner", skill: "judge-arch", script: "scripts/ci/run-manifest-gates.mjs", sha256: "d".repeat(64), test: "t" }], aggregator: { requiredCheck: "enterprise-gates" } });
  assert.equal(run(fixture({ committed, upstream })), 2);
});

test("PROV: FLAGS (1) committed machinery not present in the published manifest (insertion)", () => {
  const g = [gate({ sha256: "b".repeat(64) })];
  const committed = JSON.stringify({ version: "1.2.0", gates: g, machinery: [{ id: "rogue", skill: "judge-arch", script: "scripts/ci/run-rogue.mjs", sha256: "c".repeat(64), test: "t" }], aggregator: { requiredCheck: "enterprise-gates" } });
  const upstream = JSON.stringify({ version: "1.2.0", gates: g, aggregator: { requiredCheck: "enterprise-gates" } });
  assert.equal(run(fixture({ committed, upstream })), 1);
});

test("ORIGIN: passes (0) when the upstream repo authors an unreleased version (nothing published yet)", () => {
  const g = [gate()];
  assert.equal(run(fixture({ committed: manifest(g), publishUpstream: false, repo: UPSTREAM })), 0);
});

test("ORIGIN: FLAGS (1) when the upstream repo rewrites an already-published version's gates", () => {
  const committed = [gate({ sha256: "e".repeat(64) })];
  const upstream = [gate({ sha256: "f".repeat(64) })];
  assert.equal(run(fixture({ committed: manifest(committed), upstream: manifest(upstream), repo: UPSTREAM })), 1);
});

process.on("exit", () => {
  for (const d of created) {
    try {
      rmSync(d, { recursive: true, force: true });
    } catch {
      /* best-effort */
    }
  }
});
