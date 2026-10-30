// Tests for always-on/record-load.mjs (PostToolUse on Skill, records a genuine load) and
// always-on/reload-skills.mjs (SessionStart:compact, re-delivers selected skills' text) - issue #175 PR-A.
import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { writeFileSync, mkdirSync, mkdtempSync, readFileSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { createHash } from "node:crypto";

const REPO = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const RECORD = join(REPO, "always-on", "record-load.mjs");
const RELOAD = join(REPO, "always-on", "reload-skills.mjs");
const sha256 = (buf) => createHash("sha256").update(buf).digest("hex");

function sandbox(names) {
  const base = mkdtempSync(join(tmpdir(), "load-state-"));
  const skillsDir = join(base, "skills");
  const hashes = {};
  for (const n of names) {
    mkdirSync(join(skillsDir, n), { recursive: true });
    const t = `# ${n}\n\n## The core rule\n\nGuidance for ${n} here.\n`;
    writeFileSync(join(skillsDir, n, "SKILL.md"), t);
    hashes[n] = sha256(Buffer.from(t, "utf8"));
  }
  return { base, skillsDir, hashes };
}
function run(script, payload, env) {
  const r = spawnSync(process.execPath, [script], { encoding: "utf8", input: payload, env: { ...process.env, ...env } });
  return { status: r.status, out: r.stdout || "" };
}

test("record-load: records a genuine Skill load into the load-state keyed by hash", () => {
  const sb = sandbox(["pattern-selector"]);
  const loaded = join(sb.base, "loaded.json");
  const r = run(RECORD, JSON.stringify({ tool_name: "Skill", tool_input: { skill: "pattern-selector" } }), { ESK_LOADED: loaded, ESK_SKILLS_DIR: sb.skillsDir });
  assert.equal(r.status, 0);
  const state = JSON.parse(readFileSync(loaded, "utf8"));
  assert.equal(state["pattern-selector"], sb.hashes["pattern-selector"]);
});

test("record-load: an unknown skill is not recorded (no real text was delivered)", () => {
  const sb = sandbox(["pattern-selector"]);
  const loaded = join(sb.base, "loaded.json");
  run(RECORD, JSON.stringify({ tool_name: "Skill", tool_input: { skill: "no-such-skill" } }), { ESK_LOADED: loaded, ESK_SKILLS_DIR: sb.skillsDir });
  const state = existsSync(loaded) ? JSON.parse(readFileSync(loaded, "utf8")) : {};
  assert.equal(state["no-such-skill"], undefined);
});

test("record-load: an unsafe skill name is ignored (no traversal)", () => {
  const sb = sandbox(["pattern-selector"]);
  const loaded = join(sb.base, "loaded.json");
  run(RECORD, JSON.stringify({ tool_name: "Skill", tool_input: { skill: "../evil" } }), { ESK_LOADED: loaded, ESK_SKILLS_DIR: sb.skillsDir });
  const state = existsSync(loaded) ? JSON.parse(readFileSync(loaded, "utf8")) : {};
  assert.deepEqual(Object.keys(state), []);
});

test("reload-skills: after a compaction it CLEARS selected skills from the load-state and names them to re-load", () => {
  // The fix for the false-loaded bug: it must not mark skills loaded (their 20-35 KB bodies cannot fit the 10 KB
  // additionalContext cap), it must clear them so the edit-gate re-holds until they are genuinely re-read.
  const sb = sandbox(["pattern-selector", "verifiable-quality-gates"]);
  const sel = { "pattern-selector": { verdict: "applies", reason: "x" }, "verifiable-quality-gates": { verdict: "required" } };
  const selPath = join(sb.base, "selection.json");
  writeFileSync(selPath, JSON.stringify(sel));
  const loaded = join(sb.base, "loaded.json");
  writeFileSync(loaded, JSON.stringify({ ...sb.hashes, "other-skill": "abc" })); // both were loaded before the compaction
  const r = run(RELOAD, "", { ESK_SELECTION: selPath, ESK_SKILLS_DIR: sb.skillsDir, ESK_LOADED: loaded });
  assert.equal(r.status, 0);
  const obj = JSON.parse(r.out);
  assert.match(obj.hookSpecificOutput.additionalContext, /pattern-selector/);
  assert.match(obj.hookSpecificOutput.additionalContext, /verifiable-quality-gates/);
  assert.match(obj.hookSpecificOutput.additionalContext, /Re-load/);
  const state = JSON.parse(readFileSync(loaded, "utf8"));
  assert.equal(state["pattern-selector"], undefined, "cleared so it must be re-read, not falsely marked loaded");
  assert.equal(state["verifiable-quality-gates"], undefined, "cleared so it must be re-read");
  assert.equal(state["other-skill"], "abc", "a non-selected skill's entry is left alone");
});

test("reload-skills: without a selection it emits nothing and exits 0 (not wired)", () => {
  const r = run(RELOAD, "", { ESK_SELECTION: "", ESK_SKILLS_DIR: "." });
  assert.equal(r.status, 0);
  assert.equal(r.out.trim(), "");
});
