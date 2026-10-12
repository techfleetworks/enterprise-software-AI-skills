// The OWASP @security scenarios must stay REAL, runnable Gherkin that lives where the other scenarios run.
// This runs bdd-comprehensive-testing's official-parser gate (check-gherkin-valid) over the OWASP example
// feature and asserts it parses, and confirms the feature carries @security-tagged scenarios. This is what
// makes "every security control creates a BDD scenario that actually runs" true in CI, not just in prose.
import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { readFileSync, readdirSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const REPO = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const GHERKIN_GATE = resolve(REPO, ".claude/skills/bdd-comprehensive-testing/scripts/check-gherkin-valid.mjs");
const FEATURES_DIR = resolve(REPO, ".claude/skills/owasp-secure-coding-bdd/assets/example/features");

test("the OWASP @security feature parses cleanly under the official gherkin gate", () => {
  const r = spawnSync(process.execPath, [GHERKIN_GATE, FEATURES_DIR], { encoding: "utf8" });
  assert.equal(r.status, 0, `check-gherkin-valid failed:\n${(r.stdout || "") + (r.stderr || "")}`);
});

test("the OWASP example feature carries real @security scenarios", () => {
  const files = readdirSync(FEATURES_DIR).filter((f) => f.endsWith(".feature"));
  assert.ok(files.length >= 1, "no .feature file found for the OWASP security scenarios");
  const text = files.map((f) => readFileSync(resolve(FEATURES_DIR, f), "utf8")).join("\n");
  const securityTags = (text.match(/@security\b/g) || []).length;
  const scenarios = (text.match(/^\s*Scenario:/gm) || []).length;
  assert.ok(securityTags >= 3, `expected at least 3 @security tags, found ${securityTags}`);
  assert.ok(scenarios >= 3, `expected at least 3 scenarios, found ${scenarios}`);
});
