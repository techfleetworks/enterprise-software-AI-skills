// Discriminating tests for pattern-selector/scripts/check-catalog-completeness.mjs.
// A fully-templated + cited entry passes; dropping any required field or the citation fails; bad input
// fails closed.
import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtempSync, writeFileSync, mkdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const REPO = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const CHECK = resolve(REPO, "pattern-selector/scripts/check-catalog-completeness.mjs");

// All required fields for one entry. Omit one by deleting its key.
function entryFields() {
  return {
    Intent: "Create objects without naming the concrete class.",
    Forces: "The concrete type varies by runtime context; callers shouldn't know it.",
    "Best situation": "A framework must let users plug in types.",
    Pros: "Removes creator↔product coupling; OCP.",
    Cons: "Class/subclass proliferation.",
    "Avoid when": "One concrete type with no foreseeable variants.",
    "Failure/rot prevented": "new-ing concrete classes scattered across callers.",
    Misuse: "A factory for a single, stable type — pure indirection.",
    "Security trade-off": "none notable.",
    "Operational cost": "One more indirection to trace in a stack trace.",
    "Adopt safely": "Introduce behind the existing constructor call site.",
    "Modern alternative": "A map of constructor functions.",
    "Verify correct application": "A test constructs ≥2 product types through the factory.",
    Example: "❌ `new MySQLConn()` in 10 callers ✅ `makeConn(cfg)`.",
    "Source(s)": "GoF 1994 ISBN 0-201-63361-2; https://refactoring.guru/design-patterns/factory-method",
  };
}
function render(fields, title = "Factory Method — Creational") {
  const body = Object.entries(fields).map(([k, v]) => `${k}: ${v}`).join("\n");
  return `# Catalog\n\nintro text here\n\n### ${title}\n${body}\n`;
}
function run(md) {
  const dir = mkdtempSync(join(tmpdir(), "cat-"));
  const f = join(dir, "design-patterns-catalog.md");
  writeFileSync(f, md);
  const r = spawnSync(process.execPath, [CHECK, f], { encoding: "utf8" });
  return { status: r.status, out: (r.stdout || "") + (r.stderr || "") };
}

test("PASSES a fully-templated, cited entry", () => {
  assert.equal(run(render(entryFields())).status, 0, run(render(entryFields())).out);
});

for (const field of ["Intent", "Security trade-off", "Operational cost", "Adopt safely", "Verify correct application", "Source(s)"]) {
  test(`FAILS when the "${field}" field is missing (discriminating)`, () => {
    const f = entryFields(); delete f[field];
    const r = run(render(f));
    assert.equal(r.status, 1, r.out);
    assert.match(r.out, new RegExp(field.replace(/[()/]/g, "\\$&").split(" ")[0]));
  });
}

test("FAILS when the entry has no citation (even if all fields present)", () => {
  const f = entryFields();
  f["Source(s)"] = "trust me, it's a good pattern"; // no URL/doi/ISBN/page
  const r = run(render(f));
  assert.equal(r.status, 1, r.out);
  assert.match(r.out, /citation/);
});

test("accepts a book page citation like (p. 322)", () => {
  const f = entryFields();
  f["Source(s)"] = "Fowler, PoEAA (p. 322)";
  assert.equal(run(render(f)).status, 0);
});

test("accepts the 'Verify it holds' label variant", () => {
  const f = entryFields();
  const v = f["Verify correct application"]; delete f["Verify correct application"];
  f["Verify it holds"] = v;
  assert.equal(run(render(f)).status, 0);
});

test("fails closed (exit 2) on a file with no ### entries", () => {
  assert.equal(run("# Catalog\n\njust prose, no entries\n").status, 2);
});
test("fails closed (exit 2) when the file is missing", () => {
  const r = spawnSync(process.execPath, [CHECK, join(tmpdir(), "nope-" + Date.now() + ".md")], { encoding: "utf8" });
  assert.equal(r.status, 2);
});
test("fails closed (exit 2) with no arguments", () => {
  assert.equal(spawnSync(process.execPath, [CHECK], { encoding: "utf8" }).status, 2);
});

// Fitness function: the repo's OWN shipped catalogs must stay complete + cited on every PR.
test("the shipped catalogs (GoF + enterprise) are complete and cited", () => {
  const catalogs = [
    resolve(REPO, "pattern-selector/references/design-patterns-catalog.md"),
    resolve(REPO, "pattern-selector/references/enterprise-patterns.md"),
  ];
  const r = spawnSync(process.execPath, [CHECK, ...catalogs], { encoding: "utf8" });
  assert.equal(r.status, 0, (r.stdout || "") + (r.stderr || ""));
});
