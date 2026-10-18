// Discriminating tests for .claude/skills/compliance-data-lifecycle/scripts/check-retention-basis.mjs.
// Every personal-data entry must carry a non-placeholder basis AND retention; not-personal is exempt;
// a terse class-only personal entry fails; bad input fails closed.
import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtempSync, writeFileSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const REPO = resolve(dirname(fileURLToPath(import.meta.url)), "..");
// Resolve the gate in EITHER layout (upstream .claude/skills/<skill>/scripts, or a consumer's scripts/ci),
// because this test is copied verbatim into a consumer and must find the gate wherever it lives.
const UPSTREAM = resolve(REPO, ".claude/skills/compliance-data-lifecycle/scripts/check-retention-basis.mjs");
const CHECK = [UPSTREAM, resolve(REPO, "scripts/ci/check-retention-basis.mjs")].find((p) => existsSync(p)) ?? UPSTREAM;

function run(map) {
  const dir = mkdtempSync(join(tmpdir(), "ret-"));
  const f = join(dir, "data-map.json");
  writeFileSync(f, typeof map === "string" ? map : JSON.stringify(map));
  const r = spawnSync(process.execPath, [CHECK, "--map", f], { encoding: "utf8" });
  return { status: r.status, out: (r.stdout || "") + (r.stderr || "") };
}

// --- complete maps PASS ------------------------------------------------------
test("FLAGS a personal entry whose basis is a placeholder (..., soon, tbd), not a real lawful basis (discriminating)", () => {
  for (const basis of ["...", "soon", "tbd", "xxx", "placeholder"]) {
    const r = run([{ field: "users.email", class: "restricted", basis, retention: "account life + 30d" }]);
    assert.equal(r.status, 1, `basis "${basis}" should fail: ` + r.out);
  }
});

test("PASSES a personal entry with basis + retention, and an exempt not-personal entry", () => {
  const r = run([
    { field: "users.email", class: "restricted", basis: "contract", retention: "account life + 30d" },
    { field: "support.email", class: "not-personal", basis: "n/a", retention: "n/a" },
  ]);
  assert.equal(r.status, 0, r.out);
});
test("PASSES the object form and accepts lawfulBasis as a basis alias", () => {
  const r = run({ "users.phone": { class: "restricted", lawfulBasis: "consent", retention: "2 years" } });
  assert.equal(r.status, 0, r.out);
});

// --- each gap FAILS (discriminating) -----------------------------------------
test("FLAGS a personal entry missing retention (exit 1)", () => {
  const r = run([{ field: "users.email", class: "restricted", basis: "contract" }]);
  assert.equal(r.status, 1, r.out);
  assert.match(r.out, /retention period/);
});
test("FLAGS a personal entry missing basis (exit 1)", () => {
  const r = run([{ field: "users.email", class: "restricted", retention: "2 years" }]);
  assert.equal(r.status, 1, r.out);
  assert.match(r.out, /lawful basis/);
});
test("FLAGS a placeholder retention like 'tbd' (exit 1, discriminating)", () => {
  const r = run([{ field: "users.email", class: "restricted", basis: "contract", retention: "tbd" }]);
  assert.equal(r.status, 1, r.out);
  assert.match(r.out, /retention period/);
});
test("FLAGS a placeholder basis like 'n/a' on a PERSONAL entry (exit 1, discriminating)", () => {
  const r = run([{ field: "users.email", class: "restricted", basis: "n/a", retention: "2 years" }]);
  assert.equal(r.status, 1, r.out);
  assert.match(r.out, /lawful basis/);
});
test("FLAGS a terse class-only personal entry (no place for basis/retention) (exit 1)", () => {
  const r = run({ "users.email": "restricted" });
  assert.equal(r.status, 1, r.out);
  assert.match(r.out, /lawful basis/);
  assert.match(r.out, /retention period/);
});

// --- not-personal is genuinely exempt ----------------------------------------
test("does NOT flag a table-qualified not-personal entry lacking basis/retention (exempt, discriminating)", () => {
  const r = run({ "support.email": "not-personal" });
  assert.equal(r.status, 0, r.out);
});
test("fails closed (exit 2) on a BARE not-personal key (matches check-untagged-pii ADR-0010 guard)", () => {
  const r = run({ "email": "not-personal" });
  assert.equal(r.status, 2, r.out);
  assert.match(r.out, /bare key/);
});

// --- fail closed on bad input ------------------------------------------------
// (A MISSING map file is no longer a failure - it is the optional-map safe default, covered below. A map
// file that IS present but malformed JSON still fails closed.)
test("fails closed (exit 2) on invalid JSON", () => {
  assert.equal(run("{ not json").status, 2);
});
test("fails closed (exit 2) on an invalid/missing class", () => {
  assert.equal(run([{ field: "users.email", class: "secret", basis: "contract", retention: "2y" }]).status, 2);
});
// --- optional map: the gate travels into consumers with a safe default (ADR-0064) ---
// --map is optional now. With no map - or a map the consumer has not created yet - there are no declared
// personal entries, so there is nothing to check and the gate passes (exit 0). check-untagged-pii is the
// gate that forces undeclared PII to be declared; this one only bites once entries exist. A map file that IS
// present but is malformed JSON still fails closed.
test("optional map: --map omitted → PASS (exit 0, empty default; travels into a config-less consumer)", () => {
  const r = spawnSync(process.execPath, [CHECK], { encoding: "utf8" });
  assert.equal(r.status, 0, (r.stdout || "") + (r.stderr || ""));
});
test("optional map: --map points at a file that does not exist → PASS (exit 0, treated as empty)", () => {
  const dir = mkdtempSync(join(tmpdir(), "ret-nomap-"));
  const r = spawnSync(process.execPath, [CHECK, "--map", join(dir, "does-not-exist.json")], { encoding: "utf8" });
  assert.equal(r.status, 0, (r.stdout || "") + (r.stderr || ""));
});
test("optional map: a map file present but malformed JSON still fails closed (exit 2, discriminating)", () => {
  const dir = mkdtempSync(join(tmpdir(), "ret-bad-"));
  const f = join(dir, "data-map.json");
  writeFileSync(f, "{ not json");
  const r = spawnSync(process.execPath, [CHECK, "--map", f], { encoding: "utf8" });
  assert.equal(r.status, 2);
});
test("still FLAGS a declared personal entry missing basis+retention under the optional-map model (discriminating)", () => {
  assert.equal(run([{ field: "users.email", class: "restricted" }]).status, 1);
});
