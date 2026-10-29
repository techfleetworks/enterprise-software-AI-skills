// Step definitions for the #180 scenarios in features/evidence/claims-match-evidence.feature.
// Each step drives the REAL claim-lint.mjs against fixtures, so the scenarios execute. A no-op claim-lint
// (always exit 0) would flip the "flagged" assertions and fail these scenarios.
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";
import assert from "node:assert/strict";

const REPO = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..");
const CLAIM_LINT = join(REPO, ".claude/skills/skeptical-audit/scripts/claim-lint.mjs");

function lint(text) {
  const dir = mkdtempSync(join(tmpdir(), "cl180-"));
  const f = join(dir, "draft.md");
  writeFileSync(f, text);
  const r = spawnSync(process.execPath, [CLAIM_LINT, f, "--strict"], { encoding: "utf8" });
  return { status: r.status, out: (r.stdout || "") + (r.stderr || "") };
}

export default function ({ Given, When, Then, And }) {
  // --- Scenario: observe which part owns a behavior before building ---
  Given(/^the agent plans a change that relies on module A handling input X$/, (world) => { world.plan = "module A handles X"; });
  When(/^it has not searched for the owner of X and run X through the system$/, (world) => {
    world.result = lint("The plan assumes module A owns the keep-that-secret request.");
  });
  Then(/^the edit is held$/, (world) => { assert.equal(world.result.status, 1, `an ungrounded ownership assumption must be flagged\n${world.result.out}`); });
  And(/^the agent is told to record the observed owner before editing$/, (world) => { assert.match(world.result.out, /observe|owner/i, "the finding should ask for the observed owner"); });

  // --- Scenario: the headline is the metric declared before measuring ---
  Given(/^the agent measured confident-wrong answers in 3 ways: 35%, 6\.2% and 3\.0%$/, (world) => { world.cuts = ["35%", "6.2%", "3.0%"]; });
  And(/^it declared 6\.2% as the headline before it measured$/, (world) => { world.headline = "6.2%"; });
  When(/^it reports to the operator$/, (world) => {
    world.good = lint("Headline (declared before measuring): 6.2% genuine-wrong. Cuts: 35% all, 6.2% clean, 3.0% strict.");
    world.bad = lint("I headlined the most favorable cut (3.0%).");
  });
  Then(/^6\.2% is the headline$/, (world) => { assert.equal(world.good.status, 0, `a predeclared headline with every cut shown should pass\n${world.good.out}`); });
  And(/^all 3 numbers appear with what each one counts$/, (world) => { assert.equal(world.bad.status, 1, `headlining the most favorable cut must be flagged\n${world.bad.out}`); });

  // --- Scenario: a work item with mostly inferred evidence cannot be done ---
  Given(/^a status row whose evidence is 12 observed records and 47 inferred records$/, (world) => {
    world.result = lint("The audit row is done. Evidence: 12 observed records and 47 inferred records.");
  });
  When(/^the agent marks the row "done"$/, () => { /* the Given already produced the report + ran the check */ });
  // "Then the mark is refused" is a shared step (defined in fixed-verified.steps.mjs): it asserts
  // world.result.status === 1, which the Given above already set by linting the done-on-inferred report.
  And(/^the row shows "12 of 59 observed"$/, (world) => { assert.match(world.result.out, /12 observed|12 of|observed/i, "the finding should surface the observed count"); });

  // --- Scenario: a downgrade names its next step ---
  Given(/^the agent downgrades a claim from "observed" to "not-assessed"$/, (world) => { world.downgrade = true; });
  When(/^it reports the downgrade$/, (world) => {
    world.result = lint("I downgraded the uptime claim to not-assessed.");
    world.good = lint("I downgraded uptime to not-assessed. Next step: run the 24h soak (owner: me) to raise it.");
  });
  Then(/^the report names the measurement that would raise it and who will take it$/, (world) => {
    assert.equal(world.result.status, 1, `a downgrade with no next step must be flagged\n${world.result.out}`);
    assert.match(world.result.out, /next step/i, "the finding should ask for the next step");
  });
  And(/^the downgrade is not the last line of the work$/, (world) => { assert.equal(world.good.status, 0, `a downgrade that names its next step should pass\n${world.good.out}`); });

  // --- Scenario: a comparison claim needs a measurement ---
  Given(/^the agent writes that approach A is safer than approach B$/, (world) => { world.draft = "Approach A is safer than approach B."; });
  And(/^it cites no measurement comparing them$/, (world) => { world.cited = false; });
  When(/^the claim check runs on the report$/, (world) => { world.result = lint(world.draft); });
  Then(/^the sentence is flagged as an untagged claim$/, (world) => {
    assert.equal(world.result.status, 1, `an unmeasured comparison must be flagged\n${world.result.out}`);
    assert.match(world.result.out, /evidence state|claim/i, "it should be flagged as an untagged claim");
  });
}
