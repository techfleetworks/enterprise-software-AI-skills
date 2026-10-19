// Guard (arch-encode of a real miss): every test/*.test.mjs MUST be listed in package.json's "test" script,
// or it silently never runs in the required CI test job. That is the exact "a test exists but does not run"
// failure verifiable-quality-gates targets. This test fails if any test file is on disk but not wired in.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const script = JSON.parse(readFileSync(resolve(ROOT, "package.json"), "utf8")).scripts?.test || "";
const listed = new Set(script.match(/test\/[^\s]+\.test\.mjs/g) || []);
const onDisk = readdirSync(resolve(ROOT, "test")).filter((f) => f.endsWith(".test.mjs")).map((f) => "test/" + f);

test("every test file is wired into npm test (no test silently skipped in the required CI job)", () => {
  const missing = onDisk.filter((f) => !listed.has(f));
  assert.deepEqual(missing, [], `these test files are NOT in package.json "test" and would not run in CI: ${missing.join(", ")}`);
});
