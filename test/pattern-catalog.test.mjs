// Discriminating tests for .claude/skills/pattern-selector/scripts/check-catalog-completeness.mjs.
// A fully-templated + cited entry passes; dropping any required field or the citation fails; bad input
// fails closed.
import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtempSync, writeFileSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const REPO = resolve(dirname(fileURLToPath(import.meta.url)), "..");
// CATALOG_GATE lets the BDD step run these same tests against a deliberately broken copy of the gate, to prove
// the tests notice (poeaa-gate-test-discriminates).
const CHECK = process.env.CATALOG_GATE || resolve(REPO, ".claude/skills/pattern-selector/scripts/check-catalog-completeness.mjs");
const REAL_REGISTRY = resolve(REPO, ".claude/skills/pattern-selector/references/poeaa-registry.json");
const realRows = () => JSON.parse(readFileSync(REAL_REGISTRY, "utf8")).patterns;

// A registry for a one-entry test catalog: the real 51 rows with every pattern declined, so coverage has
// nothing to demand. edit(rows) may change rows before it is written.
function registryFile(edit = (rows) => rows) {
  const rows = edit(realRows().map((r) => ({ ...r, status: "declined", reason: "not in this test catalog" })));
  const dir = mkdtempSync(join(tmpdir(), "reg-"));
  const f = join(dir, "poeaa-registry.json");
  writeFileSync(f, JSON.stringify({ patterns: rows }));
  return f;
}

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
function run(md, { registry = registryFile(), also = [] } = {}) {
  const dir = mkdtempSync(join(tmpdir(), "cat-"));
  const f = join(dir, "design-patterns-catalog.md");
  writeFileSync(f, md);
  const extra = also.flatMap((text, i) => { const p = join(dir, `also-${i}.md`); writeFileSync(p, text); return ["--also-scan", p]; });
  const r = spawnSync(process.execPath, [CHECK, "--registry", registry, ...extra, f], { encoding: "utf8" });
  return { status: r.status, out: (r.stdout || "") + (r.stderr || "") };
}
// One entry whose Source is the given text.
const withSource = (src, title) => render({ ...entryFields(), "Source(s)": src }, title);

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
  f["Source(s)"] = "Evans, Domain-Driven Design, Aggregates (p. 125)";
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

test("accepts a book page citation like (p. 322) for a book other than PoEAA", () => {
  const f = entryFields();
  f["Source(s)"] = "Evans, Domain-Driven Design (p. 322)";
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
  const r = spawnSync(process.execPath, [CHECK, "--registry", registryFile(), join(tmpdir(), "nope-" + Date.now() + ".md")], { encoding: "utf8" });
  assert.equal(r.status, 2);
});
test("fails closed (exit 2) with no arguments", () => {
  assert.equal(spawnSync(process.execPath, [CHECK], { encoding: "utf8" }).status, 2);
});

// --- PoEAA citations are checked against the page registry (ADR-0106, audit F1) ---------------------------

test("PoEAA: the right page passes", () => {
  const r = run(withSource("Fowler, *PoEAA*, Repository (322), ISBN 0-321-12742-0"));
  assert.equal(r.status, 0, r.out);
});

for (const cited of [17, 999, 321, 323, 1999]) {
  test(`PoEAA: a wrong page (${cited}) fails and names the pattern, the cited page, and the registry page (discriminating)`, () => {
    const r = run(withSource(`Fowler, *PoEAA*, Repository (${cited}), ISBN 0-321-12742-0`));
    assert.equal(r.status, 1, r.out);
    assert.match(r.out, new RegExp(`"Repository" cites page ${cited}, but the registry page is 322`));
  });
}

test("PoEAA: a pattern named with no page fails", () => {
  const r = run(withSource("Fowler, *PoEAA*, Repository, ISBN 0-321-12742-0"));
  assert.equal(r.status, 1, r.out);
  assert.match(r.out, /has no page/);
});

test("PoEAA: the ISBN alone no longer satisfies a PoEAA source", () => {
  const r = run(withSource("Fowler, Patterns of Enterprise Application Architecture, ISBN 0-321-12742-0"));
  assert.equal(r.status, 1, r.out);
  assert.match(r.out, /a PoEAA source needs a pattern page or a chapter/);
});

test("PoEAA: a pattern name that is not in the book fails", () => {
  const r = run(withSource("Fowler, *PoEAA*, Repositry (322), ISBN 0-321-12742-0"));
  assert.equal(r.status, 1, r.out);
  assert.match(r.out, /"Repositry" is not in the PoEAA registry/);
});

for (const [chapter, exit] of [[1, 0], [2, 0], [18, 0], [0, 1], [19, 1]]) {
  test(`PoEAA: a chapter citation ch. ${chapter} exits ${exit}`, () => {
    const r = run(withSource(`Fowler, *PoEAA*, ch. ${chapter}, ISBN 0-321-12742-0`));
    assert.equal(r.status, exit, r.out);
  });
}

for (const [text, exit] of [
  ["Active Record (160) is cheaper", 0], ["Active Record (161) is cheaper", 1],
  ["built on Metadata Mapping (306)", 0], ["built on Metadata Mapping (329)", 1],
  ["uses a Table Data Gateway (144)", 0], ["reached by a Data Mapper (165)", 0],
  ["wrapped in a Gateway (466)", 0], ["wrapped in a Gateway (144)", 1],
]) {
  test(`PoEAA: a bare cross-reference "${text}" exits ${exit} (longest name wins)`, () => {
    const f = entryFields(); f["Avoid when"] = text;
    const r = run(render(f));
    assert.equal(r.status, exit, r.out);
  });
}

// Regressions from the WP2 fresh-context review: each of these wrong citations passed the first draft of the gate.
for (const [label, src] of [
  ["a two-digit page after a word in a Source", "Fowler, *PoEAA*, see Repository (32); ISBN 0-321-12742-0."],
  ["a four-digit page followed by more text", "Fowler, *PoEAA*, Repository (3220) and Unit of Work (184)."],
  ["a misspelled name followed by more text", "Fowler, *PoEAA*, Repositry (322) and Unit of Work (184)."],
  ["a lowercase name", "Fowler, *PoEAA*, repository (999)."],
  ["spaces inside the parentheses", "Fowler, *PoEAA*, Repository ( 999 )."],
  ["a (p. NNN) page on a registry name", "Fowler, *PoEAA*, Repository (p. 999)."],
  ["a chapter outside 1 to 18 under the full title", "Fowler, Patterns of Enterprise Application Architecture, ch. 42."],
  ["another book's chapter with only the PoEAA ISBN", "Evans, Domain-Driven Design, ch. 5; Fowler, ISBN 0-321-12742-0."],
]) {
  test(`PoEAA: ${label} fails (review regression)`, () => {
    const r = run(withSource(src));
    assert.equal(r.status, 1, r.out);
  });
}

for (const [text, exit] of [
  ["see Model-View-Controller (999)", 1], ["see Model-View-Controller (MVC) (330)", 0],
  ["a Null Object (999)", 1], ["a Null Object (496)", 0],
  ["a Data Transfer Object (DTO) (999)", 1], ["a DTO (401)", 0],
  ["a unit of work (185)", 1],
]) {
  test(`PoEAA: the catalog's own spelling "${text}" is checked too and exits ${exit} (review regression)`, () => {
    const f = entryFields(); f["Avoid when"] = text;
    const r = run(render(f));
    assert.equal(r.status, exit, r.out);
  });
}

test("PoEAA: a wrong page in an --also-scan file (the chooser) fails too", () => {
  const r = run(render(entryFields()), { also: ["| a loop runs one query per row | Lazy Load (201) |"] });
  assert.equal(r.status, 1, r.out);
  assert.match(r.out, /"Lazy Load" cites page 201, but the registry page is 200/);
});

test("PoEAA: a covered pattern with no catalog heading fails coverage", () => {
  const reg = registryFile((rows) => rows.map((r) => (r.name === "Two Step View" ? { ...r, status: "covered" } : r)));
  const r = run(render(entryFields()), { registry: reg });
  assert.equal(r.status, 1, r.out);
  assert.match(r.out, /"Two Step View" is covered in the registry but missing from the catalog/);
});

for (const [pattern, heading, cluster] of [
  ["Repository", "Repository", "persistence"],
  ["Model View Controller", "Model-View-Controller (MVC)", "presentation"],
  ["Data Transfer Object", "Data Transfer Object (DTO)", "application/integration"],
  ["Special Case", "Null Object (Special Case)", "domain/DDD"],
]) {
  test(`PoEAA: "${pattern}" counts as covered by the heading "### ${heading}, ${cluster}"`, () => {
    const reg = registryFile((rows) => rows.map((r) => (r.name === pattern ? { ...r, status: "covered", heading } : r)));
    const ok = run(render(entryFields(), `${heading}, ${cluster}`), { registry: reg });
    assert.equal(ok.status, 0, ok.out);
    const missing = run(render(entryFields(), `Something Else, ${cluster}`), { registry: reg });
    assert.equal(missing.status, 1, missing.out);
  });
}

test("PoEAA: a declined pattern with an empty reason fails", () => {
  const reg = registryFile((rows) => rows.map((r) => (r.name === "Record Set" ? { ...r, reason: "" } : r)));
  const r = run(render(entryFields()), { registry: reg });
  assert.equal(r.status, 1, r.out);
  assert.match(r.out, /a declined pattern needs a reason/);
});

test("PoEAA: a missing registry is a block (exit 2) that names the path", () => {
  const gone = join(tmpdir(), `no-registry-${Date.now()}.json`);
  const r = run(render(entryFields()), { registry: gone });
  assert.equal(r.status, 2, r.out);
  assert.ok(r.out.includes(gone), r.out);
});

test("PoEAA: the catalog header shows both citation forms, and its example passes the gate", () => {
  const md = readFileSync(resolve(REPO, ".claude/skills/pattern-selector/references/enterprise-patterns.md"), "utf8");
  const header = md.slice(0, md.indexOf("\n### "));
  assert.match(header, /Fowler, \*PoEAA\*,\s+<Pattern> \(<page>\)/);
  assert.match(header, /Fowler, \*PoEAA\*, ch\. <n>/);
  const example = header.match(/for example `(Fowler, \*PoEAA\*, [^`]+)`/);
  assert.ok(example, "the header gives an example citation");
  assert.equal(run(withSource(example[1])).status, 0);
});

// Fitness function: the repo's OWN shipped catalogs must stay complete, cited, and correctly cited on every PR.
test("the shipped catalogs (GoF + enterprise) are complete, cited, and match the PoEAA registry", () => {
  const ref = (n) => resolve(REPO, ".claude/skills/pattern-selector/references", n);
  const r = spawnSync(process.execPath, [CHECK,
    "--also-scan", ref("choosing-a-pattern.md"), "--also-scan", ref("anti-patterns-and-smells.md"),
    "--also-scan", ref("criticism-and-limits.md"), "--also-scan", resolve(REPO, ".claude/skills/pattern-selector/SKILL.md"),
    ref("design-patterns-catalog.md"), ref("enterprise-patterns.md")], { encoding: "utf8" });
  assert.equal(r.status, 0, (r.stdout || "") + (r.stderr || ""));
});
