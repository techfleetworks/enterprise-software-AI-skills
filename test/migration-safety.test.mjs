// Discriminating tests for .claude/skills/release-deployment-safety/scripts/check-migration-safety.mjs.
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
const CHECK = resolve(REPO, ".claude/skills/release-deployment-safety/scripts/check-migration-safety.mjs");

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
test("FLAGS MySQL MODIFY (in-place type change) and CHANGE (rename) (dialect, discriminating)", () => {
  assert.equal(run("ALTER TABLE orders MODIFY amount BIGINT NOT NULL;\n").status, 1);
  assert.equal(run("ALTER TABLE orders CHANGE old_name new_name VARCHAR(255);\n").status, 1);
});
test("does NOT flag the words change/modify inside a string literal (no false positive)", () => {
  assert.equal(run("ALTER TABLE t ADD COLUMN note text DEFAULT 'change requested, please modify soon';\n").status, 0);
  assert.equal(run("INSERT INTO audit(action) VALUES ('change the old record and modify it');\n").status, 0);
});
test("PASSES NOT NULL WHEN a DEFAULT is given (the `unless` clause, discriminating)", () => {
  assert.equal(run("ALTER TABLE users ADD COLUMN active boolean NOT NULL DEFAULT true;\n").status, 0);
});
test("PASSES the skill's own 3-step NOT NULL: step 1 (CHECK … NOT VALID) is not flagged (F1)", () => {
  assert.equal(run("ALTER TABLE users ADD CONSTRAINT users_tier_nn CHECK (tier IS NOT NULL) NOT VALID;\n").status, 0);
});
test("PASSES a CHECK/FK added NOT VALID (the fk-check `unless`, discriminating)", () => {
  assert.equal(run("ALTER TABLE orders ADD CONSTRAINT fk_cust FOREIGN KEY (cust_id) REFERENCES customers (id) NOT VALID;\n").status, 0);
});
test("does NOT flag ADD COLUMN named `type` as a type change (F4, no false positive)", () => {
  assert.equal(run("ALTER TABLE events ADD COLUMN type text;\n").status, 0);
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
  "fk-check-not-valid": "ALTER TABLE orders ADD CONSTRAINT fk_cust FOREIGN KEY (cust_id) REFERENCES customers (id);",
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
test("a too-short (1-char) reason does NOT suppress (F6 — guards the length check)", () => {
  const sql = "-- migration-safety:ignore x\nDROP TABLE legacy_sessions;\n";
  assert.equal(run(sql).status, 1, "a 1-char reason is not a real reason");
});
test("a TRAILING ignore on the statement's own line binds to THAT statement (F5)", () => {
  // After the splitter fix, the trailing comment waives the DROP it follows, not the next statement.
  assert.equal(run("DROP TABLE a; -- migration-safety:ignore cleanup, backed up and announced\n").status, 0);
});
test("a trailing ignore on statement A does NOT leak to statement B (F5, discriminating)", () => {
  const sql = "DROP TABLE a; -- migration-safety:ignore waive A, backed up\nDROP TABLE b;\n";
  const r = run(sql);
  assert.equal(r.status, 1, "B must still be flagged");
  assert.match(r.out, /drop-table/);
  assert.doesNotMatch(r.out, /:1\b/); // A (line 1) is suppressed; only B remains
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
