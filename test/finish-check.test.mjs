// Discriminating tests for always-on/finish-check.mjs (issue #174 PR-A). A no-op finish-check (always exit 0)
// flips every BLOCK case below; the valid and read-only cases must still end.
import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { writeFileSync, mkdirSync, mkdtempSync, copyFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { createHash } from "node:crypto";

const REPO = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const FC = join(REPO, "always-on", "finish-check.mjs");
const QUOTE = "This is a sentence with at least eight exact words to quote here.";
const sha256 = (buf) => createHash("sha256").update(buf).digest("hex");
const fwd = (p) => p.split("\\").join("/");

// Build a complete, passing task: an installed skill, a changed source file on disk, a transcript that edits it,
// a valid per-task receipt covering it, and a task record with every formula step proven.
function scenario() {
  const base = mkdtempSync(join(tmpdir(), "finish-check-"));
  const skillsDir = join(base, "skills");
  mkdirSync(join(skillsDir, "comprehensive-test-strategy"), { recursive: true });
  writeFileSync(join(skillsDir, "comprehensive-test-strategy", "SKILL.md"), `# comprehensive-test-strategy\n\n## The core rule\n\n${QUOTE}\n`);
  const work = join(base, "work");
  mkdirSync(work, { recursive: true });
  const srcAbs = join(work, "feature.ts");
  writeFileSync(srcAbs, "export const x = 1;\n");
  const src = fwd(srcAbs);
  const srcHash = sha256(Buffer.from("export const x = 1;\n"));

  const transcript = join(base, "transcript.jsonl");
  writeFileSync(transcript, JSON.stringify({ type: "tool_use", name: "Write", input: { file_path: src } }) + "\n");

  const receipt = join(base, "receipt.jsonl");
  writeFileSync(receipt, JSON.stringify({
    task_id: "t1", changed_files: [{ path: src, sha256: srcHash }],
    skills: [{ name: "comprehensive-test-strategy", verdict: "applied", heading: "the-core-rule", quote: QUOTE, files: [src] }],
  }) + "\n");

  const record = {
    task_id: "t1", session_id: "s1",
    steps: ["select", "load", "plan", "build", "prove", "review", "encode", "receipt"],
    build: { testsChanged: true, newChecks: [], coverage: {} },
    prove: { ledger: true, claimLintExit: 0, checkers: [{ command: "node check", exit: 0, output_sha256: "abc123" }] },
    review: { freshContext: true, timedOut: false, logged: true, findings: [], matrix: { [src]: { boundary: { verdict: "ok", source: "f:1" }, ownership: { verdict: "ok", source: "f:1" }, dependency: { verdict: "ok", source: "f:1" }, "error-handling": { verdict: "ok", source: "f:1" } } } },
    encode: { findings: [] },
    receiptPath: receipt,
  };
  return { base, skillsDir, work, src, transcript, receipt, record };
}
function writeRecord(base, record) { const p = join(base, "record.json"); writeFileSync(p, JSON.stringify(record)); return p; }
function run(payload, env) {
  const r = spawnSync(process.execPath, [FC], { encoding: "utf8", input: JSON.stringify(payload), env: { ...process.env, ...env } });
  return { status: r.status, out: (r.stdout || "") + (r.stderr || "") };
}
// Run the finish-check for a scenario with a (possibly mutated) record.
function finish(sc, recordOverride) {
  const rec = recordOverride || sc.record;
  const rp = writeRecord(sc.base, rec);
  return run({ transcript_path: sc.transcript, session_id: "s1" }, { ESK_TASK_RECORD: rp, ESK_RECEIPT: sc.receipt, ESK_SKILLS_DIR: sc.skillsDir });
}

test("a task with every formula step proven and a passing receipt ends (exit 0)", () => {
  const sc = scenario();
  const r = finish(sc);
  assert.equal(r.status, 0, r.out);
});

test("a read-only task (no edits in the transcript) ends with no receipt (exit 0)", () => {
  const sc = scenario();
  const empty = join(sc.base, "ro.jsonl");
  writeFileSync(empty, JSON.stringify({ type: "tool_use", name: "Read", input: { file_path: sc.src } }) + "\n");
  const rp = writeRecord(sc.base, sc.record);
  const r = run({ transcript_path: empty, session_id: "s1" }, { ESK_TASK_RECORD: rp, ESK_RECEIPT: sc.receipt, ESK_SKILLS_DIR: sc.skillsDir });
  assert.equal(r.status, 0, r.out);
  assert.match(r.out, /read-only/);
});

test("a task that changed files but has NO task record is blocked (exit 2) - discriminating", () => {
  const sc = scenario();
  const r = run({ transcript_path: sc.transcript, session_id: "s1" }, { ESK_TASK_RECORD: join(sc.base, "missing.json"), ESK_RECEIPT: sc.receipt, ESK_SKILLS_DIR: sc.skillsDir });
  assert.equal(r.status, 2, r.out);
  assert.match(r.out, /no task record/);
});

test("the task cannot end before the review step (exit 2)", () => {
  const sc = scenario();
  const rec = { ...sc.record, steps: ["select", "load", "plan", "build", "prove", "encode", "receipt"] };
  const r = finish(sc, rec);
  assert.equal(r.status, 2, r.out);
  assert.match(r.out, /review step is missing/);
});

test("a source change with no test is blocked (exit 2)", () => {
  const sc = scenario();
  const rec = { ...sc.record, build: { ...sc.record.build, testsChanged: false } };
  const r = finish(sc, rec);
  assert.equal(r.status, 2, r.out);
  assert.match(r.out, /no test moved with it|add or update the test/);
});

test("a new check with no discriminating test is blocked (exit 2)", () => {
  const sc = scenario();
  const rec = { ...sc.record, build: { ...sc.record.build, newChecks: [{ script: "g.mjs", hasDiscriminatingTest: false }] } };
  const r = finish(sc, rec);
  assert.equal(r.status, 2, r.out);
  assert.match(r.out, /no-op/);
});

test("a coverage number with an uncovered changed branch is blocked (exit 2)", () => {
  const sc = scenario();
  const rec = { ...sc.record, build: { ...sc.record.build, coverage: { targetMet: true, uncoveredChangedBranch: "parseYear:else" } } };
  const r = finish(sc, rec);
  assert.equal(r.status, 2, r.out);
  assert.match(r.out, /parseYear:else/);
});

test("an untagged claim (claim-lint non-zero) blocks the finish (exit 2)", () => {
  const sc = scenario();
  const rec = { ...sc.record, prove: { ...sc.record.prove, claimLintExit: 1 } };
  const r = finish(sc, rec);
  assert.equal(r.status, 2, r.out);
  assert.match(r.out, /claim-lint/);
});

test("a self-review (not fresh context) is blocked (exit 2)", () => {
  const sc = scenario();
  const rec = { ...sc.record, review: { ...sc.record.review, freshContext: false } };
  const r = finish(sc, rec);
  assert.equal(r.status, 2, r.out);
  assert.match(r.out, /fresh-context review/);
});

test("a review matrix that skips a changed file is blocked (exit 2)", () => {
  const sc = scenario();
  const rec = { ...sc.record, review: { ...sc.record.review, matrix: {} } };
  const r = finish(sc, rec);
  assert.equal(r.status, 2, r.out);
  assert.match(r.out, /does not cover the changed file/);
});

test("an open HIGH review finding blocks the finish (exit 2)", () => {
  const sc = scenario();
  const rec = { ...sc.record, review: { ...sc.record.review, findings: [{ severity: "high", file: sc.src, status: "open" }] } };
  const r = finish(sc, rec);
  assert.equal(r.status, 2, r.out);
  assert.match(r.out, /open high/i);
});

test("a review that timed out is blocked (exit 2)", () => {
  const sc = scenario();
  const rec = { ...sc.record, review: { ...sc.record.review, timedOut: true } };
  const r = finish(sc, rec);
  assert.equal(r.status, 2, r.out);
  assert.match(r.out, /timed out/);
});

test("a caught mistake that was fixed but not encoded blocks the finish (exit 2)", () => {
  const sc = scenario();
  const rec = { ...sc.record, encode: { findings: [{ description: "wrong owner", fixed: true, rule: null, reason: null }] } };
  const r = finish(sc, rec);
  assert.equal(r.status, 2, r.out);
  assert.match(r.out, /not encoded/);
});

test("a changed-files task with a failing/absent receipt is blocked (exit 2)", () => {
  const sc = scenario();
  const badReceipt = join(sc.base, "bad.jsonl");
  writeFileSync(badReceipt, "   \n"); // empty receipt -> task-receipt holds
  const rp = writeRecord(sc.base, sc.record);
  const r = run({ transcript_path: sc.transcript, session_id: "s1" }, { ESK_TASK_RECORD: rp, ESK_RECEIPT: badReceipt, ESK_SKILLS_DIR: sc.skillsDir });
  assert.equal(r.status, 2, r.out);
  assert.match(r.out, /receipt/);
});

test("after the block cap, the finish ESCALATES (ends the turn) instead of looping (exit 0)", () => {
  const sc = scenario();
  const rec = { ...sc.record, steps: ["select"] }; // very incomplete -> would normally block
  const rp = writeRecord(sc.base, rec);
  const blocks = join(sc.base, "blocks.json");
  writeFileSync(blocks, JSON.stringify({ count: 3 }));
  const r = run({ transcript_path: sc.transcript, session_id: "s1", stop_hook_active: true }, { ESK_TASK_RECORD: rp, ESK_RECEIPT: sc.receipt, ESK_SKILLS_DIR: sc.skillsDir, ESK_BLOCKS: blocks, ESK_BLOCK_CAP: "3" });
  assert.equal(r.status, 0, r.out);
  assert.match(r.out, /escalated/);
});

test("when the finish-check is not wired (ESK_TASK_RECORD unset, ESK_ENFORCE unset) the turn may end (exit 0)", () => {
  const sc = scenario();
  const r = run({ transcript_path: sc.transcript, session_id: "s1" }, { ESK_TASK_RECORD: "", ESK_ENFORCE: "", ESK_SKILLS_DIR: sc.skillsDir });
  assert.equal(r.status, 0, r.out);
  assert.match(r.out, /not wired/);
});

test("ACTIVATION: ESK_ENFORCE=1 alone wires it - a valid DERIVED record+receipt ends the turn (exit 0)", () => {
  const sc = scenario();
  const base = join(sc.base, "esk-home");
  mkdirSync(join(base, "records"), { recursive: true });
  mkdirSync(join(base, "receipts"), { recursive: true });
  const rec = { ...sc.record }; delete rec.receiptPath; // force the receipt to resolve from the derived per-session path
  writeFileSync(join(base, "records", "s1.json"), JSON.stringify(rec));
  copyFileSync(sc.receipt, join(base, "receipts", "s1.jsonl"));
  // no ESK_TASK_RECORD and no ESK_RECEIPT: both must be derived from ESK_HOME + the payload session_id
  const r = run({ transcript_path: sc.transcript, session_id: "s1" }, { ESK_ENFORCE: "1", ESK_HOME: base, ESK_SKILLS_DIR: sc.skillsDir });
  assert.equal(r.status, 0, r.out);
});

test("ACTIVATION: ESK_ENFORCE=1 with NO derived record blocks a changed-files task (exit 2) - discriminating", () => {
  const sc = scenario();
  const base = join(sc.base, "esk-home-empty");
  mkdirSync(base, { recursive: true });
  const r = run({ transcript_path: sc.transcript, session_id: "s1" }, { ESK_ENFORCE: "1", ESK_HOME: base, ESK_SKILLS_DIR: sc.skillsDir });
  assert.equal(r.status, 2, r.out);
  assert.match(r.out, /no task record/);
});

test("ACTIVATION: ESK_ENFORCE=1 with a MISSING session id FAILS a changed-files turn CLOSED (exit 2) - discriminating", () => {
  const sc = scenario();
  const base = join(sc.base, "esk-home-nosess"); mkdirSync(base, { recursive: true });
  // enforcement on, no explicit ESK_TASK_RECORD, and NO session_id: the per-session path cannot be derived. A
  // fail-OPEN here (exit 0) would let a changed-files turn end unchecked; it must fail closed.
  const r = run({ transcript_path: sc.transcript }, { ESK_ENFORCE: "1", ESK_HOME: base, ESK_SKILLS_DIR: sc.skillsDir });
  assert.equal(r.status, 2, r.out);
  assert.match(r.out, /no usable session id|failing closed/);
});

test("ACTIVATION: ESK_ENFORCE=1 with a missing session id still ENDS a read-only turn (exit 0)", () => {
  const sc = scenario();
  const ro = join(sc.base, "ro2.jsonl");
  writeFileSync(ro, JSON.stringify({ type: "tool_use", name: "Read", input: { file_path: sc.src } }) + "\n");
  const base = join(sc.base, "esk-home-nosess2"); mkdirSync(base, { recursive: true });
  const r = run({ transcript_path: ro }, { ESK_ENFORCE: "1", ESK_HOME: base, ESK_SKILLS_DIR: sc.skillsDir });
  assert.equal(r.status, 0, r.out); // read-only ends even when enforcement is on and the session id is absent
});

test("ACTIVATION: an operator waiver file (by:operator) waives a missing step; the agent record cannot (exit 0)", () => {
  const sc = scenario();
  const base = join(sc.base, "esk-home-waive");
  mkdirSync(join(base, "records"), { recursive: true });
  mkdirSync(join(base, "receipts"), { recursive: true });
  mkdirSync(join(base, "waivers"), { recursive: true });
  const rec = { ...sc.record, steps: ["select", "load", "plan", "build", "prove", "encode", "receipt"], review: { freshContext: false } }; // review step missing
  delete rec.receiptPath;
  writeFileSync(join(base, "records", "s1.json"), JSON.stringify(rec));
  copyFileSync(sc.receipt, join(base, "receipts", "s1.jsonl"));
  // an agent-written self-waiver (by:agent) must NOT count; only an operator waiver does
  writeFileSync(join(base, "waivers", "s1.json"), JSON.stringify([{ step: "review", by: "agent", reason: "trust me" }]));
  const blocked = run({ transcript_path: sc.transcript, session_id: "s1" }, { ESK_ENFORCE: "1", ESK_HOME: base, ESK_SKILLS_DIR: sc.skillsDir });
  assert.equal(blocked.status, 2, blocked.out);
  assert.match(blocked.out, /review step is missing/);
  // the operator waiver DOES count
  writeFileSync(join(base, "waivers", "s1.json"), JSON.stringify([{ step: "review", by: "operator", reason: "accepted risk for this hotfix" }]));
  const allowed = run({ transcript_path: sc.transcript, session_id: "s1" }, { ESK_ENFORCE: "1", ESK_HOME: base, ESK_SKILLS_DIR: sc.skillsDir });
  assert.equal(allowed.status, 0, allowed.out);
});

test("steps recorded out of order are blocked (exit 2) - discriminating", () => {
  const sc = scenario();
  const rec = { ...sc.record, steps: ["load", "select", "plan", "build", "prove", "review", "encode", "receipt"] };
  const r = finish(sc, rec);
  assert.equal(r.status, 2, r.out);
  assert.match(r.out, /out of order/);
});

test("a final report with no evidence ledger is blocked (exit 2) - discriminating", () => {
  const sc = scenario();
  const rec = { ...sc.record, prove: { ...sc.record.prove, ledger: false } };
  const r = finish(sc, rec);
  assert.equal(r.status, 2, r.out);
  assert.match(r.out, /evidence ledger/);
});

test("a review that was not appended to the log is blocked (exit 2) - discriminating", () => {
  const sc = scenario();
  const rec = { ...sc.record, review: { ...sc.record.review, logged: false } };
  const r = finish(sc, rec);
  assert.equal(r.status, 2, r.out);
  assert.match(r.out, /review log/);
});

test("a checker result missing its output hash is blocked (exit 2) - discriminating", () => {
  const sc = scenario();
  const rec = { ...sc.record, prove: { ...sc.record.prove, checkers: [{ command: "node check", exit: 0 }] } };
  const r = finish(sc, rec);
  assert.equal(r.status, 2, r.out);
  assert.match(r.out, /fully recorded/);
});

test("a review matrix row missing one question's verdict is blocked (exit 2) - discriminating", () => {
  const sc = scenario();
  // the row is present for the changed file but omits the "error-handling" question (present-but-partial, not whole-row-missing)
  const partial = { boundary: { verdict: "ok", source: "f:1" }, ownership: { verdict: "ok", source: "f:1" }, dependency: { verdict: "ok", source: "f:1" } };
  const rec = { ...sc.record, review: { ...sc.record.review, matrix: { [sc.src]: partial } } };
  const r = finish(sc, rec);
  assert.equal(r.status, 2, r.out);
  assert.match(r.out, /verdict\+source for "error-handling"/);
});

test("a transcript_path that cannot be read fails closed (block, exit 2) - discriminating", () => {
  const sc = scenario();
  const rp = writeRecord(sc.base, sc.record);
  // a transcript_path is provided but the file is missing: this is an error, not a read-only task, so it BLOCKS
  const r = run({ transcript_path: join(sc.base, "no-such-transcript.jsonl"), session_id: "s1" }, { ESK_TASK_RECORD: rp, ESK_RECEIPT: sc.receipt, ESK_SKILLS_DIR: sc.skillsDir });
  assert.equal(r.status, 2, r.out);
  assert.match(r.out, /could not be read|failing closed/);
});

test("a malformed payload fails closed (block, exit 2)", () => {
  const sc = scenario();
  const rp = writeRecord(sc.base, sc.record);
  const r = run("not json", { ESK_TASK_RECORD: rp, ESK_RECEIPT: sc.receipt, ESK_SKILLS_DIR: sc.skillsDir });
  // run() JSON.stringifies, so inject raw via a direct spawn:
  const r2 = spawnSync(process.execPath, [FC], { encoding: "utf8", input: "{ not json", env: { ...process.env, ESK_TASK_RECORD: rp, ESK_RECEIPT: sc.receipt, ESK_SKILLS_DIR: sc.skillsDir } });
  assert.equal(r2.status, 2, (r2.stdout || "") + (r2.stderr || ""));
});
