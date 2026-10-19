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
function buildSource({ version = "1.0.0", gates = [{ id: "alpha" }], machinery = [{ id: "runner" }], omitHookTemplate = false } = {}) {
  const root = mkdtempSync(join(tmpdir(), "gen-src-"));
  created.push(root);
  const sdir = join(root, ".claude", "skills", "judge-arch", "scripts");
  mkdirSync(sdir, { recursive: true });
  mkdirSync(join(root, "test"), { recursive: true });
  // Ship the pre-push hook template so genesis installs it, matching the real source repo.
  if (!omitHookTemplate) {
    const tdir = join(root, ".claude", "skills", "bootstrap", "templates");
    mkdirSync(tdir, { recursive: true });
    writeFileSync(join(tdir, "pre-push"), "#!/usr/bin/env node\n// stub hook template\nprocess.exit(0);\n");
    writeFileSync(join(tdir, "install-hooks.mjs"), "#!/usr/bin/env node\n// stub install-hooks helper\nprocess.exit(0);\n");
  }
  const mkEntry = (e, kind) => {
    const name = `${kind === "machinery" ? "run" : "check"}-${e.id}.mjs`;
    const body = `// bootstrap-v2-${kind}: ${e.id}\n${e.body ?? "// body\n"}`;
    writeFileSync(join(sdir, name), body);
    const script = `scripts/ci/${name}`;
    const testRel = `test/${e.id}.test.mjs`;
    writeFileSync(join(root, testRel), "// test\n");
    const entry = { id: e.id, script, sha256: sha(body), test: testRel };
    if (kind === "gate") { entry.origin = "upstream"; entry.skill = "judge-arch"; entry.lane = "required"; if (e.invoke) entry.invoke = e.invoke; }
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
// A manifest carries bootstrap-v2 provenance (what the ADR-0052 guard keys on).
const looksOurs = (m) => typeof m?.generatedFrom === "string" && /@\d+\.\d+\.\d+$/.test(m.generatedFrom) && typeof m?.aggregator?.requiredCheck === "string";

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

test("GENESIS: installs the pre-push hook from the source template", () => {
  const src = buildSource();
  const tgt = newTarget();
  run(src, tgt, ["--yes"]);
  const hook = join(tgt, ".githooks", "pre-push");
  assert.ok(existsSync(hook), "the pre-push hook is installed");
  assert.deepEqual(readFileSync(hook), readFileSync(join(src, ".claude/skills/bootstrap/templates/pre-push")), "hook matches the source template");
  // A second run is a no-op for the hook (it already exists), so the whole run stays idempotent.
  assert.equal(run(src, tgt, ["--yes"]), 0);
});

test("GENESIS: sets core.hooksPath to .githooks in a git repo, and does NOT clobber an existing one", () => {
  // Fresh git repo with no core.hooksPath: genesis sets it.
  const tgt = newTarget();
  execFileSync("git", ["init", "-q", tgt], { stdio: "pipe" });
  run(buildSource(), tgt, ["--yes"]);
  const set = execFileSync("git", ["-C", tgt, "config", "--get", "core.hooksPath"], { encoding: "utf8" }).trim();
  assert.equal(set, ".githooks", "core.hooksPath set on a fresh repo");
  // A repo that already routes hooks elsewhere: genesis must leave it alone.
  const tgt2 = newTarget();
  execFileSync("git", ["init", "-q", tgt2], { stdio: "pipe" });
  execFileSync("git", ["-C", tgt2, "config", "core.hooksPath", ".husky"], { stdio: "pipe" });
  run(buildSource(), tgt2, ["--yes"]);
  const kept = execFileSync("git", ["-C", tgt2, "config", "--get", "core.hooksPath"], { encoding: "utf8" }).trim();
  assert.equal(kept, ".husky", "an existing core.hooksPath is preserved, not clobbered");
});

test("GENESIS: adds a package.json prepare script and installs the hook helper (zero-step hook)", () => {
  const src = buildSource();
  const tgt = newTarget();
  writeFileSync(join(tgt, "package.json"), JSON.stringify({ name: "consumer", version: "0.0.0", scripts: { test: "echo hi" } }, null, 2) + "\n");
  run(src, tgt, ["--yes"]);
  assert.ok(existsSync(join(tgt, ".githooks", "install-hooks.mjs")), "helper installed");
  const pkg = JSON.parse(readFileSync(join(tgt, "package.json"), "utf8"));
  assert.equal(pkg.scripts.prepare, "node .githooks/install-hooks.mjs", "prepare script added");
  assert.equal(pkg.scripts.test, "echo hi", "existing scripts preserved");
});

test("GENESIS: degrades safely when package.json is not valid JSON (no crash, no edit, hook still installed)", () => {
  const src = buildSource();
  const tgt = newTarget();
  writeFileSync(join(tgt, "package.json"), "{ not valid json ,,, ");
  assert.equal(run(src, tgt, ["--yes"]), 0, "genesis still succeeds");
  assert.equal(readFileSync(join(tgt, "package.json"), "utf8"), "{ not valid json ,,, ", "the malformed file is left untouched");
  assert.ok(existsSync(join(tgt, ".githooks", "install-hooks.mjs")), "helper still installed");
});

test("GENESIS: no-op on a package.json whose prepare already runs the helper", () => {
  const src = buildSource();
  const tgt = newTarget();
  const pkg = { name: "c", version: "0.0.0", scripts: { prepare: "node .githooks/install-hooks.mjs && echo hi" } };
  writeFileSync(join(tgt, "package.json"), JSON.stringify(pkg, null, 2) + "\n");
  run(src, tgt, ["--yes"]);
  assert.equal(JSON.parse(readFileSync(join(tgt, "package.json"), "utf8")).scripts.prepare, "node .githooks/install-hooks.mjs && echo hi", "an already-wired prepare is left exactly as is");
});

test("GENESIS: preserves the package.json indent style when adding prepare", () => {
  const src = buildSource();
  const tgt = newTarget();
  // 4-space indent, no prepare yet.
  writeFileSync(join(tgt, "package.json"), JSON.stringify({ name: "c", version: "0.0.0" }, null, 4) + "\n");
  run(src, tgt, ["--yes"]);
  const text = readFileSync(join(tgt, "package.json"), "utf8");
  assert.match(text, /\n {4}"/, "4-space indent is preserved, not reformatted to 2-space");
  assert.equal(JSON.parse(text).scripts.prepare, "node .githooks/install-hooks.mjs");
});

test("GENESIS: does NOT clobber an existing package.json prepare script", () => {
  const src = buildSource();
  const tgt = newTarget();
  writeFileSync(join(tgt, "package.json"), JSON.stringify({ name: "consumer", version: "0.0.0", scripts: { prepare: "husky" } }, null, 2) + "\n");
  run(src, tgt, ["--yes"]);
  const pkg = JSON.parse(readFileSync(join(tgt, "package.json"), "utf8"));
  assert.equal(pkg.scripts.prepare, "husky", "an existing prepare script is preserved, not clobbered");
  assert.ok(existsSync(join(tgt, ".githooks", "install-hooks.mjs")), "helper still installed for manual wiring");
});

test("GENESIS: still bootstraps cleanly when the source ships no hook template", () => {
  const src = buildSource({ omitHookTemplate: true });
  const tgt = newTarget();
  assert.equal(run(src, tgt, ["--yes"]), 0);
  assert.ok(existsSync(join(tgt, "gate-manifest.json")), "manifest still written");
  assert.ok(!existsSync(join(tgt, ".githooks", "pre-push")), "no hook written when the source has no template");
});

test("GENESIS: copied scripts match the source byte-for-byte", () => {
  const src = buildSource();
  const tgt = newTarget();
  run(src, tgt, ["--yes"]);
  const from = readFileSync(join(src, ".claude/skills/judge-arch/scripts/check-alpha.mjs"));
  const to = readFileSync(join(tgt, "scripts/ci/check-alpha.mjs"));
  assert.deepEqual(to, from);
});

test("GENESIS: preserves a gate's invoke args in the consumer manifest (engineering gates travel, ADR-0061)", () => {
  // Regression: genesis rebuilt each gate object field-by-field and silently DROPPED invoke, so a
  // travelling engineering gate ran in the consumer with no path args (fail-closed or wrong scope) even
  // though the aggregator supports invoke. Without the preserved args, the gate cannot scan the consumer.
  const src = buildSource({ gates: [{ id: "scoped", invoke: ["--allow-empty", "--ignore", "scripts/ci", "."] }, { id: "plain" }] });
  const tgt = newTarget();
  assert.equal(run(src, tgt, ["--yes"]), 0);
  const m = readManifest(tgt);
  const scoped = m.gates.find((g) => g.id === "scoped");
  const plain = m.gates.find((g) => g.id === "plain");
  assert.deepEqual(scoped.invoke, ["--allow-empty", "--ignore", "scripts/ci", "."], "invoke must survive into the consumer manifest");
  assert.equal(plain.invoke, undefined, "a gate with no invoke stays invoke-free (no spurious field)");
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

test("GUARD: REFUSES (exit 1) a pre-existing FOREIGN gate-manifest.json and stomps nothing (ADR-0052, discriminating)", () => {
  // A consumer that already has its OWN gate-manifest.json (no bootstrap-v2 provenance) must not be
  // reconciled against: reconcile would schedule its gates (origin defaulting to upstream) for deletion.
  // Without the guard this run deletes check-theirs.mjs; with it, it refuses and writes nothing.
  const src = buildSource({ gates: [{ id: "alpha" }] });
  const tgt = newTarget();
  mkdirSync(join(tgt, "scripts", "ci"), { recursive: true });
  const theirs = join(tgt, "scripts/ci/check-theirs.mjs");
  writeFileSync(theirs, "// their own enforcement gate\n");
  const foreign = { gates: [{ id: "theirs", script: "scripts/ci/check-theirs.mjs" }] }; // no generatedFrom, no aggregator
  const foreignText = JSON.stringify(foreign, null, 2) + "\n";
  writeFileSync(join(tgt, "gate-manifest.json"), foreignText);
  const r = runCapture(src, tgt, ["--yes"]);
  assert.equal(r.code, 1, "a foreign manifest must be refused, not reconciled: " + r.out);
  assert.match(r.out, /not generated by this tool|--adopt-existing/i);
  assert.equal(readFileSync(theirs, "utf8"), "// their own enforcement gate\n", "their gate script must NOT be deleted");
  assert.equal(readFileSync(join(tgt, "gate-manifest.json"), "utf8"), foreignText, "their manifest must be untouched");
  assert.ok(!existsSync(join(tgt, "scripts/ci/check-alpha.mjs")), "nothing written when refused");
});

test("GUARD: --adopt-existing takes over a foreign manifest, backs it up, keeps their gates as repo-local, deletes nothing (ADR-0052)", () => {
  const src = buildSource({ gates: [{ id: "alpha" }] });
  const tgt = newTarget();
  mkdirSync(join(tgt, "scripts", "ci"), { recursive: true });
  const theirs = join(tgt, "scripts/ci/check-theirs.mjs");
  writeFileSync(theirs, "// their own enforcement gate\n");
  const foreign = { gates: [{ id: "theirs", script: "scripts/ci/check-theirs.mjs" }] };
  const foreignText = JSON.stringify(foreign, null, 2) + "\n";
  writeFileSync(join(tgt, "gate-manifest.json"), foreignText);
  assert.equal(run(src, tgt, ["--yes", "--adopt-existing"]), 0, "adopt must succeed");
  assert.equal(readFileSync(join(tgt, "gate-manifest.json") + ".esk.bak", "utf8"), foreignText, "the foreign manifest is backed up to .esk.bak");
  assert.equal(readFileSync(theirs, "utf8"), "// their own enforcement gate\n", "their gate script is preserved, not deleted");
  assert.ok(existsSync(join(tgt, "scripts/ci/check-alpha.mjs")), "our upstream gate is layered on");
  const m = readManifest(tgt);
  assert.ok(looksOurs(m), "the adopted manifest is now a bootstrap-v2 manifest");
  const rl = m.gates.find((g) => g.id === "theirs");
  assert.ok(rl && rl.origin === "repo-local", "their gate is recorded as repo-local, so parity will not flag it and reconcile will never delete it");
});

test("GUARD: a manifest WE generated still reconciles normally (the guard does not block our own) (ADR-0052)", () => {
  // Genesis once (writes an our-shaped manifest), then reconcile with a dropped gate: removal must still work,
  // proving the guard keys on provenance and does not wall off our own reconcile.
  const tgt = newTarget();
  assert.equal(run(buildSource({ version: "1.0.0", gates: [{ id: "alpha" }, { id: "foo" }] }), tgt, ["--yes"]), 0);
  assert.ok(existsSync(join(tgt, "scripts/ci/check-foo.mjs")));
  assert.equal(run(buildSource({ version: "1.1.0", gates: [{ id: "alpha" }] }), tgt, ["--yes"]), 0, "our own reconcile is not blocked");
  assert.ok(!existsSync(join(tgt, "scripts/ci/check-foo.mjs")), "a dropped gate is still removed on our own manifest");
});

test("CODE-OWNERS: --code-owners scaffolds .github/CODEOWNERS over the enforcement paths (ADR-0055, discriminating)", () => {
  const src = buildSource({ gates: [{ id: "alpha" }] });
  const tgt = newTarget();
  assert.equal(run(src, tgt, ["--yes", "--code-owners", "@me @org/team"]), 0);
  const co = join(tgt, ".github", "CODEOWNERS");
  assert.ok(existsSync(co), "CODEOWNERS must be scaffolded when --code-owners is given");
  const body = readFileSync(co, "utf8");
  assert.match(body, /\/scripts\/ci\/\s+@me @org\/team/, "enforcement path owned by the given owners");
  assert.match(body, /\/gate-manifest\.json\s+@me @org\/team/);
  assert.match(body, /\/\.github\/workflows\/\s+@me @org\/team/);
});

test("CODE-OWNERS: absent flag writes NO CODEOWNERS (opt-in, discriminating)", () => {
  const src = buildSource({ gates: [{ id: "alpha" }] });
  const tgt = newTarget();
  assert.equal(run(src, tgt, ["--yes"]), 0);
  assert.equal(existsSync(join(tgt, ".github", "CODEOWNERS")), false, "CODEOWNERS is opt-in, never written without the flag");
});

test("CODE-OWNERS: an existing CODEOWNERS is NOT clobbered (no-clobber)", () => {
  const src = buildSource({ gates: [{ id: "alpha" }] });
  const tgt = newTarget();
  mkdirSync(join(tgt, ".github"), { recursive: true });
  const co = join(tgt, ".github", "CODEOWNERS");
  writeFileSync(co, "# my own owners\n* @someoneelse\n");
  assert.equal(run(src, tgt, ["--yes", "--code-owners", "@me"]), 0);
  assert.equal(readFileSync(co, "utf8"), "# my own owners\n* @someoneelse\n", "an existing CODEOWNERS must be left untouched");
});

test("CODE-OWNERS: an invalid owner is a BLOCKER and nothing is written (fail closed)", () => {
  const src = buildSource({ gates: [{ id: "alpha" }] });
  const tgt = newTarget();
  const r = runCapture(src, tgt, ["--yes", "--code-owners", "not-an-owner"]);
  assert.equal(r.code, 1, "an invalid owner must block: " + r.out);
  assert.match(r.out, /not a valid owner/i);
  assert.equal(existsSync(join(tgt, ".github", "CODEOWNERS")), false, "nothing written when blocked");
  assert.equal(existsSync(join(tgt, "gate-manifest.json")), false, "a blocker stops the whole apply");
});

test("CODE-OWNERS: on an otherwise-current repo with an existing CODEOWNERS, the no-clobber advisory is NOT swallowed (Finding 1)", () => {
  const src = buildSource({ gates: [{ id: "alpha" }] });
  const tgt = newTarget();
  assert.equal(run(src, tgt, ["--yes"]), 0); // genesis once: now current, no CODEOWNERS
  writeFileSync(join(tgt, ".github", "CODEOWNERS"), "# pre-existing\n* @someoneelse\n");
  const r = runCapture(src, tgt, ["--code-owners", "@me"]); // dry run on the now-current repo
  assert.equal(r.code, 0, r.out);
  assert.doesNotMatch(r.out, /already current\. Nothing to change/i, "must not swallow the request as nothing-to-do");
  assert.match(r.out, /CODEOWNERS already exists/i, "must surface the no-clobber advisory");
});

test("CODE-OWNERS: an all-whitespace --code-owners value is a blocker (no owner parsed)", () => {
  const src = buildSource({ gates: [{ id: "alpha" }] });
  const tgt = newTarget();
  const r = runCapture(src, tgt, ["--yes", "--code-owners", "   "]);
  assert.equal(r.code, 1, "an empty owner list must block: " + r.out);
  assert.match(r.out, /no owner was parsed/i);
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

test("GENESIS: the scaffolded workflow is a per-skill matrix with one required summary check (ADR-0065)", () => {
  const src = buildSource({ gates: [{ id: "alpha" }, { id: "beta" }] });
  const tgt = newTarget();
  run(src, tgt, ["--yes"]);
  const yml = readFileSync(join(tgt, ".github/workflows/enterprise-gates.yml"), "utf8");
  // setup job emits the matrix from the manifest (not a hand-listed one, so it can't drift)
  assert.match(yml, /gate-matrix\.mjs/, "setup must generate the matrix from the manifest");
  assert.match(yml, /gates:\s*\$\{\{ steps\.matrix\.outputs\.gates \}\}/);
  assert.match(yml, /matrix:\s*\n\s*gate:\s*\$\{\{ fromJSON\(needs\.setup\.outputs\.gates\) \}\}/);
  // per-gate run uses --only and runs the gate's discrimination test in the consumer
  assert.match(yml, /run-manifest-gates\.mjs --only "\$\{\{ matrix\.gate \}\}"/);
  assert.match(yml, /node --test "\$t"/);
  // the single required check needs every matrix job and is green only if they all passed
  assert.match(yml, /enterprise-gates:\s*\n\s*needs:\s*\[setup, gate\]/);
  assert.match(yml, /needs\.gate\.result/);
  // the matrix is emitted with a BARE assignment so a gate-matrix failure fails the step; the swallowing
  // echo-command-substitution pattern (which masks the exit under bash -eo pipefail) must NOT be used.
  assert.match(yml, /gates=\$\(node scripts\/ci\/gate-matrix\.mjs\)/);
  assert.doesNotMatch(yml, /echo "gates=\$\(node/);
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

test("CONSUMER-TESTS: copied gate tests run GREEN in a bootstrapped consumer (ADR-0057, discriminating)", () => {
  // Genesis the REAL skills repo into a fresh consumer, then run a copied gate test IN the consumer. Its
  // GUARD must resolve to the consumer layout (scripts/ci), not the upstream path, or it fails. Before the
  // fix the copied test hardcoded the upstream path and failed in every consumer; this is the proof it does
  // not anymore. node --test needs no deps here (the gate tests use only node builtins).
  const REAL = resolve(process.cwd()); // npm test runs from the repo root
  const tgt = newTarget();
  assert.equal(run(REAL, tgt, ["--yes"]), 0, "genesis from the real repo must succeed");
  for (const t of ["test/skill-gate-parity.test.mjs", "test/manifest-provenance.test.mjs", "test/bootstrap-presence.test.mjs", "test/reference-links.test.mjs", "test/no-ua-sniffing.test.mjs", "test/owasp-lints.test.mjs", "test/migration-safety.test.mjs", "test/alert-hygiene.test.mjs", "test/arch-gate.test.mjs", "test/untagged-pii.test.mjs", "test/retention-basis.test.mjs"]) {
    let status;
    try { execFileSync("node", ["--test", t], { cwd: tgt, stdio: "pipe" }); status = 0; }
    catch (e) { status = e.status ?? 1; }
    assert.equal(status, 0, `copied ${t} must pass in the consumer (GUARD resolves to scripts/ci)`);
  }
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
