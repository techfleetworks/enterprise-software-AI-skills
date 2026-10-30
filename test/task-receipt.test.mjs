// Discriminating tests for .claude/skills/judge-arch/scripts/task-receipt.mjs (issue #177).
//
// The load-bearing refusals, each of which a no-op check (always exit 0) would flip: a stale/copied receipt, an
// uncovered changed file (no sampling), an applied quote that is not verbatim under its cited heading, an
// applied entry pointing outside the change, a missing selected skill, an empty receipt. A valid, grounded
// receipt whose recorded hashes match the current files is accepted (exit 0). write keeps one file per session
// (parallel sessions do not overwrite); export turns a per-task entry into the PR receipt format.
import { test } from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { writeFileSync, mkdirSync, mkdtempSync, readFileSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { createHash } from "node:crypto";

const REPO = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const CLI = join(REPO, ".claude", "skills", "judge-arch", "scripts", "task-receipt.mjs");
const sha256 = (buf) => createHash("sha256").update(buf).digest("hex");
const fwd = (p) => p.split("\\").join("/");
const QUOTE = "This is a sentence with at least eight exact words to quote here.";

function run(args, stdin) {
  try {
    const out = execFileSync(process.execPath, [CLI, ...args], { encoding: "utf8", input: stdin, stdio: ["pipe", "pipe", "pipe"] });
    return { code: 0, out };
  } catch (e) {
    return { code: e.status ?? 1, out: (e.stdout || "") + (e.stderr || "") };
  }
}

// A fresh sandbox: an installed skill file (with a real heading + a >=8-word quote), a work folder with one
// changed file, and a valid per-task entry over them. Tests mutate the entry to drive each refusal.
function sandbox() {
  const base = mkdtempSync(join(tmpdir(), "task-receipt-"));
  const skillsDir = join(base, "skills");
  mkdirSync(join(skillsDir, "demo-skill"), { recursive: true });
  const skillText = `# Demo skill\n\n## The core rule\n\n${QUOTE}\n`;
  writeFileSync(join(skillsDir, "demo-skill", "SKILL.md"), skillText);
  const skillHash = sha256(Buffer.from(skillText, "utf8"));
  const work = join(base, "work");
  mkdirSync(work, { recursive: true });
  const changed = (name, content) => { const p = join(work, name); writeFileSync(p, content); return { path: fwd(p), sha256: sha256(Buffer.from(content)) }; };
  const cf = changed("a.txt", "hello");
  const entry = {
    task_id: "t1", session_id: "s1", created_at: "2026-10-29T12:00:00.000Z",
    changed_files: [cf],
    skills: [{ name: "demo-skill", verdict: "applied", heading: "the-core-rule", quote: QUOTE, skill_file_sha256: skillHash, files: [cf.path], why: "applied it", what: "the core rule" }],
    checkers: [],
  };
  return { base, skillsDir, skillHash, work, cf, changed, entry };
}
function writeReceipt(base, entry) { const p = join(base, "receipt.jsonl"); writeFileSync(p, JSON.stringify(entry) + "\n"); return p; }
function check(entry, sb, extra = []) {
  const rp = writeReceipt(sb.base, entry);
  return run(["check", "--receipt", rp, "--changed-list", sb.cf.path, "--skills-dir", sb.skillsDir, ...extra]);
}

test("check: a valid, grounded receipt whose hashes match is accepted (exit 0)", () => {
  const sb = sandbox();
  const r = check(sb.entry, sb);
  assert.equal(r.code, 0, r.out);
  assert.match(r.out, /accepted/);
});

test("check: a stale/copied receipt (recorded hash != current file) is refused (exit 2) - discriminating", () => {
  const sb = sandbox();
  sb.entry.changed_files[0].sha256 = "0".repeat(64); // as if copied from an earlier build
  const r = check(sb.entry, sb);
  assert.equal(r.code, 2, r.out);
  assert.match(r.out, /stale or copied|does not describe the files/);
});

test("check: an uncovered changed file is refused, named (exit 2) - no sampling", () => {
  const sb = sandbox();
  const extra = sb.changed("b.txt", "second"); // a second changed file the receipt does NOT list
  const rp = writeReceipt(sb.base, sb.entry);
  const r = run(["check", "--receipt", rp, "--changed-list", `${sb.cf.path},${extra.path}`, "--skills-dir", sb.skillsDir]);
  assert.equal(r.code, 2, r.out);
  assert.match(r.out, /b\.txt/);
  assert.match(r.out, /not covered/);
});

test("check: an applied quote that is not verbatim under the cited heading is refused (exit 2)", () => {
  const sb = sandbox();
  sb.entry.skills[0].quote = "These are eight words that are not in the skill text.";
  const r = check(sb.entry, sb);
  assert.equal(r.code, 2, r.out);
  assert.match(r.out, /verbatim|does not appear/);
  assert.match(r.out, /the-core-rule/);
});

test("check: a cited heading that is not in the skill file is refused (exit 2)", () => {
  const sb = sandbox();
  sb.entry.skills[0].heading = "no-such-heading";
  const r = check(sb.entry, sb);
  assert.equal(r.code, 2, r.out);
  assert.match(r.out, /not a heading/);
});

test("check: an applied entry pointing at a file outside the change is refused (exit 2)", () => {
  const sb = sandbox();
  sb.entry.skills[0].files = ["docs/old_record.md"]; // not in the change
  const r = check(sb.entry, sb);
  assert.equal(r.code, 2, r.out);
  assert.match(r.out, /not in the change/);
});

test("check: skill_file_sha256 that does not match the installed SKILL.md is refused (exit 2)", () => {
  const sb = sandbox();
  sb.entry.skills[0].skill_file_sha256 = "f".repeat(64);
  const r = check(sb.entry, sb);
  assert.equal(r.code, 2, r.out);
  assert.match(r.out, /skill_file_sha256|different skill text/);
});

test("check: the receipt must match the selection; a required skill not applied is refused and named (exit 2)", () => {
  const sb = sandbox();
  // selection requires two skills; the receipt only applies demo-skill
  const r = check(sb.entry, sb, ["--selection", "demo-skill,pattern-selector"]);
  assert.equal(r.code, 2, r.out);
  assert.match(r.out, /pattern-selector/);
  assert.match(r.out, /selection/);
});

test("check: an empty receipt file is refused as having no entries (exit 2)", () => {
  const sb = sandbox();
  const rp = join(sb.base, "empty.jsonl");
  writeFileSync(rp, "   \n");
  const r = run(["check", "--receipt", rp, "--changed-list", sb.cf.path, "--skills-dir", sb.skillsDir]);
  assert.equal(r.code, 2, r.out);
  assert.match(r.out, /no entries/);
});

test("check: an expired waiver is refused (exit 2)", () => {
  const sb = sandbox();
  sb.entry.skills[0] = { name: "demo-skill", verdict: "waived", waiver: { reason: "temporary", approver: "mdenner", expires: "2000-01-01" } };
  const r = check(sb.entry, sb);
  assert.equal(r.code, 2, r.out);
  assert.match(r.out, /expired waiver/);
});

test("check: malformed JSON fails closed (exit 2)", () => {
  const sb = sandbox();
  const rp = join(sb.base, "bad.jsonl");
  writeFileSync(rp, "{ not json\n");
  const r = run(["check", "--receipt", rp, "--changed-list", sb.cf.path, "--skills-dir", sb.skillsDir]);
  assert.equal(r.code, 2, r.out);
});

test("check: a skill name of '..' is refused as traversal before any file access (exit 2)", () => {
  const sb = sandbox();
  sb.entry.skills[0].name = ".."; // SAFE_NAME alone would admit this; isSafeName must reject it
  const r = check(sb.entry, sb);
  assert.equal(r.code, 2, r.out);
  assert.match(r.out, /unsafe skill name/);
});

test("check: without --selection, the OK output discloses that completeness was NOT checked", () => {
  const sb = sandbox();
  const r = check(sb.entry, sb); // valid, no --selection
  assert.equal(r.code, 0, r.out);
  assert.match(r.out, /completeness NOT checked/);
});

test("check: a changed path that is a directory (not a readable file) fails closed (exit 2)", () => {
  const sb = sandbox();
  const dirPath = join(sb.work, "a-dir");
  mkdirSync(dirPath);
  sb.entry.changed_files.push({ path: fwd(dirPath), sha256: "0".repeat(64) });
  const rp = writeReceipt(sb.base, sb.entry);
  const r = run(["check", "--receipt", rp, "--changed-list", `${sb.cf.path},${fwd(dirPath)}`, "--skills-dir", sb.skillsDir]);
  assert.equal(r.code, 2, r.out);
  assert.match(r.out, /not a regular file|could not be read/);
});

test("write: a session id of '..' is refused as traversal (exit 2)", () => {
  const sb = sandbox();
  const store = join(sb.base, "store");
  const r = run(["write", "--session", "..", "--entry", "-", "--store", store], JSON.stringify({ task_id: "t", changed_files: [], skills: [] }));
  assert.equal(r.code, 2, r.out);
  assert.match(r.out, /session/);
});

test("export: a waived skill carries its approver and expiry into why (audit trail not lost)", () => {
  const sb = sandbox();
  sb.entry.skills[0] = { name: "demo-skill", verdict: "waived", waiver: { reason: "temporary", approver: "mdenner", expires: "2099-01-01" } };
  const rp = writeReceipt(sb.base, sb.entry);
  const r = run(["export", "--receipt", rp, "--change", "fix/177-demo"]);
  assert.equal(r.code, 0, r.out);
  const obj = JSON.parse(r.out.trim());
  assert.equal(obj.skills["demo-skill"].status, "not-applicable");
  assert.match(obj.skills["demo-skill"].why, /approver: mdenner/);
  assert.match(obj.skills["demo-skill"].why, /expires: 2099-01-01/);
});

test("write: two sessions in the same store keep separate files (parallel, no overwrite)", () => {
  const sb = sandbox();
  const store = join(sb.base, "store");
  const eA = { task_id: "ta", changed_files: [], skills: [] };
  const eB = { task_id: "tb", changed_files: [], skills: [] };
  assert.equal(run(["write", "--session", "sessA", "--entry", "-", "--store", store], JSON.stringify(eA)).code, 0);
  assert.equal(run(["write", "--session", "sessB", "--entry", "-", "--store", store], JSON.stringify(eB)).code, 0);
  assert.equal(run(["write", "--session", "sessA", "--entry", "-", "--store", store], JSON.stringify({ task_id: "ta2", changed_files: [], skills: [] })).code, 0);
  assert.ok(existsSync(join(store, "sessA.jsonl")));
  assert.ok(existsSync(join(store, "sessB.jsonl")));
  const a = readFileSync(join(store, "sessA.jsonl"), "utf8").split(/\r?\n/).filter(Boolean);
  const b = readFileSync(join(store, "sessB.jsonl"), "utf8").split(/\r?\n/).filter(Boolean);
  assert.equal(a.length, 2, "session A appended, not overwritten");
  assert.equal(b.length, 1, "session B is untouched by A");
});

test("export: a per-task entry becomes a PR-format receipt with anchors, quotes, and where", () => {
  const sb = sandbox();
  const rp = writeReceipt(sb.base, sb.entry);
  const r = run(["export", "--receipt", rp, "--change", "fix/177-demo"]);
  assert.equal(r.code, 0, r.out);
  const obj = JSON.parse(r.out.trim());
  assert.equal(obj.change, "fix/177-demo");
  assert.equal(obj.skills["demo-skill"].status, "applied");
  assert.equal(obj.skills["demo-skill"].anchors[0], "demo-skill/SKILL.md#the-core-rule");
  assert.equal(obj.skills["demo-skill"].quotes[0], QUOTE);
  assert.deepEqual(obj.skills["demo-skill"].where, [sb.cf.path]);
  assert.equal(obj.humanReviewed, null);
});

test("--help prints usage and exits 0", () => {
  const out = execFileSync(process.execPath, [CLI, "--help"], { encoding: "utf8" });
  assert.match(out, /task-receipt/);
});
