// Discriminating tests for .claude/skills/owasp-secure-coding-bdd/scripts/check-cheatsheet-catalog.mjs.
//
// The gate resolves its paths from its own file location, so each test copies the REAL gate into a throwaway
// skill dir (scripts/ + references/ + SKILL.md) and runs it there (the copy-into-fixture pattern from
// check-test-patterns.md). Covered: a compliant catalog passes; a done sheet missing its file, a file missing
// a required section, a Sources block with no URL, a done file not indexed in SKILL.md, an orphan file, and a
// file present but marked done:false all FAIL (exit 1); an empty/missing manifest fails closed (exit 2). The
// stack-layer grouping is gated too: a correct multi-category grouping passes, while a wrong (done/total)
// count, a sheet filed under the wrong category, a wrong done/pending Status cell, a category heading the
// manifest lacks, and a manifest sheet with no category all FAIL. Deprecated sheets (manifest deprecated +
// supersededBy) are pointers: one that links its successor + cites a source PASSES without control sections or
// an @security scenario, while one that omits the successor link or names a non-manifest successor FAILS.
import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, cpSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const REPO = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const REAL_GATE = resolve(REPO, ".claude/skills/owasp-secure-coding-bdd/scripts/check-cheatsheet-catalog.mjs");

const SECTIONS = [
  "# Title",
  "## What it is",
  "A real description with enough substance to count as a section body.",
  "## The attack it stops",
  "A concrete attack this control stops, stated in a full sentence.",
  "## Controls",
  "The specific control and why it matters, written as real guidance.",
  "## @security scenario",
  "```gherkin",
  "@security @usecase:example",
  "Scenario: the attack is rejected",
  "  Given a request",
  "  When an attacker sends the payload",
  "  Then the control rejects it",
  "```",
  "## The real guarantee",
  "What the control truly guarantees, and the honest limit beyond it.",
  "## Sources",
  "- OWASP sheet https://cheatsheetseries.owasp.org/cheatsheets/Example_Cheat_Sheet.html (retrieved 2026-10-10)",
];
const goodSheet = SECTIONS.join("\n") + "\n";

// A valid deprecated-sheet pointer: says it is deprecated, links the successor per-sheet file, cites a source.
// Deprecated sheets are NOT required to carry the control sections or an @security scenario.
const deprecatedPointer = (succ) =>
  `# Old (deprecated)\n\nThis sheet is deprecated. Use [successor](references/cheatsheets/${succ}.md).\n\n## Sources\n- OWASP Old Cheat Sheet (https://cheatsheetseries.owasp.org/cheatsheets/Old_Cheat_Sheet.html, retrieved 2026-10-11): deprecated. [documented]\n`;

// Build a fixture skill dir. sheets = {slug: {done, category?, body?}}; indexSlugs = which slugs SKILL.md routes
// to. Sheets get a default category "General" unless one is given, and the generated SKILL.md groups them under
// "### <category> (done/total)" headings (the real catalog shape) so the grouping gate has an owner to check.
function fixture({ manifestSheets, files = {}, indexSlugs = null, skill = null }) {
  const dir = mkdtempSync(join(tmpdir(), "owasp-cat-"));
  mkdirSync(join(dir, "scripts"), { recursive: true });
  mkdirSync(join(dir, "references", "cheatsheets"), { recursive: true });
  cpSync(REAL_GATE, join(dir, "scripts", "check-cheatsheet-catalog.mjs"));
  const withCat = manifestSheets === undefined ? undefined : manifestSheets.map((s) => ({ ...s, category: s.category || "General" }));
  if (withCat !== undefined) {
    writeFileSync(join(dir, "references", "cheatsheets-manifest.json"), JSON.stringify({ count: withCat.length, sheets: withCat }, null, 2));
  }
  for (const [name, body] of Object.entries(files)) writeFileSync(join(dir, "references", "cheatsheets", name), body);
  const routed = new Set(indexSlugs || (withCat || []).map((s) => s.slug));
  const groups = new Map();
  for (const s of withCat || []) { if (!groups.has(s.category)) groups.set(s.category, []); groups.get(s.category).push(s); }
  let index = "";
  for (const [cat, arr] of groups) {
    const done = arr.filter((s) => s.done).length;
    index += `\n### ${cat} (${done}/${arr.length})\n\n| Cheat sheet | File | Status |\n|---|---|---|\n`;
    for (const s of arr) if (routed.has(s.slug)) index += `| ${s.slug} | references/cheatsheets/${s.slug}.md | ${s.deprecated ? "deprecated" : s.done ? "done" : "pending"} |\n`;
  }
  writeFileSync(join(dir, "SKILL.md"), skill != null ? skill : `# owasp\n\n## The cheat-sheet catalog\n${index}\n`);
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

test("PASS: a done sheet whose @security scenario is a Scenario Outline (valid Gherkin, no false positive)", () => {
  const outline = goodSheet.replace("Scenario: the attack is rejected", "Scenario Outline: the attack is rejected");
  const dir = fixture({ manifestSheets: [{ slug: "Example", title: "Example", url: "u", done: true }], files: { "Example.md": outline } });
  assert.equal(run(dir).status, 0, run(dir).out);
});

test("FAIL: a done sheet with a present-but-EMPTY required section (heading only, discriminating)", () => {
  const emptyControls = goodSheet.replace(/## Controls\n[^\n]*\n/, "## Controls\n\n");
  const dir = fixture({ manifestSheets: [{ slug: "Example", title: "Example", url: "u", done: true }], files: { "Example.md": emptyControls } });
  const r = run(dir);
  assert.equal(r.status, 1, r.out);
  assert.match(r.out, /Controls.*no real content|no real content/i);
});

test("FAIL: a done sheet whose @security scenario is a one-line fake (not real Gherkin, discriminating)", () => {
  const oneLine = goodSheet.replace(/  Given a request\n  When an attacker sends the payload\n  Then the control rejects it/, "  Given a request When an attacker sends the payload Then it rejects");
  const dir = fixture({ manifestSheets: [{ slug: "Example", title: "Example", url: "u", done: true }], files: { "Example.md": oneLine } });
  const r = run(dir);
  assert.equal(r.status, 1, r.out);
  assert.match(r.out, /multi-line Gherkin|own line in order/i);
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
  assert.match(r.out, /not a real multi-line Gherkin scenario/);
});

test("FAIL: a scenario with Gherkin keywords but NO @security tag (exit 1, discriminating)", () => {
  // Scenario/Given/When/Then present, but the @security tag removed from the body. The heading still contains
  // the literal "@security", so this catches the vacuous-tag-check regression.
  const bad = goodSheet.replace("@security @usecase:example\n", "");
  const dir = fixture({ manifestSheets: [{ slug: "Example", title: "Example", url: "u", done: true }], files: { "Example.md": bad } });
  const r = run(dir);
  assert.equal(r.status, 1);
  assert.match(r.out, /not a real multi-line Gherkin scenario/);
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

test("PASS: a correct multi-category grouping with matching counts", () => {
  const dir = fixture({
    manifestSheets: [
      { slug: "Aaa", title: "A", url: "u", done: true, category: "Frontend" },
      { slug: "Bbb", title: "B", url: "u", done: false, category: "Backend" },
    ],
    files: { "Aaa.md": goodSheet },
  });
  const r = run(dir);
  assert.equal(r.status, 0, r.out);
});

test("FAIL: a group heading whose counts disagree with the manifest (exit 1, discriminating)", () => {
  const dir = fixture({
    manifestSheets: [{ slug: "Example", title: "E", url: "u", done: true, category: "Frontend" }],
    files: { "Example.md": goodSheet },
    skill: "# owasp\n\n## The cheat-sheet catalog\n\n### Frontend (0/1)\n\n| x | references/cheatsheets/Example.md |\n",
  });
  const r = run(dir);
  assert.equal(r.status, 1);
  assert.match(r.out, /shows \(0\/1\) but the manifest has 1\/1/);
});

test("FAIL: two sheets swapped between category headings (exit 1, discriminating)", () => {
  // Each heading's counts match, but the sheets are filed under the wrong category — the membership check.
  const dir = fixture({
    manifestSheets: [
      { slug: "Aaa", title: "A", url: "u", done: true, category: "Frontend" },
      { slug: "Bbb", title: "B", url: "u", done: true, category: "Backend" },
    ],
    files: { "Aaa.md": goodSheet, "Bbb.md": goodSheet },
    skill: "# owasp\n\n## The cheat-sheet catalog\n\n### Frontend (1/1)\n\n| x | references/cheatsheets/Bbb.md |\n\n### Backend (1/1)\n\n| x | references/cheatsheets/Aaa.md |\n",
  });
  const r = run(dir);
  assert.equal(r.status, 1);
  assert.match(r.out, /Aaa: manifest category "Frontend" but not listed under that heading/);
});

test("FAIL: a category heading the manifest does not have (exit 1, discriminating)", () => {
  const dir = fixture({
    manifestSheets: [{ slug: "Example", title: "E", url: "u", done: true, category: "Frontend" }],
    files: { "Example.md": goodSheet },
    skill: "# owasp\n\n## The cheat-sheet catalog\n\n### Frontend (1/1)\n\n| x | references/cheatsheets/Example.md |\n\n### Imaginary (0/0)\n\n(none)\n",
  });
  const r = run(dir);
  assert.equal(r.status, 1);
  assert.match(r.out, /"### Imaginary" group with no matching manifest category/);
});

test("FAIL: a row whose Status cell disagrees with the manifest done flag (exit 1, discriminating)", () => {
  // Heading count is correct (1/1) and the sheet is listed, but its Status cell says pending while it is done.
  const dir = fixture({
    manifestSheets: [{ slug: "Example", title: "E", url: "u", done: true, category: "Frontend" }],
    files: { "Example.md": goodSheet },
    skill: "# owasp\n\n## The cheat-sheet catalog\n\n### Frontend (1/1)\n\n| Cheat sheet | File | Status |\n|---|---|---|\n| Example | references/cheatsheets/Example.md | pending |\n",
  });
  const r = run(dir);
  assert.equal(r.status, 1);
  assert.match(r.out, /lists Example as "pending" but the manifest has it done/);
});

test("FAIL: a manifest sheet missing its category (exit 1, fail closed)", () => {
  const dir = fixture({ manifestSheets: [{ slug: "Example", title: "E", url: "u", done: true }], files: { "Example.md": goodSheet } });
  // Rewrite the manifest with no category to prove the gate rejects an uncategorized sheet.
  writeFileSync(join(dir, "references", "cheatsheets-manifest.json"), JSON.stringify({ count: 1, sheets: [{ slug: "Example", title: "E", url: "u", done: true }] }, null, 2));
  const r = run(dir);
  assert.equal(r.status, 1);
  assert.match(r.out, /has no "category"/);
});

test("PASS: a deprecated sheet is a pointer (no control sections / @security needed)", () => {
  const dir = fixture({
    manifestSheets: [
      { slug: "Old", title: "Old", url: "u", done: true, deprecated: true, supersededBy: "New", category: "Auth" },
      { slug: "New", title: "New", url: "u", done: true, category: "Auth" },
    ],
    files: { "Old.md": deprecatedPointer("New"), "New.md": goodSheet },
  });
  const r = run(dir);
  assert.equal(r.status, 0, r.out);
});

test("FAIL: a deprecated sheet that does not link its successor (exit 1, discriminating)", () => {
  const dir = fixture({
    manifestSheets: [
      { slug: "Old", title: "Old", url: "u", done: true, deprecated: true, supersededBy: "New", category: "Auth" },
      { slug: "New", title: "New", url: "u", done: true, category: "Auth" },
    ],
    // pointer with no successor link
    files: { "Old.md": "# Old (deprecated)\n\nThis sheet is deprecated.\n\n## Sources\n- OWASP (https://cheatsheetseries.owasp.org/cheatsheets/Old_Cheat_Sheet.html, retrieved 2026-10-11). [documented]\n", "New.md": goodSheet },
  });
  const r = run(dir);
  assert.equal(r.status, 1);
  assert.match(r.out, /deprecated but does not link its successor/);
});

test("FAIL: a deprecated sheet whose supersededBy is not a manifest slug (exit 1, discriminating)", () => {
  const dir = fixture({
    manifestSheets: [{ slug: "Old", title: "Old", url: "u", done: true, deprecated: true, supersededBy: "Ghost", category: "Auth" }],
    files: { "Old.md": deprecatedPointer("Ghost") },
  });
  const r = run(dir);
  assert.equal(r.status, 1);
  assert.match(r.out, /supersededBy" is missing or not a manifest slug/);
});

test("FAIL CLOSED: empty manifest (exit 2)", () => {
  const dir = fixture({ manifestSheets: [] });
  assert.equal(run(dir).status, 2);
});

test("FAIL CLOSED: missing manifest (exit 2)", () => {
  const dir = fixture({ manifestSheets: undefined });
  assert.equal(run(dir).status, 2);
});
