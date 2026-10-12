// Discriminating tests for .claude/skills/owasp-secure-coding-bdd/scripts/check-verbatim.mjs (ADR-0018).
//
// The gate resolves its paths from its own file location, so each test copies the REAL gate into a throwaway
// skill dir (scripts/ + references/ + vendor/) and runs it there (the copy-into-fixture pattern from
// check-test-patterns.md). It proves the gate DETECTS a verbatim run and does not false-flag the things that
// are allowed:
//   - PASS when the per-sheet file is own-words;
//   - FAIL (exit 1) when it carries a >= 10-word run copied from the vendored source;
//   - the 9-vs-10 boundary is real (9 shared words pass, 10 fail), which is the mutation proof that the
//     threshold check is not vacuous: a no-op gate or a widened threshold turns the FAIL case green;
//   - a shared run inside `## Sources` (citation) or inside a fenced code block does NOT flag;
//   - a not-done sheet is ignored; a sheet with no upstream source is skipped (not failed) while others check;
//   - every fail-closed path (missing/empty manifest, absent/empty vendor dir, zero checkable done sheets)
//     exits 2.
import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtempSync, mkdirSync, writeFileSync, cpSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const REPO = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const REAL_GATE = resolve(REPO, ".claude/skills/owasp-secure-coding-bdd/scripts/check-verbatim.mjs");

// A distinct, order-known word sequence so a test can share an EXACT number of consecutive words with a
// per-sheet file and nothing else overlaps.
const SEQ = "alpha beta gamma delta epsilon zeta eta theta iota kappa lambda mu nu xi omicron pi rho sigma tau upsilon";
// The vendored source: the sequence wrapped in prose, plus a fenced code block that is allowed to be shared.
const SOURCE = `# Upstream Cheat Sheet\n\nIntroductory upstream prose. ${SEQ}. Closing upstream prose here.\n\n\`\`\`js\nconst sharedExample = computeTheSameExactWayInBothFilesForTenPlusWords();\nvalidate(input).then(render).catch(report).finally(cleanupResources).forEach(log);\n\`\`\`\n`;
// Own-words content that shares no 10-word run with SOURCE (used for clean sheets).
const OWN_WORDS = "# Title\n\nWe explain the control in fresh language that borrows no long phrase from anywhere upstream.\n\n## Sources\n- OWASP sheet https://example.test/x (retrieved 2026-10-11)\n";

// Build a fixture skill dir. sheets: manifest entries. files: {slug: body}. vendor: null = no vendor dir at all,
// {} = empty vendor dir, {"<name>_Cheat_Sheet.md": body} = those vendored sources (the default is one source).
function fixture({ sheets, files = {}, vendor = { "Ex_Cheat_Sheet.md": SOURCE } }) {
  const dir = mkdtempSync(join(tmpdir(), "owasp-verbatim-"));
  mkdirSync(join(dir, "scripts"), { recursive: true });
  mkdirSync(join(dir, "references", "cheatsheets"), { recursive: true });
  cpSync(REAL_GATE, join(dir, "scripts", "check-verbatim.mjs"));
  if (sheets !== undefined) {
    writeFileSync(join(dir, "references", "cheatsheets-manifest.json"), JSON.stringify({ count: sheets.length, sheets }, null, 2));
  }
  for (const [slug, body] of Object.entries(files)) writeFileSync(join(dir, "references", "cheatsheets", `${slug}.md`), body);
  if (vendor) {
    mkdirSync(join(dir, "vendor", "cheatsheets-src"), { recursive: true });
    for (const [name, body] of Object.entries(vendor)) writeFileSync(join(dir, "vendor", "cheatsheets-src", name), body);
  }
  return dir;
}

function run(dir) {
  const r = spawnSync(process.execPath, [join(dir, "scripts", "check-verbatim.mjs")], { encoding: "utf8" });
  return { status: r.status, out: (r.stdout || "") + (r.stderr || "") };
}

// A per-sheet file that shares the first `n` words of SEQ, padded with non-overlapping filler on both sides.
const sheetSharing = (n) =>
  `# Ex\n\nOur unique opening words lead in. ${SEQ.split(" ").slice(0, n).join(" ")} our unique closing words follow on.\n`;

test("PASS: an own-words done sheet does not flag (exit 0, evidence printed)", () => {
  const dir = fixture({ sheets: [{ slug: "Ex", done: true }], files: { Ex: OWN_WORDS } });
  const r = run(dir);
  assert.equal(r.status, 0, r.out);
  assert.match(r.out, /1 done sheet\(s\) compared/);
});

test("FAIL: a >= 10-word verbatim run from the source flags (exit 1, discriminating)", () => {
  const dir = fixture({ sheets: [{ slug: "Ex", done: true }], files: { Ex: sheetSharing(12) } });
  const r = run(dir);
  assert.equal(r.status, 1, r.out);
  assert.match(r.out, /references\/cheatsheets\/Ex\.md/);
  assert.match(r.out, /alpha beta gamma delta epsilon zeta eta theta iota kappa/);
});

test("BOUNDARY: 9 shared words pass, 10 shared words fail (the threshold is real, not vacuous)", () => {
  const nine = fixture({ sheets: [{ slug: "Ex", done: true }], files: { Ex: sheetSharing(9) } });
  assert.equal(run(nine).status, 0, "9 shared words must pass");
  const ten = fixture({ sheets: [{ slug: "Ex", done: true }], files: { Ex: sheetSharing(10) } });
  assert.equal(run(ten).status, 1, "10 shared words must fail");
});

test("PASS: a long shared run that lives only in the `## Sources` section is attribution, not a violation", () => {
  const body = `# Ex\n\nOwn-words body with nothing borrowed.\n\n## Sources\n- Upstream text: ${SEQ}\n`;
  const dir = fixture({ sheets: [{ slug: "Ex", done: true }], files: { Ex: body } });
  assert.equal(run(dir).status, 0);
});

test("PASS: a long shared run inside a fenced code block does not flag (shared code is allowed)", () => {
  const body = `# Ex\n\nOwn-words body.\n\n\`\`\`text\n${SEQ}\n\`\`\`\n`;
  const dir = fixture({ sheets: [{ slug: "Ex", done: true }], files: { Ex: body } });
  assert.equal(run(dir).status, 0);
});

test("PASS: a NOT-done sheet is ignored even if it would flag", () => {
  const dir = fixture({ sheets: [{ slug: "Ex", done: false }], files: { Ex: sheetSharing(12) } });
  assert.equal(run(dir).status, 0);
});

test("PASS: a done sheet with no upstream source is skipped while another is checked (reported)", () => {
  const dir = fixture({
    sheets: [
      { slug: "Ex", done: true },
      { slug: "NoSrc", done: true },
    ],
    files: { Ex: OWN_WORDS, NoSrc: sheetSharing(12) },
    vendor: { "Ex_Cheat_Sheet.md": SOURCE }, // NoSrc has no vendored source
  });
  const r = run(dir);
  assert.equal(r.status, 0, r.out);
  assert.match(r.out, /Skipped \(no upstream source\): NoSrc/);
});

test("FAIL CLOSED: the vendor dir is absent (exit 2)", () => {
  const dir = fixture({ sheets: [{ slug: "Ex", done: true }], files: { Ex: OWN_WORDS }, vendor: null });
  const r = run(dir);
  assert.equal(r.status, 2);
  assert.match(r.out, /vendor/i);
});

test("FAIL CLOSED: the vendor dir is empty (exit 2)", () => {
  const dir = fixture({ sheets: [{ slug: "Ex", done: true }], files: { Ex: OWN_WORDS }, vendor: {} });
  assert.equal(run(dir).status, 2);
});

test("FAIL CLOSED: a done sheet has a file but NO done sheet had a vendored source (exit 2)", () => {
  // Vendor dir is non-empty but holds an unrelated source, so the done sheet cannot be checked: a silent pass
  // here would hide a broken vendoring step, so it must fail closed rather than vacuously pass.
  const dir = fixture({ sheets: [{ slug: "Ex", done: true }], files: { Ex: OWN_WORDS }, vendor: { "Unrelated_Cheat_Sheet.md": SOURCE } });
  const r = run(dir);
  assert.equal(r.status, 2);
  assert.match(r.out, /NONE had a vendored source/);
});

test("FAIL CLOSED: empty manifest (exit 2)", () => {
  assert.equal(run(fixture({ sheets: [] })).status, 2);
});

test("FAIL CLOSED: missing manifest (exit 2)", () => {
  assert.equal(run(fixture({ sheets: undefined })).status, 2);
});
