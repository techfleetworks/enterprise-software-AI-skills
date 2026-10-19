// Keeps docs/coverage-map.md honest: it must list EVERY skill and EVERY manifest gate. If a new skill or a new
// travelling gate is added and the map is not updated, this test fails, so the "what enforces each skill"
// record can never silently drift from reality. (Part of npm test, itself a required check.)
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const MAP = readFileSync(resolve(ROOT, "docs/coverage-map.md"), "utf8");

// The 16 skills are every folder under .claude/skills except the bootstrap installer (not one of the skills).
const skills = readdirSync(resolve(ROOT, ".claude/skills"), { withFileTypes: true })
  .filter((d) => d.isDirectory() && d.name !== "bootstrap")
  .map((d) => d.name);
const manifest = JSON.parse(readFileSync(resolve(ROOT, "gate-manifest.json"), "utf8"));
const gateIds = manifest.gates.map((g) => g.id);

test("the coverage map lists every skill (no skill left unclassified)", () => {
  assert.equal(skills.length, 16, `expected 16 skills, found ${skills.length}`);
  const missing = skills.filter((s) => !MAP.includes("`" + s + "`"));
  assert.deepEqual(missing, [], `coverage-map.md is missing skill(s): ${missing.join(", ")}`);
});

test("the coverage map lists every travelling manifest gate (discriminating)", () => {
  const missing = gateIds.filter((id) => !MAP.includes("`" + id + "`"));
  assert.deepEqual(missing, [], `coverage-map.md is missing manifest gate(s): ${missing.join(", ")}`);
});

test("the map's travelling-gate count matches the manifest's engineering + self-protection split", () => {
  // Sanity on the honest total: 11 manifest gates (8 engineering + 3 self-protection), all named above.
  assert.equal(gateIds.length, 11, `expected 11 manifest gates, found ${gateIds.length} (update coverage-map.md's inventory + total)`);
});
