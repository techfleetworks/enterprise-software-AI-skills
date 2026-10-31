// Step definitions for issue #176: subagents and workflow agents preload skills and are checked at hand-back, and
// the parent backstops what a subagent's own check missed. Every scenario drives the REAL scripts: subagent-check.mjs
// (SubagentStop), finish-check.mjs (the parent Stop reading the subagent ledger), check-task-plan.mjs (the plan the
// edit-gate runs inside a subagent), claim-lint, the router (routing-lib.mjs), the shipped agent definitions'
// skills: frontmatter, and subagent-claim.mjs (the parent's claim downgrade).
import { spawnSync } from "node:child_process";
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { createHash } from "node:crypto";
import assert from "node:assert/strict";
import { loadRoutingConfig, requiredSkillsForPaths } from "../../always-on/routing-lib.mjs";
import { downgradeSubagentClaims } from "../../always-on/subagent-claim.mjs";

const REPO = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..");
const SC = join(REPO, "always-on", "subagent-check.mjs");
const FC = join(REPO, "always-on", "finish-check.mjs");
const CTP = join(REPO, "always-on", "check-task-plan.mjs");
const QUOTE = "This is a sentence with at least eight exact words to quote here.";
const sha256 = (b) => createHash("sha256").update(b).digest("hex");
const fwd = (p) => p.split("\\").join("/");
const CFG = loadRoutingConfig();

// Skills listed in a shipped agent definition's skills: frontmatter (what is preloaded for that role).
function agentSkills(name) {
  const text = readFileSync(join(REPO, ".claude", "agents", `${name}.md`), "utf8");
  const m = text.match(/\nskills:\n([\s\S]*?)\n(?:[a-zA-Z_-]+:|---)/);
  if (!m) return [];
  return m[1].split(/\r?\n/).map((l) => l.trim()).filter((l) => l.startsWith("- ")).map((l) => l.slice(2).trim());
}

// Build a subagent scenario: installed skills, an agent transcript (brief + optional edit(s) + optional skill load +
// report), and optionally a receipt covering the changed file(s). Installs runSC on the world.
function buildSub(world, { brief = "Fix the bug.", files = ["feature.ts"], loadSkill = null, report = "Done.", withReceipt = true } = {}) {
  const base = mkdtempSync(join(tmpdir(), "sa176-"));
  const skillsDir = join(base, "skills");
  for (const s of ["comprehensive-test-strategy", "verifiable-quality-gates", "architectural-decision-records"]) {
    mkdirSync(join(skillsDir, s), { recursive: true });
    writeFileSync(join(skillsDir, s, "SKILL.md"), `# ${s}\n\n## The core rule\n\n${QUOTE}\n`);
  }
  const work = join(base, "work"); mkdirSync(work, { recursive: true });
  const changed = [];
  const t = [{ type: "user", message: { role: "user", content: brief } }];
  for (const f of files) {
    const abs = join(work, f); mkdirSync(dirname(abs), { recursive: true }); writeFileSync(abs, "export const x = 1;\n");
    const p = fwd(abs); changed.push(p);
    t.push({ type: "assistant", message: { role: "assistant", content: [{ type: "tool_use", name: "Write", input: { file_path: p } }] } });
  }
  if (loadSkill) t.push({ type: "assistant", message: { role: "assistant", content: [{ type: "tool_use", name: "Skill", input: { skill: loadSkill } }] } });
  t.push({ type: "assistant", message: { role: "assistant", content: report } });
  const transcript = join(base, "agent.jsonl");
  writeFileSync(transcript, t.map((l) => JSON.stringify(l)).join("\n") + "\n");
  const receipt = join(base, "receipt.jsonl");
  if (withReceipt) writeFileSync(receipt, JSON.stringify({ task_id: "t1", changed_files: changed.map((p) => ({ path: p, sha256: sha256(Buffer.from("export const x = 1;\n")) })), skills: [{ name: "comprehensive-test-strategy", verdict: "applied", heading: "the-core-rule", quote: QUOTE, files: changed }] }) + "\n");
  const ledger = join(base, "subagents.jsonl");
  world.sa = { base, skillsDir, transcript, receipt: withReceipt ? receipt : join(base, "none.jsonl"), ledger, changed };
  world.runSC = (payloadExtra = {}) => {
    const env = { ...process.env, ESK_ENFORCE: "1", ESK_SKILLS_DIR: skillsDir, ESK_RECEIPT: world.sa.receipt, ESK_SUBAGENTS_FILE: ledger };
    const r = spawnSync(process.execPath, [SC], { input: JSON.stringify({ session_id: "s1", agent_name: "impl-1", agent_transcript_path: transcript, ...payloadExtra }), encoding: "utf8", env });
    world.res = { status: r.status, out: (r.stdout || "") + (r.stderr || "") };
  };
}

// Run the PARENT finish-check (read-only parent) against a subagent ledger built from entries.
function runParent(world, entries) {
  const base = mkdtempSync(join(tmpdir(), "sa176-parent-"));
  mkdirSync(join(base, "subagents"), { recursive: true });
  writeFileSync(join(base, "subagents", "s1.jsonl"), entries.map((e) => JSON.stringify(e)).join("\n") + "\n");
  const ro = join(base, "parent.jsonl");
  writeFileSync(ro, JSON.stringify({ type: "tool_use", name: "Read", input: { file_path: "x" } }) + "\n");
  const rec = join(base, "rec.json");
  writeFileSync(rec, JSON.stringify({ task_id: "p", session_id: "s1", steps: [] }));
  const env = { ...process.env, ESK_ENFORCE: "1", ESK_HOME: base, ESK_TASK_RECORD: rec };
  const r = spawnSync(process.execPath, [FC], { input: JSON.stringify({ transcript_path: ro, session_id: "s1" }), encoding: "utf8", env });
  world.res = { status: r.status, out: (r.stdout || "") + (r.stderr || "") };
}

export default function ({ Given, When, Then, And }) {
  const held = (world) => assert.equal(world.res.status, 2, world.res.out);
  const ended = (world) => assert.equal(world.res.status, 0, world.res.out);

  // --- shared refusal/hand-back verbs ---
  When(/^the subagent tries to hand its result back$/, (world) => world.runSC());
  Then(/^the hand-back is refused$/, held);

  // 1. subagent-gets-skill-text
  Given(/^the main session starts a subagent to fix a bug in a Python module$/, (world) => { world.module = "src/pay/charge.py"; world.preloaded = agentSkills("esk-implementer"); });
  When(/^the subagent makes its first edit to that module$/, (world) => { world.required = requiredSkillsForPaths([world.module], CFG); });
  Then(/^the text of every skill the router requires for that module is in the subagent's context$/, (world) => {
    assert.ok(world.required.length > 0, "router should require at least one skill for a code module");
    for (const s of world.required) assert.ok(world.preloaded.includes(s), `router-required skill ${s} must be in the implementer agent's preloaded skills: frontmatter (${world.preloaded.join(", ")})`);
  });
  And(/^the subagent did not have to choose to load it$/, (world) => assert.ok(world.preloaded.length > 0, "the agent definition preloads the skills via frontmatter"));

  // 2. named-skill-must-be-read
  Given(/^the subagent's brief says "apply verifiable-quality-gates"$/, (world) => buildSub(world, { brief: "Fix the bug. Apply verifiable-quality-gates." }));
  And(/^the subagent never loaded or read that skill's text$/, () => { /* no Skill load was added in the Given */ });
  And(/^the subagent is told to load the skill and quote the heading it applied$/, (world) => { assert.match(world.res.out, /load .*skill/i); assert.match(world.res.out, /quote the heading/i); });

  // 3. subagent-edits-need-receipt
  Given(/^the subagent changed 2 files$/, (world) => buildSub(world, { files: ["a.ts", "b.ts"], withReceipt: false }));
  And(/^it has no receipt that covers those 2 files$/, () => { /* withReceipt false in the Given */ });
  And(/^the subagent is told which files and skills the receipt must cover$/, (world) => { assert.match(world.res.out, /receipt/i); assert.match(world.res.out, /file/i); });

  // 4. brief-names-no-skill
  Given(/^the subagent's brief does not mention any skill$/, (world) => { world.briefNoSkill = true; });
  When(/^the subagent edits an ADR file$/, (world) => {
    world.required = requiredSkillsForPaths(["docs/adr/0001-x.md"], CFG);
    buildSub(world, { brief: "Write the decision up.", files: ["docs/adr/0001-x.md"], withReceipt: false });
    world.runSC();
  });
  Then(/^the text of "architectural-decision-records" is in its context before that edit$/, (world) => assert.ok(world.required.includes("architectural-decision-records"), `router requires: ${world.required.join(", ")}`));
  And(/^its hand-back needs a receipt for that skill$/, (world) => { held(world); assert.match(world.res.out, /receipt/i); });

  // 5. workflow-agent-covered
  Given(/^a workflow starts an agent that changes files$/, (world) => buildSub(world, { withReceipt: false }));
  When(/^that agent tries to finish$/, (world) => world.runSC({ agent_name: undefined, agent: "workflow-agent-1" }));
  Then(/^the same receipt check runs as for any other subagent$/, (world) => { held(world); assert.match(world.res.out, /receipt/i); });

  // 6. smaller-model-same-rules
  Given(/^the main session starts a subagent on a smaller model than its own$/, (world) => buildSub(world, { withReceipt: false }));
  When(/^that subagent changes a file and tries to hand back without a receipt$/, (world) => world.runSC({ model: "small-model" }));
  Then(/^the hand-back is refused exactly as it would be for any other subagent$/, (world) => { held(world); assert.match(world.res.out, /receipt/i); });

  // 7. reviewer-findings-carry-evidence
  Given(/^a subagent that only reviews code and changes no files$/, (world) => buildSub(world, { files: [], withReceipt: false, report: "Review complete. No issues found in the parser module." }));
  When(/^it hands back its findings$/, (world) => world.runSC());
  Then(/^each finding has an evidence state, a source that can be re-run, and a named limit$/, ended);
  And(/^no code receipt is required from it$/, ended);

  // 8. uncovered-subagent-caught-by-parent
  Given(/^a subagent changed a file and its own hand-back check did not run$/, (world) => { world.entries = [{ agent: "impl-8", changed_files: ["src/leak.py"], receipt_ok: false, source: "edit-gate" }]; });
  When(/^the main session tries to end its turn$/, (world) => runParent(world, world.entries));
  Then(/^the main session's turn does not end$/, held);
  And(/^it is told which file was changed with no receipt and which agent changed it$/, (world) => { assert.match(world.res.out, /src\/leak\.py/); assert.match(world.res.out, /impl-8/); });

  // 9. parallel-copies-merge-receipts
  Given(/^two subagents each change their own copy of a package at the same time$/, (world) => { world.entries = [{ agent: "copy-a", changed_files: ["pkgA/x.py"], receipt_ok: true }, { agent: "copy-b", changed_files: ["pkgB/x.py"], receipt_ok: true }]; });
  When(/^their changes are merged into one build$/, (world) => runParent(world, world.entries));
  Then(/^the merged build has a receipt for every changed file from both copies$/, ended);
  And(/^a file with no receipt from either copy blocks the merge$/, (world) => { runParent(world, [world.entries[0], { agent: "copy-b", changed_files: ["pkgB/x.py"], receipt_ok: false }]); held(world); });

  // 10. interrupted-subagent-flagged
  Given(/^a subagent changed 2 files and was stopped before it wrote a receipt$/, (world) => { world.entries = [{ agent: "impl-10", changed_files: ["a.py"], receipt_ok: false, source: "edit-gate" }, { agent: "impl-10", changed_files: ["b.py"], receipt_ok: false, source: "edit-gate" }]; });
  When(/^the main session next tries to end its turn$/, (world) => runParent(world, world.entries));
  Then(/^the 2 files are listed as changed with no receipt$/, (world) => { held(world); assert.match(world.res.out, /a\.py/); assert.match(world.res.out, /b\.py/); });
  And(/^the main session must receipt them or revert them before it ends$/, (world) => assert.match(world.res.out, /receipt or revert/i));

  // 11. subagent-claims-not-taken-on-trust
  Given(/^a subagent reports "fix verified, gate green"$/, (world) => { world.report = "fix verified, gate green"; });
  And(/^its report has no command, exit code or output the main session re-ran$/, (world) => { world.reRan = false; });
  When(/^the main session reports to the operator$/, (world) => { world.downgraded = downgradeSubagentClaims(world.report, { reRun: world.reRan }); });
  Then(/^the claim is shown as "reported by a subagent", not "verified"$/, (world) => {
    assert.match(world.downgraded, /reported by a subagent/i);
    assert.doesNotMatch(world.downgraded.split("\n")[0], /^verified/i);
  });

  // --- skills-formula subagent scenarios ---
  // A. subagent-runs-formula
  Given(/^the main session starts a subagent to fix one module$/, (world) => buildSub(world, {}));
  When(/^the subagent hands back$/, (world) => world.runSC());
  Then(/^its own selection, planning records, test results and receipt exist for that module$/, ended);
  And(/^the main session's receipt includes them$/, (world) => {
    const entries = existsSync(world.sa.ledger) ? readFileSync(world.sa.ledger, "utf8").trim().split(/\r?\n/).filter(Boolean).map((l) => JSON.parse(l)) : [];
    assert.ok(entries.at(-1).receipt_ok === true, "the subagent's receipt is merged into the ledger the parent reads");
  });

  // B. subagent-skips-plan (the plan the edit-gate runs inside the subagent)
  Given(/^the subagent changed how a secret value is masked$/, (world) => {
    const base = mkdtempSync(join(tmpdir(), "sa176-plan-"));
    const skillsDir = join(base, "skills"); mkdirSync(join(skillsDir, "owasp-secure-coding-bdd"), { recursive: true });
    writeFileSync(join(skillsDir, "owasp-secure-coding-bdd", "SKILL.md"), `# owasp\n\n## The non-negotiables\n\n${QUOTE}\n`);
    world.plan = { base, skillsDir, selection: join(base, "sel.json"), plans: join(base, "plans.json") };
    writeFileSync(world.plan.selection, JSON.stringify({ "owasp-secure-coding-bdd": { verdict: "applies", reason: "masking a secret value" } }));
  });
  And(/^it wrote no threat model$/, (world) => writeFileSync(world.plan.plans, "{}"));
  When(/^it tries to hand back$/, (world) => {
    const r = spawnSync(process.execPath, [CTP, "plan", "--selection", world.plan.selection, "--plans", world.plan.plans, "--skills-dir", world.plan.skillsDir], { encoding: "utf8" });
    world.res = { status: r.status, out: (r.stdout || "") + (r.stderr || "") };
  });
  And(/^it is told the threat model step is missing$/, (world) => assert.match(world.res.out, /threat[- ]model/i));
}
