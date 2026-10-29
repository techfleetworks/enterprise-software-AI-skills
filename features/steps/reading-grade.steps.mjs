// Step definitions for the #181 scenarios in features/evidence/claims-match-evidence.feature.
// Scenario 1 drives the REAL readability.mjs; scenario 2 drives the REAL claim-lint.mjs. A no-op readability
// (always exit 0) flips the "rewritten, not sent" assertion, and a no-op claim-lint flips the "tries" one, so
// both scenarios execute against real behavior rather than restating a fixture.
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";
import assert from "node:assert/strict";

const REPO = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..");
const READABILITY = join(REPO, ".claude/skills/usability-ux-universal-design/scripts/readability.mjs");
const CLAIM_LINT = join(REPO, ".claude/skills/skeptical-audit/scripts/claim-lint.mjs");

function runScript(script, text, args) {
  const dir = mkdtempSync(join(tmpdir(), "cl181-"));
  const f = join(dir, "draft.md");
  writeFileSync(f, text);
  const r = spawnSync(process.execPath, [script, f, ...args], { encoding: "utf8" });
  return { status: r.status, out: (r.stdout || "") + (r.stderr || "") };
}
const measure = (text, max) => runScript(READABILITY, text, ["--max-grade", String(max)]);
const lint = (text) => runScript(CLAIM_LINT, text, ["--strict"]);

// A deliberately hard draft (long sentences, longer words), and a plain rewrite of the same point.
const HARD =
  "When the operator requests an explanation, the agent should measure the reading grade of its draft " +
  "before sending the reply. If the measurement indicates the draft exceeds the requested grade, the agent " +
  "must rewrite the explanation using shorter sentences and simpler everyday words.";
const SIMPLE =
  "When you ask for a simple answer, the agent checks the grade of its draft first. If the draft is too " +
  "hard to read, the agent writes it again. It uses short words and short lines.";
// The compliant plain rendering keeps the count, the "chosen" word, and the evidence state; the slip reframes
// the same fixed set as "tries".
const KEEPS_WORDS = "observed: all 25 chosen combinations failed, each run once.";
const DROPS_WORDS = "The 25 chosen combinations reproduced it, 25 out of 25 tries.";

export default function ({ Given, When, Then, And }) {
  // --- Scenario: a plain-language report meets the reading grade the operator asked for ---
  Given(/^the operator asks for an explanation at a 7th-grade reading level$/, (world) => { world.target = 7.9; });
  When(/^the agent drafts the explanation$/, (world) => {
    world.first = measure(HARD, world.target);
    world.rewrite = measure(SIMPLE, world.target);
  });
  Then(/^the draft is measured with a readability check before it is sent$/, (world) => {
    assert.match(world.first.out, /Flesch-Kincaid grade \d/, `the draft must be measured before sending\n${world.first.out}`);
  });
  And(/^a draft above grade 7\.9 is rewritten, not sent$/, (world) => {
    assert.equal(world.first.status, 1, `a draft above the target must be flagged for rewrite\n${world.first.out}`);
    assert.equal(world.rewrite.status, 0, `the plain rewrite must be at or below the target\n${world.rewrite.out}`);
  });

  // --- Scenario: making a report simple does not change what the evidence says ---
  Given(/^the evidence is 25 hand-picked combinations, each run once, all failing$/, (world) => {
    world.evidence = { count: 25, chosen: true, runsEach: 1, allFailed: true };
  });
  When(/^the agent explains it in plain language$/, (world) => {
    world.keeps = KEEPS_WORDS;
    world.good = lint(KEEPS_WORDS);
    world.bad = lint(DROPS_WORDS);
  });
  Then(/^the explanation says "all 25 chosen combinations failed"$/, (world) => {
    // The compliant rendering keeps the count and the "chosen" word; the real claim check accepts it. (A
    // bare constant-vs-regex check would prove nothing, so the load-bearing assertion is the real lint run.)
    assert.equal(world.good.status, 0, `keeping the evidence words should pass the claim check\n${world.good.out}`);
  });
  And(/^it does not describe the result as tries, odds or a rate$/, (world) => {
    assert.equal(world.bad.status, 1, `reframing a chosen set as tries/odds/rate must be flagged\n${world.bad.out}`);
    assert.match(world.bad.out, /tries|odds|rate|evidence words/i, "the finding should name the evidence-words slip");
  });
}
