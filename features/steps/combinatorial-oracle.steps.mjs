// Step definitions for the #182 scenarios in features/evidence/claims-match-evidence.feature.
// Scenario 1 drives the REAL coverage-measure.mjs (a hand-picked grid vs a covering array); scenario 2 drives
// the REAL leak-check.mjs on the two audit cases, and contrasts it with a naive substring check that gets both
// wrong. A no-op coverage-measure (always exit 0) flips the hand-picked-grid assertion, and a no-op leak-check
// flips the variant/substring assertions, so both scenarios execute against real behavior.
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";
import assert from "node:assert/strict";

const REPO = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..");
const COVERAGE = join(REPO, ".claude/skills/comprehensive-test-strategy/scripts/coverage-measure.mjs");
const LEAK = join(REPO, ".claude/skills/comprehensive-test-strategy/scripts/leak-check.mjs");

function runFile(script, contents, args) {
  const dir = mkdtempSync(join(tmpdir(), "cl182-"));
  const f = join(dir, "input");
  writeFileSync(f, contents);
  const r = spawnSync(process.execPath, [script, f, ...args], { encoding: "utf8" });
  return { status: r.status, out: (r.stdout || "") + (r.stderr || "") };
}
const measure = (plan) => runFile(COVERAGE, JSON.stringify(plan), []);
function leak(outputText, secret) {
  const dir = mkdtempSync(join(tmpdir(), "cl182l-"));
  const f = join(dir, "out.txt");
  writeFileSync(f, outputText);
  const r = spawnSync(process.execPath, [LEAK, "--secret", secret, f], { encoding: "utf8" });
  return { status: r.status, out: (r.stdout || "") + (r.stderr || "") };
}

// The interaction model: a leak happens only when a secret is present AND a "keep that secret" instruction is
// present. Three binary factors (secret, instruction, order) make a small pairwise space.
const FACTORS = { secret: ["present", "absent"], instruction: ["present", "absent"], order: ["secret-first", "instruction-first"] };
const COVERING_ARRAY = [
  { secret: "present", instruction: "present", order: "secret-first" },
  { secret: "present", instruction: "absent", order: "instruction-first" },
  { secret: "absent", instruction: "present", order: "instruction-first" },
  { secret: "absent", instruction: "absent", order: "secret-first" },
];
const HANDPICKED_GRID = [
  { secret: "present", instruction: "present", order: "secret-first" },
  { secret: "absent", instruction: "absent", order: "instruction-first" },
];

export default function ({ Given, When, Then, And }) {
  // --- Scenario: a two-input defect is tested with a covering array ---
  Given(/^a leak happens only when a secret and a later "keep that secret" appear together$/, (world) => {
    world.factors = FACTORS;
  });
  When(/^the agent designs the test that verifies the fix$/, (world) => {
    world.array = measure({ factors: world.factors, strength: 2, rows: COVERING_ARRAY });
    world.grid = measure({ factors: world.factors, strength: 2, rows: HANDPICKED_GRID });
  });
  Then(/^the test lists every factor and its values$/, (world) => {
    for (const name of Object.keys(FACTORS)) {
      assert.match(world.array.out, new RegExp(name), `the plan must list factor "${name}"\n${world.array.out}`);
    }
  });
  And(/^it uses a covering array of a stated strength$/, (world) => {
    // The covering array reports full strength-2 coverage (exit 0); the hand-picked grid does not (exit 1).
    assert.equal(world.array.status, 0, `the covering array must reach full pairwise coverage\n${world.array.out}`);
    assert.equal(world.grid.status, 1, `a hand-picked grid must measure as less than a covering array\n${world.grid.out}`);
    assert.match(world.array.out, /strength 2/);
  });
  And(/^it reports the measured share of combinations covered$/, (world) => {
    assert.match(world.array.out, /\d+ of \d+ .*combinations covered \(\d/, `the share must be reported\n${world.array.out}`);
    assert.match(world.grid.out, /6 of 12/, `the hand-picked grid's measured share must be reported\n${world.grid.out}`);
  });

  // --- Scenario: the leak checker is itself tested before "0 leaks" ---
  Given(/^a leak checker compares output text with secret values$/, (world) => { world.ready = true; });
  When(/^the agent claims "0 leaks"$/, (world) => {
    world.variant = leak("We contacted Dr Example about the record.", "Dr. Example"); // punctuation variant
    world.substring = leak("The round was 175k invested last year.", "75k");          // one value inside another
    world.empty = leak("", "Dr. Example");                                            // empty input
    // A naive substring checker gets both audit cases wrong (misses the variant, false-alarms on the substring).
    world.naiveMissesVariant = "We contacted Dr Example about the record.".includes("Dr. Example"); // false
    world.naiveFalseAlarms = "The round was 175k invested last year.".includes("75k");              // true
  });
  Then(/^the checker has passing tests for punctuation variants and for one value inside another$/, (world) => {
    assert.equal(world.variant.status, 1, `the checker must catch the punctuation-variant leak\n${world.variant.out}`);
    assert.equal(world.substring.status, 0, `the checker must not flag one value inside a larger one\n${world.substring.out}`);
  });
  And(/^the claim is refused if those tests are missing$/, (world) => {
    // Empty input is clean (defined, safe), and a naive checker without these tests would be wrong both ways,
    // so its "0 leaks" is not trustworthy; the tested checker is what earns the claim.
    assert.equal(world.empty.status, 0, `empty output must be clean\n${world.empty.out}`);
    assert.equal(world.naiveMissesVariant, false, "a naive substring checker would MISS the variant leak");
    assert.equal(world.naiveFalseAlarms, true, "a naive substring checker would FALSE-ALARM on the substring");
  });
}
