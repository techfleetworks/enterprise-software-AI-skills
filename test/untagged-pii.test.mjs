// Discriminating tests for .claude/skills/compliance-data-lifecycle/scripts/check-untagged-pii.mjs.
// A PII-looking column must be classified in the data map; an undeclared one fails; a false positive
// is resolved by declaring it "not-personal"; non-PII columns are ignored; bad input fails closed.
import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtempSync, writeFileSync, mkdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const REPO = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const CHECK = resolve(REPO, ".claude/skills/compliance-data-lifecycle/scripts/check-untagged-pii.mjs");

function run(sql, map) {
  const dir = mkdtempSync(join(tmpdir(), "pii-"));
  const sqlFile = join(dir, "0001_schema.sql");
  const mapFile = join(dir, "data-map.json");
  writeFileSync(sqlFile, sql);
  writeFileSync(mapFile, typeof map === "string" ? map : JSON.stringify(map));
  const r = spawnSync(process.execPath, [CHECK, "--map", mapFile, sqlFile], { encoding: "utf8" });
  return { status: r.status, out: (r.stdout || "") + (r.stderr || "") };
}

const USERS = `CREATE TABLE users (
  id bigint PRIMARY KEY,
  email text NOT NULL,
  phone text,
  status text,
  CONSTRAINT users_email_chk CHECK (email <> '')
);
`;

// --- happy path --------------------------------------------------------------
test("PASSES when every PII-looking column is classified", () => {
  const r = run(USERS, { "users.email": "restricted", "users.phone": "restricted" });
  assert.equal(r.status, 0, r.out);
});
test("a bare column-name declaration also satisfies it", () => {
  assert.equal(run(USERS, { email: "restricted", phone: "confidential" }).status, 0);
});

// --- discriminating: undeclared PII fails ------------------------------------
test("FAILS when a PII column is not in the map (discriminating)", () => {
  const r = run(USERS, { "users.email": "restricted" }); // phone missing
  assert.equal(r.status, 1, r.out);
  assert.match(r.out, /users\.phone/);
});
test("FLAGS ip/age/salary/citizenship columns (broadened indicators, discriminating)", () => {
  for (const col of ["client_ip", "ip_addr", "age", "salary", "citizenship"]) {
    const r = run(`CREATE TABLE t (\n  id int,\n  ${col} text\n);\n`, {});
    assert.equal(r.status, 1, `${col} should be flagged as PII-looking: ` + r.out);
    assert.match(r.out, new RegExp(col));
  }
});

test("FAILS on an undeclared ADD COLUMN ssn (discriminating)", () => {
  const r = run("ALTER TABLE users ADD COLUMN ssn text;\n", {});
  assert.equal(r.status, 1);
  assert.match(r.out, /users\.ssn/);
});

// --- non-PII columns are ignored; constraint lines aren't columns -------------
test("does NOT flag non-PII columns (id, status) and ignores CONSTRAINT lines", () => {
  const r = run("CREATE TABLE t (\n  id bigint PRIMARY KEY,\n  status text,\n  PRIMARY KEY (id)\n);\n", {});
  assert.equal(r.status, 0, r.out);
});

// --- false-positive escape: declare not-personal -----------------------------
test("a name that looks like PII but isn't is resolved by declaring it not-personal", () => {
  const sql = "CREATE TABLE support (\n  id bigint,\n  email text\n);\n"; // shared inbox, not a person
  assert.equal(run(sql, { "support.email": "not-personal" }).status, 0);
});

// --- false-negative gaps closed (backfilled from the fresh-context review) ----
test("FLAGS `ADD COLUMN IF NOT EXISTS <pii>` (idempotent-migration idiom, discriminating — #1)", () => {
  const r = run("ALTER TABLE t ADD COLUMN IF NOT EXISTS email text;\n", {});
  assert.equal(r.status, 1, r.out);
  assert.match(r.out, /t\.email/);
});
test("FLAGS every column in a multi-ADD ALTER, not just the first (#4)", () => {
  const r = run("ALTER TABLE t ADD COLUMN email text, ADD COLUMN ssn text;\n", { "t.email": "restricted" });
  assert.equal(r.status, 1, r.out);
  assert.match(r.out, /t\.ssn/);
});
test("FLAGS `username` (direct identifier) while leaving bare `name` unflagged by design (#3)", () => {
  const r = run("CREATE TABLE t (\n  id bigint,\n  name text,\n  username text\n);\n", {});
  assert.equal(r.status, 1, r.out);
  assert.match(r.out, /t\.username/);
  assert.doesNotMatch(r.out, /t\.name\b/);
});
test("attributes the table correctly for `ALTER TABLE ONLY schema.t` (#6)", () => {
  const r = run("ALTER TABLE ONLY public.users ADD COLUMN email text;\n", {});
  assert.equal(r.status, 1, r.out);
  assert.match(r.out, /public\.users\.email/);
  assert.doesNotMatch(r.out, /only\.email/i);
});
test("a stray `)` in a DEFAULT literal does not end the CREATE block early (#5)", () => {
  const r = run("CREATE TABLE t (\n  note text DEFAULT ')',\n  email text\n);\n", {});
  assert.equal(r.status, 1, r.out); // email must still be reached + flagged
  assert.match(r.out, /t\.email/);
});
test("rejects a bare not-personal key so it can't blanket-exempt another table's PII (#2)", () => {
  const sql = "CREATE TABLE users (\n  id bigint,\n  email text\n);\n";
  const r = run(sql, { email: "not-personal" }); // bare not-personal → must be rejected (exit 2)
  assert.equal(r.status, 2, r.out);
});

// --- fail closed -------------------------------------------------------------
test("fails closed (exit 2) on an invalid class in the map", () => {
  assert.equal(run(USERS, { "users.email": "secret-sauce", "users.phone": "restricted" }).status, 2);
});
test("fails closed (exit 2) when the map file is missing", () => {
  const dir = mkdtempSync(join(tmpdir(), "pii-nomap-"));
  const sqlFile = join(dir, "s.sql");
  writeFileSync(sqlFile, USERS);
  const r = spawnSync(process.execPath, [CHECK, "--map", join(dir, "nope.json"), sqlFile], { encoding: "utf8" });
  assert.equal(r.status, 2);
});
test("fails closed (exit 2) when no .sql files are found", () => {
  const dir = mkdtempSync(join(tmpdir(), "pii-empty-"));
  mkdirSync(join(dir, "sub"));
  writeFileSync(join(dir, "data-map.json"), "{}");
  const r = spawnSync(process.execPath, [CHECK, "--map", join(dir, "data-map.json"), join(dir, "sub")], { encoding: "utf8" });
  assert.equal(r.status, 2);
});
