#!/usr/bin/env node
// claim-lint - a smoke alarm for unproven claims in a text/markdown draft.
//
//   node claim-lint.mjs <file.md> [--strict]
//
// It flags two things, line by line (fenced ``` code blocks are skipped, so
// evidence ledgers, command output, and examples don't trip it):
//   1. HEDGE - weasel words that stand in for a measurement.
//   2. CLAIM - assertion-shaped sentences carrying NO evidence state.
//
// Evidence states it recognises (case-insensitive, backticks ignored):
//   proven · observed · inferred · documented · reported · not-assessed / not assessed
//
// Exit codes:
//   0 = clean, OR findings in warn-only mode (no --strict) - prints them, does not block.
//   1 = findings AND --strict - blocks (use this in CI to fail the build on untagged claims).
//   2 = bad usage (no file / unreadable file).
// It is a smoke alarm, not a judge: a clean run only means the obvious misses
// are gone - the skeptic's loop still owns the subtle ones.

import { readFileSync } from "node:fs";

const HEDGE_WORDS = [
  "essentially", "mostly", "pretty much", "more or less", "basically",
  "should be fine", "should work", "should be", "ought to", "probably",
  "maybe", "perhaps",
  "likely", "i think", "i believe", "i assume", "presumably", "seems to",
  "seems like", "appears to", "as far as i can tell", "afaik", "i recall",
  "i'm fairly sure", "im fairly sure", "fairly confident", "in theory",
];
// Match each hedge on WORD BOUNDARIES, not as a raw substring: a substring match flags "likely"
// inside "unlikely" and "should be" inside "should become" - false positives that train people to
// ignore the tool. \b anchors mean the hedge must stand as its own word(s). (Case-insensitive; the
// phrases hold only letters/spaces/apostrophes, so \b around them behaves.)
const escapeRe = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const HEDGES = HEDGE_WORDS.map((h) => ({ word: h, re: new RegExp(`\\b${escapeRe(h)}\\b`, "i") }));

// Assertion shapes that demand evidence. Word-boundary-ish, case-insensitive.
const CLAIM_PATTERNS = [
  /\bit works\b/i, /\bworks (fine|correctly|as expected)\b/i,
  /\btests? pass(es|ed)?\b/i, /\ball (good|green|passing)\b/i,
  /\bis (running|up|live|deployed|safe|secure|fixed|done|complete)\b/i,
  /\bis (unused|dead code|not (used|referenced|called))\b/i,
  /\bno (references?|callers?|usages?|other) \w+/i,
  /\b(nothing|no one|nobody) (uses|references|calls)\b/i,
  /\b(verified|confirmed|validated|ensured|checked)\b/i,
  /\bthere (is|are) no\b/i, /\bnever (happens|fails|breaks)\b/i,
  /\balways (works|passes|succeeds)\b/i, /\bhandles? (all|every)\b/i,
  /\bis (tested|reviewed|validated|working)\b/i,
  /\b(the )?(build|suite|ci|pipeline|deploy\w*|check|gate) (passes|passed|succeeds|succeeded)\b/i,
  /\bcan('?t| not) (happen|fail|occur)\b/i,
];

const STATE = /(proven|observed|inferred|documented|reported|not[-\s]assessed)/i;

const file = process.argv[2];
const strict = process.argv.includes("--strict");
if (!file) {
  console.error("usage: node claim-lint.mjs <file.md> [--strict]");
  process.exit(2);
}

let text;
try {
  text = readFileSync(file, "utf8");
} catch (e) {
  console.error(`cannot read ${file}: ${e.message}`);
  process.exit(2);
}

const lines = text.split(/\r?\n/);
const findings = [];
let inFence = false;

lines.forEach((raw, i) => {
  const line = raw.trim();
  if (/^```/.test(line)) { inFence = !inFence; return; }
  if (inFence || line === "") return;
  if (line.startsWith(">") || line.startsWith("|") || line.startsWith("#")) return; // quotes/tables/headings

  // The evidence state may sit on the claim's line OR the next non-blank line (a common ledger layout). Not
  // looking ahead would false-flag a backed claim whose state is on the adjacent line - and that trains people
  // to ignore the tool.
  let nextNonBlank = "";
  for (let j = i + 1; j < lines.length; j++) { const t = lines[j].trim(); if (t) { nextNonBlank = t; break; } }
  // Credit the NEXT line's state only when that line is clearly THIS claim's evidence row - a ledger table row
  // (| ... |), an "Evidence:/Source:" line, or a bracketed [state]. Crediting any line that merely mentions a
  // state token would silence a claim that happens to sit above an UNRELATED evidence line.
  const nextIsEvidence = /^\|/.test(nextNonBlank)
    || /^(evidence|source|proof|state)\b/i.test(nextNonBlank)
    || /^\[?(proven|observed|inferred|documented|reported|not[-\s]assessed)\]/i.test(nextNonBlank);
  const hasState = STATE.test(line) || (nextIsEvidence && STATE.test(nextNonBlank));

  for (const h of HEDGES) {
    // "should be removed/added/updated" is an imperative recommendation, not a confidence hedge. Narrow to an
    // explicit action-verb set so a real soft-confidence hedge ("should be cached/deployed by now") is NOT exempt.
    if (h.word === "should be" && /\bshould be (removed|added|updated|deleted|renamed|moved|refactored|replaced|dropped|merged|reverted|split|consolidated|extracted|inlined|deprecated)\b/i.test(line)) continue;
    if (h.re.test(line)) {
      findings.push({ n: i + 1, kind: "HEDGE", hit: h.word, line: raw.trim() });
    }
  }
  if (!hasState) {
    for (const p of CLAIM_PATTERNS) {
      const m = line.match(p);
      if (m) {
        findings.push({ n: i + 1, kind: "CLAIM", hit: m[0], line: raw.trim() });
        break; // one claim finding per line is enough signal
      }
    }
  }
});

if (findings.length === 0) {
  console.log(`claim-lint: clean - no hedge-words or untagged claims in ${file}`);
  console.log("(smoke alarm only: run the skeptic's loop for the subtle ones.)");
  process.exit(0);
}

const hedges = findings.filter((f) => f.kind === "HEDGE").length;
const claims = findings.filter((f) => f.kind === "CLAIM").length;
console.log(`claim-lint: ${findings.length} finding(s) in ${file} - ${hedges} hedge-word(s), ${claims} untagged claim(s)\n`);
for (const f of findings) {
  const why = f.kind === "HEDGE"
    ? `hedge-word "${f.hit}" - cite a measurement or say not-assessed`
    : `claim "${f.hit}" has no evidence state - tag proven/observed/inferred/documented/reported/not-assessed`;
  console.log(`  L${f.n}  [${f.kind}] ${why}`);
  console.log(`         > ${f.line}`);
}
console.log("\nFix: attach an evidence state + a re-runnable source + a named limitation, or downgrade the claim.");
if (!strict) console.log("(warn-only: re-run with --strict to make these findings block.)");
// Findings exist here (the clean case already exited 0 above): block only under --strict.
process.exit(strict ? 1 : 0);
