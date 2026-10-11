// Discriminating tests for release-deployment-safety/scripts/check-migration-safety.mjs.
// Each unsafe pattern must FAIL the gate; its expand/contract-safe equivalent must PASS; and the
// inline ignore directive must suppress ONLY with a reason.
import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtempSync, writeFileSync, mkdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const REPO = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const CHECK = resolve(REPO, "release-deployment-safety/scripts/check-migration-safety.mjs");

function run(sql) {
  const dir = mkdtempSync(join(tmpdir(), "mig-"));
  const f = join(dir, "0001_change.sql");
  writeFileSync(f, sql);
  const r = spawnSync(process.execPath, [CHECK, f], { encoding: "utf8" });
  return { status: r.status, out: (r.stdout || "") + (r.stderr || "") };
}

// --- safe migrations PASS ----------------------------------------------------
test("PASSES a safe expand migration (nullable add + CONCURRENTLY index)", () => {
  const r = run("ALTER TABLE users ADD COLUMN preferred_locale text;\nCREATE INDEX CONCURRENTLY idx_users_locale ON users (preferred_locale);\n");
  assert.equal(r.status, 0, r.out);
});
test("PASSES NOT NULL WHEN a DEFAULT is given (the `unless` clause, discriminating)", () => {
  assert.equal(run("ALTER TABLE users ADD COLUMN active boolean NOT NULL DEFAULT true;\n").status, 0);
});

// --- each unsafe pattern FAILS (discriminating, one per rule) -----------------
const UNSAFE = {
  "drop-table": "DROP TABLE legacy_sessions;",
  "truncate": "TRUNCATE audit_log;",
  "drop-column": "ALTER TABLE users DROP COLUMN nickname;",
  "rename-column": "ALTER TABLE users RENAME COLUMN email TO email_address;",
  "add-not-null-no-default": "ALTER TABLE users ADD COLUMN tier text NOT NULL;",
  "set-not-null-direct": "ALTER TABLE users ALTER COLUMN email SET NOT NULL;",
  "alter-column-type": "ALTER TABLE users ALTER COLUMN age TYPE bigint;",
  "index-not-concurrent": "CREATE INDEX idx_users_email ON users (email);",
};
for (const [rule, sql] of Object.entries(UNSAFE)) {
  test(`FLAGS ${rule} (exit 1, discriminating)`, () => {
    const r = run(sql);
    assert.equal(r.status, 1, `expected a failure for ${rule}; got:\n${r.out}`);
    assert.match(r.out, new RegExp(rule));
  });
}

// --- suppression semantics ---------------------------------------------------
test("an ignore directive WITH a reason suppresses (exit 0)", () => {
  const sql = "-- migration-safety:ignore contract phase, backed up and announced\nDROP TABLE legacy_sessions;\n";
  assert.equal(run(sql).status, 0, run(sql).out);
});
test("a targeted ignore=rule WITH a reason suppresses only that rule (exit 0)", () => {
  const sql = "-- migration-safety:ignore=drop-table deliberate contraction, see ADR\nDROP TABLE legacy_sessions;\n";
  assert.equal(run(sql).status, 0);
});
test("a bare ignore with NO reason does NOT suppress (exit 1, discriminating)", () => {
  const sql = "-- migration-safety:ignore\nDROP TABLE legacy_sessions;\n";
  assert.equal(run(sql).status, 1, "an unexplained ignore must not suppress");
});

// --- no false positive on commented-out SQL ----------------------------------
test("does NOT flag a DROP that is commented out (no false positive)", () => {
  assert.equal(run("-- DROP TABLE legacy_sessions; (left for reference)\nALTER TABLE users ADD COLUMN x text;\n").status, 0);
});

// --- fail closed on zero scan ------------------------------------------------
test("fails closed (exit 2) when a directory has no .sql files", () => {
  const dir = mkdtempSync(join(tmpdir(), "mig-empty-"));
  mkdirSync(join(dir, "sub"));
  const r = spawnSync(process.execPath, [CHECK, dir], { encoding: "utf8" });
  assert.equal(r.status, 2);
});
