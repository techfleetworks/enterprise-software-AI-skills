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
// Resolve the gate to the copy CI actually runs, not a vendored .claude/skills copy (issue #112). A consumer
// keeps the gate at scripts/ci/check-retention-basis.mjs (its GATE_DIR path, which the workflow sets); vendoring the skills also
// drops a copy under .claude/skills that must NOT be the one tested. Prefer the GATE_DIR copy; fall back to the
// upstream skill copy (this repo has no scripts/ci).
const CI_DIR = process.env.GATE_DIR || resolve(REPO, "scripts/ci");
const CONSUMER = resolve(CI_DIR, "check-retention-basis.mjs");
const CHECK = [CONSUMER, UPSTREAM].find((p) => existsSync(p)) ?? UPSTREAM;
test("gate resolution: tests the scripts/ci (GATE_DIR) copy CI runs, not a vendored .claude/skills copy (issue #112)", () => {
  // In a consumer that vendors the skills both copies exist; the discrimination test must exercise the
  // scripts/ci copy the aggregator runs. Upstream has no scripts/ci, so this is a no-op pass there.
  if (existsSync(CONSUMER)) assert.equal(CHECK, CONSUMER, "must test the scripts/ci (GATE_DIR) gate, not the .claude/skills copy");
});

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
// (A MISSING map fails closed unless --map-optional is given; see the ISSUE-145 cases below. A map file that
// IS present but malformed JSON always fails closed.)
test("fails closed (exit 2) on invalid JSON", () => {
  assert.equal(run("{ not json").status, 2);
});
test("fails closed (exit 2) on an invalid/missing class", () => {
  assert.equal(run([{ field: "users.email", class: "secret", basis: "contract", retention: "2y" }]).status, 2);
});

// --- ISSUE-145: a missing map must not read as a completed check -------------------------------------------
// Before the fix, no --map at all and an explicit --map to a missing file BOTH printed the same OK line and
// exited 0, so a required compliance gate "passed" having checked nothing (a mistyped path, or a map kept
// elsewhere). Now --map is required, a missing explicit map fails CLOSED, and only --map-optional (the
// published CI invoke) turns a genuinely-absent map into a DISTINCT vacuous pass. Each case is discriminating:
// reverting the fix makes it exit 0 with the generic OK line again.
test("ISSUE-145: no --map at all fails closed (exit 2, bad usage) — reverting makes it pass vacuously", () => {
  const r = spawnSync(process.execPath, [CHECK], { encoding: "utf8" });
  assert.equal(r.status, 2, (r.stdout || "") + (r.stderr || ""));
});
test("ISSUE-145: an explicit --map to a missing file, WITHOUT --map-optional, fails closed (exit 2)", () => {
  const dir = mkdtempSync(join(tmpdir(), "ret-nomap-"));
  const r = spawnSync(process.execPath, [CHECK, "--map", join(dir, "does-not-exist.json")], { encoding: "utf8" });
  assert.equal(r.status, 2, (r.stdout || "") + (r.stderr || ""));
});
test("ISSUE-145: a missing map WITH --map-optional passes vacuously (exit 0) and says so distinctly", () => {
  const dir = mkdtempSync(join(tmpdir(), "ret-opt-"));
  const r = spawnSync(process.execPath, [CHECK, "--map", join(dir, "does-not-exist.json"), "--map-optional"], { encoding: "utf8" });
  const out = (r.stdout || "") + (r.stderr || "");
  assert.equal(r.status, 0, out);
  assert.match(out, /no data map|vacuous/i, out); // a real pass of entries must NOT print this line
});
test("ISSUE-145: --map-optional does NOT weaken a real check — a present map with a gap still fails (exit 1)", () => {
  const dir = mkdtempSync(join(tmpdir(), "ret-present-"));
  const f = join(dir, "data-map.json");
  writeFileSync(f, JSON.stringify([{ field: "users.email", class: "restricted", basis: "contract" }]));
  const r = spawnSync(process.execPath, [CHECK, "--map", f, "--map-optional"], { encoding: "utf8" });
  assert.equal(r.status, 1, (r.stdout || "") + (r.stderr || ""));
});
test("a map file present but malformed JSON still fails closed (exit 2, discriminating)", () => {
  const dir = mkdtempSync(join(tmpdir(), "ret-bad-"));
  const f = join(dir, "data-map.json");
  writeFileSync(f, "{ not json");
  const r = spawnSync(process.execPath, [CHECK, "--map", f], { encoding: "utf8" });
  assert.equal(r.status, 2);
});
test("still FLAGS a declared personal entry missing basis+retention (discriminating)", () => {
  assert.equal(run([{ field: "users.email", class: "restricted" }]).status, 1);
});
