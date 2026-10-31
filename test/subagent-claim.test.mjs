// Tests for always-on/subagent-claim.mjs (issue #176, deliverable 7): the parent must not launder a subagent's
// verification claim. A no-op downgrade (returns the report unchanged when not re-run) flips the first case.
import { test } from "node:test";
import assert from "node:assert/strict";
import { downgradeSubagentClaims } from "../always-on/subagent-claim.mjs";

test("a subagent's verification claim is relabelled when the parent did NOT re-run it - discriminating", () => {
  const out = downgradeSubagentClaims("fix verified, gate green", { reRun: false });
  assert.match(out, /reported by a subagent/i);
  assert.match(out, /verified \[reported by a subagent/i); // the word 'verified' is tagged, not presented as fact
});

test("when the parent RE-RAN it, the claim stands unchanged", () => {
  const report = "fix verified, gate green";
  assert.equal(downgradeSubagentClaims(report, { reRun: true }), report);
});

test("multiple verification phrases are each tagged", () => {
  const out = downgradeSubagentClaims("The tests pass and the bug is fixed and the gate is green.", { reRun: false });
  assert.ok((out.match(/\[reported by a subagent, not re-run by the parent\]/g) || []).length >= 2);
});

test("an empty report is returned unchanged", () => {
  assert.equal(downgradeSubagentClaims("", { reRun: false }), "");
});

test("downgrading already-downgraded text does not stack the banner (idempotent) - discriminating", () => {
  const once = downgradeSubagentClaims("fix verified, gate green", { reRun: false });
  const twice = downgradeSubagentClaims(once, { reRun: false });
  assert.equal((twice.match(/Reported by a subagent \(not re-run here\):/g) || []).length, 1);
});
