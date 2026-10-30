// Tests for always-on/routing-lib.mjs and the versioned personal-install routing map (issue #175).
// Each routing rule gets its own test (deliverable 2): a representative path fires it and pulls in its skills.
import { test } from "node:test";
import assert from "node:assert/strict";
import { writeFileSync, mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { loadRoutingConfig, requiredSkillsForPaths, firedRules, globToRe } from "../always-on/routing-lib.mjs";

const cfg = loadRoutingConfig(); // the shipped default map

const RULES = [
  ["schema-or-migration", "db/migrations/0001_init.sql", ["architectural-decision-records", "release-deployment-safety", "compliance-data-lifecycle"]],
  ["auth-input-secrets", "src/auth/login.ts", ["owasp-secure-coding-bdd"]],
  ["ui-surface", "src/components/Button.tsx", ["universal-accessibility-wcag", "universal-browser-device-support", "usability-ux-universal-design"]],
  ["source-change", "lib/parse.ts", ["comprehensive-test-strategy", "bdd-comprehensive-testing"]],
  ["service-endpoint", "src/api/users.controller.ts", ["sre-operational-readiness"]],
  ["test-files", "src/feature.test.ts", ["verifiable-quality-gates", "comprehensive-test-strategy"]],
  ["adr-or-decision", "docs/adr/0005-choice.md", ["architectural-decision-records"]],
];

for (const [ruleId, path, skills] of RULES) {
  test(`routing rule "${ruleId}" fires on ${path} and requires its skills`, () => {
    const fired = firedRules([path], cfg).map((r) => r.id);
    assert.ok(fired.includes(ruleId), `expected rule ${ruleId} to fire; fired: ${fired.join(",")}`);
    const req = requiredSkillsForPaths([path], cfg);
    for (const s of skills) assert.ok(req.includes(s), `expected "${s}" required for ${path}; got ${req.join(",")}`);
  });
}

test("a path matching no rule requires nothing", () => {
  assert.deepEqual(requiredSkillsForPaths(["README.md", "docs/notes.txt"], cfg), []);
});

test("globToRe: ** spans directories, * does not cross a slash", () => {
  assert.ok(globToRe("src/**/*.ts").test("src/a/b/c.ts"));
  assert.ok(globToRe("**/migrations/**").test("x/y/migrations/z/0001.sql"));
  assert.ok(!globToRe("src/*.ts").test("src/a/b.ts"));
});

test("loadRoutingConfig throws (fail closed) on a malformed config", () => {
  const dir = mkdtempSync(join(tmpdir(), "routing-"));
  const bad = join(dir, "bad.json");
  writeFileSync(bad, JSON.stringify({ rules: [{ id: "x", when: [] }] })); // empty when, no requires
  assert.throws(() => loadRoutingConfig(bad), /routing rule needs/);
  const notJson = join(dir, "nj.json");
  writeFileSync(notJson, "{ not json");
  assert.throws(() => loadRoutingConfig(notJson), /cannot read routing config/);
});
