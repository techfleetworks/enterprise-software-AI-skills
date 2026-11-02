// Step definitions for features/always-on/pattern-decision-citations.feature (v1.4 WP2, spec R2.12).
// Drives the REAL always-on/check-task-plan.mjs in plan mode against a throwaway skills dir, with or without the
// pattern-selector page registry installed, so a plan check that stopped reading the record's citations turns
// the held cases green-to-red.
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";
import assert from "node:assert/strict";

const REPO = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..");
const CLI = join(REPO, "always-on/check-task-plan.mjs");
const SKILL = join(REPO, ".claude/skills/pattern-selector");

// A skills dir holding only pattern-selector; with the registry and its reader when installed is true.
function skillsDir(installed) {
  const dir = join(mkdtempSync(join(tmpdir(), "pdc-")), "skills");
  mkdirSync(join(dir, "pattern-selector"), { recursive: true });
  writeFileSync(join(dir, "pattern-selector", "SKILL.md"), "# pattern-selector\n");
  if (installed) {
    for (const [sub, file] of [["scripts", "poeaa-registry.mjs"], ["references", "poeaa-registry.json"]]) {
      mkdirSync(join(dir, "pattern-selector", sub), { recursive: true });
      writeFileSync(join(dir, "pattern-selector", sub, file), readFileSync(join(SKILL, sub, file)));
    }
  }
  return dir;
}

// Every field the plan check requires, with real content; the scenario sets the decision and the verify step.
const record = (decision) => ({
  forces: "two callers load the same order and save it in one request", forcesEvidence: "[observed] src/orders.ts:12 and :40",
  lifetimeForces: "more callers are planned", costOfDeferring: "each new caller copies the query", decision,
  pros: "one place owns the query", cons: "one more layer", failurePrevented: "queries copied across callers",
  securityTradeoff: "one place to apply row-level filters", operationalCost: "none notable",
  simplerAlternative: "a plain function per query", adoptSafely: "wrap the existing calls first",
  verify: "a unit test of the repository", verificationStatus: "not-assessed",
});

export default function ({ Given, When, Then, And }) {
  Given(/^the PoEAA page registry is installed$/, (world) => { world.skillsDir = skillsDir(true); });
  Given(/^the installed skills have no PoEAA page registry$/, (world) => { world.skillsDir = skillsDir(false); });
  And(/^(?:a|a complete) pattern decision whose decision is "([^"]+)"$/, (world, decision) => { world.record = record(decision); });
  And(/^its verify field names the kit item for Repository$/, (world) => {
    world.record.verify = "the arch-gate rule poeaa-repository from the prove-it kit (v1.4 WP9)";
  });
  When(/^the plan is checked$/, (world) => {
    const dir = mkdtempSync(join(tmpdir(), "pdc-plan-"));
    const sel = join(dir, "selection.json");
    const plans = join(dir, "plans.json");
    writeFileSync(sel, JSON.stringify({ "pattern-selector": { verdict: "required", reason: "a repository changes" } }));
    writeFileSync(plans, JSON.stringify({ "pattern-decision": world.record }));
    const r = spawnSync(process.execPath, [CLI, "plan", "--selection", sel, "--plans", plans, "--skills-dir", world.skillsDir], { encoding: "utf8" });
    world.result = { code: r.status, out: (r.stdout || "") + (r.stderr || "") };
  });
  Then(/^the check holds and names "([^"]+)"$/, (world, problem) => {
    assert.equal(world.result.code, 2, world.result.out);
    assert.ok(world.result.out.includes(problem), world.result.out);
  });
  Then(/^the check passes$/, (world) => assert.equal(world.result.code, 0, world.result.out));
  And(/^it prints "([^"]+)"$/, (world, text) => assert.ok(world.result.out.includes(text), world.result.out));
  And(/^the notice says to refresh the skills$/, (world) => assert.match(world.result.out, /Refresh the skills/));
}
