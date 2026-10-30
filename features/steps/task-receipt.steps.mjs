// Step definitions for issue #177's scenarios in features/always-on/skills-formula-every-task.feature (Rule
// "Step 8, receipt") and features/always-on/skills-apply-every-task.feature.
//
// Every scenario drives the REAL .claude/skills/judge-arch/scripts/task-receipt.mjs against a sandboxed skills
// dir and work folder set up by the shared Background (world.skillsDir, world.workDir, both temp). A no-op check
// (always exit 0) flips every "it fails" / "the turn does not end" assertion. The shared steps "the agent tries
// to end its turn" and "the turn does not end" live in checker-fail-closed.steps.mjs; here the Givens install
// world.endTurn and world.res so those shared steps run the receipt check.
import { mkdirSync, writeFileSync, readFileSync, existsSync } from "node:fs";
import { join, dirname, resolve, basename } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import assert from "node:assert/strict";

const REPO = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..");
const TR = join(REPO, ".claude", "skills", "judge-arch", "scripts", "task-receipt.mjs");
const QUOTE = "This is a sentence with at least eight exact words to quote here.";
const sha256 = (buf) => createHash("sha256").update(buf).digest("hex");
const fwd = (p) => p.split("\\").join("/");

function tr(args, stdin) {
  const r = spawnSync(process.execPath, [TR, ...args], { encoding: "utf8", input: stdin });
  return { status: r.status, out: (r.stdout || "") + (r.stderr || "") };
}
function installSkill(skillsDir, name) {
  mkdirSync(join(skillsDir, name), { recursive: true });
  writeFileSync(join(skillsDir, name, "SKILL.md"), `# ${name}\n\n## The core rule\n\n${QUOTE}\n`);
}
function changedFile(work, name, content) {
  const p = join(work, name);
  writeFileSync(p, content);
  return { path: fwd(p), sha256: sha256(Buffer.from(content)) };
}
function writeReceipt(dir, entry) {
  const p = join(dir, `receipt-${Math.random().toString(36).slice(2)}.jsonl`);
  writeFileSync(p, JSON.stringify(entry) + "\n");
  return p;
}
// The standard end-turn action: write world.entry to a receipt file and run the real checker over world's
// changed-file list (and selection, if any). Read at call time, so an "And" step can mutate world.entry first.
function runReceiptCheck(world) {
  const rp = writeReceipt(world.workDir, world.entry);
  const args = ["check", "--receipt", rp, "--changed-list", world.changedList.join(","), "--skills-dir", world.skillsDir];
  if (world.selection) args.push("--selection", world.selection.join(","));
  world.res = tr(args);
}

export default function ({ Given, When, Then, And }) {
  // --- Scenario: an "applied" entry pointing at a file outside the change is refused ---
  Given(/^the receipt says "pattern-selector" was applied in "docs\/old_record\.md"$/, (world) => {
    installSkill(world.skillsDir, "pattern-selector");
    world.cf = changedFile(world.workDir, "a.txt", "work");
    world.changedList = [world.cf.path];
    world.entry = {
      task_id: "t-files", changed_files: [world.cf],
      skills: [{ name: "pattern-selector", verdict: "applied", heading: "the-core-rule", quote: QUOTE, files: ["docs/old_record.md"] }],
    };
  });
  And(/^that file did not change in this task$/, (world) => { world.outsideFile = "docs/old_record.md"; });
  When(/^the receipt check runs with the list of changed files$/, (world) => { runReceiptCheck(world); });
  Then(/^it fails$/, (world) => { assert.notEqual(world.res.status, 0, `the receipt check must fail\n${world.res.out}`); });

  // --- Scenario: the receipt must match the selection ---
  Given(/^the selection marks 6 skills "required" or "applies"$/, (world) => {
    world.selection = ["demo-a", "demo-b", "demo-c", "demo-d", "demo-e", "demo-missing"];
    world.cf = changedFile(world.workDir, "a.txt", "work");
    world.changedList = [world.cf.path];
    const applied = world.selection.slice(0, 5);
    for (const name of applied) installSkill(world.skillsDir, name);
    world.entry = {
      task_id: "t-sel", changed_files: [world.cf],
      skills: applied.map((name) => ({ name, verdict: "applied", heading: "the-core-rule", quote: QUOTE, files: [world.cf.path] })),
    };
    world.missingSkill = "demo-missing";
  });
  And(/^the receipt marks only 5 of them "applied"$/, (world) => {
    // the 6th selected skill (demo-missing) is absent from the receipt entirely; the check must name it
    assert.equal(world.entry.skills.length, 5);
  });
  When(/^the receipt check runs$/, (world) => { runReceiptCheck(world); });
  And(/^the missing skill is named$/, (world) => {
    assert.match(world.res.out, new RegExp(world.missingSkill), `the refusal must name the missing skill\n${world.res.out}`);
  });

  // --- Scenario: applied without quoting the real text is refused ---
  Given(/^the agent's receipt marks "verifiable-quality-gates" as applied$/, (world) => {
    installSkill(world.skillsDir, "verifiable-quality-gates");
    world.cf = changedFile(world.workDir, "a.txt", "work");
    world.changedList = [world.cf.path];
    world.entry = {
      task_id: "t-quote", changed_files: [world.cf],
      skills: [{ name: "verifiable-quality-gates", verdict: "applied", heading: "the-core-rule", quote: QUOTE, files: [world.cf.path] }],
    };
    world.endTurn = () => runReceiptCheck(world);
  });
  And(/^the quoted text does not appear word for word under the cited heading of that skill$/, (world) => {
    world.entry.skills[0].quote = "These are eight words that are not present here.";
  });
  And(/^the agent is shown the heading it cited and told the quote does not match$/, (world) => {
    assert.match(world.res.out, /verbatim|does not appear/, world.res.out);
    assert.match(world.res.out, /the-core-rule/, world.res.out);
  });

  // --- Scenario: a receipt copied from an earlier build is refused ---
  Given(/^a receipt whose recorded file hashes match an earlier build$/, (world) => {
    world.cf = changedFile(world.workDir, "a.txt", "CURRENT-CONTENT");
    world.changedList = [world.cf.path];
    world.entry = {
      task_id: "t-stale", changed_files: [{ path: world.cf.path, sha256: "0".repeat(64) }], skills: [],
    };
    world.endTurn = () => runReceiptCheck(world);
  });
  And(/^the files changed in this task have different hashes$/, (world) => {
    assert.notEqual(world.entry.changed_files[0].sha256, world.cf.sha256);
  });
  And(/^the agent is told the receipt does not describe the files it changed$/, (world) => {
    assert.match(world.res.out, /does not describe the files|stale or copied/, world.res.out);
  });

  // --- Scenario: two sessions keep separate receipts ---
  Given(/^two agent sessions change different files in the same folder at the same time$/, (world) => {
    world.store = join(world.workDir, "store");
    world.cfA = changedFile(world.workDir, "a.txt", "A");
    world.cfB = changedFile(world.workDir, "b.txt", "B");
    world.entryA = { task_id: "ta", changed_files: [world.cfA], skills: [] };
    world.entryB = { task_id: "tb", changed_files: [world.cfB], skills: [] };
  });
  When(/^each one ends its turn$/, (world) => {
    world.wA = tr(["write", "--session", "sessA", "--entry", "-", "--store", world.store], JSON.stringify(world.entryA));
    world.wB = tr(["write", "--session", "sessB", "--entry", "-", "--store", world.store], JSON.stringify(world.entryB));
  });
  Then(/^each receipt covers only the files that session changed$/, (world) => {
    assert.equal(world.wA.status, 0, world.wA.out);
    assert.equal(world.wB.status, 0, world.wB.out);
    const a = JSON.parse(readFileSync(join(world.store, "sessA.jsonl"), "utf8").trim());
    const b = JSON.parse(readFileSync(join(world.store, "sessB.jsonl"), "utf8").trim());
    assert.deepEqual(a.changed_files.map((f) => f.path), [world.cfA.path]);
    assert.deepEqual(b.changed_files.map((f) => f.path), [world.cfB.path]);
  });
  And(/^neither receipt is overwritten by the other$/, (world) => {
    for (const s of ["sessA", "sessB"]) {
      const lines = readFileSync(join(world.store, `${s}.jsonl`), "utf8").split(/\r?\n/).filter(Boolean);
      assert.equal(lines.length, 1, `${s} should have exactly its own entry`);
    }
  });

  // --- Scenario: an empty receipt file does not count ---
  Given(/^the agent changed 1 file$/, (world) => {
    world.cf = changedFile(world.workDir, "a.txt", "work");
    world.changedList = [world.cf.path];
  });
  And(/^the receipt file for this task exists but is empty$/, (world) => {
    world.receiptPath = join(world.workDir, "empty.jsonl");
    writeFileSync(world.receiptPath, "   \n");
    world.endTurn = () => {
      world.res = tr(["check", "--receipt", world.receiptPath, "--changed-list", world.changedList.join(","), "--skills-dir", world.skillsDir]);
    };
  });
  And(/^the agent is told the receipt has no entries$/, (world) => {
    assert.match(world.res.out, /no entries/, world.res.out);
  });

  // --- Scenario: a 400-file task is checked in full, not sampled ---
  Given(/^the agent changed 400 files in one task$/, (world) => {
    world.changed = [];
    for (let i = 0; i < 400; i++) world.changed.push(changedFile(world.workDir, `f${i}.txt`, `c${i}`));
    world.changedList = world.changed.map((f) => f.path);
  });
  And(/^the receipt covers 399 of them$/, (world) => {
    world.missingFile = world.changed[399];
    world.entry = { task_id: "t-large", changed_files: world.changed.slice(0, 399), skills: [] };
    world.endTurn = () => runReceiptCheck(world);
  });
  And(/^the 1 uncovered file is named$/, (world) => {
    assert.match(world.res.out, new RegExp(basename(world.missingFile.path).replace(".", "\\.")), world.res.out);
    assert.match(world.res.out, /not covered/, world.res.out);
  });
}
