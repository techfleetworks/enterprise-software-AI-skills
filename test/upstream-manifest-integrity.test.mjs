// Proves check-upstream-manifest-integrity (UPSTREAM-INTEGRITY-001, bootstrap-v2) actually detects: it
// builds throwaway fixture repos (a .claude/skills/<skill>/scripts tree of marked gate scripts plus a
// gate-manifest.json) and runs the real gate via its env seams, asserting exit codes - in exact
// agreement → 0; each drift class (sha256 mismatch, missing source, missing/wrong marker, missing test,
// an unmanifested marked script, machinery drift) → 1; and missing/malformed manifest or missing skills
// dir → 2 (fail-closed). sha256 values are computed exactly as the gate does, so a "matching" fixture
// genuinely matches. The test FAILS if the gate stops detecting (discrimination).
import { test } from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync, readFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { resolve, join, dirname } from "node:path";
import { tmpdir } from "node:os";

const GUARD = resolve(process.cwd(), ".claude/skills/judge-arch/scripts/check-upstream-manifest-integrity.mjs");
const created = [];
const sha = (s) => createHash("sha256").update(s).digest("hex");

/**
 * Build a fixture. entries: [{id, kind='gate', skill='judge-arch', body, markerKind, markerId, hash,
 * writeSource=true, writeTest=true, origin}]. extraMarked: [{skill, name, kind, id}] writes a marked
 * script with no manifest entry. omitManifest / rawManifest / omitSkillsDir override.
 */
function fixture({ entries = [], consumerGates = [], extraMarked = [], extraUnmarked = [], omitManifest = false, rawManifest, omitSkillsDir = false } = {}) {
  const root = mkdtempSync(join(tmpdir(), "integrity-"));
  created.push(root);
  const skillsDir = join(root, ".claude", "skills");
  mkdirSync(skillsDir, { recursive: true }); // the skills dir exists even when a source is omitted (that is a missing FILE, exit 1, not a missing DIR, exit 2)
  const gates = [];
  const machinery = [];
  const consumerRequiredGates = [];
  for (const e of entries) {
    const kind = e.kind ?? "gate";
    const skill = e.skill ?? "judge-arch";
    const name = `check-${e.id}.mjs`;
    const markerKind = e.markerKind ?? kind;
    const markerId = e.markerId ?? e.id;
    const body = `// bootstrap-v2-${markerKind}: ${markerId}\n${e.body ?? "// gate body\n"}`;
    if (e.writeSource !== false) {
      const dir = join(skillsDir, skill, "scripts");
      mkdirSync(dir, { recursive: true });
      writeFileSync(join(dir, name), body);
    }
    const testRel = `test/${e.id}.test.mjs`;
    const testBody = e.testBody ?? "// test\n";
    if (e.writeTest !== false) {
      mkdirSync(join(root, "test"), { recursive: true });
      writeFileSync(join(root, testRel), testBody);
    }
    const entry = { id: e.id, skill, script: `scripts/ci/${name}`, sha256: e.hash ?? sha(body), test: testRel };
    if (kind === "gate") {
      entry.origin = e.origin ?? "upstream";
      entry.lane = "required";
      // #123: every upstream gate pins its discrimination TEST's hash. e.testHash overrides it (drift case);
      // e.omitTestSha leaves it off (missing case).
      if (!e.omitTestSha) entry.testSha256 = e.testHash ?? sha(testBody);
      gates.push(entry);
    } else machinery.push(entry);
  }
  // Consumer-required gates (ADR-0109): a consumer-gate-marked source + a consumerRequiredGates manifest entry.
  for (const c of consumerGates) {
    const skill = c.skill ?? "bdd-comprehensive-testing";
    const name = `check-${c.id}.mjs`;
    const markerKind = c.markerKind ?? "consumer-gate";
    const markerId = c.markerId ?? c.id;
    const body = `// bootstrap-v2-${markerKind}: ${markerId}\n${c.body ?? "// gate body\n"}`;
    if (c.writeSource !== false) {
      const dir = join(skillsDir, skill, "scripts");
      mkdirSync(dir, { recursive: true });
      writeFileSync(join(dir, name), body);
    }
    const testRel = `test/${c.id}.test.mjs`;
    if (c.writeTest !== false) {
      mkdirSync(join(root, "test"), { recursive: true });
      writeFileSync(join(root, testRel), c.testBody ?? "// test\n");
    }
    const entry = { id: c.id, origin: c.origin ?? "upstream", skill, script: `scripts/ci/${name}`, sha256: c.hash ?? sha(body), test: testRel };
    if (!c.omitAcceptance) entry.acceptance = c.acceptance ?? "the consumer must provide its own input";
    // A consumer-gate pins its test hash by default (ADR-0109 F2); omitTestSha / testHash drive the error cases.
    if (!c.omitTestSha) entry.testSha256 = c.testHash ?? sha(c.testBody ?? "// test\n");
    consumerRequiredGates.push(entry);
  }
  for (const x of extraMarked) {
    const dir = join(skillsDir, x.skill ?? "judge-arch", "scripts");
    mkdirSync(dir, { recursive: true });
    writeFileSync(join(dir, x.name), `// bootstrap-v2-${x.kind ?? "gate"}: ${x.id}\n// body\n`);
  }
  // A .mjs with NO scope marker: the unclassified-script case the completeness rule must flag, at any name or
  // depth. `subdir` places it below scripts/ to exercise the recursion (ADR-0109 F3).
  for (const x of extraUnmarked) {
    const dir = join(skillsDir, x.skill ?? "judge-arch", "scripts", ...(x.subdir ? [x.subdir] : []));
    mkdirSync(dir, { recursive: true });
    writeFileSync(join(dir, x.name), x.body ?? "// no marker here\n");
  }
  if (omitSkillsDir) rmSync(skillsDir, { recursive: true, force: true });
  if (!omitManifest) {
    const man = { version: "1.0.0", gates, machinery, aggregator: { requiredCheck: "enterprise-gates" } };
    if (consumerRequiredGates.length) man.consumerRequiredGates = consumerRequiredGates;
    writeFileSync(join(root, "gate-manifest.json"), rawManifest ?? JSON.stringify(man));
  }
  return root;
}

function run(root) {
  try {
    execFileSync("node", [GUARD], {
      stdio: "pipe",
      env: { ...process.env, GATE_MANIFEST_FILE: join(root, "gate-manifest.json"), GATE_SKILLS_DIR: join(root, ".claude", "skills") },
    });
    return 0;
  } catch (e) {
    return e.status ?? 1;
  }
}

test("INTEGRITY: passes (0) when the manifest and marked source agree exactly", () => {
  const root = fixture({ entries: [{ id: "alpha" }, { id: "runner", kind: "machinery" }] });
  assert.equal(run(root), 0);
});

test("INTEGRITY: FLAGS (1) a gate whose sha256 differs from its source", () => {
  assert.equal(run(fixture({ entries: [{ id: "alpha", hash: sha("DIFFERENT") }] })), 1);
});

test("INTEGRITY: FLAGS (1) a gate whose source script is missing", () => {
  assert.equal(run(fixture({ entries: [{ id: "alpha", writeSource: false }] })), 1);
});

test("INTEGRITY: FLAGS (1) a gate whose source carries no marker", () => {
  // body has no marker and we set markerKind to an empty-effect by writing a plain body: emulate by
  // giving a source whose marker line is absent. Easiest: a machinery/gate with a body-only source.
  const root = fixture({ entries: [{ id: "alpha" }] });
  // overwrite the source with an unmarked body, and fix the manifest hash to match, so ONLY the marker is wrong
  const src = join(root, ".claude", "skills", "judge-arch", "scripts", "check-alpha.mjs");
  const unmarked = "// no marker here\n";
  writeFileSync(src, unmarked);
  const man = JSON.parse(readFileSync(join(root, "gate-manifest.json"), "utf8"));
  man.gates[0].sha256 = sha(unmarked);
  writeFileSync(join(root, "gate-manifest.json"), JSON.stringify(man));
  assert.equal(run(root), 1);
});

test("INTEGRITY: FLAGS (1) a source whose marker id does not match the manifest id", () => {
  assert.equal(run(fixture({ entries: [{ id: "alpha", markerId: "beta" }] })), 1);
});

test("INTEGRITY: FLAGS (1) a gate that names a test which does not exist", () => {
  assert.equal(run(fixture({ entries: [{ id: "alpha", writeTest: false }] })), 1);
});

test("INTEGRITY ISSUE-123: FLAGS (1) a gate with NO testSha256 (the test's content is not pinned)", () => {
  assert.equal(run(fixture({ entries: [{ id: "alpha", omitTestSha: true }] })), 1);
});

test("INTEGRITY ISSUE-123: FLAGS (1) a gate whose testSha256 does not match its test file (hollowed test)", () => {
  assert.equal(run(fixture({ entries: [{ id: "alpha", testHash: sha("a DIFFERENT, real discriminating test\n") }] })), 1);
});

test("INTEGRITY ISSUE-123: passes (0) when testSha256 matches the test file content", () => {
  assert.equal(run(fixture({ entries: [{ id: "alpha", testBody: "import {test} from 'node:test';\ntest('real', () => {});\n" }] })), 0);
});

test("INTEGRITY: FLAGS (1) a marked source script that is not listed in the manifest", () => {
  const root = fixture({ entries: [{ id: "alpha" }], extraMarked: [{ name: "check-rogue.mjs", kind: "gate", id: "rogue" }] });
  assert.equal(run(root), 1);
});

test("INTEGRITY: FLAGS (1) machinery whose sha256 differs from its source", () => {
  assert.equal(run(fixture({ entries: [{ id: "runner", kind: "machinery", hash: sha("WRONG") }] })), 1);
});

test("INTEGRITY: FLAGS (1) a source file carrying two different markers", () => {
  const root = fixture({ entries: [{ id: "alpha" }] });
  const dir = join(root, ".claude", "skills", "judge-arch", "scripts");
  writeFileSync(join(dir, "check-double.mjs"), "// bootstrap-v2-gate: alpha\n// bootstrap-v2-gate: beta\n// body\n");
  assert.equal(run(root), 1);
});

test("INTEGRITY ADR-0109: passes (0) a helper-marked non-gate script (declared not-a-gate)", () => {
  const root = fixture({ entries: [{ id: "alpha" }], extraMarked: [{ name: "shared-lib.mjs", kind: "helper", id: "shared-lib" }] });
  assert.equal(run(root), 0);
});

test("INTEGRITY: does NOT flag a repo-local gate (no upstream source expected)", () => {
  const root = fixture({ entries: [{ id: "alpha" }, { id: "local", origin: "repo-local", writeSource: false }] });
  assert.equal(run(root), 0);
});

test("INTEGRITY: fails CLOSED (2) on a malformed machinery entry (sha256 missing)", () => {
  const body = "// bootstrap-v2-gate: alpha\n// gate body\n";
  const root = fixture({
    entries: [{ id: "alpha" }],
    rawManifest: JSON.stringify({
      version: "1.0.0",
      gates: [{ id: "alpha", origin: "upstream", skill: "judge-arch", script: "scripts/ci/check-alpha.mjs", sha256: sha(body), test: "test/alpha.test.mjs", lane: "required" }],
      machinery: [{ id: "runner", skill: "judge-arch", script: "scripts/ci/run-runner.mjs" }],
      aggregator: { requiredCheck: "enterprise-gates" },
    }),
  });
  assert.equal(run(root), 2);
});

test("INTEGRITY: fails CLOSED (2) when the manifest is missing", () => {
  assert.equal(run(fixture({ entries: [{ id: "alpha" }], omitManifest: true })), 2);
});

test("INTEGRITY: fails CLOSED (2) on a malformed manifest (no gates array)", () => {
  assert.equal(run(fixture({ rawManifest: JSON.stringify({ version: "1.0.0" }) })), 2);
});

test("INTEGRITY: fails CLOSED (2) when the skills dir does not exist", () => {
  assert.equal(run(fixture({ entries: [{ id: "alpha" }], omitSkillsDir: true })), 2);
});

// --- ADR-0109: scope classification of every consumer-facing checker ---

test("INTEGRITY ADR-0109: passes (0) with a consumer-gate entry and its marked source", () => {
  const root = fixture({ entries: [{ id: "alpha" }], consumerGates: [{ id: "bdd-coverage" }] });
  assert.equal(run(root), 0);
});

test("INTEGRITY ADR-0109: FLAGS (1) an UNCLASSIFIED check-*.mjs (no scope marker)", () => {
  const root = fixture({ entries: [{ id: "alpha" }], extraUnmarked: [{ name: "check-rogue.mjs" }] });
  assert.equal(run(root), 1);
});

test("INTEGRITY ADR-0109 F1: FLAGS (1) an unmarked .mjs NOT named check-* (a gate cannot escape by its name)", () => {
  const root = fixture({ entries: [{ id: "alpha" }], extraUnmarked: [{ name: "sneaky-gate.mjs" }] });
  assert.equal(run(root), 1);
});

test("INTEGRITY ADR-0109 F3: FLAGS (1) an unmarked .mjs nested below scripts/ (the scan recurses)", () => {
  const root = fixture({ entries: [{ id: "alpha" }], extraUnmarked: [{ name: "deep.mjs", subdir: "nested" }] });
  assert.equal(run(root), 1);
});

test("INTEGRITY ADR-0109: FLAGS (1) a helper marker wrongly LISTED in the manifest", () => {
  // A helper is never a shipped gate; listing its id as a gate must fail.
  const root = fixture({ entries: [{ id: "shared", markerKind: "helper" }] });
  assert.equal(run(root), 1);
});

test("INTEGRITY ADR-0109: FLAGS (1) a consumer-gate marked source not in consumerRequiredGates", () => {
  const root = fixture({ entries: [{ id: "alpha" }], extraMarked: [{ name: "check-ghost.mjs", kind: "consumer-gate", id: "ghost" }] });
  assert.equal(run(root), 1);
});

test("INTEGRITY ADR-0109: FLAGS (1) a consumer-gate whose sha256 differs from its source", () => {
  assert.equal(run(fixture({ entries: [{ id: "alpha" }], consumerGates: [{ id: "bdd-coverage", hash: sha("DIFFERENT") }] })), 1);
});

test("INTEGRITY ADR-0109: FLAGS (1) a consumer-gate missing its acceptance contract", () => {
  assert.equal(run(fixture({ entries: [{ id: "alpha" }], consumerGates: [{ id: "bdd-coverage", omitAcceptance: true }] })), 1);
});

test("INTEGRITY ADR-0109 F2: FLAGS (1) a consumer-gate with no testSha256 (test-hollowing unprotected)", () => {
  assert.equal(run(fixture({ entries: [{ id: "alpha" }], consumerGates: [{ id: "bdd-coverage", omitTestSha: true }] })), 1);
});

test("INTEGRITY ADR-0109 F4: fails CLOSED (2) on an id used in more than one manifest section", () => {
  const root = fixture({ entries: [{ id: "dup" }], consumerGates: [{ id: "dup", skill: "bdd-comprehensive-testing" }] });
  assert.equal(run(root), 2);
});

test("INTEGRITY ADR-0109: FLAGS (1) an upstream-only marked source wrongly LISTED in the manifest", () => {
  // The source is marked upstream-only but the manifest lists it as a gate: it would ship to a consumer.
  assert.equal(run(fixture({ entries: [{ id: "selfgov", markerKind: "upstream-only" }] })), 1);
});

test("INTEGRITY ADR-0109: passes (0) an upstream-only marked check-*.mjs that is in NO manifest section", () => {
  const root = fixture({ entries: [{ id: "alpha" }], extraMarked: [{ name: "check-selfgov.mjs", kind: "upstream-only", id: "selfgov" }] });
  assert.equal(run(root), 0);
});

test("INTEGRITY ADR-0109: the REAL repository passes (every shipped .mjs is classified and manifested)", () => {
  // Run the gate against this repo itself, so a mismarked, unmanifested, or unclassified script added later turns
  // npm test red (the structural guarantee, enforced in CI, not just on fixtures).
  assert.equal(run(process.cwd()), 0);
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
