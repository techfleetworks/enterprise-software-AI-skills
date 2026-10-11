// Discriminating tests for owasp-secure-coding-bdd/scripts/check-cheatsheet-catalog.mjs.
//
// The gate resolves its paths from its own file location, so each test copies the REAL gate into a throwaway
// skill dir (scripts/ + references/ + SKILL.md) and runs it there (the copy-into-fixture pattern from
// check-test-patterns.md). Covered: a compliant catalog passes; a done sheet missing its file, a file missing
// a required section, a Sources block with no URL, a done file not indexed in SKILL.md, an orphan file, and a
// file present but marked done:false all FAIL (exit 1); an empty/missing manifest fails closed (exit 2).
import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, cpSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const REPO = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const REAL_GATE = resolve(REPO, "owasp-secure-coding-bdd/scripts/check-cheatsheet-catalog.mjs");

const SECTIONS = [
  "# Title",
  "## What it is",
  "body",
  "## The attack it stops",
  "body",
  "## Controls",
  "body",
  "## @security scenario",
  "```gherkin",
  "@security @usecase:example",
  "Scenario: the attack is rejected",
  "  Given a request",
  "  When an attacker sends the payload",
  "  Then the control rejects it",
  "```",
  "## The real guarantee",
  "body",
  "## Sources",
  "- OWASP sheet https://cheatsheetseries.owasp.org/cheatsheets/Example_Cheat_Sheet.html (retrieved 2026-10-10)",
];
const goodSheet = SECTIONS.join("\n") + "\n";

// Build a fixture skill dir. sheets = {slug: {done, body?}}; indexSlugs = which slugs SKILL.md routes to.
function fixture({ manifestSheets, files = {}, indexSlugs = null, skill = null }) {
  const dir = mkdtempSync(join(tmpdir(), "owasp-cat-"));
  mkdirSync(join(dir, "scripts"), { recursive: true });
  mkdirSync(join(dir, "references", "cheatsheets"), { recursive: true });
  cpSync(REAL_GATE, join(dir, "scripts", "check-cheatsheet-catalog.mjs"));
  if (manifestSheets !== undefined) {
    writeFileSync(join(dir, "references", "cheatsheets-manifest.json"), JSON.stringify({ count: manifestSheets.length, sheets: manifestSheets }, null, 2));
  }
  for (const [name, body] of Object.entries(files)) writeFileSync(join(dir, "references", "cheatsheets", name), body);
  const routed = indexSlugs || (manifestSheets || []).map((s) => s.slug);
  const index = routed.map((s) => `| ${s} | references/cheatsheets/${s}.md |`).join("\n");
  writeFileSync(join(dir, "SKILL.md"), skill != null ? skill : `# owasp\n\n## Routing index\n${index}\n`);
  return dir;
}

function run(dir) {
  const r = spawnSync(process.execPath, [join(dir, "scripts", "check-cheatsheet-catalog.mjs")], { encoding: "utf8" });
  return { status: r.status, out: (r.stdout || "") + (r.stderr || "") };
}

test("PASS: a done sheet with all sections, a citation, and an index entry", () => {
  const dir = fixture({ manifestSheets: [{ slug: "Example", title: "Example", url: "u", done: true }], files: { "Example.md": goodSheet } });
  const r = run(dir);
  assert.equal(r.status, 0, r.out);
  assert.match(r.out, /1\/1/);
});

test("PASS: a not-done sheet with no file (backlog) still passes (ratchet)", () => {
  const dir = fixture({ manifestSheets: [{ slug: "Later", title: "Later", url: "u", done: false }] });
  assert.equal(run(dir).status, 0);
});

test("FAIL: a done sheet whose file is missing (exit 1, discriminating)", () => {
  const dir = fixture({ manifestSheets: [{ slug: "Gone", title: "Gone", url: "u", done: true }] });
  const r = run(dir);
  assert.equal(r.status, 1);
  assert.match(r.out, /marked done but .* is missing/);
});

test("FAIL: a file missing a required section (exit 1, discriminating)", () => {
  const bad = goodSheet.replace("## The real guarantee", "## Something else");
  const dir = fixture({ manifestSheets: [{ slug: "Example", title: "Example", url: "u", done: true }], files: { "Example.md": bad } });
  const r = run(dir);
  assert.equal(r.status, 1);
  assert.match(r.out, /missing required section "## The real guarantee"/);
});

test("FAIL: a @security section that is prose, not a Gherkin scenario (exit 1, discriminating)", () => {
  const bad = goodSheet.replace(
    /## @security scenario[\s\S]*?## The real guarantee/,
    "## @security scenario\nWe should test that injection is blocked.\n\n## The real guarantee"
  );
  const dir = fixture({ manifestSheets: [{ slug: "Example", title: "Example", url: "u", done: true }], files: { "Example.md": bad } });
  const r = run(dir);
  assert.equal(r.status, 1);
  assert.match(r.out, /not a real Gherkin scenario/);
});

test("FAIL: a scenario with Gherkin keywords but NO @security tag (exit 1, discriminating)", () => {
  // Scenario/Given/When/Then present, but the @security tag removed from the body. The heading still contains
  // the literal "@security", so this catches the vacuous-tag-check regression.
  const bad = goodSheet.replace("@security @usecase:example\n", "");
  const dir = fixture({ manifestSheets: [{ slug: "Example", title: "Example", url: "u", done: true }], files: { "Example.md": bad } });
  const r = run(dir);
  assert.equal(r.status, 1);
  assert.match(r.out, /not a real Gherkin scenario/);
  assert.match(r.out, /@security/);
});

test("FAIL: a manifest slug missing from the SKILL.md routing index (exit 1, discriminating)", () => {
  const dir = fixture({
    manifestSheets: [
      { slug: "Example", title: "Example", url: "u", done: true },
      { slug: "Pending_One", title: "Pending One", url: "u", done: false },
    ],
    files: { "Example.md": goodSheet },
    indexSlugs: ["Example"], // Pending_One deliberately dropped from the index
  });
  const r = run(dir);
  assert.equal(r.status, 1);
  assert.match(r.out, /Pending_One: in the manifest but missing from the SKILL\.md routing index/);
});

test("FAIL: a Sources block with no citation URL (exit 1, discriminating)", () => {
  const bad = goodSheet.replace(/- OWASP sheet https:\S+ \(retrieved 2026-10-10\)/, "- OWASP sheet (no link)");
  const dir = fixture({ manifestSheets: [{ slug: "Example", title: "Example", url: "u", done: true }], files: { "Example.md": bad } });
  const r = run(dir);
  assert.equal(r.status, 1);
  assert.match(r.out, /no citation URL/);
});

test("FAIL: a done file not indexed in SKILL.md (exit 1, discriminating)", () => {
  const dir = fixture({ manifestSheets: [{ slug: "Example", title: "Example", url: "u", done: true }], files: { "Example.md": goodSheet }, skill: "# owasp\n\n(no index here)\n" });
  const r = run(dir);
  assert.equal(r.status, 1);
  assert.match(r.out, /not indexed in SKILL\.md/);
});

test("FAIL: an orphan file with no manifest entry (exit 1, discriminating)", () => {
  const dir = fixture({ manifestSheets: [{ slug: "Example", title: "Example", url: "u", done: true }], files: { "Example.md": goodSheet, "Orphan.md": goodSheet } });
  const r = run(dir);
  assert.equal(r.status, 1);
  assert.match(r.out, /Orphan\.md: no manifest entry/);
});

test("FAIL: a file present but manifest says done:false (exit 1, discriminating)", () => {
  const dir = fixture({ manifestSheets: [{ slug: "Example", title: "Example", url: "u", done: false }], files: { "Example.md": goodSheet } });
  const r = run(dir);
  assert.equal(r.status, 1);
  assert.match(r.out, /manifest says done:false/);
});

test("FAIL CLOSED: empty manifest (exit 2)", () => {
  const dir = fixture({ manifestSheets: [] });
  assert.equal(run(dir).status, 2);
});

test("FAIL CLOSED: missing manifest (exit 2)", () => {
  const dir = fixture({ manifestSheets: undefined });
  assert.equal(run(dir).status, 2);
});
