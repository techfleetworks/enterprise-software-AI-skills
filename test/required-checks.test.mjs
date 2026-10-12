// Guards the committed branch-protection ruleset. The required status checks can GROW but must never
// silently shrink: if someone drops a required check from .github/rulesets/main-protection.json, this
// test (part of npm test, itself a required check) fails. Live protection is synced from this file by
// scripts/apply-ruleset.sh, so the committed JSON is the source of truth this test defends. It cannot
// verify the LIVE GitHub state (that needs an API call and admin); it proves the source of truth is intact.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const ruleset = JSON.parse(readFileSync(path.join(ROOT, ".github", "rulesets", "main-protection.json"), "utf8"));
const rule = (ruleset.rules || []).find((r) => r.type === "required_status_checks");

test("branch protection requires every mechanical-gate check (none may be dropped)", () => {
  assert.ok(rule, "ruleset has no required_status_checks rule");
  const ctx = (rule.parameters.required_status_checks || []).map((c) => c.context);
  for (const needed of ["test (20)", "test (24)", "routing"]) {
    assert.ok(ctx.includes(needed), `required_status_checks must include "${needed}" (found: ${ctx.join(", ") || "none"})`);
  }
});

test("required status checks are enforced strictly (branches must be up to date)", () => {
  assert.equal(rule.parameters.strict_required_status_checks_policy, true);
});

test("the ruleset is actively enforced and blocks deletion, force-push, and direct push", () => {
  assert.equal(ruleset.enforcement, "active");
  const types = (ruleset.rules || []).map((r) => r.type);
  assert.ok(types.includes("deletion"), "ruleset must block branch deletion");
  assert.ok(types.includes("non_fast_forward"), "ruleset must block force-push");
  assert.ok(types.includes("pull_request"), "ruleset must require a pull request (no direct push to main)");
});
