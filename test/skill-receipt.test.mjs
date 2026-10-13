// Discriminating tests for check-skill-receipt.mjs - the capstone gate that proves a change's skill-application
// receipt is GROUNDED (complete, anchors resolve, quotes verbatim, files in the diff, coupled surfaces applied)
// without claiming it is TRUE. Every case proves the gate DISCRIMINATES: it passes a grounded receipt and fails
// each specific way a receipt can be hollow or fabricated, and it fails closed on malformed/unsafe input.
import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtempSync, mkdirSync, writeFileSync, symlinkSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const REPO = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const GATE = resolve(REPO, ".claude/skills/judge-arch/scripts/check-skill-receipt.mjs");

const BANNER = "This receipt is the agent's self-report. A human must review the work against the diff. It does not prove the work was done or done well.";

// A two-skill fixture (plus bootstrap, which the gate excludes). skill-a has a real heading and a quotable line.
const SKILL_A = "# Skill A\n\n## Core Rule\n\nAlways validate the input before you trust any of it in this system.\n";
const SKILL_B = "# Skill B\n\n## Another Rule\n\nPrefer deleting code over adding a new and separate way to do it.\n";

// A fully grounded entry: skill-a applied + grounded, skill-b not-applicable.
function goodEntry(over = {}) {
  return {
    change: "test-change",
    date: "2026-10-13",
    author: "test",
    humanReviewed: null,
    skills: {
      "skill-a": {
        status: "applied",
        why: "the change touches the core path",
        what: "input validation before trust",
        where: ["real.md"],
        anchors: ["skill-a/SKILL.md#core-rule"],
        quotes: ["Always validate the input before you trust any of it in this system"],
      },
      "skill-b": { status: "not-applicable", why: "no second-rule surface in this change" },
    },
    ...over,
  };
}

// Build an isolated run: a skills dir (skill-a, skill-b, bootstrap), a receipt log of the given entries, a
// README carrying the banner (unless suppressed), and an optional coupling config. Returns the arg list.
function build({ entries, banner = BANNER, config = null, skillA = SKILL_A } = {}) {
  const root = mkdtempSync(join(tmpdir(), "receipt-"));
  const skills = join(root, "skills");
  for (const [name, md] of [["skill-a", skillA], ["skill-b", SKILL_B], ["bootstrap", "# Bootstrap\n"]]) {
    mkdirSync(join(skills, name), { recursive: true });
    writeFileSync(join(skills, name, "SKILL.md"), md);
  }
  const receiptDir = join(root, "receipts");
  mkdirSync(receiptDir, { recursive: true });
  const receipt = join(receiptDir, "log.jsonl");
  const lines = (entries || [goodEntry()]).map((e) => (typeof e === "string" ? e : JSON.stringify(e)));
  writeFileSync(receipt, lines.join("\n") + "\n");
  if (banner !== null) writeFileSync(join(receiptDir, "README.md"), `# Receipts\n\n${banner}\n`);
  const argv = [GATE, "--receipt", receipt, "--skills-dir", skills];
  if (config) { const cp = join(root, "coupling.json"); writeFileSync(cp, JSON.stringify(config)); argv.push("--config", cp); }
  return { argv, root, receipt, skills };
}
const run = (argv, extra = []) => spawnSync(process.execPath, [...argv, ...extra], { encoding: "utf8" });
const out = (r) => (r.stdout || "") + (r.stderr || "");

// 1. complete + grounded -> pass
test("PASSES a complete, grounded receipt", () => {
  const r = run(build().argv);
  assert.equal(r.status, 0, out(r));
});

// 2. missing skill entry -> fail (incomplete)
test("FAILS when a skill has no entry (incomplete, discriminating)", () => {
  const e = goodEntry(); delete e.skills["skill-b"];
  const r = run(build({ entries: [e] }).argv);
  assert.equal(r.status, 1, out(r));
  assert.match(out(r), /skill-b.*no receipt entry|incomplete/i);
});

// 3. non-existent anchor heading -> fail
test("FAILS an applied entry whose anchor heading is not in the skill (discriminating)", () => {
  const e = goodEntry(); e.skills["skill-a"].anchors = ["skill-a/SKILL.md#not-a-real-heading"];
  const r = run(build({ entries: [e] }).argv);
  assert.equal(r.status, 1, out(r));
  assert.match(out(r), /not a heading/i);
});

// 4. quote not in the cited skill -> fail
test("FAILS an applied entry whose quote is not in the cited skill (discriminating)", () => {
  const e = goodEntry(); e.skills["skill-a"].quotes = ["This sentence was never written anywhere in the skill file at all"];
  const r = run(build({ entries: [e] }).argv);
  assert.equal(r.status, 1, out(r));
  assert.match(out(r), /does not appear/i);
});

// 4b. quote too short (< 8 words) -> fail (grounding too weak)
test("FAILS a quote shorter than the minimum word run (discriminating)", () => {
  const e = goodEntry(); e.skills["skill-a"].quotes = ["Always validate the input"]; // 4 words, and it IS in the file
  const r = run(build({ entries: [e] }).argv);
  assert.equal(r.status, 1, out(r));
  assert.match(out(r), /words/i);
});

// 4c. a quote that exists only in the FRONTMATTER, not the cited section -> fail (grounding must be the guidance)
test("FAILS a quote taken from the frontmatter, not the cited section (discriminating)", () => {
  const skillA = "---\nname: skill-a\ndescription: The quick brown fox jumps over the lazy dog every single morning without fail.\n---\n# Skill A\n\n## Core Rule\n\nAlways validate the input before you trust any of it in this system.\n";
  const e = goodEntry(); e.skills["skill-a"].quotes = ["The quick brown fox jumps over the lazy dog every single morning"];
  const r = run(build({ entries: [e], skillA }).argv);
  assert.equal(r.status, 1, out(r));
  assert.match(out(r), /does not appear under|section or the frontmatter/i);
});

// 4d. a quote from a DIFFERENT section than the anchor -> fail (anchor and quote are bound together)
test("FAILS a quote from a different section than the cited heading (discriminating)", () => {
  const skillA = "# Skill A\n\n## Core Rule\n\nAlways validate the input before you trust any of it in this system.\n\n## Other Rule\n\nPrefer deleting dead code over leaving it to rot in the repository forever here.\n";
  const e = goodEntry(); e.skills["skill-a"].quotes = ["Prefer deleting dead code over leaving it to rot in the repository forever here"];
  const r = run(build({ entries: [e], skillA }).argv);
  assert.equal(r.status, 1, out(r));
  assert.match(out(r), /does not appear under/i);
});

// 5. where file not in the diff -> fail (only when --changed-list is given)
test("FAILS when an applied entry cites a file not in the change diff (discriminating)", () => {
  const r = run(build().argv, ["--changed-list", "other.md,second.md"]);
  assert.equal(r.status, 1, out(r));
  assert.match(out(r), /not in the change diff/i);
});

// 6. a triggered coupling surface marked not-applicable -> fail
test("FAILS when a fired coupling surface is marked not-applicable (discriminating)", () => {
  const config = { rules: [{ id: "b-surface", when: ["**/*.ts"], requires: ["skill-b"] }] };
  // skill-b is not-applicable in the good entry; a .ts file changed fires the rule -> must be applied.
  const r = run(build({ config }).argv, ["--changed-list", "src/app.ts,real.md"]);
  assert.equal(r.status, 1, out(r));
  assert.match(out(r), /coupling rule.*fired|not .?applied/i);
});

// 7. traversal anchor -> fail closed (exit 2)
test("FAILS CLOSED (exit 2) on an anchor path that escapes the skills dir (threat model)", () => {
  const e = goodEntry(); e.skills["skill-a"].anchors = ["../../../../etc/passwd#x"];
  const r = run(build({ entries: [e] }).argv);
  assert.equal(r.status, 2, out(r));
  assert.match(out(r), /traversal|outside the skills dir/i);
});

// 7b. a committed symlink inside the skills dir pointing outside -> fail closed (canonical traversal defense)
test("FAILS CLOSED on an anchor file that is a symlink escaping the skills dir (threat model)", (t) => {
  const e = goodEntry();
  e.skills["skill-a"].anchors = ["skill-a/evil.md#core-rule"];
  e.skills["skill-a"].quotes = ["Arbitrary attacker controlled text that is at least eight words long here"];
  const b = build({ entries: [e] });
  const outside = join(b.root, "outside.md");
  writeFileSync(outside, "# Outside\n\n## Core Rule\n\nArbitrary attacker controlled text that is at least eight words long here.\n");
  try { symlinkSync(outside, join(b.skills, "skill-a", "evil.md")); }
  catch { t.skip("symlink creation not permitted on this platform"); return; }
  const r = run(b.argv);
  assert.equal(r.status, 2, out(r));
  assert.match(out(r), /symlink|outside the skills dir/i);
});

// 8. fail-closed structural cases (exit 2)
test("FAILS CLOSED on an invalid status", () => {
  const e = goodEntry(); e.skills["skill-a"].status = "maybe";
  assert.equal(run(build({ entries: [e] }).argv).status, 2);
});
test("FAILS CLOSED on an unknown skill name in the receipt", () => {
  const e = goodEntry(); e.skills["skill-z"] = { status: "applied", why: "x", what: "y", where: ["real.md"], anchors: ["skill-a/SKILL.md#core-rule"], quotes: ["Always validate the input before you trust any of it in this system"] };
  assert.equal(run(build({ entries: [e] }).argv).status, 2);
});
test("FAILS CLOSED on an empty required field", () => {
  const e = goodEntry(); e.skills["skill-a"].why = "   ";
  assert.equal(run(build({ entries: [e] }).argv).status, 2);
});
test("FAILS CLOSED on a missing humanReviewed field", () => {
  const e = goodEntry(); delete e.humanReviewed;
  assert.equal(run(build({ entries: [e] }).argv).status, 2);
});
test("FAILS CLOSED when the human-review banner is absent", () => {
  assert.equal(run(build({ banner: null }).argv).status, 2);
});
test("FAILS CLOSED on a malformed (non-JSON) receipt line", () => {
  assert.equal(run(build({ entries: ["{ not json"] }).argv).status, 2);
});

// 9. non-append-only edit -> fail
test("FAILS when the log is not an append to the base (history drift, discriminating)", () => {
  const { argv, root } = build();
  const base = join(root, "base.jsonl");
  writeFileSync(base, JSON.stringify({ change: "an-earlier-entry-that-is-no-longer-a-prefix" }) + "\n");
  const r = run(argv, ["--base", base]);
  assert.equal(r.status, 1, out(r));
  assert.match(out(r), /append-only/i);
});
test("PASSES append-only when the base is a clean prefix of the log", () => {
  // Two entries; base is exactly the first line -> the log is a clean append.
  const e1 = goodEntry({ change: "first" });
  const e2 = goodEntry({ change: "second" });
  const b = build({ entries: [e1, e2] });
  const base = join(b.root, "base.jsonl");
  writeFileSync(base, JSON.stringify(e1) + "\n");
  const r = run(b.argv, ["--base", base, "--change", "second"]);
  assert.equal(r.status, 0, out(r));
});

// disclosure: without --changed-list, diff binding + coupling are NOT checked (and a coupling miss passes)
test("without --changed-list, a coupling miss is not caught and the OK line discloses it", () => {
  const config = { rules: [{ id: "b-surface", when: ["**/*.ts"], requires: ["skill-b"] }] };
  const r = run(build({ config }).argv);
  assert.equal(r.status, 0, out(r));
  assert.match(out(r), /NOT checked/i);
});

// Enforcement against the real repo: the committed latest receipt must be complete and grounded against the
// real skills at all times. This bare run checks completeness + anchors + quotes + banner; diff binding,
// coupling, and append-only need the change diff and the base revision, which the deferred CI job will pass
// (--changed-list / --base), not this test.
test("the repository's own latest receipt is complete and grounded against the real skills", () => {
  const GATE_REAL = resolve(REPO, ".claude/skills/judge-arch/scripts/check-skill-receipt.mjs");
  const r = spawnSync(process.execPath, [GATE_REAL,
    "--receipt", resolve(REPO, "docs/skill-receipts/log.jsonl"),
    "--skills-dir", resolve(REPO, ".claude/skills")], { encoding: "utf8" });
  assert.equal(r.status, 0, out(r));
});
