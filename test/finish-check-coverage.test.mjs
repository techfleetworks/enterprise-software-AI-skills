// Discriminating tests for the finish-check coverage precondition (ADR-0116, issue #203 gap 2).
// Each test drives the REAL always-on/finish-check.mjs against a fixture repo whose formula record, receipt and
// transcript are COMPLETE and valid, so coverage is the only variable. A fixture that is adopted-but-ungated,
// drifted, or cannot-assess must BLOCK (exit 2) with a "coverage:" message; a covered, waived, or non-adopted
// fixture must END (exit 0). The exit-code mapping is pinned with a STUB esk-genesis in the fixture (so the test
// never depends on a real genesis run), which also proves finish-check prefers the repo's OWN installer.
//
// Mutation proof (verifiable-quality-gates): neutering coverageProblems() in finish-check.mjs to `return []` flips
// every "blocked" case below (adopted-ungated, adopted-via-workflow, drift, fail-closed, lapsed-waiver,
// agent-self-waive) from exit 2 to exit 0, reding this suite. The "coverage:" message assertion keeps a block for
// some OTHER reason from masquerading as a pass of these cases.
import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";

const REPO = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const FC = join(REPO, "always-on", "finish-check.mjs");
const sha256 = (buf) => createHash("sha256").update(buf).digest("hex");
const fwd = (p) => p.split("\\").join("/");
const QUESTIONS = ["boundary", "ownership", "dependency", "error-handling"];
const QUOTE = "This is a sentence with at least eight exact words to quote here.";
const tmps = [];
process.on("exit", () => { for (const d of tmps) { try { rmSync(d, { recursive: true, force: true }); } catch { /* best-effort */ } } });

// A fixture repo with a COMPLETE, passing finish-check task (so only coverage can block it).
function buildTask() {
  const target = mkdtempSync(join(tmpdir(), "fcc-"));
  tmps.push(target);
  const skillsDir = join(target, ".claude", "skills");
  mkdirSync(join(skillsDir, "comprehensive-test-strategy"), { recursive: true });
  writeFileSync(join(skillsDir, "comprehensive-test-strategy", "SKILL.md"), `# comprehensive-test-strategy\n\n## The core rule\n\n${QUOTE}\n`);
  const content = "export const v0 = 0;\n";
  writeFileSync(join(target, "f0.ts"), content);
  const transcript = join(target, "transcript.jsonl");
  writeFileSync(transcript, JSON.stringify({ type: "tool_use", name: "Write", input: { file_path: fwd(join(target, "f0.ts")) } }) + "\n");
  const receipt = join(target, "receipt.jsonl");
  writeFileSync(receipt, JSON.stringify({ task_id: "t1", changed_files: [{ path: "f0.ts", sha256: sha256(Buffer.from(content)) }], skills: [{ name: "comprehensive-test-strategy", verdict: "applied", heading: "the-core-rule", quote: QUOTE, files: ["f0.ts"] }] }) + "\n");
  const matrix = { "f0.ts": {} };
  for (const q of QUESTIONS) matrix["f0.ts"][q] = { verdict: "ok", source: "f0.ts:1" };
  const record = {
    task_id: "t1", session_id: "s1",
    steps: ["select", "load", "plan", "build", "prove", "review", "encode", "receipt"],
    build: { testsChanged: true, newChecks: [], coverage: {} },
    prove: { ledger: true, claimLintExit: 0, checkers: [{ command: "node c", exit: 0, output_sha256: "abc" }] },
    review: { freshContext: true, timedOut: false, logged: true, findings: [], matrix },
    encode: { findings: [] },
    receiptPath: receipt,
  };
  const recordPath = join(target, "record.json");
  writeFileSync(recordPath, JSON.stringify(record));
  const waivers = join(target, "waivers.json");
  // Isolate from any ambient enforce install so the fixture is the only source of state.
  const env = { ...process.env };
  delete env.ESK_ENFORCE; delete env.ESK_HOME; delete env.ESK_BLOCKS; delete env.ESK_SUBAGENTS_FILE; delete env.ESK_COVERAGE_WAIVER_TTL_DAYS;
  env.ESK_TASK_RECORD = recordPath; env.ESK_RECEIPT = receipt; env.ESK_SKILLS_DIR = skillsDir; env.ESK_WAIVERS_FILE = waivers;
  const input = JSON.stringify({ transcript_path: transcript, session_id: "s1", cwd: target });
  return { target, env, input, waivers };
}

const run = (t) => { const r = spawnSync(process.execPath, [FC], { encoding: "utf8", input: t.input, env: t.env }); return { status: r.status, out: (r.stdout || "") + (r.stderr || "") }; };
const adoptMarker = (target) => { mkdirSync(join(target, ".claude"), { recursive: true }); writeFileSync(join(target, ".claude", ".esk-installed"), JSON.stringify({ version: "1.3.3" })); };
const adoptWorkflow = (target) => { mkdirSync(join(target, ".github", "workflows"), { recursive: true }); writeFileSync(join(target, ".github", "workflows", "enterprise-gates.yml"), "name: enterprise-gates\n"); };
const writeManifest = (target) => writeFileSync(join(target, "gate-manifest.json"), JSON.stringify({ version: "1.0.0", generatedFrom: "x/y@1.0.0", gates: [], aggregator: { requiredCheck: "enterprise-gates" } }));
const stubGenesis = (target, code) => { const d = join(target, ".claude", "skills", "bootstrap", "scripts"); mkdirSync(d, { recursive: true }); writeFileSync(join(d, "esk-genesis.mjs"), `#!/usr/bin/env node\nprocess.exit(${code});\n`); };
const daysAgo = (n) => new Date(Date.now() - n * 86400000).toISOString().slice(0, 10);

test("a non-adopted repo is never coverage-blocked (file-changing task ends)", () => {
  const t = buildTask();
  const r = run(t);
  assert.equal(r.status, 0, r.out);
  assert.doesNotMatch(r.out, /coverage:/, r.out);
});

test("adopted (marker) but no gates installed: the task is blocked", () => {
  const t = buildTask(); adoptMarker(t.target);
  const r = run(t);
  assert.equal(r.status, 2, r.out);
  assert.match(r.out, /coverage:.*no gates/i, r.out);
});

test("adopted via the enterprise-gates workflow but no manifest: blocked", () => {
  const t = buildTask(); adoptWorkflow(t.target);
  const r = run(t);
  assert.equal(r.status, 2, r.out);
  assert.match(r.out, /coverage:/, r.out);
});

test("covered: the repo's own installer reports clean (exit 0), the task ends", () => {
  const t = buildTask(); adoptMarker(t.target); writeManifest(t.target); stubGenesis(t.target, 0);
  const r = run(t);
  assert.equal(r.status, 0, r.out);
  assert.doesNotMatch(r.out, /coverage:/, r.out);
});

test("drift: the installer reports un-gated/drift (exit 1), the task is blocked", () => {
  const t = buildTask(); adoptMarker(t.target); writeManifest(t.target); stubGenesis(t.target, 1);
  const r = run(t);
  assert.equal(r.status, 2, r.out);
  assert.match(r.out, /coverage:.*drift/i, r.out);
});

test("fail-closed: the installer cannot assess (exit 2), the task is blocked", () => {
  const t = buildTask(); adoptMarker(t.target); writeManifest(t.target); stubGenesis(t.target, 2);
  const r = run(t);
  assert.equal(r.status, 2, r.out);
  assert.match(r.out, /coverage:.*(assessed|failing closed)/i, r.out);
});

test("a fresh operator coverage waiver lets an ungated repo end", () => {
  const t = buildTask(); adoptMarker(t.target);
  writeFileSync(t.waivers, JSON.stringify([{ step: "coverage", by: "operator", reason: "throwaway spike", date: daysAgo(0) }]));
  const r = run(t);
  assert.equal(r.status, 0, r.out);
});

test("a lapsed operator coverage waiver does not count (TTL default 30): blocked", () => {
  const t = buildTask(); adoptMarker(t.target);
  writeFileSync(t.waivers, JSON.stringify([{ step: "coverage", by: "operator", reason: "old skip", date: daysAgo(400) }]));
  const r = run(t);
  assert.equal(r.status, 2, r.out);
  assert.match(r.out, /coverage:/, r.out);
});

test("TTL=0 (never expires) honors an old-dated operator waiver", () => {
  const t = buildTask(); adoptMarker(t.target);
  t.env.ESK_COVERAGE_WAIVER_TTL_DAYS = "0";
  writeFileSync(t.waivers, JSON.stringify([{ step: "coverage", by: "operator", reason: "permanent skip", date: daysAgo(400) }]));
  const r = run(t);
  assert.equal(r.status, 0, r.out);
});

test("the skills source repo (upstream) is never coverage-blocked", () => {
  const t = buildTask();
  adoptMarker(t.target); writeManifest(t.target); stubGenesis(t.target, 1); // would otherwise report drift
  mkdirSync(join(t.target, "always-on"), { recursive: true });
  writeFileSync(join(t.target, "always-on", "enterprise-skills-always-on.md"), "# directive\n");
  writeFileSync(join(t.target, "always-on", "emit-directive.mjs"), "// emitter\n");
  const r = run(t);
  assert.equal(r.status, 0, r.out);
  assert.doesNotMatch(r.out, /coverage:/, r.out);
});

test("the agent cannot self-waive: a by:agent coverage entry does not count", () => {
  const t = buildTask(); adoptMarker(t.target);
  writeFileSync(t.waivers, JSON.stringify([{ step: "coverage", by: "agent", reason: "I waive myself", date: daysAgo(0) }]));
  const r = run(t);
  assert.equal(r.status, 2, r.out);
  assert.match(r.out, /coverage:/, r.out);
});
