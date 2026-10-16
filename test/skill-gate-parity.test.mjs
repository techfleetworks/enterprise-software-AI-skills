// Proves check-skill-gate-parity (PARITY-001, bootstrap-v2 PR 1) actually detects: it builds throwaway
// fixture repos (a gate-manifest.json plus gate scripts) and runs the real gate against them via its
// env seams, asserting exit codes - in-parity → 0, each drift/missing/unsanctioned class → 1, and
// malformed/missing manifest → 2. Hashes are computed with node:crypto exactly as the gate does, so a
// "matching" fixture genuinely matches and a "drifted" one genuinely differs. The test FAILS if the
// gate stops detecting (discrimination), so a broken gate cannot pass.
import { test } from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from "node:fs";
import { createHash } from "node:crypto";
import { resolve, join } from "node:path";
import { tmpdir } from "node:os";

const GUARD = resolve(process.cwd(), ".claude/skills/judge-arch/scripts/check-skill-gate-parity.mjs");
const created = [];
const sha = (s) => createHash("sha256").update(s).digest("hex");

/**
 * Build a fixture repo. `gates` = [{id, script, content, hash?, test?, writeScript?, writeTest?}].
 * `machinery` = [{id, content, hash?, writeScript?}] writes scripts/ci/run-<id>.mjs and lists it under
 * the manifest's machinery array.
 */
function fixture({ gates = [], machinery = [], extraScripts = [], omitManifest = false, rawManifest } = {}) {
  const root = mkdtempSync(join(tmpdir(), "parity-"));
  created.push(root);
  mkdirSync(join(root, "scripts", "ci"), { recursive: true });
  mkdirSync(join(root, "test"), { recursive: true });
  const manifestGates = [];
  for (const g of gates) {
    const rel = g.script ?? `scripts/ci/check-${g.id}.mjs`;
    const testRel = g.test ?? `test/${g.id}.test.mjs`;
    if (g.writeScript !== false) writeFileSync(join(root, rel), g.content ?? "// gate\n");
    if (g.writeTest !== false) writeFileSync(join(root, testRel), "// test\n");
    const entry = {
      id: g.id,
      script: rel,
      sha256: g.hash ?? sha(g.content ?? "// gate\n"),
      test: testRel,
      lane: g.lane ?? "required",
    };
    if (g.omitTestField) delete entry.test;
    manifestGates.push(entry);
  }
  const manifestMachinery = [];
  for (const m of machinery) {
    const rel = m.script ?? `scripts/ci/run-${m.id}.mjs`;
    if (m.writeScript !== false) writeFileSync(join(root, rel), m.content ?? "// machinery\n");
    manifestMachinery.push({ id: m.id, skill: "judge-arch", script: rel, sha256: m.hash ?? sha(m.content ?? "// machinery\n"), test: `test/${m.id}.test.mjs` });
  }
  for (const name of extraScripts) writeFileSync(join(root, "scripts", "ci", name), "// extra\n");
  if (!omitManifest) {
    const built = { version: "1.0.0", gates: manifestGates, aggregator: { requiredCheck: "gate" } };
    if (manifestMachinery.length) built.machinery = manifestMachinery;
    writeFileSync(join(root, "gate-manifest.json"), rawManifest ?? JSON.stringify(built));
  }
  return root;
}

function run(root) {
  try {
    execFileSync("node", [GUARD], {
      stdio: "pipe",
      env: { ...process.env, GATE_MANIFEST_FILE: join(root, "gate-manifest.json"), GATE_DIR: join(root, "scripts", "ci") },
    });
    return 0;
  } catch (e) {
    return e.status ?? 1;
  }
}

test("PARITY: passes (0) when committed gates match the manifest", () => {
  const root = fixture({ gates: [{ id: "alpha", content: "// alpha gate\n" }, { id: "beta", content: "// beta gate\n" }] });
  assert.equal(run(root), 0);
});

test("PARITY: FLAGS (1) a drifted gate (sha256 mismatch)", () => {
  const root = fixture({ gates: [{ id: "alpha", content: "// alpha gate\n", hash: sha("DIFFERENT") }] });
  assert.equal(run(root), 1);
});

test("PARITY: FLAGS (1) a manifest gate whose script is missing", () => {
  const root = fixture({ gates: [{ id: "alpha", content: "// alpha\n", writeScript: false }] });
  assert.equal(run(root), 1);
});

test("PARITY: FLAGS (1) a manifest gate whose discrimination test is missing", () => {
  const root = fixture({ gates: [{ id: "alpha", content: "// alpha\n", writeTest: false }] });
  assert.equal(run(root), 1);
});

test("PARITY: FLAGS (1) an unsanctioned committed gate not in the manifest (allow-list)", () => {
  const root = fixture({ gates: [{ id: "alpha", content: "// alpha\n" }], extraScripts: ["check-evil.mjs"] });
  assert.equal(run(root), 1);
});

test("PARITY: FLAGS (1) an unsanctioned .cjs gate (widened extension allow-list)", () => {
  const root = fixture({ gates: [{ id: "alpha", content: "// alpha\n" }], extraScripts: ["check-evil.cjs"] });
  assert.equal(run(root), 1);
});

test("PARITY: does NOT flag a non-gate helper file in the gate dir (no false positive)", () => {
  const root = fixture({ gates: [{ id: "alpha", content: "// alpha\n" }], extraScripts: ["_guard-lib.mjs"] });
  assert.equal(run(root), 0);
});

test("PARITY: FLAGS (1) a manifest gate that names NO discrimination test", () => {
  const root = fixture({ gates: [{ id: "alpha", content: "// alpha\n", omitTestField: true }] });
  assert.equal(run(root), 1);
});

test("PARITY: fails CLOSED (2) on a malformed gate entry (script not a string)", () => {
  const root = fixture({
    rawManifest: JSON.stringify({ version: "1.0.0", gates: [{ id: "x", lane: "required" }], aggregator: { requiredCheck: "gate" } }),
  });
  assert.equal(run(root), 2);
});

test("PARITY: FLAGS (1) a gate whose script path escapes the repo (path traversal)", () => {
  const root = fixture({ gates: [{ id: "alpha", script: "../../escape.mjs", writeScript: false, writeTest: false }] });
  assert.equal(run(root), 1);
});

test("PARITY: passes (0) when a machinery script matches its manifest sha256", () => {
  const root = fixture({ gates: [{ id: "alpha", content: "// alpha\n" }], machinery: [{ id: "runner", content: "// runner\n" }] });
  assert.equal(run(root), 0);
});

test("PARITY: FLAGS (1) a machinery script whose sha256 drifts from the manifest", () => {
  const root = fixture({ gates: [{ id: "alpha", content: "// alpha\n" }], machinery: [{ id: "runner", content: "// runner\n", hash: sha("DIFFERENT") }] });
  assert.equal(run(root), 1);
});

test("PARITY: FLAGS (1) a machinery script that is missing", () => {
  const root = fixture({ gates: [{ id: "alpha", content: "// alpha\n" }], machinery: [{ id: "runner", content: "// runner\n", writeScript: false }] });
  assert.equal(run(root), 1);
});

test("PARITY: fails CLOSED (2) on a malformed machinery entry (sha256 missing)", () => {
  const root = fixture({ rawManifest: JSON.stringify({ version: "1.0.0", gates: [], machinery: [{ id: "runner", skill: "judge-arch", script: "scripts/ci/run-manifest-gates.mjs" }], aggregator: { requiredCheck: "gate" } }) });
  assert.equal(run(root), 2);
});

test("PARITY: FLAGS (1) a machinery script path that escapes the repo (traversal)", () => {
  const root = fixture({ rawManifest: JSON.stringify({ version: "1.0.0", gates: [], machinery: [{ id: "runner", skill: "judge-arch", script: "../evil.mjs", sha256: "a".repeat(64), test: "t" }], aggregator: { requiredCheck: "gate" } }) });
  assert.equal(run(root), 1);
});

test("PARITY: FLAGS (1) a machinery script that uses the gate check- prefix (gate masquerading as machinery)", () => {
  const root = fixture({ rawManifest: JSON.stringify({ version: "1.0.0", gates: [], machinery: [{ id: "evil", skill: "judge-arch", script: "scripts/ci/check-evil.mjs", sha256: "a".repeat(64), test: "t" }], aggregator: { requiredCheck: "gate" } }) });
  assert.equal(run(root), 1);
});

test("PARITY: fails CLOSED (2) when the manifest is missing", () => {
  const root = fixture({ gates: [{ id: "alpha", content: "// alpha\n" }], omitManifest: true });
  assert.equal(run(root), 2);
});

test("PARITY: fails CLOSED (2) when the manifest is not a manifest (no gates array)", () => {
  const root = fixture({ rawManifest: JSON.stringify({ version: "1.0.0" }) });
  assert.equal(run(root), 2);
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
