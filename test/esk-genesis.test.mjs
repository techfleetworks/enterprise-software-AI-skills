// Proves esk-genesis (bootstrap-v2 genesis/reconcile, ADR-0047) actually bootstraps and reconciles a
// consumer repo from a synthetic upstream skills repo. It builds a fake SOURCE (a gate-manifest.json
// plus marked gate/machinery scripts and tests, hashed exactly as the manifest records), runs the real
// generator into a throwaway TARGET, and asserts the produced files, the consumer manifest, repo-local
// preservation, reconcile removal of a dropped gate, idempotency, the source-integrity blocker, and that
// a dry run writes nothing. The test FAILS if the generator stops doing these, so a broken generator
// cannot pass.
import { test } from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, existsSync, rmSync } from "node:fs";
import { createHash } from "node:crypto";
import { resolve, join } from "node:path";
import { tmpdir } from "node:os";

const GEN = resolve(process.cwd(), ".claude/skills/bootstrap/scripts/esk-genesis.mjs");
const created = [];
const sha = (s) => createHash("sha256").update(s).digest("hex");

/**
 * Build a synthetic upstream skills repo. gates/machinery: [{id, body?}]. Returns the source dir.
 * Each gate/machinery script is written under .claude/skills/judge-arch/scripts/ with a marker, and the
 * manifest records the real sha256 so the generator's integrity check passes.
 */
function buildSource({ version = "1.0.0", gates = [{ id: "alpha" }], machinery = [{ id: "runner" }] } = {}) {
  const root = mkdtempSync(join(tmpdir(), "gen-src-"));
  created.push(root);
  const sdir = join(root, ".claude", "skills", "judge-arch", "scripts");
  mkdirSync(sdir, { recursive: true });
  mkdirSync(join(root, "test"), { recursive: true });
  const mkEntry = (e, kind) => {
    const name = `${kind === "machinery" ? "run" : "check"}-${e.id}.mjs`;
    const body = `// bootstrap-v2-${kind}: ${e.id}\n${e.body ?? "// body\n"}`;
    writeFileSync(join(sdir, name), body);
    const script = `scripts/ci/${name}`;
    const testRel = `test/${e.id}.test.mjs`;
    writeFileSync(join(root, testRel), "// test\n");
    const entry = { id: e.id, script, sha256: sha(body), test: testRel };
    if (kind === "gate") { entry.origin = "upstream"; entry.skill = "judge-arch"; entry.lane = "required"; }
    else { entry.skill = "judge-arch"; }
    return entry;
  };
  const manifest = {
    version,
    generatedFrom: `techfleetworks/enterprise-software-AI-skills@${version}`,
    gates: gates.map((g) => mkEntry(g, "gate")),
    machinery: machinery.map((m) => mkEntry(m, "machinery")),
    aggregator: { requiredCheck: "enterprise-gates" },
  };
  writeFileSync(join(root, "gate-manifest.json"), JSON.stringify(manifest, null, 2) + "\n");
  return root;
}

function newTarget() {
  // Nest the target repo inside its own private parent, so a traversal like "../x" resolves into this
  // parent (not the shared temp dir), keeping the "nothing written outside the target" assertions
  // reliable and isolated from other fixtures.
  const parent = mkdtempSync(join(tmpdir(), "gen-tgt-"));
  created.push(parent);
  const t = join(parent, "repo");
  mkdirSync(t, { recursive: true });
  return t;
}

function run(src, tgt, extra = []) {
  try {
    execFileSync("node", [GEN, "--source", src, "--target", tgt, ...extra], { stdio: "pipe" });
    return 0;
  } catch (e) {
    return e.status ?? 1;
  }
}
function runCapture(src, tgt, extra = []) {
  try {
    const out = execFileSync("node", [GEN, "--source", src, "--target", tgt, ...extra], { encoding: "utf8" });
    return { code: 0, out };
  } catch (e) {
    return { code: e.status ?? 1, out: (e.stdout || "") + (e.stderr || "") };
  }
}
const readManifest = (tgt) => JSON.parse(readFileSync(join(tgt, "gate-manifest.json"), "utf8"));

test("GENESIS: bootstraps a fresh consumer with scripts, tests, manifest, and workflow", () => {
  const src = buildSource({ gates: [{ id: "alpha" }, { id: "beta" }] });
  const tgt = newTarget();
  assert.equal(run(src, tgt, ["--yes"]), 0);
  assert.ok(existsSync(join(tgt, "scripts/ci/check-alpha.mjs")), "gate script copied");
  assert.ok(existsSync(join(tgt, "scripts/ci/check-beta.mjs")), "second gate copied");
  assert.ok(existsSync(join(tgt, "scripts/ci/run-runner.mjs")), "machinery copied");
  assert.ok(existsSync(join(tgt, "test/alpha.test.mjs")), "gate test copied");
  assert.ok(existsSync(join(tgt, ".github/workflows/enterprise-gates.yml")), "workflow scaffolded");
  const m = readManifest(tgt);
  assert.equal(m.version, "1.0.0");
  assert.deepEqual(m.gates.map((g) => g.id).sort(), ["alpha", "beta"]);
  assert.equal(m.machinery[0].id, "runner");
  assert.equal(m.aggregator.requiredCheck, "enterprise-gates");
});

test("GENESIS: copied scripts match the source byte-for-byte", () => {
  const src = buildSource();
  const tgt = newTarget();
  run(src, tgt, ["--yes"]);
  const from = readFileSync(join(src, ".claude/skills/judge-arch/scripts/check-alpha.mjs"));
  const to = readFileSync(join(tgt, "scripts/ci/check-alpha.mjs"));
  assert.deepEqual(to, from);
});

test("GENESIS: a dry run (no --yes) writes nothing", () => {
  const src = buildSource();
  const tgt = newTarget();
  assert.equal(run(src, tgt), 0);
  assert.ok(!existsSync(join(tgt, "gate-manifest.json")), "no manifest written on a dry run");
  assert.ok(!existsSync(join(tgt, "scripts/ci/check-alpha.mjs")), "no script written on a dry run");
});

test("RECONCILE: preserves an existing repo-local gate and records it as adopted", () => {
  const src = buildSource({ gates: [{ id: "alpha" }] });
  const tgt = newTarget();
  mkdirSync(join(tgt, "scripts", "ci"), { recursive: true });
  const legacy = join(tgt, "scripts/ci/check-legacy.mjs");
  const legacyContent = "// a pre-existing local guard\n";
  writeFileSync(legacy, legacyContent);
  run(src, tgt, ["--yes"]);
  assert.equal(readFileSync(legacy, "utf8"), legacyContent, "repo-local file is byte-identical");
  const m = readManifest(tgt);
  const rl = m.gates.find((g) => g.id === "legacy");
  assert.ok(rl, "repo-local gate is recorded in the manifest");
  assert.equal(rl.origin, "repo-local");
  assert.equal(rl.sha256, sha(legacyContent));
});

test("RECONCILE: a gate dropped upstream is removed (no orphan)", () => {
  const tgt = newTarget();
  run(buildSource({ version: "1.0.0", gates: [{ id: "alpha" }, { id: "foo" }] }), tgt, ["--yes"]);
  assert.ok(existsSync(join(tgt, "scripts/ci/check-foo.mjs")), "foo present after genesis");
  // Bump: new upstream no longer ships foo.
  assert.equal(run(buildSource({ version: "1.1.0", gates: [{ id: "alpha" }] }), tgt, ["--yes"]), 0);
  assert.ok(!existsSync(join(tgt, "scripts/ci/check-foo.mjs")), "foo removed on reconcile");
  assert.ok(!existsSync(join(tgt, "test/foo.test.mjs")), "foo test removed on reconcile");
  assert.equal(readManifest(tgt).version, "1.1.0", "pin bumped");
  assert.ok(!readManifest(tgt).gates.find((g) => g.id === "foo"), "foo gone from the manifest");
});

test("RECONCILE: re-running with no upstream change is a no-op (idempotent)", () => {
  const src = buildSource();
  const tgt = newTarget();
  run(src, tgt, ["--yes"]);
  const before = readFileSync(join(tgt, "gate-manifest.json"), "utf8");
  assert.equal(run(src, tgt, ["--yes"]), 0);
  assert.equal(readFileSync(join(tgt, "gate-manifest.json"), "utf8"), before, "manifest unchanged on a second run");
});

test("GENESIS: BLOCKS (exit 1) when the source script does not match the manifest sha256", () => {
  const src = buildSource({ gates: [{ id: "alpha" }] });
  // Tamper the source script so its bytes no longer match the manifest-recorded hash.
  writeFileSync(join(src, ".claude/skills/judge-arch/scripts/check-alpha.mjs"), "// bootstrap-v2-gate: alpha\n// TAMPERED\n");
  const tgt = newTarget();
  assert.equal(run(src, tgt, ["--yes"]), 1);
  assert.ok(!existsSync(join(tgt, "gate-manifest.json")), "nothing written when blocked");
});

test("GENESIS: the scaffolded workflow sets the env so the copied gates resolve to the consumer root", () => {
  const src = buildSource();
  const tgt = newTarget();
  run(src, tgt, ["--yes"]);
  const yml = readFileSync(join(tgt, ".github/workflows/enterprise-gates.yml"), "utf8");
  assert.match(yml, /GATE_REPO_ROOT:\s*\$\{\{ github\.workspace \}\}/);
  assert.match(yml, /GATE_MANIFEST_FILE:\s*\$\{\{ github\.workspace \}\}\/gate-manifest\.json/);
  assert.match(yml, /GATE_DIR:\s*\$\{\{ github\.workspace \}\}\/scripts\/ci/);
  assert.match(yml, /GATE_UPSTREAM_FILE:/);
  assert.match(yml, /GATE_UPSTREAM_REPO:/);
});

// NOTE: these traversal tests use a script/skill whose basename resolves to a source file that EXISTS
// with a matching sha, so the ONLY thing that can block the install is the containment guard. If the
// guard were removed, the file would copy OUTSIDE the target and the run would exit 0 - so the test
// genuinely fails when the guard regresses (it is not short-circuited by a source-missing check).
test("GENESIS: BLOCKS (1) a manifest whose gate script escapes the target (path traversal)", () => {
  const src = buildSource({ gates: [{ id: "alpha" }] });
  const mf = join(src, "gate-manifest.json");
  const m = JSON.parse(readFileSync(mf, "utf8"));
  m.gates[0].script = "../check-alpha.mjs"; // basename check-alpha.mjs EXISTS in source, sha matches
  writeFileSync(mf, JSON.stringify(m));
  const tgt = newTarget();
  assert.equal(run(src, tgt, ["--yes"]), 1);
  assert.ok(!existsSync(resolve(tgt, "../check-alpha.mjs")), "no file written outside the target");
  assert.ok(!existsSync(join(tgt, "gate-manifest.json")), "nothing written when a traversal is blocked");
});

test("GENESIS: BLOCKS (1) a manifest gate whose skill contains a path traversal", () => {
  const src = buildSource({ gates: [{ id: "alpha" }] });
  const mf = join(src, "gate-manifest.json");
  const m = JSON.parse(readFileSync(mf, "utf8"));
  m.gates[0].skill = "judge-arch/../judge-arch"; // resolves to the real source dir, so only safeSkill blocks it
  writeFileSync(mf, JSON.stringify(m));
  const tgt = newTarget();
  assert.equal(run(src, tgt, ["--yes"]), 1);
  assert.ok(!existsSync(join(tgt, "gate-manifest.json")), "nothing written when a skill traversal is blocked");
});

test("RECONCILE: refuses to delete a dropped gate whose prior script escapes the target", () => {
  const src = buildSource({ gates: [{ id: "alpha" }] });
  const tgt = newTarget();
  run(src, tgt, ["--yes"]); // genesis
  // Tamper the committed consumer manifest to add a prior upstream gate pointing outside the repo.
  const cm = JSON.parse(readFileSync(join(tgt, "gate-manifest.json"), "utf8"));
  cm.gates.push({ id: "evil", origin: "upstream", skill: "judge-arch", script: "../../evil.mjs", sha256: "a".repeat(64), test: "test/evil.test.mjs", lane: "required" });
  writeFileSync(join(tgt, "gate-manifest.json"), JSON.stringify(cm));
  // Reconcile: the source does not ship 'evil', so it is a removal candidate; its escaping path is refused.
  assert.equal(run(src, tgt, ["--yes"]), 1);
  assert.ok(!existsSync(resolve(tgt, "../../evil.mjs")), "nothing deleted outside the target");
});

test("GENESIS: BLOCKS (1) a manifest with an injection-y upstream repo name", () => {
  const src = buildSource();
  const mf = join(src, "gate-manifest.json");
  const m = JSON.parse(readFileSync(mf, "utf8"));
  m.generatedFrom = 'foo"; rm -rf ~ #@1.0.0';
  writeFileSync(mf, JSON.stringify(m));
  assert.equal(run(src, newTarget(), ["--yes"]), 2);
});

test("GENESIS: warns when a repo-local gate has no matching test", () => {
  const src = buildSource({ gates: [{ id: "alpha" }] });
  const tgt = newTarget();
  mkdirSync(join(tgt, "scripts", "ci"), { recursive: true });
  writeFileSync(join(tgt, "scripts/ci/check-legacy.mjs"), "// a local guard with no test\n");
  const { out } = runCapture(src, tgt); // dry run: the warning is printed in the plan
  assert.match(out, /no test at test\/legacy\.test\.mjs|parity will flag it/);
});

test("GENESIS: fails CLOSED (2) when the source has no manifest", () => {
  const src = mkdtempSync(join(tmpdir(), "gen-empty-"));
  created.push(src);
  assert.equal(run(src, newTarget(), ["--yes"]), 2);
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
