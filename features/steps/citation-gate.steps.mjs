// Step definitions for features/pattern-selector/citation-gate.feature (v1.4 WP2, ADR-0106).
// Every scenario drives the REAL catalog gate (check-catalog-completeness.mjs) or the REAL registry test
// (test/poeaa-registry.test.mjs) against a throwaway catalog and registry, so a gate that stopped comparing
// pages would turn these red. The registry fixture starts as the real 51 rows with every pattern declined, so a
// one-entry catalog has no coverage to satisfy unless a scenario marks a row covered.
import { mkdtempSync, writeFileSync, readFileSync, mkdirSync, copyFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";
import assert from "node:assert/strict";

const REPO = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..");
const SKILL = join(REPO, ".claude/skills/pattern-selector");
const GATE = join(SKILL, "scripts/check-catalog-completeness.mjs");
const REGISTRY = join(SKILL, "references/poeaa-registry.json");
const CATALOG = join(SKILL, "references/enterprise-patterns.md");

const realRows = () => JSON.parse(readFileSync(REGISTRY, "utf8")).patterns;
const out = (r) => (r.stdout || "") + (r.stderr || "");
const tmp = (prefix) => mkdtempSync(join(tmpdir(), prefix));

// One fully templated entry; the scenario sets its title, its Source, and its Avoid when text.
function entry({ title = "Test Pattern, testing", source = "Evans, Domain-Driven Design, ISBN 0-321-12521-5", avoid = "a single caller" } = {}) {
  const fields = {
    Intent: "a stated intent", Forces: "the forces", "Best situation": "the best case", Pros: "the pros", Cons: "the cons",
    "Avoid when": avoid, "Failure/rot prevented": "the rot", Misuse: "a misuse", "Security trade-off": "none notable",
    "Operational cost": "low", "Adopt safely": "behind a flag", "Modern alternative": "a function",
    "Verify correct application": "a unit test", Example: "an example", "Source(s)": source,
  };
  return `# Test catalog\n\n### ${title}\n${Object.entries(fields).map(([k, v]) => `${k}: ${v}`).join("\n")}\n`;
}

function runGate(world) {
  const dir = tmp("cite-");
  const catalog = join(dir, "catalog.md");
  writeFileSync(catalog, entry({ title: world.title, source: world.source, avoid: world.avoid }));
  let registry = world.registryPath;
  if (!registry) {
    registry = join(dir, "poeaa-registry.json");
    writeFileSync(registry, JSON.stringify({ patterns: world.rows }));
  }
  world.registryUsed = registry;
  world.result = spawnSync(process.execPath, [GATE, "--registry", registry, catalog], { encoding: "utf8" });
}
const row = (world, name) => {
  const r = world.rows.find((x) => x.name === name);
  assert.ok(r, `"${name}" is not in the registry`);
  return r;
};

export default function ({ Given, When, Then, And }) {
  Given(/^the PoEAA page registry lists all 51 catalog patterns with their printed pages$/, (world) => {
    world.rows = realRows().map((r) => ({ ...r, status: "declined", reason: "not in this test catalog" }));
    assert.equal(world.rows.length, 51);
  });
  And(/^the registry lists "([^"]+)" at printed page (\d+)$/, (world, name, page) => {
    assert.equal(row(world, name).page, Number(page));
  });

  // --- the entry under test ---
  Given(/^a catalog entry cites "(.+)"$/, (world, cite) => { world.source = `${cite}, ISBN 0-321-12742-0`; });
  Given(/^a catalog entry cites "(.+)" with no page$/, (world, cite) => { world.source = `${cite}, ISBN 0-321-12742-0`; });
  Given(/^a catalog entry's Source field names PoEAA and the ISBN "([^"]+)"$/, (world, isbn) => {
    world.source = `Fowler, Patterns of Enterprise Application Architecture, ISBN ${isbn}`;
  });
  And(/^the entry carries no "<Pattern> \(<page>\)" or chapter citation$/, (world) => {
    assert.doesNotMatch(world.source, /\(\d+\)|ch\.\s*\d/);
  });
  Given(/^a catalog entry's text contains "(.+)"$/, (world, text) => { world.avoid = text; });

  When(/^the catalog gate checks (?:the catalog|coverage)$/, (world) => runGate(world));
  Then(/^the gate exits (\d)$/, (world, code) => assert.equal(world.result.status, Number(code), out(world.result)));

  And(/^the message names "([^"]+)", the cited page (\d+), and the registry page (\d+)$/, (world, name, cited, page) => {
    assert.match(out(world.result), new RegExp(`"${name}" cites page ${cited}, but the registry page is ${page}`));
  });
  And(/^the message says the citation has no page$/, (world) => assert.match(out(world.result), /has no page/));
  And(/^the message says a PoEAA source needs a pattern page or a chapter$/, (world) => {
    assert.match(out(world.result), /a PoEAA source needs a pattern page or a chapter/);
  });
  And(/^the message says "([^"]+)" is not in the PoEAA registry$/, (world, name) => {
    assert.match(out(world.result), new RegExp(`"${name}" is not in the PoEAA registry`));
  });

  // --- the registry's own test ---
  Given(/^the registry lists "([^"]+)" at (\d+) and "([^"]+)" at (\d+)$/, (world, a, pa, b, pb) => {
    world.rows ||= realRows();
    assert.equal(row(world, a).page, Number(pa));
    assert.equal(row(world, b).page, Number(pb));
  });
  And(/^a maintainer changes "([^"]+)" to (\d+)(?: in the registry)?$/, (world, name, page) => {
    world.rows ||= realRows();
    row(world, name).page = Number(page);
  });
  Given(/^the registry holds (\d+) patterns$/, (world, n) => {
    const rows = realRows();
    const count = Number(n);
    world.rows = count <= rows.length ? rows.slice(0, count) : [...rows, ...Array.from({ length: count - rows.length }, (_, i) => ({ ...rows[50], name: `Extra ${i}`, page: 900 + i }))];
  });
  Given(/^the registry's test pins the 15 pages the audit matched to the book's cross-references$/, (world) => {
    const src = readFileSync(join(REPO, "test/poeaa-registry.test.mjs"), "utf8");
    const pinned = src.slice(src.indexOf("const PINNED"), src.indexOf("};", src.indexOf("const PINNED")));
    assert.equal((pinned.match(/"[^"]+": \d+/g) || []).length, 15);
    world.rows = realRows();
  });
  When(/^the registry's own test runs$/, (world) => {
    const f = join(tmp("reg-"), "poeaa-registry.json");
    writeFileSync(f, JSON.stringify({ patterns: world.rows }));
    world.result = spawnSync(process.execPath, ["--test", join(REPO, "test/poeaa-registry.test.mjs")], { encoding: "utf8", env: { ...process.env, POEAA_REGISTRY: f } });
  });
  Then(/^the test (passes|fails)$/, (world, verdict) => {
    assert.equal(world.result.status === 0, verdict === "passes", out(world.result));
  });
  And(/^the message names "([^"]+)" as out of order$/, (world, name) => {
    assert.match(out(world.result), new RegExp(`"${name}" at page \\d+ is out of order`));
  });
  And(/^the message names "([^"]+)" with the pinned page (\d+)$/, (world, name, page) => {
    assert.match(out(world.result), new RegExp(`"${name}" must be at the pinned page ${page}`));
  });

  // --- coverage ---
  Given(/^the registry marks "([^"]+)" as "(covered|declined)" with the heading "([^"]+)"$/, (world, name, status, heading) => {
    Object.assign(row(world, name), { status, heading });
  });
  Given(/^the registry marks "([^"]+)" as "declined" with an empty reason$/, (world, name) => {
    Object.assign(row(world, name), { status: "declined", reason: "" });
  });
  And(/^no catalog heading starts with "([^"]+)"$/, (world, heading) => {
    world.title = "Some Other Pattern, testing";
    assert.ok(!world.title.startsWith(heading));
  });
  Given(/^the registry row "([^"]+)" has the heading "([^"]+)"$/, (world, name, heading) => {
    Object.assign(row(world, name), { status: "covered", heading });
  });
  And(/^the catalog has the entry "### (.+)"$/, (world, title) => { world.title = title; });
  Then(/^the gate counts "([^"]+)" as covered$/, (world, name) => {
    assert.equal(world.result.status, 0, out(world.result));
    assert.equal(row(world, name).status, "covered");
    assert.match(out(world.result), /1 covered, 50 declined/);
  });
  And(/^the message names "([^"]+)" as covered in the registry but missing from the catalog$/, (world, name) => {
    assert.match(out(world.result), new RegExp(`"${name}" is covered in the registry but missing from the catalog`));
  });
  And(/^the message says a declined pattern needs a reason$/, (world) => assert.match(out(world.result), /a declined pattern needs a reason/));

  // --- fail closed ---
  Given(/^the PoEAA page registry file does not exist$/, (world) => {
    world.registryPath = join(tmp("noreg-"), "poeaa-registry.json");
  });
  And(/^the message names the registry path it expected$/, (world) => {
    assert.ok(out(world.result).includes(world.registryPath), out(world.result));
  });

  // --- the gate's own tests can fail (mutation) ---
  Given(/^the page comparison in the catalog gate is replaced by one that always passes$/, (world) => {
    const dir = tmp("mutant-");
    for (const sub of ["scripts", "references"]) mkdirSync(join(dir, sub));
    copyFileSync(GATE, join(dir, "scripts/check-catalog-completeness.mjs"));
    copyFileSync(REGISTRY, join(dir, "references/poeaa-registry.json"));
    const lib = readFileSync(join(SKILL, "scripts/poeaa-registry.mjs"), "utf8");
    const target = ".filter((t) => t.page !== t.row.page) // mutation-target: page-compare";
    assert.ok(lib.includes(target), "the page comparison is marked as the mutation target");
    writeFileSync(join(dir, "scripts/poeaa-registry.mjs"), lib.replace(target, ".filter(() => false)"));
    world.mutantGate = join(dir, "scripts/check-catalog-completeness.mjs");
  });
  When(/^the gate's committed tests run$/, (world) => {
    world.result = spawnSync(process.execPath, ["--test", "--test-name-pattern=PoEAA", join(REPO, "test/pattern-catalog.test.mjs")],
      { encoding: "utf8", env: { ...process.env, CATALOG_GATE: world.mutantGate } });
  });
  Then(/^at least one test fails$/, (world) => assert.notEqual(world.result.status, 0, out(world.result)));
  And(/^the failing test is the one that plants a wrong page$/, (world) => {
    assert.match(out(world.result), /✖ PoEAA: a wrong page \(\d+\) fails/);
  });

  // --- the header documents the enforced forms ---
  Given(/^the header of the enterprise catalog$/, (world) => {
    const md = readFileSync(CATALOG, "utf8");
    world.header = md.slice(0, md.indexOf("\n### "));
  });
  When(/^a maintainer reads how to cite PoEAA$/, (world) => { world.example = (world.header.match(/for example `(Fowler, \*PoEAA\*, [^`]+)`/) || [])[1]; });
  Then(/^the header shows the form "<Pattern> \(<page>\)" and the form "ch\. <n>"$/, (world) => {
    assert.match(world.header, /<Pattern> \(<page>\)/);
    assert.match(world.header, /ch\. <n>/);
  });
  And(/^the example citation in the header passes the catalog gate$/, (world) => {
    assert.ok(world.example, "the header gives an example citation");
    world.rows = realRows().map((r) => ({ ...r, status: "declined", reason: "not in this test catalog" }));
    world.source = world.example;
    runGate(world);
    assert.equal(world.result.status, 0, out(world.result));
  });
}
