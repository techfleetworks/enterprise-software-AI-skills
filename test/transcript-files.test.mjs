// Tests for always-on/transcript-files.mjs (issue #176): the shared transcript parser. Changed files, skills read,
// the brief, and the final report are each derived from JSONL; an unreadable transcript throws (callers fail closed).
import { test } from "node:test";
import assert from "node:assert/strict";
import { writeFileSync, mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { changedFilesFromTranscript, skillsReadInTranscript, firstUserText, lastAssistantText } from "../always-on/transcript-files.mjs";

function write(lines) {
  const p = join(mkdtempSync(join(tmpdir(), "tf-")), "t.jsonl");
  writeFileSync(p, lines.map((l) => JSON.stringify(l)).join("\n") + "\n");
  return p;
}

test("changedFilesFromTranscript collects edit-tool file_paths (nested, both spellings)", () => {
  const p = write([
    { type: "user", message: { role: "user", content: "go" } },
    { type: "assistant", message: { role: "assistant", content: [{ type: "tool_use", name: "Write", input: { file_path: "src/a.ts" } }] } },
    { type: "assistant", message: { role: "assistant", content: [{ type: "tool_use", name: "Read", input: { file_path: "src/b.ts" } }] } },
    { type: "assistant", message: { role: "assistant", content: [{ type: "tool_use", name: "MultiEdit", input: { file_path: "src\\c.ts" } }] } },
  ]);
  assert.deepEqual(changedFilesFromTranscript(p).sort(), ["src/a.ts", "src/c.ts"]); // Read is not an edit; backslash normalized
});

test("skillsReadInTranscript counts a Skill tool_use and a file path under skills/<name>/", () => {
  const p = write([
    { type: "assistant", message: { role: "assistant", content: [{ type: "tool_use", name: "Skill", input: { skill: "pattern-selector" } }] } },
    { type: "assistant", message: { role: "assistant", content: [{ type: "tool_use", name: "Read", input: { file_path: ".claude/skills/architectural-decision-records/SKILL.md" } }] } },
  ]);
  const s = skillsReadInTranscript(p);
  assert.ok(s.has("pattern-selector"));
  assert.ok(s.has("architectural-decision-records"));
});

test("skillsReadInTranscript strips a plugin: prefix on a Skill name", () => {
  const p = write([{ type: "assistant", message: { role: "assistant", content: [{ type: "tool_use", name: "Skill", input: { skill: "enterprise-software-AI-skills:verifiable-quality-gates" } }] } }]);
  assert.ok(skillsReadInTranscript(p).has("verifiable-quality-gates"));
});

test("firstUserText returns the first user turn's text (string or content array)", () => {
  assert.equal(firstUserText(write([{ type: "user", message: { role: "user", content: "the brief" } }])), "the brief");
  assert.equal(firstUserText(write([{ type: "user", message: { role: "user", content: [{ type: "text", text: "array brief" }] } }])), "array brief");
});

test("lastAssistantText returns the last assistant turn's text, skipping tool-only turns", () => {
  const p = write([
    { type: "assistant", message: { role: "assistant", content: "first" } },
    { type: "assistant", message: { role: "assistant", content: [{ type: "tool_use", name: "Write", input: { file_path: "x" } }] } },
    { type: "assistant", message: { role: "assistant", content: "final report" } },
  ]);
  assert.equal(lastAssistantText(p), "final report");
});

test("a missing transcript throws (callers fail closed)", () => {
  assert.throws(() => changedFilesFromTranscript(join(tmpdir(), "nope-xyz.jsonl")), /could not be read/);
});
