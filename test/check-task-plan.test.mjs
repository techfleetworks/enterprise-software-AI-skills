// Discriminating tests for always-on/check-task-plan.mjs (issue #175, PR-A: selection + load).
// A no-op validator (always exit 0) flips every HOLD case below.
import { test } from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { writeFileSync, mkdirSync, mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { createHash } from "node:crypto";

const REPO = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const CLI = join(REPO, "always-on", "check-task-plan.mjs");
const sha256 = (buf) => createHash("sha256").update(buf).digest("hex");

// A sandbox skills dir with the given skills, and the sha256 of each SKILL.md (for the load-state).
const SKILLS = ["architectural-decision-records", "release-deployment-safety", "compliance-data-lifecycle", "comprehensive-test-strategy", "bdd-comprehensive-testing", "owasp-secure-coding-bdd"];
function sandbox() {
  const base = mkdtempSync(join(tmpdir(), "task-plan-"));
  const skillsDir = join(base, "skills");
  const hashes = {};
  for (const name of SKILLS) {
    mkdirSync(join(skillsDir, name), { recursive: true });
    const text = `# ${name}\n\n## The core rule\n\nSome guidance for ${name} with enough words here.\n`;
    writeFileSync(join(skillsDir, name, "SKILL.md"), text);
    hashes[name] = sha256(Buffer.from(text, "utf8"));
  }
  return { base, skillsDir, hashes };
}
// A valid baseline selection: every skill "applies" with a reason.
function baseSelection() {
  const sel = {};
  for (const name of SKILLS) sel[name] = { verdict: "applies", reason: `relevant to this task (${name})` };
  return sel;
}
function writeJson(dir, name, obj) { const p = join(dir, name); writeFileSync(p, JSON.stringify(obj)); return p; }
function run(args) {
  try { return { code: 0, out: execFileSync(process.execPath, [CLI, ...args], { encoding: "utf8" }) }; }
  catch (e) { return { code: e.status ?? 1, out: (e.stdout || "") + (e.stderr || "") }; }
}
function selection(sb, sel, extra = []) {
  const p = writeJson(sb.base, "selection.json", sel);
  return run(["selection", "--selection", p, "--skills-dir", sb.skillsDir, ...extra]);
}

test("selection: a full, reasoned selection passes (exit 0)", () => {
  const sb = sandbox();
  const r = selection(sb, baseSelection());
  assert.equal(r.code, 0, r.out);
  assert.match(r.out, /covers all/);
});

test("selection: an omitted skill is an empty cell and HOLDS (exit 2), named - discriminating", () => {
  const sb = sandbox();
  const sel = baseSelection();
  delete sel["compliance-data-lifecycle"];
  const r = selection(sb, sel);
  assert.equal(r.code, 2, r.out);
  assert.match(r.out, /compliance-data-lifecycle/);
  assert.match(r.out, /empty cell|no verdict/);
});

test("selection: an applies/not-applicable with no reason HOLDS (exit 2)", () => {
  const sb = sandbox();
  const sel = baseSelection();
  sel["bdd-comprehensive-testing"] = { verdict: "not-applicable" }; // no reason
  const r = selection(sb, sel);
  assert.equal(r.code, 2, r.out);
  assert.match(r.out, /no reason/);
});

test("selection: an invalid verdict HOLDS (exit 2)", () => {
  const sb = sandbox();
  const sel = baseSelection();
  sel["owasp-secure-coding-bdd"] = { verdict: "maybe", reason: "x" };
  assert.equal(selection(sb, sel).code, 2);
});

test("selection: a router-required skill marked not-applicable cannot be self-waived (exit 2) - discriminating", () => {
  const sb = sandbox();
  const sel = baseSelection();
  sel["architectural-decision-records"] = { verdict: "not-applicable", reason: "I think it is fine" };
  const r = selection(sb, sel, ["--changed-list", "db/migrations/0001_init.sql"]);
  assert.equal(r.code, 2, r.out);
  assert.match(r.out, /architectural-decision-records/);
  assert.match(r.out, /only the operator can waive/);
});

test("selection: an operator waiver frees a router-required skill (exit 0)", () => {
  const sb = sandbox();
  const sel = baseSelection();
  sel["architectural-decision-records"] = { verdict: "not-applicable", reason: "waived by operator for this task" };
  const r = selection(sb, sel, ["--changed-list", "db/migrations/0001_init.sql", "--waivers", "architectural-decision-records"]);
  assert.equal(r.code, 0, r.out);
});

test("selection: 'unsure' is expressed as applies-with-a-reason and is accepted (exit 0)", () => {
  const sb = sandbox();
  const sel = baseSelection();
  sel["compliance-data-lifecycle"] = { verdict: "applies", reason: "unsure whether personal data is touched, so applying it" };
  assert.equal(selection(sb, sel).code, 0);
});

// --- loaded ---
function loaded(sb, sel, state) {
  const sp = writeJson(sb.base, "selection.json", sel);
  const lp = writeJson(sb.base, "loaded.json", state);
  return run(["loaded", "--selection", sp, "--loaded", lp, "--skills-dir", sb.skillsDir]);
}

test("loaded: every required/applies skill loaded with its current hash passes (exit 0)", () => {
  const sb = sandbox();
  const r = loaded(sb, baseSelection(), sb.hashes);
  assert.equal(r.code, 0, r.out);
});

test("loaded: an applies skill never loaded HOLDS (exit 2), named - discriminating", () => {
  const sb = sandbox();
  const state = { ...sb.hashes };
  delete state["verifiable-quality-gates"]; // not in sandbox anyway; remove a real one:
  delete state["comprehensive-test-strategy"];
  const r = loaded(sb, baseSelection(), state);
  assert.equal(r.code, 2, r.out);
  assert.match(r.out, /comprehensive-test-strategy/);
  assert.match(r.out, /not loaded this session/);
});

test("loaded: a stale delivery (old hash) does not count as loaded (exit 2)", () => {
  const sb = sandbox();
  const state = { ...sb.hashes, "owasp-secure-coding-bdd": "0".repeat(64) };
  const r = loaded(sb, baseSelection(), state);
  assert.equal(r.code, 2, r.out);
  assert.match(r.out, /owasp-secure-coding-bdd/);
});

test("loaded: a not-applicable skill need not be loaded (exit 0)", () => {
  const sb = sandbox();
  const sel = baseSelection();
  sel["owasp-secure-coding-bdd"] = { verdict: "not-applicable", reason: "no security surface" };
  const state = { ...sb.hashes };
  delete state["owasp-secure-coding-bdd"]; // not loaded, but not-applicable -> fine
  assert.equal(loaded(sb, sel, state).code, 0);
});

// --- plan (step 3) ---
const RECORD_SKILLS = [
  "pattern-selector", "owasp-secure-coding-bdd", "bdd-comprehensive-testing", "architectural-decision-records",
  "compliance-data-lifecycle", "release-deployment-safety", "sre-operational-readiness",
  "universal-accessibility-wcag", "universal-browser-device-support", "usability-ux-universal-design",
  "enterprise-architecture-standards",
];
function planSelection() { const s = {}; for (const n of RECORD_SKILLS) s[n] = { verdict: "applies", reason: "x" }; return s; }
function writeAdr(dir) {
  const p = join(dir, "adr.md");
  writeFileSync(p, `---\nstatus: "accepted"\n---\n# Test ADR\n## Context and Problem Statement\nwhy\n## Considered Options\n- a\n- b\n## Decision\nd\n## Consequences\n- good and bad\n`);
  return p;
}
function buildPlans(adrPath) {
  return {
    "pattern-decision": { forces: "f", forcesEvidence: "[observed]", lifetimeForces: "lf", costOfDeferring: "c", decision: "d", pros: "p", cons: "co", failurePrevented: "fp", securityTradeoff: "s", operationalCost: "o", simplerAlternative: "sa", adoptSafely: "as", verify: "v", verificationStatus: "not-assessed" },
    "threat-model": { surface: "the value kept secret", threats: [{ name: "second channel", category: "Information Disclosure", cheatSheet: "Logging", control: "redact before log", scenario: "@security leak blocked" }] },
    "bdd-matrix": { audiences: ["agent"], cells: [{ useCase: "year-answer", audience: "agent", scenario: "@... year works" }] },
    "adr": { path: adrPath },
    "data-lifecycle": { dataClass: "health condition", retentionBasis: "consent", deletion: { claim: "cascade reaches every store", evidenceState: "observed" } },
    "reversibility": { reversibility: { claim: "expand/contract migration", evidenceState: "observed" } },
    "service-readiness": { slis: ["latency"], alerts: ["p99"], runbook: "runbook.md", alertFires: { evidenceState: "proven" } },
    "a11y-verdict": { claim: "axe clean", evidenceState: "observed" },
    "browser-verdict": { claim: "matrix pass", evidenceState: "observed" },
    "usability-verdict": { claim: "5-user test", evidenceState: "observed" },
    "arch-standards": { standards: ["layering"], claims: [{ claim: "handles 1k rps", measurement: "load-test.json" }] },
  };
}
function planCheck(sb, sel, plans) {
  const sp = writeJson(sb.base, "selection.json", sel);
  const pp = writeJson(sb.base, "plans.json", plans);
  return run(["plan", "--selection", sp, "--plans", pp, "--skills-dir", sb.skillsDir]);
}

test("plan: a full, complete set of planning records passes (exit 0)", () => {
  const sb = sandbox();
  const r = planCheck(sb, planSelection(), buildPlans(writeAdr(sb.base)));
  assert.equal(r.code, 0, r.out);
});

test("plan: a required planning record that is missing HOLDS (exit 2), named - discriminating", () => {
  const sb = sandbox();
  const plans = buildPlans(writeAdr(sb.base));
  delete plans["threat-model"];
  const r = planCheck(sb, planSelection(), plans);
  assert.equal(r.code, 2, r.out);
  assert.match(r.out, /owasp-secure-coding-bdd/);
  assert.match(r.out, /missing/);
});

test("plan: a pattern-decision missing a part (simpler alternative) HOLDS (exit 2)", () => {
  const sb = sandbox();
  const plans = buildPlans(writeAdr(sb.base));
  delete plans["pattern-decision"].simplerAlternative;
  const r = planCheck(sb, planSelection(), plans);
  assert.equal(r.code, 2, r.out);
  assert.match(r.out, /simplerAlternative/);
});

test("plan: a threat with no control HOLDS (exit 2)", () => {
  const sb = sandbox();
  const plans = buildPlans(writeAdr(sb.base));
  plans["threat-model"].threats[0].control = "";
  const r = planCheck(sb, planSelection(), plans);
  assert.equal(r.code, 2, r.out);
  assert.match(r.out, /has no control/);
});

test("plan: a control with no @security scenario HOLDS (exit 2)", () => {
  const sb = sandbox();
  const plans = buildPlans(writeAdr(sb.base));
  plans["threat-model"].threats[0].scenario = "";
  const r = planCheck(sb, planSelection(), plans);
  assert.equal(r.code, 2, r.out);
  assert.match(r.out, /@security scenario/);
});

test("plan: a deletion claim that is only inferred HOLDS (exit 2)", () => {
  const sb = sandbox();
  const plans = buildPlans(writeAdr(sb.base));
  plans["data-lifecycle"].deletion.evidenceState = "inferred";
  const r = planCheck(sb, planSelection(), plans);
  assert.equal(r.code, 2, r.out);
  assert.match(r.out, /observed.*proven|not inferred/);
});

test("plan: a reversibility claim below observed HOLDS (exit 2)", () => {
  const sb = sandbox();
  const plans = buildPlans(writeAdr(sb.base));
  plans["reversibility"].reversibility.evidenceState = "documented";
  const r = planCheck(sb, planSelection(), plans);
  assert.equal(r.code, 2, r.out);
});

test("plan: an ADR with an unfilled placeholder HOLDS (exit 2)", () => {
  const sb = sandbox();
  const adr = join(sb.base, "bad-adr.md");
  writeFileSync(adr, `---\nstatus: "accepted"\n---\n# ADR\n## Context\nx\n## Considered Options\n- a\n- b\n## Consequences\nTODO fill this in\n`);
  const plans = buildPlans(writeAdr(sb.base));
  plans["adr"] = { path: adr };
  const r = planCheck(sb, planSelection(), plans);
  assert.equal(r.code, 2, r.out);
  assert.match(r.out, /placeholder/);
});

test("plan: an ADR citing a confirmation file that does not exist HOLDS (exit 2, dead link)", () => {
  const sb = sandbox();
  const plans = buildPlans(writeAdr(sb.base));
  plans["adr"] = { path: writeAdr(sb.base), confirmationFiles: ["measure/coverage_v2.json"] };
  const r = planCheck(sb, planSelection(), plans);
  assert.equal(r.code, 2, r.out);
  assert.match(r.out, /dead link|does not exist/);
});

test("plan: a ui verdict that is not observed/proven HOLDS (exit 2)", () => {
  const sb = sandbox();
  const plans = buildPlans(writeAdr(sb.base));
  plans["a11y-verdict"].evidenceState = "inferred";
  const r = planCheck(sb, planSelection(), plans);
  assert.equal(r.code, 2, r.out);
});

test("plan: an arch-standards claim with no measurement HOLDS (exit 2)", () => {
  const sb = sandbox();
  const plans = buildPlans(writeAdr(sb.base));
  delete plans["arch-standards"].claims[0].measurement;
  const r = planCheck(sb, planSelection(), plans);
  assert.equal(r.code, 2, r.out);
});

test("--help prints usage and exits 0", () => {
  assert.match(execFileSync(process.execPath, [CLI, "--help"], { encoding: "utf8" }), /check-task-plan/);
});
