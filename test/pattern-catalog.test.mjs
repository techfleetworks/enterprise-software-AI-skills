// Discriminating tests for .claude/skills/pattern-selector/scripts/check-catalog-completeness.mjs.
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
const CHECK = resolve(REPO, ".claude/skills/pattern-selector/scripts/check-catalog-completeness.mjs");

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

// Every one of the 15 required fields must be individually enforced (discriminating on all, not a subset).
for (const field of Object.keys(entryFields())) {
  test(`FAILS when the "${field}" field is missing (discriminating)`, () => {
    const f = entryFields(); delete f[field];
    assert.equal(run(render(f)).status, 1, `expected FAIL when "${field}" is missing`);
  });
}

// A present-but-EMPTY field (label with no content) must also fail — not just a missing label.
test("FAILS when a field label is present but its value is empty (discriminating)", () => {
  const f = entryFields(); f["Security trade-off"] = "";
  assert.equal(run(render(f)).status, 1);
});

test("FAILS when the only citation is Wikipedia (the no-Wikipedia rule is enforced, not just stated)", () => {
  const f = entryFields();
  f["Source(s)"] = "https://en.wikipedia.org/wiki/Factory_method_pattern";
  const r = run(render(f));
  assert.equal(r.status, 1, r.out);
  assert.match(r.out, /citation/);
});

test("FAILS when a bare year like (1994) is the only citation token (not a real source)", () => {
  const f = entryFields();
  f["Source(s)"] = "the book, published (1994)";
  assert.equal(run(render(f)).status, 1);
});

test("FAILS when a p99/p95 latency string is the only citation token (not a book page, discriminating)", () => {
  const f = entryFields();
  f["Source(s)"] = "folklore; adds about 40ms at p99 latency under load, no real cite here";
  const r = run(render(f));
  assert.equal(r.status, 1, r.out);
  assert.match(r.out, /citation/);
});
test("PASSES when a real book page citation (p. 322) is the source (no false positive)", () => {
  const f = entryFields();
  f["Source(s)"] = "Fowler, Patterns of Enterprise Application Architecture, Repository (p. 322)";
  assert.equal(run(render(f)).status, 0, run(render(f)).out);
});

test("fields written only INSIDE a fenced code block do not satisfy the entry (fence-blind fix)", () => {
  const fenced = "# Catalog\n\nintro\n\n### Foo — Creational\n```\n" +
    Object.entries(entryFields()).map(([k, v]) => `${k}: ${v}`).join("\n") +
    "\n### Nested Heading In Fence\n```\n";
  const r = run(fenced);
  assert.equal(r.status, 1, r.out); // the real entry has no fields once the fence is stripped
  assert.doesNotMatch(r.out, /Nested Heading/); // and the ### inside the fence is not a spurious entry
});

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
    resolve(REPO, ".claude/skills/pattern-selector/references/design-patterns-catalog.md"),
    resolve(REPO, ".claude/skills/pattern-selector/references/enterprise-patterns.md"),
  ];
  const r = spawnSync(process.execPath, [CHECK, ...catalogs], { encoding: "utf8" });
  assert.equal(r.status, 0, (r.stdout || "") + (r.stderr || ""));
});
