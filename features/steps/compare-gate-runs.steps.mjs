// Step definitions for the compare-gate-runs scenarios in features/evidence/claims-match-evidence.feature
// (issue #178). Each step drives the REAL reference script
// .claude/skills/verifiable-quality-gates/scripts/compare-gate-runs.mjs against fixtures, so the
// scenarios are executable integration tests, not prose. If the script were a no-op (always exit 0),
// the Then-steps below would throw and the scenarios would fail, which is what makes them discriminate.
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";
import assert from "node:assert/strict";

const REPO = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..");
const SCRIPT = join(REPO, ".claude/skills/verifiable-quality-gates/scripts/compare-gate-runs.mjs");

function writeRun(world, name, records) {
  if (!world.dir) world.dir = mkdtempSync(join(tmpdir(), "cgr-"));
  const p = join(world.dir, name);
  writeFileSync(p, JSON.stringify(records));
  return p;
}
function runCompare(world, extraArgs) {
  const r = spawnSync(process.execPath, [SCRIPT, "--base", world.basePath, "--changed", world.changedPath, ...extraArgs], { encoding: "utf8" });
  world.result = { status: r.status, out: r.stdout || "", err: r.stderr || "" };
  world.combined = world.result.out + world.result.err;
}

export default function ({ Given, When, Then, And }) {
  // --- Scenario: a missing status field cannot report "0 new failures" ---
  Given(/^a comparison script reads a status field that is absent from every gate record$/, (world) => {
    // Records exist and have an "exit" field, but the comparison is told to read "ok", which no record has.
    world.basePath = writeRun(world, "base.json", [{ gate: "g1", exit: 0 }, { gate: "g2", exit: 0 }]);
    world.changedPath = writeRun(world, "changed.json", [{ gate: "g1", exit: 0 }, { gate: "g2", exit: 0 }]);
    world.statusField = "ok";
  });
  When(/^it compares the base build with the changed build$/, (world) => {
    runCompare(world, ["--status-field", world.statusField]);
  });
  Then(/^it stops with an error naming the missing field$/, (world) => {
    assert.notEqual(world.result.status, 0, `expected a non-zero exit, got ${world.result.status}`);
    assert.match(world.combined, new RegExp(`"${world.statusField}"`), `error should name the missing field "${world.statusField}"`);
  });
  And(/^it does not print a count of new failures$/, (world) => {
    // The clean verdict line (the only place a "0 new failures" count is printed) must be absent.
    assert.doesNotMatch(world.combined, /OK - 0 new failures/, "a failed comparison must not print the clean 0-new-failures line");
  });

  // --- Scenario: a worsened gate that is red in both builds is reported as new ---
  Given(/^a gate fails on the base build with (\d+) problems$/, (world, n) => {
    world.basePath = writeRun(world, "base.json", [{ gate: "g1", exit: 1, problems: Number(n) }]);
  });
  And(/^the same gate fails on the changed build with (\d+) problems$/, (world, n) => {
    world.changedPath = writeRun(world, "changed.json", [{ gate: "g1", exit: 1, problems: Number(n) }]);
  });
  When(/^the agent checks the change for side effects$/, (world) => {
    runCompare(world, ["--count-field", "problems"]);
  });
  Then(/^the (\d+) extra problems are reported as new failures$/, (world, n) => {
    assert.match(world.combined, new RegExp(`\\+${n} new problems`), `expected the report to name +${n} new problems`);
  });
  And(/^the change is not called clean until they are explained or fixed$/, (world) => {
    assert.notEqual(world.result.status, 0, "a worsened gate must make the comparison exit non-zero");
    assert.doesNotMatch(world.combined, /OK - 0 new failures/, "a worsened gate must not be reported as clean");
    assert.match(world.combined, /not clean/i, "the report should state the change is not clean");
  });
}
