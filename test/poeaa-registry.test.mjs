// Tests for the PoEAA page registry (.claude/skills/pattern-selector/references/poeaa-registry.json, ADR-0106)
// and its reader (scripts/poeaa-registry.mjs). The registry owns the book's page facts, so a typo here would
// make the catalog gate enforce a wrong page. Two independent checks catch that: the shape and order check
// (pages rise in catalog order), and the 15 pages the audit matched to the book, pinned below, which catch
// an in-order typo such as Repository 322 changed to 320.
// POEAA_REGISTRY points these tests at another registry file (the BDD steps use it to plant a bad one).
import { test } from "node:test";
import assert from "node:assert/strict";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { loadRegistry, validateRegistry, namedPageTokens, wrongPages, prefixedCitations, unknownNamedTokens, chapterOk, resolveName } from "../.claude/skills/pattern-selector/scripts/poeaa-registry.mjs";

const REPO = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const PATH = process.env.POEAA_REGISTRY || resolve(REPO, ".claude/skills/pattern-selector/references/poeaa-registry.json");
const rows = loadRegistry(PATH);

// The pages the audit matched to the book's own cross-references and that the catalog already cited
// (docs/audit/poeaa-2026-11/poeaa-adversarial-audit.md, "What did hold up").
const PINNED = {
  "Service Layer": 133, "Active Record": 160, "Data Mapper": 165, "Unit of Work": 184, "Identity Map": 195,
  "Lazy Load": 200, "Serialized LOB": 272, "Metadata Mapping": 306, "Query Object": 316, "Repository": 322,
  "Model View Controller": 330, "Data Transfer Object": 401, "Gateway": 466, "Value Object": 486, "Special Case": 496,
};

test("the registry is well formed: 51 unique patterns, pages rising in catalog order, every field set", () => {
  assert.deepEqual(validateRegistry(rows), []);
});

test("the registry pins the 15 pages the audit matched to the book", () => {
  for (const [name, page] of Object.entries(PINNED)) {
    const row = rows.find((r) => r.name === name);
    assert.ok(row, `"${name}" is missing from the registry`);
    assert.equal(row.page, page, `"${name}" must be at the pinned page ${page}, found ${row.page}`);
  }
});

// --- the validator rejects each kind of bad registry (discriminating, in memory) ---------------------------

const copy = () => rows.map((r) => ({ ...r }));
for (const [label, edit, expect] of [
  ["50 rows", (r) => r.slice(0, 50), /exactly 51 patterns, found 50/],
  ["52 rows", (r) => [...r, { ...r[50], name: "Extra", page: 999 }], /exactly 51 patterns, found 52/],
  ["0 rows", () => [], /exactly 51 patterns, found 0/],
  ["a duplicate", (r) => { r[1] = { ...r[0], page: r[1].page }; return r; }, /appears more than once/],
  ["a page out of order", (r) => { r.find((x) => x.name === "Lazy Load").page = 190; return r; }, /"Lazy Load" at page 190 is out of order/],
  ["a chapter outside 9 to 18", (r) => { r[0].chapter = 8; return r; }, /chapter 8/],
  ["a declined row with no reason", (r) => { r[50].reason = ""; return r; }, /a declined pattern needs a reason/],
  ["an unknown status", (r) => { r[0].status = "maybe"; return r; }, /not covered or declined/],
]) {
  test(`the validator rejects ${label}`, () => {
    const problems = validateRegistry(edit(copy()));
    assert.ok(problems.some((p) => expect.test(p)), problems.join("\n"));
  });
}

test("the validator rejects an alias another row already uses", () => {
  const r = copy();
  r[1].aliases = [r[0].name];
  assert.ok(validateRegistry(r).some((p) => /already uses/.test(p)));
});

test("names resolve by registry name or alias, in any case, with a space or a hyphen", () => {
  for (const [written, name] of [["Model-View-Controller (MVC)", "Model View Controller"], ["model view controller", "Model View Controller"],
    ["Null Object", "Special Case"], ["DTO", "Data Transfer Object"], ["coarse grained lock", "Coarse-Grained Lock"]]) {
    assert.equal(resolveName(written, rows)?.name, name, written);
  }
  assert.equal(resolveName("Florble", rows), undefined);
});

test("loadRegistry throws, naming the path, for a missing file", () => {
  assert.throws(() => loadRegistry(resolve(REPO, "no-such-registry.json")), /no-such-registry\.json/);
});

// --- citation finding --------------------------------------------------------------------------------------

test("the longest registry name wins: Table Data Gateway and Data Mapper are not read as Gateway or Mapper", () => {
  const found = namedPageTokens("a Table Data Gateway (144), a Data Mapper (165), a Gateway (466), a Mapper (473)", rows);
  assert.deepEqual(found.map((t) => `${t.name}@${t.page}`), ["Table Data Gateway@144", "Data Mapper@165", "Gateway@466", "Mapper@473"]);
  assert.deepEqual(wrongPages("a Table Data Gateway (144) and a Data Mapper (165)", rows), []);
});

test("a name that wraps across a line still counts, and a year in parentheses does not", () => {
  assert.deepEqual(wrongPages("Identity\nMap (196)", rows), [{ name: "Identity Map", cited: 196, page: 195 }]);
  assert.deepEqual(namedPageTokens("Repository (2002)", rows), []);
});

test("prefixed citations: pattern with page, pattern with no page, and chapter", () => {
  assert.deepEqual(prefixedCitations("Fowler, *PoEAA*, Unit of Work (184), ISBN x. Fowler, *PoEAA*, Repository; Fowler, *PoEAA*, ch. 2."), [
    { kind: "pattern", name: "Unit of Work", page: 184 },
    { kind: "pattern", name: "Repository", page: null },
    { kind: "chapter", chapter: 2 },
  ]);
  assert.ok(chapterOk(1) && chapterOk(18) && !chapterOk(0) && !chapterOk(19));
});

test("unknown title-case tokens are found, and known names (with words before them) are not", () => {
  assert.deepEqual(unknownNamedTokens("Use Repository (322) over Florble (100) and a Table Data Gateway (144)", rows), [{ name: "Florble", page: 100 }]);
});

test("acronyms, short numbers, and the catalog's own spellings are not unknown names", () => {
  assert.deepEqual(unknownNamedTokens("follow-up in PR (415) and ADR (106); Step (2); Model-View-Controller (330); Null Object (496)", rows), []);
});
