// Discriminating tests for always-on/subagent-check.mjs (issue #176). The SubagentStop hand-back check must refuse
// when a subagent changed files with no receipt, or the brief named a skill it never read, or a read-only reviewer's
// findings carry no evidence; and it must write the subagent ledger so the parent can backstop. A no-op check
// (always exit 0) flips every block case below.
import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { writeFileSync, mkdirSync, mkdtempSync, readFileSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { createHash } from "node:crypto";

const REPO = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const SC = join(REPO, "always-on", "subagent-check.mjs");
const QUOTE = "This is a sentence with at least eight exact words to quote here.";
const sha256 = (buf) => createHash("sha256").update(buf).digest("hex");
const fwd = (p) => p.split("\\").join("/");

// Build a subagent scenario: an installed skill, an agent transcript (brief + optional edit + optional skill load +
// final report), and (optionally) a receipt covering the changed file.
function scenario({ brief = "Fix the bug.", edits = true, loadSkill = null, report = "Done.", withReceipt = true } = {}) {
  const base = mkdtempSync(join(tmpdir(), "subagent-"));
  const skillsDir = join(base, "skills");
  mkdirSync(join(skillsDir, "comprehensive-test-strategy"), { recursive: true });
  writeFileSync(join(skillsDir, "comprehensive-test-strategy", "SKILL.md"), `# comprehensive-test-strategy\n\n## The core rule\n\n${QUOTE}\n`);
  mkdirSync(join(skillsDir, "verifiable-quality-gates"), { recursive: true });
  writeFileSync(join(skillsDir, "verifiable-quality-gates", "SKILL.md"), `# verifiable-quality-gates\n\n## The core rule\n\n${QUOTE}\n`);
  const work = join(base, "work"); mkdirSync(work, { recursive: true });
  const srcAbs = join(work, "feature.ts"); writeFileSync(srcAbs, "export const x = 1;\n");
  const src = fwd(srcAbs);

  const t = [{ type: "user", message: { role: "user", content: brief } }];
  if (edits) t.push({ type: "assistant", message: { role: "assistant", content: [{ type: "tool_use", name: "Write", input: { file_path: src } }] } });
  if (loadSkill) t.push({ type: "assistant", message: { role: "assistant", content: [{ type: "tool_use", name: "Skill", input: { skill: loadSkill } }] } });
  t.push({ type: "assistant", message: { role: "assistant", content: report } });
  const transcript = join(base, "agent.jsonl");
  writeFileSync(transcript, t.map((l) => JSON.stringify(l)).join("\n") + "\n");

  const receipt = join(base, "receipt.jsonl");
  if (withReceipt) writeFileSync(receipt, JSON.stringify({ task_id: "t1", changed_files: [{ path: src, sha256: sha256(Buffer.from("export const x = 1;\n")) }], skills: [{ name: "comprehensive-test-strategy", verdict: "applied", heading: "the-core-rule", quote: QUOTE, files: [src] }] }) + "\n");
  const ledger = join(base, "subagents.jsonl");
  return { base, skillsDir, transcript, receipt: withReceipt ? receipt : join(base, "none.jsonl"), ledger, src };
}
function run(sc, payloadExtra = {}, envExtra = {}) {
  const env = { ...process.env, ESK_ENFORCE: "1", ESK_SKILLS_DIR: sc.skillsDir, ESK_RECEIPT: sc.receipt, ESK_SUBAGENTS_FILE: sc.ledger, ...envExtra };
  const r = spawnSync(process.execPath, [SC], { input: JSON.stringify({ session_id: "s1", agent_name: "impl-1", agent_transcript_path: sc.transcript, ...payloadExtra }), encoding: "utf8", env });
  return { status: r.status, out: (r.stdout || "") + (r.stderr || "") };
}
const ledgerEntries = (sc) => (existsSync(sc.ledger) ? readFileSync(sc.ledger, "utf8").trim().split(/\r?\n/).filter(Boolean).map((l) => JSON.parse(l)) : []);

test("a subagent that changed a file with a covering receipt hands back (exit 0) and is logged receipt_ok", () => {
  const sc = scenario();
  const r = run(sc);
  assert.equal(r.status, 0, r.out);
  const e = ledgerEntries(sc).at(-1);
  assert.equal(e.receipt_ok, true);
  assert.deepEqual(e.changed_files, [sc.src]);
});

test("a subagent that changed files with NO receipt is refused (exit 2) and logged receipt_ok=false - discriminating", () => {
  const sc = scenario({ withReceipt: false });
  const r = run(sc);
  assert.equal(r.status, 2, r.out);
  assert.match(r.out, /receipt/);
  const e = ledgerEntries(sc).at(-1);
  assert.equal(e.receipt_ok, false);
  assert.deepEqual(e.changed_files, [sc.src]); // the parent can now see the uncovered files
});

test("a brief that names a skill the subagent never read is refused (exit 2) - discriminating", () => {
  const sc = scenario({ brief: "Fix the bug. Apply verifiable-quality-gates and skeptical-audit." });
  const r = run(sc);
  assert.equal(r.status, 2, r.out);
  assert.match(r.out, /verifiable-quality-gates/);
  assert.match(r.out, /never loaded or read/);
});

test("the named-skill match is scoped to the brief's Skills block + word boundaries (no false over-block) - discriminating", () => {
  // The Skills block names only verifiable-quality-gates; prose elsewhere mentions another skill and a substring.
  const brief = "Fix the bug.\n\n## Skills (load and apply with the Skill tool)\n- verifiable-quality-gates: the gate\n\nContext: see architectural-decision-records for history; this is not a bootstrap task.";
  const sc = scenario({ brief, loadSkill: "verifiable-quality-gates" });
  const r = run(sc);
  assert.equal(r.status, 0, r.out); // only vqg is "named" (and it was read); ADR mentioned outside the block is NOT required
});

test("a named skill that WAS read (Skill load) passes the named-skill check", () => {
  const sc = scenario({ brief: "Fix the bug. Apply verifiable-quality-gates.", loadSkill: "verifiable-quality-gates" });
  const r = run(sc);
  assert.equal(r.status, 0, r.out); // receipt covers the file and the named skill was read
});

test("a read-only reviewer with findings that carry evidence hands back (exit 0), no code receipt", () => {
  const sc = scenario({ edits: false, withReceipt: false, report: "Review complete. No issues found in the parser module." });
  const r = run(sc);
  assert.equal(r.status, 0, r.out);
});

test("a read-only reviewer whose findings carry NO evidence is refused (exit 2) - discriminating", () => {
  const sc = scenario({ edits: false, withReceipt: false, report: "I verified the gate is green." });
  const r = run(sc);
  assert.equal(r.status, 2, r.out);
  assert.match(r.out, /evidence|claim-lint/);
});

test("an unreadable agent transcript fails closed (block, exit 2)", () => {
  const sc = scenario();
  const r = run(sc, { agent_transcript_path: join(sc.base, "no-such.jsonl") });
  assert.equal(r.status, 2, r.out);
  assert.match(r.out, /could not be read|failing closed/);
});

test("not wired (no ESK_ENFORCE and no transcript) allows the hand-back (exit 0)", () => {
  const sc = scenario();
  const r = spawnSync(process.execPath, [SC], { input: JSON.stringify({ session_id: "s1" }), encoding: "utf8", env: { ...process.env, ESK_ENFORCE: "", ESK_SKILLS_DIR: sc.skillsDir } });
  assert.equal(r.status, 0, (r.stdout || "") + (r.stderr || ""));
});
