// Step definitions for the #179 scenarios in features/evidence/claims-match-evidence.feature.
// Each step drives a REAL script - claim-lint.mjs (the fixed/suite/unexplained-pass rules) or
// check-open-high-findings.mjs (HIGH blocks done) - against fixtures, so the scenarios are executable
// integration tests. A no-op in either script would flip the Then-assertions and fail the scenario.
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";
import assert from "node:assert/strict";

const REPO = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..");
const CLAIM_LINT = join(REPO, ".claude/skills/skeptical-audit/scripts/claim-lint.mjs");
const OPEN_HIGH = join(REPO, ".claude/skills/judge-arch/scripts/check-open-high-findings.mjs");

function tmp(name, text) {
  const dir = mkdtempSync(join(tmpdir(), "cl179-"));
  const p = join(dir, name);
  writeFileSync(p, text);
  return p;
}
function claimLint(world, text) {
  const r = spawnSync(process.execPath, [CLAIM_LINT, tmp("draft.md", text), "--strict"], { encoding: "utf8" });
  world.result = { status: r.status, out: (r.stdout || "") + (r.stderr || "") };
  return world.result;
}

export default function ({ Given, When, Then, And }) {
  // --- Scenario: a defect is not fixed until a revert turns a committed test red ---
  Given(/^the agent changed code to fix a reported defect$/, (world) => { world.defect = true; });
  And(/^no committed test fails when that change is reverted$/, (world) => { world.hasRevertRecord = false; });
  When(/^the agent marks the defect "fixed"$/, (world) => { claimLint(world, "The reported login defect is fixed."); });
  Then(/^the mark is refused$/, (world) => { assert.equal(world.result.status, 1, `expected claim-lint to flag the fixed claim\n${world.result.out}`); });
  And(/^the agent is told to add a test that fails on the reverted code$/, (world) => { assert.match(world.result.out, /revert/i, "the finding should ask for a revert record"); });

  // --- Scenario: a passing suite does not prove a behavior it never tests ---
  Given(/^the agent claims year answers work$/, (world) => { world.claim = "year answers work"; });
  And(/^no case in the passing suite uses an event noun with a full day-month-year date$/, (world) => { world.uncovered = "full day-month-year date"; });
  When(/^the agent reports the claim$/, (world) => { claimLint(world, "Year answers work; the 75-case suite passes."); });
  Then(/^the claim names the cases that cover it$/, (world) => {
    assert.equal(world.result.status, 1, `a suite-backed claim with no named cases must be flagged\n${world.result.out}`);
    assert.match(world.result.out, /cases/i, "the finding should ask the claim to name its covering cases");
  });
  And(/^the uncovered shape is listed as not checked$/, (world) => {
    // A claim that DOES name its cases and lists the not-checked shapes is accepted.
    const good = claimLint(world, "Year answers work (cases: full date, partial date; not-checked: time-only).\nThe 75-case suite passes.");
    assert.equal(good.status, 0, `naming cases + not-checked shapes should satisfy the rule\n${good.out}`);
  });

  // --- Scenario: an unexplained pass is attributed before it counts ---
  Given(/^a test that failed before the change now passes$/, (world) => { world.wasFailing = true; });
  And(/^no edit in the change was aimed at that test's behavior$/, (world) => { world.targeted = false; });
  When(/^the agent reports the test as fixed$/, (world) => { claimLint(world, "The year test now passes."); });
  Then(/^it must first revert each edit in turn and name the one that turns the test red again$/, (world) => {
    assert.equal(world.result.status, 1, `an unexplained pass must be flagged until attributed\n${world.result.out}`);
    assert.match(world.result.out, /revert/i, "the finding should require a revert attribution");
  });

  // --- Scenario: a HIGH review finding blocks "done" ---
  Given(/^a fresh-context review returned 1 HIGH finding$/, (world) => {
    world.logPath = tmp("log.jsonl", JSON.stringify({ change: "w", findings: [{ severity: "high", where: "mask.mjs", finding: "a secret reaches a second output channel" }] }) + "\n");
  });
  And(/^the finding is neither fixed nor waived by the operator$/, (world) => { world.resolved = false; });
  When(/^the agent calls the work done$/, (world) => {
    const r = spawnSync(process.execPath, [OPEN_HIGH, "--log", world.logPath], { encoding: "utf8" });
    world.result = { status: r.status, out: (r.stdout || "") + (r.stderr || "") };
  });
  Then(/^the work is not marked done$/, (world) => { assert.equal(world.result.status, 1, `an open HIGH finding must block done\n${world.result.out}`); });
  And(/^the open HIGH finding is shown to the operator$/, (world) => { assert.match(world.result.out, /mask\.mjs|secret reaches a second output channel/, "the open HIGH finding should be named"); });
}
