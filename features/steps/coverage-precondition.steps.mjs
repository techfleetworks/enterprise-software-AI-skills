// Step definitions for features/always-on/coverage-precondition.feature (ADR-0116, #203 gap 2).
// Every scenario drives the REAL always-on/finish-check.mjs against a fixture repo whose formula record, receipt
// and transcript are complete and valid, so coverage is the only variable. The esk-genesis exit-code mapping is
// pinned with a stub installer in the fixture, so these scenarios never depend on a real genesis run. Neutering
// coverageProblems() in finish-check.mjs flips every "turn is held" scenario to "ends", reding this feature.
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import assert from "node:assert/strict";

const REPO = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..");
const FC = join(REPO, "always-on", "finish-check.mjs");
const sha256 = (buf) => createHash("sha256").update(buf).digest("hex");
const fwd = (p) => p.split("\\").join("/");
const QUESTIONS = ["boundary", "ownership", "dependency", "error-handling"];
const QUOTE = "This is a sentence with at least eight exact words to quote here.";
const created = [];
process.on("exit", () => { for (const d of created) { try { rmSync(d, { recursive: true, force: true }); } catch { /* best-effort */ } } });

function buildTask(world) {
  const target = mkdtempSync(join(tmpdir(), "fcc-bdd-"));
  created.push(target);
  const skillsDir = join(target, ".claude", "skills");
  mkdirSync(join(skillsDir, "comprehensive-test-strategy"), { recursive: true });
  writeFileSync(join(skillsDir, "comprehensive-test-strategy", "SKILL.md"), `# comprehensive-test-strategy\n\n## The core rule\n\n${QUOTE}\n`);
  const content = "export const v0 = 0;\n";
  writeFileSync(join(target, "f0.ts"), content);
  const transcript = join(target, "transcript.jsonl");
  writeFileSync(transcript, JSON.stringify({ type: "tool_use", name: "Write", input: { file_path: fwd(join(target, "f0.ts")) } }) + "\n");
  const readOnly = join(target, "readonly.jsonl");
  writeFileSync(readOnly, JSON.stringify({ type: "tool_use", name: "Read", input: { file_path: fwd(join(target, "f0.ts")) } }) + "\n");
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
  writeFileSync(join(target, "record.json"), JSON.stringify(record));
  const waivers = join(target, "waivers.json");
  const env = { ...process.env };
  delete env.ESK_ENFORCE; delete env.ESK_HOME; delete env.ESK_BLOCKS; delete env.ESK_SUBAGENTS_FILE; delete env.ESK_COVERAGE_WAIVER_TTL_DAYS;
  env.ESK_TASK_RECORD = join(target, "record.json"); env.ESK_RECEIPT = receipt; env.ESK_SKILLS_DIR = skillsDir; env.ESK_WAIVERS_FILE = waivers;
  world.t = { target, env, waivers, transcript, readOnly };
}
const adoptMarker = (t) => { mkdirSync(join(t.target, ".claude"), { recursive: true }); writeFileSync(join(t.target, ".claude", ".esk-installed"), JSON.stringify({ version: "1.3.3" })); };
const adoptWorkflow = (t) => { mkdirSync(join(t.target, ".github", "workflows"), { recursive: true }); writeFileSync(join(t.target, ".github", "workflows", "enterprise-gates.yml"), "name: enterprise-gates\n"); };
const writeManifest = (t) => writeFileSync(join(t.target, "gate-manifest.json"), JSON.stringify({ version: "1.0.0", generatedFrom: "x/y@1.0.0", gates: [], aggregator: { requiredCheck: "enterprise-gates" } }));
const stubGenesis = (t, code) => { const d = join(t.target, ".claude", "skills", "bootstrap", "scripts"); mkdirSync(d, { recursive: true }); writeFileSync(join(d, "esk-genesis.mjs"), `#!/usr/bin/env node\nprocess.exit(${code});\n`); };
const daysAgo = (n) => new Date(Date.now() - n * 86400000).toISOString().slice(0, 10);
const runWith = (t, payload) => { const r = spawnSync(process.execPath, [FC], { encoding: "utf8", input: JSON.stringify(payload), env: t.env }); return { status: r.status, out: (r.stdout || "") + (r.stderr || "") }; };

export default function ({ Given, When, Then, And }) {
  Given(/^a repo that never adopted the enterprise skills$/, (world) => { buildTask(world); });
  Given(/^a repo that is covered by the current gates$/, (world) => { buildTask(world); adoptMarker(world.t); writeManifest(world.t); stubGenesis(world.t, 0); });
  Given(/^a repo that adopted the enterprise skills but has no gates installed$/, (world) => { buildTask(world); adoptMarker(world.t); });
  Given(/^a repo whose installed gates have drifted$/, (world) => { buildTask(world); adoptMarker(world.t); writeManifest(world.t); stubGenesis(world.t, 1); });
  Given(/^an adopted repo whose gate coverage cannot be assessed$/, (world) => { buildTask(world); adoptMarker(world.t); writeManifest(world.t); stubGenesis(world.t, 2); });
  Given(/^the skills source repo whose installer would report drift$/, (world) => {
    buildTask(world); adoptMarker(world.t); writeManifest(world.t); stubGenesis(world.t, 1);
    mkdirSync(join(world.t.target, "always-on"), { recursive: true });
    writeFileSync(join(world.t.target, "always-on", "enterprise-skills-always-on.md"), "# directive\n");
    writeFileSync(join(world.t.target, "always-on", "emit-directive.mjs"), "// emitter\n");
  });

  And(/^an operator has recorded a fresh coverage waiver$/, (world) => { writeFileSync(world.t.waivers, JSON.stringify([{ step: "coverage", by: "operator", reason: "throwaway spike", date: daysAgo(0) }])); });
  And(/^an operator coverage waiver lapsed long ago$/, (world) => { writeFileSync(world.t.waivers, JSON.stringify([{ step: "coverage", by: "operator", reason: "old skip", date: daysAgo(400) }])); });
  And(/^the agent writes a coverage waiver for itself$/, (world) => { writeFileSync(world.t.waivers, JSON.stringify([{ step: "coverage", by: "agent", reason: "I waive myself", date: daysAgo(0) }])); });

  When(/^a Claude task that changed a source file tries to end$/, (world) => { world.res = runWith(world.t, { transcript_path: world.t.transcript, session_id: "s1", cwd: world.t.target }); });
  When(/^the agent only reads files and ends the task$/, (world) => { world.res = runWith(world.t, { transcript_path: world.t.readOnly, session_id: "s1", cwd: world.t.target }); });
  When(/^a subagent that changed a source file tries to end$/, (world) => { world.res = runWith(world.t, { agent_transcript_path: world.t.transcript, session_id: "s1", cwd: world.t.target }); });

  Then(/^the turn is held and the coverage gap is named$/, (world) => {
    assert.equal(world.res.status, 2, world.res.out);
    assert.match(world.res.out, /coverage:/, world.res.out);
  });
  Then(/^the task ends with no coverage block$/, (world) => {
    assert.equal(world.res.status, 0, world.res.out);
    assert.doesNotMatch(world.res.out, /coverage:/, world.res.out);
  });
}
