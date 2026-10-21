// Parity gate (ADR-0071): the local pre-push and CI must run a consistent, declared set of the repo's own
// check:* gates, from ONE committed source (self-checks.json). This fails if a check:* npm script is added
// without being classified there, if a classification names a script that does not exist, or if the pre-push
// hook stops sourcing its gate list from that file, so the local pre-push and CI can never silently diverge.
// Part of npm test (itself a required check). Discriminating: adding an unclassified check:* turns it red.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const pkg = JSON.parse(readFileSync(resolve(ROOT, "package.json"), "utf8"));
const selfChecks = JSON.parse(readFileSync(resolve(ROOT, "self-checks.json"), "utf8"));
const hook = readFileSync(resolve(ROOT, ".githooks", "pre-push"), "utf8");

const pkgChecks = Object.keys(pkg.scripts || {}).filter((k) => k.startsWith("check:")).sort();
const classified = Object.keys(selfChecks.checks || {}).sort();

test("every check:* script is classified in self-checks.json, and vice versa (no local/CI drift)", () => {
  const unclassified = pkgChecks.filter((c) => !classified.includes(c));
  const orphaned = classified.filter((c) => !pkgChecks.includes(c));
  assert.deepEqual(unclassified, [], `these check:* scripts are not classified in self-checks.json (add each with local true/false): ${unclassified.join(", ")}`);
  assert.deepEqual(orphaned, [], `self-checks.json classifies check(s) with no matching package.json script: ${orphaned.join(", ")}`);
});

test("each classification sets a boolean local flag, and every CI-only (local:false) check states a reason", () => {
  for (const [name, c] of Object.entries(selfChecks.checks || {})) {
    assert.equal(typeof (c && c.local), "boolean", `self-checks.json "${name}" must set a boolean "local"`);
    if (c.local === false) {
      assert.ok(typeof c.reason === "string" && c.reason.length > 0, `CI-only check "${name}" (local:false) must state a non-empty "reason"`);
    }
  }
});

test("the pre-push hook sources its gate list from self-checks.json, not a hardcoded list", () => {
  assert.ok(hook.includes("self-checks.json"), "the pre-push hook must read self-checks.json so its local gates cannot drift from the committed source");
  // Guard against a regression to a hardcoded array like `const GATES = ["check:architecture", ...]`.
  assert.ok(!/const\s+GATES\s*=\s*\[\s*["']check:/.test(hook), "the pre-push hook must not hardcode a check:* gate list; derive it from self-checks.json");
});

test("at least one gate is marked local, so the pre-push is not hollow", () => {
  const local = Object.values(selfChecks.checks || {}).filter((c) => c && c.local === true);
  assert.ok(local.length > 0, "self-checks.json must mark at least one check local:true, or the pre-push runs nothing");
});
