// Discriminating tests for .claude/skills/comprehensive-test-strategy/scripts/leak-check.mjs
//
// This file IS the "the oracle is itself tested" deliverable for the leak checker: it pins the two errors the
// audit found (a punctuation variant missed; one value flagged inside a larger one) plus the empty-input case,
// per the rule in the skill. A naive substring checker, or a no-op that always exits 0, flips these.
import { test } from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { writeFileSync, mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const REPO = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const CHECK = resolve(REPO, ".claude/skills/comprehensive-test-strategy/scripts/leak-check.mjs");

// Returns { code, out }. Writes the output text to a file and runs the checker with the given secrets.
function run(outputText, secrets = [], extra = []) {
  const dir = mkdtempSync(join(tmpdir(), "leak-check-"));
  const file = join(dir, "out.txt");
  writeFileSync(file, outputText);
  const args = [];
  for (const s of secrets) { args.push("--secret", s); }
  args.push(...extra, file);
  try {
    const out = execFileSync(process.execPath, [CHECK, ...args], { stdio: "pipe", encoding: "utf8" });
    return { code: 0, out };
  } catch (e) {
    return { code: e.status ?? 1, out: (e.stdout || "") + (e.stderr || "") };
  }
}

test("catches a punctuation variant: 'Dr Example' leaks the secret 'Dr. Example' (exit 1)", () => {
  // The audit's missed leak. A naive substring match of "Dr. Example" would NOT find "Dr Example".
  const r = run("We contacted Dr Example about the record.", ["Dr. Example"]);
  assert.equal(r.code, 1, r.out);
});

test("does NOT flag one value inside a larger one: '75k' is not leaked by '175k' (exit 0)", () => {
  // The audit's false alarm. A naive substring match would wrongly flag this.
  const r = run("The round was 175k invested last year.", ["75k"]);
  assert.equal(r.code, 0, r.out);
});

test("still catches the value as a whole token: '75k' in 'saved 75k' leaks (exit 1)", () => {
  assert.equal(run("They saved 75k last year.", ["75k"]).code, 1);
});

test("catches a case variant (exit 1)", () => {
  assert.equal(run("the api_key is SECRET123 here", ["secret123"]).code, 1);
});

test("catches a Unicode width variant via NFKC (exit 1)", () => {
  // Fullwidth 'ＤＲ' normalizes to 'dr'; the secret 'DR example' leaks.
  assert.equal(run("leak: ＤＲ example here", ["DR example"]).code, 1);
});

test("empty output is clean (exit 0)", () => {
  assert.equal(run("", ["Dr. Example"]).code, 0);
});

test("with several secrets, one leak is enough to fail (exit 1)", () => {
  assert.equal(run("nothing here but 75k standalone", ["absent-secret", "75k"]).code, 1);
});

test("no secret given fails closed (exit 2), never a clean pass", () => {
  assert.equal(run("some output", []).code, 2);
});

test("an empty / whitespace-only secret fails closed (exit 2), not a match-everything pass", () => {
  assert.equal(run("some output", ["   "]).code, 2);
});

test("ANY secret that normalizes to no tokens fails closed, even mixed with a usable one (exit 2)", () => {
  // Review F4: a usable secret alongside an unusable one must not quietly check only the usable one and
  // report clean; an unchecked secret never reads as clean.
  assert.equal(run("benign text with no secrets", ["@#$%", "realword"]).code, 2);
});

// Characterization of the NAMED limit (review F3): a secret embedded inside a larger alphanumeric token with no
// delimiter is NOT caught by the whole-token model. This is the documented trade-off of avoiding the 75k/175k
// false alarm; the test pins it so the behavior is intentional, not an accidental regression.
test("documented limit: a secret concatenated into a larger token is NOT caught (exit 0)", () => {
  assert.equal(run("the value is prefixABCD1234suffix here", ["ABCD1234"]).code, 0);
});
test("the same secret at a token boundary IS caught (exit 1)", () => {
  assert.equal(run("the value is prefix ABCD1234 suffix here", ["ABCD1234"]).code, 1);
});

test("an unreadable output file fails closed (exit 2)", () => {
  let code = 0;
  try {
    execFileSync(process.execPath, [CHECK, "--secret", "x", join(tmpdir(), "no-such-leak-file-xyz.txt")], { stdio: "pipe" });
  } catch (e) { code = e.status; }
  assert.equal(code, 2);
});

test("--help prints usage and exits 0", () => {
  const out = execFileSync(process.execPath, [CHECK, "--help"], { encoding: "utf8" });
  assert.match(out, /usage:/i);
});
