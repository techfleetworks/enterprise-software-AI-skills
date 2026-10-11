// Discriminating tests for compliance-data-lifecycle/scripts/check-untagged-pii.mjs.
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
const CHECK = resolve(REPO, "compliance-data-lifecycle/scripts/check-untagged-pii.mjs");

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
