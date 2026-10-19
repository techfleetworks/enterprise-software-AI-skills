// Discriminating tests for always-on/enforcement-nudge.mjs (ADR-0066): the pure decision for the "your gates
// run but do not block merges yet" nudge. It must fire in a consumer that is advisory-only, stay silent in the
// origin / non-consumer, and clear ONLY when a committed ruleset requires the check AND it was applied.
import { test } from "node:test";
import assert from "node:assert/strict";
import { decideEnforcementNudge, rulesetRequires, ENFORCE_NUDGE_CAP } from "../always-on/enforcement-nudge.mjs";

// --- rulesetRequires -----------------------------------------------------------
// A realistic ruleset: active + targets the default branch unless overridden, so the "requires the check"
// tests isolate the context check, and the enforcement/target guards get their own discriminating tests.
const ruleset = (contexts, opts = {}) => ({
  name: "eg",
  enforcement: opts.enforcement || "active",
  conditions: { ref_name: { include: opts.include || ["~DEFAULT_BRANCH"], exclude: [] } },
  rules: [{ type: "deletion" }, { type: "required_status_checks", parameters: { required_status_checks: contexts.map((c) => ({ context: c })) } }],
});

test("rulesetRequires: true when an ACTIVE default-branch ruleset requires the named check", () => {
  assert.equal(rulesetRequires([ruleset(["test (20)", "enterprise-gates"])], "enterprise-gates"), true);
});
test("rulesetRequires: true for a default-branch named by its literal ref (refs/heads/main)", () => {
  assert.equal(rulesetRequires([ruleset(["enterprise-gates"], { include: ["refs/heads/main"] })], "enterprise-gates"), true);
});
test("rulesetRequires: false when no ruleset lists the check (discriminating)", () => {
  assert.equal(rulesetRequires([ruleset(["test (20)", "routing"])], "enterprise-gates"), false);
});
test("rulesetRequires: false for a DISABLED ruleset that lists the check (inert-ruleset false-clear guard)", () => {
  assert.equal(rulesetRequires([ruleset(["enterprise-gates"], { enforcement: "disabled" })], "enterprise-gates"), false);
});
test("rulesetRequires: false when the ruleset targets a non-default branch (wrong-branch guard)", () => {
  assert.equal(rulesetRequires([ruleset(["enterprise-gates"], { include: ["refs/heads/never-used"] })], "enterprise-gates"), false);
});
test("rulesetRequires: false on an empty or malformed set (never throws)", () => {
  assert.equal(rulesetRequires([], "enterprise-gates"), false);
  assert.equal(rulesetRequires([{}, { rules: "nope" }, null], "enterprise-gates"), false);
  assert.equal(rulesetRequires(null, "enterprise-gates"), false);
});

// --- decideEnforcementNudge ----------------------------------------------------
test("says nothing when NOT installed as a consumer (origin / directive-only repo)", () => {
  const r = decideEnforcementNudge({ installed: false, rulesetRequiresCheck: false, applied: false, state: null });
  assert.equal(r.text, null);
  assert.equal(r.advisory, false);
});
test("ENFORCED (clears, no nudge) when a ruleset requires the check AND it was applied", () => {
  const r = decideEnforcementNudge({ installed: true, rulesetRequiresCheck: true, applied: true, state: { count: 7 } });
  assert.equal(r.text, null);
  assert.equal(r.enforced, true);
  assert.equal(r.nextState, null, "state is cleared when enforced");
});
test("ADVISORY + loud when installed but no ruleset requires the check (discriminating)", () => {
  const r = decideEnforcementNudge({ installed: true, rulesetRequiresCheck: false, applied: false, state: null });
  assert.equal(r.advisory, true);
  assert.match(r.text, /do NOT block merges/);
  assert.match(r.text, /apply-ruleset\.sh/);
  assert.equal(r.nextState.count, 1);
});
test("ADVISORY when the ruleset requires the check but it was NOT applied (distinct message)", () => {
  const r = decideEnforcementNudge({ installed: true, rulesetRequiresCheck: true, applied: false, state: null });
  assert.equal(r.advisory, true);
  assert.match(r.text, /has NOT been applied/);
});
test("ADVISORY does NOT clear just because a ruleset exists without the applied-marker (discriminating)", () => {
  // Intent alone (committed ruleset) must not silence it; the confirm (applied) is required too.
  const r = decideEnforcementNudge({ installed: true, rulesetRequiresCheck: true, applied: false, state: { count: 3 } });
  assert.notEqual(r.text, null);
  assert.equal(r.nextState.count, 4);
});
test("the count climbs each session until the cap, then goes quiet (never fully silent)", () => {
  const atCap = decideEnforcementNudge({ installed: true, rulesetRequiresCheck: false, applied: false, state: { count: ENFORCE_NUDGE_CAP - 1 } });
  assert.match(atCap.text, /reminder 30 of 30/);
  const past = decideEnforcementNudge({ installed: true, rulesetRequiresCheck: false, applied: false, state: { count: ENFORCE_NUDGE_CAP } });
  assert.match(past.text, /still ADVISORY/);
  assert.doesNotMatch(past.text, /reminder/);
});
