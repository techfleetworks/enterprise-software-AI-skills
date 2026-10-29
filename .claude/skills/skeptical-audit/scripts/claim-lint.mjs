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
  // "verified" is owned by the dedicated VERIFY rule (assertive "I/we verified"); the generic pattern keeps
  // the siblings, and "checked" but not the scoping token "not-checked"/"not checked".
  /\b(confirmed|validated|ensured)\b|(?<!not[-\s])\bchecked\b/i,
  /\bthere (is|are) no\b/i, /\bnever (happens|fails|breaks)\b/i,
  /\balways (works|passes|succeeds)\b/i, /\bhandles? (all|every)\b/i,
  /\bis (tested|reviewed|validated|working)\b/i,
  /\b(the )?(build|suite|ci|pipeline|deploy\w*|check|gate) (passes|passed|succeeds|succeeded)\b/i,
  /\bcan('?t| not) (happen|fail|occur)\b/i,
  // #180: a comparison ("A is safer/better/more reliable than B") is a claim that needs a measurement, and
  // calling something "the primary/main/real control" is a claim about what actually protects the system.
  // The comparative list is curated (not a bare "more <anything> than", which catches "more work than").
  /\bis (safer|better|faster|stronger|cheaper|simpler|more (reliable|secure|robust|performant|scalable|accurate|efficient|resilient|maintainable|available)) than\b/i,
  /\bis (the|a) (primary|main|real) (control|guarantee|defen[cs]e)\b/i,
];

const STATE = /(proven|observed|inferred|documented|reported|not[-\s]assessed)/i;

// #179: high-stakes claims need MORE than an evidence state - a specific, re-runnable record. These are
// checked DOCUMENT-level (the record may sit in a fenced block, which the per-line loop skips), so a claim
// is grounded when the report carries the matching record somewhere, and flagged when it carries none.
//
// "fixed"/"resolved" (a defect, or a test that now passes) needs a REVERT record: a committed test was red
// before the fix, green after it, and red again when the fix is reverted (each run with its command + exit).
const FIX_CLAIM = /\b(is (now )?fixed|is (now )?resolved|now fixed|now resolved|now passes|passes now|fixed incidentally|marked? (it )?(as )?(fixed|resolved))\b/i;
const FIX_DEFECT = /\b(bug|defect|issue|regression|failure|the test)\b[^.\n]*\b(is |was |now )?(fixed|resolved)\b/i;
const REVERT_RECORD = /\brevert[-\s]?check\b|\bred[\s>._,-]{1,6}green[\s>._,-]{1,6}red\b|\bred on revert\b/i;
// "verified" as an AGENT claim ("I/we verified", "verified that") needs a re-runnable command, its exit
// code, and an output hash (or an explicit "verified-by"), OR at least an inline evidence state. Scoped to
// the assertive frame so ordinary domain vocabulary ("the email must be verified") is not flagged.
const VERIFY_CLAIM = /\b(?:i|we)\s+(?:have\s+)?verified\b|\bverified that\b/i;
const VERIFY_RECORD = /\bverified-by\b|\bexit\b[^\n]*\b(sha-?256|output[-\s]?hash|output[-\s]?sha)\b|\b(sha-?256|output[-\s]?hash|output[-\s]?sha)\b[^\n]*\bexit\b/i;
// A claim that generalizes from a test SUITE to a behavior must name the covering cases and the input
// shapes it did NOT check (a green suite proves only the cases it contains).
const SUITE_CLAIM = /\b(suite|test suite|green suite|all tests|\d+[\s-]?cases?|\d+ scenarios?)\b[^\n]*\b(pass(es|ed)?|green|works?|correct|prove[sd]?|cover)\b|\b(works?|correct|handles? (all|every))\b[^\n]*\b(suite|test suite|all tests|\d+[\s-]?cases?)\b/i;
const CASES_MARKER = /\bcases?:/i;
const NOTCHECKED_MARKER = /\bnot[-\s]checked\b|\bnot covered\b|\buncovered\b/i;
// "done"/"complete"/"ready to ship" must not stand while a HIGH review finding is open.
const DONE_CLAIM = /\b(is|are|work is|marked?|calling (it|this|the work)|called (it|this|the work))\s+(done|complete)\b|\bready to (merge|ship)\b|\bshippable\b|\bgood to (merge|ship|go)\b/i;
const openHighLine = (l) =>
  /\bHIGH\b/.test(l) &&
  /\b(open|unresolved|unaddressed|not (yet )?(fixed|resolved|waived))\b/i.test(l) &&
  !/\b(no|zero|0)\b[^\n]*\b(open|unresolved|HIGH)\b/i.test(l);

// #180: skeptical-audit additions - mistakes that happen before and around a claim.
// Ownership: before building on "X owns Y", record the OBSERVED owner (file:line + run output); an
// ownership assumption with no owner record and no evidence state is held. Scoped to a code-ownership
// context (a code noun, or an "assume") so an ordinary domain fact ("the user owns their data") is not flagged.
const OWNS_CLAIM = /\b(module|component|service|function|class|handler|endpoint|the code|which (part|module|component))\b[^.\n]*\b(owns|handles|is responsible for|is the owner of)\b|\bassum\w+\b[^.\n]*\b(owns|handles|is responsible for|is the owner of)\b/i;
const OWNER_RECORD = /\bowner:\s*\S+:\d+/i; // e.g. owner: src/mask.ts:42
// Downgrade: lowering a claim's evidence state is the deliverable, but it must name the next step to raise it.
// Requires an explicit downgrade VERB, so ordinary "now reported to the vendor" / "now inferred from the header"
// are not read as a downgrade.
const DOWNGRADE_CLAIM = /\bdowngrad(e|ed|ing)\b|\b(lowered|dropped|moved)\s+(it\s+|this\s+)?(to|down to)\s+(not[-\s]assessed|reported|inferred|documented)\b/i;
const NEXT_STEP = /\bnext step\b|\bto (raise|upgrade) (it|this)\b|\bwould (raise|upgrade)\b|\bwho will\b|\bupgrade it by\b/i;
// Headline: the reported headline must be the metric declared BEFORE measuring; headlining the most favorable
// result is flagged. Scoped to the reporting sense so git "cherry-pick the hotfix" is not flagged.
const HEADLINE_CHERRY = /\bheadlined the (most )?favorable\b|\bmost favorable (cut|number|result|metric|measure|reading|percentage|figure|score)\b|\bcherry.?pick(ed|ing)? (the |a )?(most )?favorable\b|\bcherry.?pick(ed|ing)? (the |a )?(result|number|metric|cut|measure|score)\b/i;

const argv = process.argv.slice(2);
// #140: -h/--help prints usage and exits 0; an unknown --flag is rejected (so a typo cannot be ignored).
const USAGE = "usage: node claim-lint.mjs <file.md> [--strict]\n  default: warn-only (prints findings, exits 0); --strict exits 1 on findings (use in CI).";
if (argv.includes("--help") || argv.includes("-h")) { console.log(USAGE); process.exit(0); }
const unknown = argv.filter((a) => a.startsWith("--") && a !== "--strict" && a !== "--help");
if (unknown.length) { console.error(`claim-lint: unknown flag(s): ${unknown.join(", ")}\n${USAGE}`); process.exit(2); }
const file = argv.find((a) => !a.startsWith("-"));
const strict = argv.includes("--strict");
if (!file) {
  console.error(USAGE);
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
// Document-level grounding for the #179 rules: the record (a revert run, a command + exit + hash, a
// cases/not-checked list) may sit in a fenced block the per-line loop skips, so a claim is grounded when
// the report carries the matching record anywhere, and flagged when it carries none.
const hasRevertRecord = REVERT_RECORD.test(text);
const hasVerifyRecord = VERIFY_RECORD.test(text);
const hasCases = CASES_MARKER.test(text);
const hasNotChecked = NOTCHECKED_MARKER.test(text);
const hasOpenHigh = lines.some(openHighLine);
// #180: a "done" row whose evidence is mostly inferred cannot be marked done. The "N observed" / "N inferred"
// tally is computed LOCAL to each done claim (its line plus the adjacent evidence line), so unrelated counts
// elsewhere in the report do not bind to it.
const tally = (s, re) => [...s.matchAll(re)].reduce((a, m) => a + Number(m[1]), 0);
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
  // #179: high-stakes claims that need a specific record, not merely an evidence state. A high-stakes
  // claim line is OWNED by its specific rule: it flags when the record is absent, and either way the
  // generic CLAIM check is skipped for that line (grounded -> not double-flagged; ungrounded -> the
  // specific finding already says what is missing). A grounding/record line is likewise not a claim.
  let handled = false;
  if (FIX_CLAIM.test(line) || FIX_DEFECT.test(line)) {
    if (!hasRevertRecord) findings.push({ n: i + 1, kind: "FIX", hit: "fixed/resolved with no revert record", line: raw.trim() });
    handled = true;
  } else if (VERIFY_CLAIM.test(line)) {
    // An inline evidence state (or the next-line evidence row) grounds it too, as the generic path allows;
    // only a bare "I verified X" with neither a record nor a state is flagged.
    if (!hasVerifyRecord && !hasState) findings.push({ n: i + 1, kind: "VERIFY", hit: "verified with no re-runnable command + exit + hash (and no evidence state)", line: raw.trim() });
    handled = true;
  } else if (SUITE_CLAIM.test(line)) {
    if (!(hasCases && hasNotChecked)) findings.push({ n: i + 1, kind: "SUITE", hit: "suite-backed claim with no named cases + not-checked shapes", line: raw.trim() });
    handled = true;
  } else if (DONE_CLAIM.test(line)) {
    const ctx = line + " " + nextNonBlank;
    const obs = tally(ctx, /(\d+)\s+observed\b/gi);
    const inf = tally(ctx, /(\d+)\s+inferred\b/gi);
    // Only an evidence/records context ties the counts to the done claim, so unrelated co-located numbers
    // (e.g. "3 observed anomalies ... 5 inferred edges") do not misfire as a done-on-inferred.
    const evidenceCtx = /\b(evidence|records?|rows?|re-?(checked|queried|verified))\b/i.test(ctx);
    if (hasOpenHigh) { findings.push({ n: i + 1, kind: "DONE-OPEN-HIGH", hit: "done/complete while a HIGH review finding is open", line: raw.trim() }); handled = true; }
    else if (inf > 0 && inf > obs && evidenceCtx) { findings.push({ n: i + 1, kind: "DONE-INFERRED", hit: `done while evidence is mostly inferred (${obs} observed vs ${inf} inferred)`, line: raw.trim() }); handled = true; }
    // else: not a blocked done; a plain untagged "is done" falls through to the generic CLAIM check below.
  } else if (OWNS_CLAIM.test(line) && !hasState && !OWNER_RECORD.test(line) && !(nextIsEvidence && OWNER_RECORD.test(nextNonBlank))) {
    findings.push({ n: i + 1, kind: "OWNERSHIP", hit: "ownership asserted with no observed owner (file:line + run output)", line: raw.trim() });
    handled = true;
  } else if (DOWNGRADE_CLAIM.test(line)) {
    if (!(NEXT_STEP.test(line) || (nextNonBlank && NEXT_STEP.test(nextNonBlank)))) findings.push({ n: i + 1, kind: "DOWNGRADE", hit: "a downgrade with no next step to raise it", line: raw.trim() });
    handled = true; // a downgrade line is owned here (it naturally carries the state it lowered to)
  } else if (HEADLINE_CHERRY.test(line)) {
    findings.push({ n: i + 1, kind: "HEADLINE", hit: "a favorable cut headlined instead of the metric declared before measuring", line: raw.trim() });
    handled = true;
  }

  if (!hasState && !handled) {
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
const grounded = findings.length - hedges - claims;
console.log(`claim-lint: ${findings.length} finding(s) in ${file} - ${hedges} hedge-word(s), ${claims} untagged claim(s), ${grounded} ungrounded high-stakes claim(s)\n`);
const WHY = {
  HEDGE: (f) => `hedge-word "${f.hit}" - cite a measurement or say not-assessed`,
  CLAIM: (f) => `claim "${f.hit}" has no evidence state - tag proven/observed/inferred/documented/reported/not-assessed`,
  FIX: () => `"fixed"/"resolved" needs a revert record (red before, green after, red again on revert), each run with its command + exit`,
  VERIFY: () => `"verified" needs a re-runnable command, its exit code, and an output hash (e.g. verified-by: \`cmd\` exit 0 sha256 ...)`,
  SUITE: () => `a suite-backed claim must name the covering cases and the shapes it did NOT check (a green suite proves only its cases)`,
  "DONE-OPEN-HIGH": () => `cannot be "done" while a HIGH review finding is open - fix it, or get an operator waiver, first`,
  "DONE-INFERRED": (f) => `cannot be "done" on mostly-inferred evidence (${f.hit}) - re-check the inferred records or show "N of M observed"`,
  OWNERSHIP: () => `observe which part owns the behavior before building on it - record the owner (file:line) and the output of running it through the system`,
  DOWNGRADE: () => `a downgrade is the deliverable, but name the next step that would raise it and who will take it - do not let it be the last word`,
  HEADLINE: () => `declare the headline metric and its cut BEFORE measuring, and report every cut with what each one counts - do not headline the most favorable`,
};
for (const f of findings) {
  const why = (WHY[f.kind] || WHY.CLAIM)(f);
  console.log(`  L${f.n}  [${f.kind}] ${why}`);
  console.log(`         > ${f.line}`);
}
console.log("\nFix: attach an evidence state + a re-runnable source + a named limitation, or downgrade the claim.");
if (!strict) console.log("(warn-only: re-run with --strict to make these findings block.)");
// Findings exist here (the clean case already exited 0 above): block only under --strict.
process.exit(strict ? 1 : 0);
