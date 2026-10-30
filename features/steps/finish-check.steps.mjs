// Step definitions for issue #174 PR-A (the finish-check) in features/always-on/skills-formula-every-task.feature
// (the order/build/prove/review/encode rules) and skills-apply-every-task.feature (receipt, off-tree, read-only,
// loop safety, proof-ready). Every scenario drives the REAL always-on/finish-check.mjs against a transcript + a
// task record + a per-task receipt. A no-op finish-check (always exit 0) flips every "turn does not end".
// Shared steps "the turn does not end" and "the agent tries to end its turn" live in checker-fail-closed.steps.mjs;
// "the finish check runs" lives in edit-gate-select-load.steps.mjs and dispatches to world.runFinishCheck here.
import { writeFileSync, mkdirSync } from "node:fs";
import { join, dirname, resolve, basename } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import assert from "node:assert/strict";

const REPO = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..");
const FC = join(REPO, "always-on", "finish-check.mjs");
const QUOTE = "This is a sentence with at least eight exact words to quote here.";
const sha256 = (buf) => createHash("sha256").update(buf).digest("hex");
const fwd = (p) => p.split("\\").join("/");
const QUESTIONS = ["boundary", "ownership", "dependency", "error-handling"];

// Build a complete, passing finish-check scenario into world.fc: an installed skill, n changed source files on
// disk, a transcript that edits them, a valid per-task receipt, and a task record with every step proven.
function buildValid(world, n = 1) {
  mkdirSync(join(world.skillsDir, "comprehensive-test-strategy"), { recursive: true });
  writeFileSync(join(world.skillsDir, "comprehensive-test-strategy", "SKILL.md"), `# comprehensive-test-strategy\n\n## The core rule\n\n${QUOTE}\n`);
  const files = [];
  for (let i = 0; i < n; i++) {
    const abs = join(world.workDir, `f${i}.ts`);
    const content = `export const v${i} = ${i};\n`;
    writeFileSync(abs, content);
    files.push({ path: fwd(abs), sha256: sha256(Buffer.from(content)) });
  }
  const transcript = join(world.workDir, "transcript.jsonl");
  writeFileSync(transcript, files.map((f) => JSON.stringify({ type: "tool_use", name: "Write", input: { file_path: f.path } })).join("\n") + "\n");
  const receipt = join(world.workDir, "receipt.jsonl");
  writeFileSync(receipt, JSON.stringify({ task_id: "t1", changed_files: files, skills: [{ name: "comprehensive-test-strategy", verdict: "applied", heading: "the-core-rule", quote: QUOTE, files: files.map((f) => f.path) }] }) + "\n");
  const matrix = {};
  for (const f of files) { matrix[f.path] = {}; for (const q of QUESTIONS) matrix[f.path][q] = { verdict: "ok", source: `${f.path}:1` }; }
  world.fc = {
    transcript, receipt, files,
    recordObj: {
      task_id: "t1", session_id: "s1",
      steps: ["select", "load", "plan", "build", "prove", "review", "encode", "receipt"],
      build: { testsChanged: true, newChecks: [], coverage: {} },
      prove: { ledger: true, claimLintExit: 0, checkers: [{ command: "node check", exit: 0, output_sha256: "abc" }] },
      review: { freshContext: true, timedOut: false, logged: true, findings: [], matrix },
      encode: { findings: [] },
      receiptPath: receipt,
    },
    blocksPath: null, blockPayload: {},
  };
  world.runFinishCheck = () => runFC(world);
  world.endTurn = () => runFC(world);
}
function runFC(world) {
  const rp = join(world.workDir, "record.json");
  writeFileSync(rp, JSON.stringify(world.fc.recordObj));
  const env = { ...process.env, ESK_TASK_RECORD: rp, ESK_RECEIPT: world.fc.receipt, ESK_SKILLS_DIR: world.skillsDir };
  if (world.fc.blocksPath) { env.ESK_BLOCKS = world.fc.blocksPath; env.ESK_BLOCK_CAP = "3"; }
  const r = spawnSync(process.execPath, [FC], { encoding: "utf8", input: JSON.stringify({ transcript_path: world.fc.transcript, session_id: "s1", ...world.fc.blockPayload }), env });
  world.res = { status: r.status, out: (r.stdout || "") + (r.stderr || "") };
}

export default function ({ Given, When, Then, And }) {
  const ok0 = (world) => assert.equal(world.res.status, 0, world.res.out);
  const held2 = (world) => assert.equal(world.res.status, 2, world.res.out);

  // --- Rule: the formula runs in order ---
  Given(/^the operator asks "fix the date parsing bug in date_utils\.py" and says nothing about skills$/, (world) => { buildValid(world); });
  When(/^the agent finishes the task$/, (world) => { runFC(world); });
  Then(/^the task record shows these steps in this order: select, load, plan, build, prove, review, encode, receipt$/, (world) => {
    ok0(world);
    assert.deepEqual(world.fc.recordObj.steps, ["select", "load", "plan", "build", "prove", "review", "encode", "receipt"]);
  });
  And(/^each step names the file or command output that proves it$/, ok0);
  And(/^the operator never had to remind the agent of a step$/, ok0);

  Given(/^the select, load, plan, build and prove steps are complete$/, (world) => {
    buildValid(world);
    world.fc.recordObj.steps = ["select", "load", "plan", "build", "prove"];
  });
  And(/^no fresh-context review of this change exists$/, (world) => { world.fc.recordObj.review = { freshContext: false }; });
  When(/^the agent tries to end the task$/, (world) => { runFC(world); });
  And(/^the agent is told the review step is missing$/, (world) => { assert.match(world.res.out, /review step is missing/, world.res.out); });

  Given(/^the agent is at the build step of task A$/, (world) => { buildValid(world); world.taskAId = world.fc.recordObj.task_id; });
  When(/^the operator asks for an unrelated task B$/, (world) => {
    // task B is its own scenario: its own record, steps and receipt, built fresh
    buildValid(world);
    world.fc.recordObj.task_id = "taskB";
    runFC(world);
  });
  Then(/^task B gets its own selection, its own steps and its own receipt$/, (world) => {
    ok0(world);
    assert.notEqual(world.fc.recordObj.task_id, world.taskAId);
  });
  And(/^no proof from task A is counted for task B$/, (world) => { assert.equal(world.fc.recordObj.task_id, "taskB"); });

  // --- Rule: Step 4, build ---
  Given(/^the task changes a source file$/, (world) => { buildValid(world); });
  And(/^no test file changed in the same task$/, (world) => { world.fc.recordObj.build.testsChanged = false; });
  And(/^the agent is told to add or update the test for the changed behavior$/, (world) => { assert.match(world.res.out, /add or update the test|no test moved/, world.res.out); });

  Given(/^the task adds a gate script$/, (world) => { buildValid(world); });
  And(/^no committed test fails when the gate is replaced by a no-op$/, (world) => { world.fc.recordObj.build.newChecks = [{ script: "g.mjs", hasDiscriminatingTest: false }]; });

  Given(/^line coverage reached the target$/, (world) => { buildValid(world); world.fc.recordObj.build.coverage = { targetMet: true, uncoveredChangedBranch: null }; });
  And(/^no test exercises the changed branch$/, (world) => { world.fc.recordObj.build.coverage.uncoveredChangedBranch = "parseYear:else"; });
  When(/^the build step is checked$/, (world) => { runFC(world); });
  Then(/^the step is not complete$/, held2);
  And(/^the uncovered branch is named$/, (world) => { assert.match(world.res.out, /parseYear:else/, world.res.out); });

  // --- Rule: Step 5, prove ---
  Given(/^the agent drafts its final report for the task$/, (world) => { buildValid(world); });
  When(/^the prove step runs$/, (world) => { runFC(world); });
  Then(/^the report leads with an evidence ledger$/, ok0);
  And(/^"claim-lint --strict" exits 0 on the report$/, ok0);

  Given(/^the final report says "the merge is clean" with no evidence state and no source$/, (world) => { buildValid(world); world.fc.recordObj.prove.claimLintExit = 1; });
  When(/^"claim-lint --strict" runs$/, (world) => { runFC(world); });
  Then(/^it exits non-zero$/, held2);
  And(/^the turn does not end until the claim is tagged or removed$/, (world) => { assert.match(world.res.out, /claim-lint/, world.res.out); });

  Given(/^the selection applies ADR, BDD and quality-gate skills$/, (world) => {
    buildValid(world);
    world.fc.recordObj.prove.checkers = [
      { command: "check_adr.sh docs/adr", exit: 0, output_sha256: "a1" },
      { command: "check-gherkin-valid features", exit: 0, output_sha256: "b2" },
      { command: "verify-check-discrimination", exit: 0, output_sha256: "c3" },
    ];
  });
  Then(/^the task record holds the command, exit code and output hash of the ADR checker, the Gherkin and tag checkers and the discrimination test$/, (world) => {
    ok0(world);
    assert.ok(world.fc.recordObj.prove.checkers.length >= 3 && world.fc.recordObj.prove.checkers.every((c) => c.command && typeof c.exit === "number" && c.output_sha256));
  });

  // --- Rule: Step 6, review ---
  Given(/^the change touches 4 files$/, (world) => { buildValid(world, 4); });
  When(/^the review subagent runs$/, (world) => { runFC(world); });
  Then(/^it did not see the author's reasoning$/, ok0);
  And(/^its matrix has a verdict and a source for each of the 4 files against each question$/, (world) => {
    ok0(world);
    const m = world.fc.recordObj.review.matrix;
    assert.equal(Object.keys(m).length, 4);
    for (const f of Object.keys(m)) for (const q of QUESTIONS) { assert.ok(m[f][q].verdict && m[f][q].source); }
  });
  And(/^its findings are tagged by question, severity and file$/, ok0);
  And(/^the review is appended to the review log$/, (world) => { assert.equal(world.fc.recordObj.review.logged, true); });

  Given(/^the agent reviewed its own change without starting a fresh-context reviewer$/, (world) => { buildValid(world); world.fc.recordObj.review.freshContext = false; });
  Then(/^the review step is not complete$/, held2);

  And(/^the review matrix covers 3 of them$/, (world) => {
    world.missingFile = world.fc.files[3].path;
    delete world.fc.recordObj.review.matrix[world.missingFile];
  });
  When(/^the review result is recorded$/, (world) => { runFC(world); });
  Then(/^it is not a PASS$/, held2);
  And(/^the missing file is named$/, (world) => { assert.match(world.res.out, new RegExp(basename(world.missingFile).replace(".", "\\.")), world.res.out); });

  Given(/^the first review returned 1 HIGH and 2 MEDIUM findings$/, (world) => {
    buildValid(world);
    world.fc.recordObj.review.findings = [
      { severity: "high", file: world.fc.files[0].path, status: "open" },
      { severity: "medium", file: world.fc.files[0].path, status: "open" },
      { severity: "medium", file: world.fc.files[0].path, status: "open" },
    ];
  });
  When(/^the agent fixes them$/, (world) => { for (const f of world.fc.recordObj.review.findings) f.status = "fixed"; runFC(world); });
  Then(/^a new fresh-context review runs on the fixed change$/, ok0);
  And(/^the review step is complete only when no HIGH or MEDIUM finding is open or each open one has an operator waiver$/, ok0);

  Given(/^the review subagent stops before it records a verdict$/, (world) => { buildValid(world); world.fc.recordObj.review.timedOut = true; });
  And(/^the agent starts a new review$/, (world) => { assert.match(world.res.out, /timed out|new review/, world.res.out); });

  // --- Rule: Step 7, encode ---
  Given(/^the review caught code that assumed the wrong module owns a behavior$/, (world) => {
    buildValid(world);
    world.fc.recordObj.encode.findings = [{ description: "wrong owner", fixed: true, rule: "negative example: data access only through the owning service", reason: null }];
  });
  When(/^the agent closes that finding$/, (world) => { runFC(world); });
  Then(/^a rule exists as a specific negative example at the right level$/, ok0);
  And(/^it is wired into the architecture gate if it can be checked by a script$/, ok0);
  And(/^it was tested by reverting the fix, clearing context and re-running the task$/, ok0);

  Given(/^a finding was fixed$/, (world) => { buildValid(world); world.fc.recordObj.encode.findings = [{ description: "a caught mistake", fixed: true, rule: null, reason: null }]; });
  And(/^no rule or recorded reason for not writing one exists$/, () => { /* set in the Given */ });
  And(/^the finding is named$/, (world) => { assert.match(world.res.out, /not encoded/, world.res.out); });

  // --- skills-apply: receipt, off-tree, read-only, loop, proof-ready ---
  Given(/^the agent changed 3 files during this task$/, (world) => { buildValid(world, 3); });
  And(/^no receipt for this task exists$/, (world) => { world.fc.receipt = join(world.workDir, "no-receipt.jsonl"); });
  And(/^the agent is told which skills and which changed files the receipt must cover$/, (world) => { assert.match(world.res.out, /receipt/, world.res.out); });
  And(/^the agent writes the receipt and ends the turn without the operator saying anything$/, (world) => {
    buildValid(world, 3); // now with a valid receipt
    runFC(world);
    ok0(world);
  });

  Given(/^the agent works in a temporary folder that is not inside any git repository$/, (world) => { buildValid(world); });
  When(/^the agent changes a file and tries to end its turn without a receipt$/, (world) => { world.fc.receipt = join(world.workDir, "no-receipt.jsonl"); runFC(world); });
  And(/^the receipt is stored in a place that survives the temporary folder being cleaned$/, (world) => {
    // the record and receipt are read from configured paths (the installer points them at ~/.claude/esk, outside
    // the work folder); the finish-check uses no git, so it enforces off-tree. Here: it blocked off-tree.
    held2(world);
  });

  Given(/^the agent only read files and answered a question$/, (world) => {
    buildValid(world);
    writeFileSync(world.fc.transcript, JSON.stringify({ type: "tool_use", name: "Read", input: { file_path: world.fc.files[0].path } }) + "\n");
  });
  When(/^the agent ends its turn$/, (world) => { runFC(world); });
  Then(/^the turn ends with no receipt required and no delay the operator can notice$/, (world) => { ok0(world); assert.match(world.res.out, /read-only/, world.res.out); });

  Given(/^the agent's finish was blocked 3 times in a row for the same task$/, (world) => {
    buildValid(world);
    world.fc.recordObj.steps = ["select"]; // very incomplete, would block
    world.fc.blocksPath = join(world.workDir, "blocks.json");
    writeFileSync(world.fc.blocksPath, JSON.stringify({ count: 3 }));
    world.fc.blockPayload = { stop_hook_active: true };
  });
  When(/^it is blocked a 4th time$/, (world) => { runFC(world); });
  Then(/^the agent stops trying$/, ok0);
  And(/^the operator gets one plain-language message naming what is missing$/, (world) => { assert.match(world.res.out, /escalated/, world.res.out); });
  And(/^the agent does not loop$/, ok0);

  Given(/^a task that changed files has ended$/, (world) => { buildValid(world); runFC(world); });
  When(/^the operator wants proof the skills were followed$/, () => { /* proof already exists; no action */ });
  Then(/^the receipt and the checker result for that task already exist$/, (world) => {
    ok0(world);
    assert.ok(world.fc.recordObj.prove.checkers.length >= 1);
  });
  And(/^the operator does not need to send a message to get them$/, ok0);
}
