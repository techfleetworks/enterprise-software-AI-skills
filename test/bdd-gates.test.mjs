// Discriminating tests for the BDD gate scripts (check-gherkin-valid, check-bdd-tags,
// check-bdd-coverage) and the datastore generator. Each builds a throwaway features/ dir, runs the
// REAL script against it, and asserts the exit code — including the failing cases that prove the gate
// actually detects (reverting a gate to a no-op flips these from fail to pass).
import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtempSync, writeFileSync, mkdirSync, appendFileSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const REPO = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const S = (name) => resolve(REPO, "bdd-comprehensive-testing/scripts", name);

const VALID = `Feature: Widget

  @audience:customer @usecase:create @category:happy @quality:functional @severity:high
  Scenario: create a widget
    Given a user
    When they create a widget
    Then it exists

  @audience:customer @usecase:create-invalid @category:error @quality:functional @severity:high
  Scenario: create fails on bad input
    Given a user
    When they submit bad input
    Then they see an error
`;

// Build a features/ dir; returns its path. generate=true produces the committed datastore.
function features(featureText, { config = { audiences: ["customer"] }, log = "## 2026-10-10 x\n- event: added\n", generate = true } = {}) {
  const root = mkdtempSync(join(tmpdir(), "bdd-"));
  mkdirSync(join(root, "sub"), { recursive: true });
  writeFileSync(join(root, "sub", "f.feature"), featureText);
  if (config) writeFileSync(join(root, "bdd-config.json"), JSON.stringify(config));
  if (log) writeFileSync(join(root, "bdd-coverage-log.md"), log);
  if (generate) run(S("bdd-index-generate.mjs"), [root]); // produce in-sync datastore
  return root;
}

function run(script, args, env = {}) {
  const r = spawnSync(process.execPath, [script, ...args], { encoding: "utf8", env: { ...process.env, ...env } });
  return { status: r.status, out: (r.stdout || "") + (r.stderr || "") };
}

// --- check-gherkin-valid -----------------------------------------------------
test("gherkin-valid: passes clean feature files", () => {
  assert.equal(run(S("check-gherkin-valid.mjs"), [features(VALID)]).status, 0);
});
test("gherkin-valid: FLAGS malformed Gherkin (discriminating)", () => {
  // A step line with no Feature above it is a hard parse error in the official parser.
  const bad = "Given something at the top level with no Feature\n";
  assert.equal(run(S("check-gherkin-valid.mjs"), [features(bad, { generate: false })]).status, 1);
});
test("gherkin-valid: fails closed on zero feature files", () => {
  assert.equal(run(S("check-gherkin-valid.mjs"), [mkdtempSync(join(tmpdir(), "empty-"))]).status, 1);
});

// --- check-bdd-tags ----------------------------------------------------------
test("tags: passes fully, validly tagged scenarios", () => {
  assert.equal(run(S("check-bdd-tags.mjs"), [features(VALID)]).status, 0);
});
test("tags: FLAGS a missing dimension (discriminating)", () => {
  const noCat = VALID.replace(" @category:happy", "");
  assert.equal(run(S("check-bdd-tags.mjs"), [features(noCat, { generate: false })]).status, 1);
});
test("tags: FLAGS an out-of-vocabulary value (discriminating)", () => {
  const bad = VALID.replace("@category:happy", "@category:bogus");
  assert.equal(run(S("check-bdd-tags.mjs"), [features(bad, { generate: false })]).status, 1);
});

// --- check-bdd-coverage ------------------------------------------------------
test("coverage: passes a complete, in-sync example", () => {
  assert.equal(run(S("check-bdd-coverage.mjs"), [features(VALID)]).status, 0);
});
test("coverage: FLAGS a happy-path-only feature (discriminating)", () => {
  const happyOnly = `Feature: Widget\n\n  @audience:customer @usecase:create @category:happy @quality:functional @severity:high\n  Scenario: create\n    Given a user\n    When they create\n    Then it exists\n`;
  assert.equal(run(S("check-bdd-coverage.mjs"), [features(happyOnly)]).status, 1);
});
test("coverage: FLAGS datastore drift (discriminating)", () => {
  const root = features(VALID); // generates an in-sync index first
  appendFileSync(join(root, "sub", "f.feature"),
    "\n  @audience:customer @usecase:extra @category:edge @quality:functional @severity:low\n  Scenario: extra\n    Given a user\n    When x\n    Then y\n");
  assert.equal(run(S("check-bdd-coverage.mjs"), [root]).status, 1); // index now stale
});
test("coverage: FLAGS an uncovered declared audience (discriminating)", () => {
  const root = features(VALID, { config: { audiences: ["customer", "admin"] } });
  assert.equal(run(S("check-bdd-coverage.mjs"), [root]).status, 1); // no admin scenario
});
test("coverage: FLAGS a non-append (edited history) log (discriminating)", () => {
  const root = features(VALID);
  const base = join(tmpdir(), "base-" + Date.now() + ".md");
  // base has content the current log does NOT start with → history was rewritten
  writeFileSync(base, "## DIFFERENT earlier entry\n- event: added\n" + readFileSync(join(root, "bdd-coverage-log.md"), "utf8"));
  assert.equal(run(S("check-bdd-coverage.mjs"), [root], { BDD_LOG_BASE: base }).status, 1);
});
test("coverage: FLAGS an unknown log event (discriminating)", () => {
  const root = features(VALID, { log: "## 2026-10-10 x\n- event: bogusevent\n" });
  assert.equal(run(S("check-bdd-coverage.mjs"), [root]).status, 1);
});

// --- check-bdd-executed (the suite actually ran) -----------------------------
function writeReport(elements, uri = "sub/f.feature") {
  const p = join(mkdtempSync(join(tmpdir(), "rep-")), "cucumber.json");
  writeFileSync(p, JSON.stringify([{ uri, name: "Widget", elements }]));
  return p;
}
const passed = (n) => ({ type: "scenario", name: n, steps: [{ result: { status: "passed" } }] });
const BOTH = ["create a widget", "create fails on bad input"];

test("executed: passes when every datastore scenario ran and passed", () => {
  const root = features(VALID);
  const rep = writeReport(BOTH.map(passed));
  assert.equal(run(S("check-bdd-executed.mjs"), [root, "--results", rep]).status, 0);
});
test("executed: FLAGS a scenario that never ran (discriminating)", () => {
  const root = features(VALID);
  const rep = writeReport([passed("create a widget")]); // second scenario missing from the run
  assert.equal(run(S("check-bdd-executed.mjs"), [root, "--results", rep]).status, 1);
});
test("executed: FLAGS a failed scenario (discriminating)", () => {
  const root = features(VALID);
  const rep = writeReport([passed("create a widget"),
    { type: "scenario", name: "create fails on bad input", steps: [{ result: { status: "failed" } }] }]);
  assert.equal(run(S("check-bdd-executed.mjs"), [root, "--results", rep]).status, 1);
});
test("executed: FLAGS an undefined step (discriminating)", () => {
  const root = features(VALID);
  const rep = writeReport([passed("create a widget"),
    { type: "scenario", name: "create fails on bad input", steps: [{ result: { status: "undefined" } }] }]);
  assert.equal(run(S("check-bdd-executed.mjs"), [root, "--results", rep]).status, 1);
});
test("executed: fails closed with no results report", () => {
  assert.equal(run(S("check-bdd-executed.mjs"), [features(VALID)]).status, 1);
});
test("executed: FLAGS a cross-feature name collision where one feature never ran (discriminating)", () => {
  // Two features, same scenario name in each; only alpha's ran. Matching by bare name would credit
  // beta's as passed (the false-green bug); matching by feature+scenario must flag beta.
  const root = mkdtempSync(join(tmpdir(), "bdd-"));
  const scen = (uc) => `  @audience:customer @usecase:${uc} @category:happy @quality:functional @severity:high\n  Scenario: shared name\n    Given a user\n    When x\n    Then y\n`;
  mkdirSync(join(root, "alpha"), { recursive: true });
  mkdirSync(join(root, "beta"), { recursive: true });
  writeFileSync(join(root, "alpha", "a.feature"), "Feature: A\n\n" + scen("a-shared"));
  writeFileSync(join(root, "beta", "b.feature"), "Feature: B\n\n" + scen("b-shared"));
  run(S("bdd-index-generate.mjs"), [root]);
  const rep = join(mkdtempSync(join(tmpdir(), "rep-")), "cucumber.json");
  writeFileSync(rep, JSON.stringify([{ uri: "alpha/a.feature", name: "A", elements: [passed("shared name")] }]));
  assert.equal(run(S("check-bdd-executed.mjs"), [root, "--results", rep]).status, 1);
});

// --- fail-closed on a present-but-malformed config ---------------------------
test("tags: FLAGS a present-but-malformed bdd-config.json (fail closed, discriminating)", () => {
  const root = features(VALID, { config: null, generate: false });
  writeFileSync(join(root, "bdd-config.json"), '{"audiences":["customer"'); // truncated JSON
  assert.equal(run(S("check-bdd-tags.mjs"), [root]).status, 1);
});
test("coverage: FLAGS a present-but-malformed bdd-config.json (fail closed, discriminating)", () => {
  const root = features(VALID);
  writeFileSync(join(root, "bdd-config.json"), "{bad json");
  assert.equal(run(S("check-bdd-coverage.mjs"), [root]).status, 1);
});
test("coverage: FLAGS an unreadable BDD_LOG_BASE when required (discriminating)", () => {
  // base path set but missing + required → must fail, not falsely report "verified"
  const root = features(VALID);
  const missing = join(tmpdir(), "no-base-" + Date.now() + ".md");
  assert.equal(run(S("check-bdd-coverage.mjs"), [root], { BDD_LOG_BASE: missing, BDD_REQUIRE_LOG_BASE: "1" }).status, 1);
});
test("executed: FLAGS a path-suffix feature collision (deeper run must not credit the shallower, discriminating)", () => {
  // root a.feature and sub/a.feature both have "shared name"; only sub ran. A suffix match would
  // credit the root feature off sub's run; longest-match attribution must flag root as never-run.
  const root = mkdtempSync(join(tmpdir(), "bdd-"));
  const scen = (uc) => `  @audience:customer @usecase:${uc} @category:happy @quality:functional @severity:high\n  Scenario: shared name\n    Given a user\n    When x\n    Then y\n`;
  mkdirSync(join(root, "sub"), { recursive: true });
  writeFileSync(join(root, "a.feature"), "Feature: Root\n\n" + scen("root-shared"));
  writeFileSync(join(root, "sub", "a.feature"), "Feature: Sub\n\n" + scen("sub-shared"));
  run(S("bdd-index-generate.mjs"), [root]);
  const rep = join(mkdtempSync(join(tmpdir(), "rep-")), "cucumber.json");
  writeFileSync(rep, JSON.stringify([{ uri: "sub/a.feature", name: "Sub", elements: [passed("shared name")] }]));
  assert.equal(run(S("check-bdd-executed.mjs"), [root, "--results", rep]).status, 1);
});
