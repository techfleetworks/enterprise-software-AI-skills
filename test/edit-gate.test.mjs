// Discriminating tests for always-on/edit-gate.mjs (issue #175, PR-A): the PreToolUse hook that holds a source
// edit until the task's selection and load steps are satisfied. A no-op hook (always exit 0) flips every deny.
import { test } from "node:test";
import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import { writeFileSync, mkdirSync, mkdtempSync, readFileSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { createHash } from "node:crypto";

const REPO = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const GATE = join(REPO, "always-on", "edit-gate.mjs");
const sha256 = (buf) => createHash("sha256").update(buf).digest("hex");
const SKILLS = ["architectural-decision-records", "release-deployment-safety", "compliance-data-lifecycle", "comprehensive-test-strategy", "bdd-comprehensive-testing", "owasp-secure-coding-bdd"];

function sandbox() {
  const base = mkdtempSync(join(tmpdir(), "edit-gate-"));
  const skillsDir = join(base, "skills");
  const hashes = {};
  const sel = {};
  for (const name of SKILLS) {
    mkdirSync(join(skillsDir, name), { recursive: true });
    const text = `# ${name}\n\n## The core rule\n\nSome guidance for ${name} with enough words here.\n`;
    writeFileSync(join(skillsDir, name, "SKILL.md"), text);
    hashes[name] = sha256(Buffer.from(text, "utf8"));
    sel[name] = { verdict: "applies", reason: `relevant (${name})` };
  }
  return { base, skillsDir, hashes, sel };
}
function runGate(payload, env) {
  const r = spawnSync(process.execPath, [GATE], { encoding: "utf8", input: JSON.stringify(payload), env: { ...process.env, ...env } });
  return { code: r.status, out: (r.stdout || "") + (r.stderr || "") };
}
const editPayload = (file_path) => ({ tool_name: "Write", tool_input: { file_path, content: "x" } });

test("a non-edit tool is allowed (exit 0)", () => {
  const r = runGate({ tool_name: "Read", tool_input: { file_path: "src/x.ts" } }, { ESK_SELECTION: "" });
  assert.equal(r.code, 0, r.out);
});

test("enforcement ON but no usable session id: the edit is DENIED (fail closed) - discriminating", () => {
  const sb = sandbox();
  // ESK_ENFORCE=1 with no explicit ESK_SELECTION and no session_id: the per-session path cannot be derived. A
  // fail-OPEN here (exit 0) would let the edit through ungated; it must fail closed.
  const r = runGate(editPayload("src/x.ts"), { ESK_ENFORCE: "1", ESK_SELECTION: "", ESK_SKILLS_DIR: sb.skillsDir });
  assert.equal(r.code, 2, r.out);
  assert.match(r.out, /no usable session id|failing closed/);
});

test("when the gate is not wired (ESK_SELECTION unset) the edit is allowed with a notice", () => {
  const sb = sandbox();
  const r = runGate(editPayload("src/x.ts"), { ESK_SELECTION: "", ESK_SKILLS_DIR: sb.skillsDir });
  assert.equal(r.code, 0, r.out);
  assert.match(r.out, /not wired/);
});

test("an edit before the selection record exists is DENIED (exit 2) - discriminating", () => {
  const sb = sandbox();
  const missing = join(sb.base, "no-selection-yet.json");
  const r = runGate(editPayload(join(sb.skillsDir, "..", "src", "x.ts")), { ESK_SELECTION: missing, ESK_SKILLS_DIR: sb.skillsDir });
  assert.equal(r.code, 2, r.out);
  assert.match(r.out, /write the skill selection/);
});

test("a complete selection with every skill loaded allows the edit (exit 0)", () => {
  const sb = sandbox();
  const selPath = join(sb.base, "selection.json");
  writeFileSync(selPath, JSON.stringify(sb.sel));
  const loadedPath = join(sb.base, "loaded.json");
  writeFileSync(loadedPath, JSON.stringify(sb.hashes));
  const r = runGate(editPayload("src/feature.ts"), { ESK_SELECTION: selPath, ESK_LOADED: loadedPath, ESK_SKILLS_DIR: sb.skillsDir });
  assert.equal(r.code, 0, r.out);
});

test("a passing edit inside a SUBAGENT records the file to the subagent ledger (issue #176) - discriminating", () => {
  const sb = sandbox();
  const selPath = join(sb.base, "selection.json"); writeFileSync(selPath, JSON.stringify(sb.sel));
  const loadedPath = join(sb.base, "loaded.json"); writeFileSync(loadedPath, JSON.stringify(sb.hashes));
  const ledger = join(sb.base, "subagents.jsonl");
  const r = runGate({ tool_name: "Write", tool_input: { file_path: "src/feature.ts", content: "x" }, session_id: "s1", agent_name: "impl-7" }, { ESK_SELECTION: selPath, ESK_LOADED: loadedPath, ESK_SKILLS_DIR: sb.skillsDir, ESK_SUBAGENTS_FILE: ledger });
  assert.equal(r.code, 0, r.out);
  const entries = readFileSync(ledger, "utf8").trim().split(/\r?\n/).map((l) => JSON.parse(l));
  assert.ok(entries.some((e) => e.agent === "impl-7" && e.changed_files.includes("src/feature.ts") && e.receipt_ok === false), "the subagent edit must be recorded unreceipted");
});

test("a passing edit in the MAIN session (no agent id) does NOT write the subagent ledger - discriminating", () => {
  const sb = sandbox();
  const selPath = join(sb.base, "selection.json"); writeFileSync(selPath, JSON.stringify(sb.sel));
  const loadedPath = join(sb.base, "loaded.json"); writeFileSync(loadedPath, JSON.stringify(sb.hashes));
  const ledger = join(sb.base, "subagents2.jsonl");
  const r = runGate({ tool_name: "Write", tool_input: { file_path: "src/feature.ts", content: "x" }, session_id: "s1" }, { ESK_SELECTION: selPath, ESK_LOADED: loadedPath, ESK_SKILLS_DIR: sb.skillsDir, ESK_SUBAGENTS_FILE: ledger });
  assert.equal(r.code, 0, r.out);
  assert.ok(!existsSync(ledger), "a main-session edit is covered by the main task record, not the subagent ledger");
});

test("a selected-but-unloaded skill DENIES the edit (exit 2, 'load ... then retry') - discriminating", () => {
  const sb = sandbox();
  const selPath = join(sb.base, "selection.json");
  writeFileSync(selPath, JSON.stringify(sb.sel));
  const loadedPath = join(sb.base, "loaded.json");
  const partial = { ...sb.hashes };
  delete partial["comprehensive-test-strategy"];
  writeFileSync(loadedPath, JSON.stringify(partial));
  const r = runGate(editPayload("src/feature.ts"), { ESK_SELECTION: selPath, ESK_LOADED: loadedPath, ESK_SKILLS_DIR: sb.skillsDir });
  assert.equal(r.code, 2, r.out);
  assert.match(r.out, /comprehensive-test-strategy/);
});

test("editing the selection record itself is exempt (allowed), so the agent can write it", () => {
  const sb = sandbox();
  const selPath = join(sb.base, "selection.json"); // does not exist yet
  const r = runGate(editPayload(selPath), { ESK_SELECTION: selPath, ESK_SKILLS_DIR: sb.skillsDir });
  assert.equal(r.code, 0, r.out);
});

test("a valid selection with ESK_LOADED unset allows with a load-not-wired notice (no silent skip)", () => {
  const sb = sandbox();
  const selPath = join(sb.base, "selection.json");
  writeFileSync(selPath, JSON.stringify(sb.sel));
  const r = runGate(editPayload("src/feature.ts"), { ESK_SELECTION: selPath, ESK_SKILLS_DIR: sb.skillsDir });
  assert.equal(r.code, 0, r.out);
  assert.match(r.out, /load-state is not wired/);
});

test("step 3: an edit is DENIED when a required planning record is missing (exit 2)", () => {
  const sb = sandbox();
  const selPath = join(sb.base, "selection.json");
  writeFileSync(selPath, JSON.stringify(sb.sel));
  const loadedPath = join(sb.base, "loaded.json");
  writeFileSync(loadedPath, JSON.stringify(sb.hashes));
  const plansPath = join(sb.base, "plans.json");
  writeFileSync(plansPath, JSON.stringify({})); // no planning records at all
  const r = runGate(editPayload("src/feature.ts"), { ESK_SELECTION: selPath, ESK_LOADED: loadedPath, ESK_PLANS: plansPath, ESK_SKILLS_DIR: sb.skillsDir });
  assert.equal(r.code, 2, r.out);
  assert.match(r.out, /plan step not satisfied|planning record/);
});

test("a malformed payload fails closed (deny, exit 2)", () => {
  try {
    execFileSync(process.execPath, [GATE], { encoding: "utf8", input: "{ not json", env: { ...process.env, ESK_SELECTION: "x" } });
    assert.fail("should have denied");
  } catch (e) {
    assert.equal(e.status, 2);
  }
});
