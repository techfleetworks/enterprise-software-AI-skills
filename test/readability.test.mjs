// Discriminating tests for .claude/skills/usability-ux-universal-design/scripts/readability.mjs
//
// These spawn the REAL script against controlled fixtures and assert its exit code and output, per
// .claude/skills/verifiable-quality-gates/references/check-test-patterns.md. The load-bearing case is the
// gate: with --max-grade N, a draft ABOVE N must exit 1 (rewrite), one at/below must exit 0. A no-op
// readability (always exit 0) flips the "above target" cases, which is what makes this test discriminate.
import { test } from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { writeFileSync, mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const REPO = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const CHECK = resolve(REPO, ".claude/skills/usability-ux-universal-design/scripts/readability.mjs");

// Returns { code, out }. code is the exit status; out is stdout+stderr.
function run(text, args = [], stdin = false) {
  const dir = mkdtempSync(join(tmpdir(), "readability-"));
  const file = join(dir, "draft.md");
  if (!stdin) writeFileSync(file, text);
  try {
    const out = execFileSync(process.execPath, [CHECK, stdin ? "-" : file, ...args], {
      stdio: "pipe", encoding: "utf8", input: stdin ? text : undefined,
    });
    return { code: 0, out };
  } catch (e) {
    return { code: e.status ?? 1, out: (e.stdout || "") + (e.stderr || "") };
  }
}

// A deliberately hard draft (long sentences, longer words) and a simple rewrite of the same point.
const HARD =
  "When the operator requests an explanation, the agent should measure the reading grade of its draft " +
  "before sending the reply. If the measurement indicates the draft exceeds the requested grade, the agent " +
  "must rewrite the explanation using shorter sentences and simpler everyday words.\n";
const SIMPLE =
  "When you ask for a simple answer, the agent checks the grade of its draft first. If the draft is too " +
  "hard to read, the agent writes it again. It uses short words and short lines.\n";

test("reports a Flesch-Kincaid grade for prose (exit 0, no target)", () => {
  const r = run(HARD);
  assert.equal(r.code, 0);
  assert.match(r.out, /Flesch-Kincaid grade \d/);
});

test("a hard draft is ABOVE a 7.9 target and must be rewritten (exit 1) - discriminating", () => {
  // A no-op readability that always exits 0 fails this assertion.
  const r = run(HARD, ["--max-grade", "7.9"]);
  assert.equal(r.code, 1);
  assert.match(r.out, /rewrite before sending/i);
});

test("a simple rewrite is at or below the 7.9 target (exit 0)", () => {
  const r = run(SIMPLE, ["--max-grade", "7.9"]);
  assert.equal(r.code, 0);
});

test("the target is a real comparison: the same draft straddles two targets", () => {
  // The hard draft's grade is well above 10 and below 20, so these two targets bracket it both ways.
  assert.equal(run(HARD, ["--max-grade", "10"]).code, 1);
  assert.equal(run(HARD, ["--max-grade", "20"]).code, 0);
});

test("prose is scored without the code, tables, and paths around it", () => {
  // The code block's long identifiers and the table would wreck the grade if they were counted; they are not.
  const withCode =
    "This is a short line of plain prose for the reader.\n" +
    "```js\nconst reallyLongVariableNameThatWouldWreckTheGrade = everythingComplicatedHappensHere();\n```\n" +
    "| metric | value |\n|---|---|\n| grade | high |\n" +
    "Run node scripts/readability.mjs path/to/file.md to see it.\n";
  const r = run(withCode, ["--max-grade", "7.9"]);
  assert.equal(r.code, 0, `prose-only grade should be under target\n${r.out}`);
  // Only the two prose lines are counted. If the code identifiers and table cells were counted, the word
  // count would be far higher, so a small count is evidence the skip logic ran.
  const words = Number((r.out.match(/(\d+) words/) || [])[1]);
  assert.ok(words > 0 && words <= 20, `expected prose-only word count <= 20, got ${words}\n${r.out}`);
});

test("a file with no prose (only a code block and a table) fails closed (exit 2)", () => {
  const noProse = "```js\nconst x = doThing();\n```\n| col | val |\n|---|---|\n| a | b |\n";
  const r = run(noProse);
  assert.equal(r.code, 2);
  assert.match(r.out, /no countable prose/i);
});

test("an empty file fails closed (exit 2)", () => {
  assert.equal(run("").code, 2);
});

test("a missing file fails closed (exit 2)", () => {
  let code = 0;
  try {
    execFileSync(process.execPath, [CHECK, join(tmpdir(), "nope-readability-xyz.md")], { stdio: "pipe" });
  } catch (e) { code = e.status; }
  assert.equal(code, 2);
});

test("a non-numeric --max-grade fails closed (exit 2), so a typo is never read as 'no target'", () => {
  const r = run(SIMPLE, ["--max-grade", "abc"]);
  assert.equal(r.code, 2);
  assert.match(r.out, /needs a number/i);
});

test("--max-grade with NO value fails closed (exit 2) - the gate is never silently disabled", () => {
  // Regression: `--max-grade $GRADE` with GRADE unset drops the number; it must not pass a hard draft.
  const r = run(HARD, ["--max-grade"]);
  assert.equal(r.code, 2);
  assert.match(r.out, /needs a number/i);
});

test("--max-grade= with an empty value fails closed (exit 2), not read as target 0", () => {
  const r = run(HARD, ["--max-grade="]);
  assert.equal(r.code, 2);
});

test("an unknown flag is rejected (exit 2)", () => {
  const r = run(SIMPLE, ["--maxgrade", "7"]);
  assert.equal(r.code, 2);
  assert.match(r.out, /unknown flag/i);
});

test("reads the draft from stdin when the path is '-'", () => {
  const r = run("The cat sat on the mat. It was a good day.\n", [], true);
  assert.equal(r.code, 0);
  assert.match(r.out, /Flesch-Kincaid grade/);
});

test("--help prints usage and exits 0", () => {
  const out = execFileSync(process.execPath, [CHECK, "--help"], { encoding: "utf8" });
  assert.match(out, /usage:/i);
});
