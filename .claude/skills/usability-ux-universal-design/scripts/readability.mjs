#!/usr/bin/env node
// readability - measure the reading grade of a report before it is sent.
//
//   node readability.mjs <file.md | ->  [--max-grade N]
//
// It reports the Flesch-Kincaid grade level of the PROSE in a file (or stdin when the path is "-").
// Prose only: it skips fenced ``` code blocks, Markdown table rows, inline `code` spans, URLs, and
// file-path-like tokens, so a report full of commands and paths is scored on the sentences a person
// reads, not on the code around them.
//
//   Flesch-Kincaid grade = 0.39 * (words / sentences) + 11.8 * (syllables / word) - 15.59
//
// With --max-grade N it is a gate: exit 1 when the measured grade is ABOVE N, so a report drafted
// above the grade the operator asked for is rewritten, not sent. Without it, it only reports (exit 0).
//
// Exit codes:
//   0 = measured (and, with --max-grade, at or below the target).
//   1 = measured and ABOVE --max-grade (rewrite before sending).
//   2 = fail closed: bad usage, unreadable input, a bad --max-grade value, OR no countable prose
//       (zero words or zero sentences). A file with no prose has no grade, so it is never a silent pass.
//
// The grade is a rule-of-thumb syllable estimate, not a guarantee of being understood (see Limits in
// the skill). A low grade means the words and sentences are short, not that the meaning is clear.

import { readFileSync } from "node:fs";

const USAGE =
  "usage: node readability.mjs <file.md | -> [--max-grade N]\n" +
  "  reports the Flesch-Kincaid grade of the prose; with --max-grade N, exits 1 when the grade is above N.";

const argv = process.argv.slice(2);
if (argv.includes("-h") || argv.includes("--help")) { console.log(USAGE); process.exit(0); }

// Parse --max-grade N (two tokens) or --max-grade=N. A present-but-unparseable value fails closed, so a
// typo can never be read as "no target" and let an over-grade report through.
let maxGrade;
const rest = [];
for (let i = 0; i < argv.length; i++) {
  const a = argv[i];
  if (a === "--max-grade") {
    const v = argv[++i];
    // A missing value (flag is last, or the next token is another flag) must fail closed, not read as
    // "no target": `--max-grade $GRADE` with GRADE unset would otherwise silently disable the gate.
    if (v === undefined || v.startsWith("--")) { console.error(`readability: --max-grade needs a number value\n${USAGE}`); process.exit(2); }
    maxGrade = v;
  } else if (a.startsWith("--max-grade=")) {
    maxGrade = a.slice("--max-grade=".length);
  } else if (a.startsWith("--")) {
    console.error(`readability: unknown flag: ${a}\n${USAGE}`);
    process.exit(2);
  } else {
    rest.push(a);
  }
}
if (maxGrade !== undefined) {
  // An empty value (`--max-grade=`) is not a number, so Number("") === 0 must not be read as "target 0".
  const n = String(maxGrade).trim() === "" ? NaN : Number(maxGrade);
  if (!Number.isFinite(n)) { console.error(`readability: --max-grade needs a number, got "${maxGrade}"\n${USAGE}`); process.exit(2); }
  maxGrade = n;
}

const file = rest[0];
if (!file) { console.error(USAGE); process.exit(2); }

let raw;
try {
  raw = file === "-" ? readFileSync(0, "utf8") : readFileSync(file, "utf8");
} catch (e) {
  console.error(`readability: cannot read ${file === "-" ? "stdin" : file}: ${e.message}`);
  process.exit(2);
}

// --- extract the prose a person reads -------------------------------------------------------------
// Drop fenced code blocks and table rows whole; strip inline code, URLs, and path-like tokens from what
// is left. What remains is the sentences the reader actually reads.
function extractProse(text) {
  const out = [];
  let inFence = false;
  for (const line0 of text.split(/\r?\n/)) {
    const line = line0.trim();
    if (/^(```|~~~)/.test(line)) { inFence = !inFence; continue; } // fence open/close line itself is dropped
    if (inFence) continue;
    if (line === "") continue;
    if (line.startsWith("|")) continue; // Markdown table row
    let s = line;
    s = s.replace(/`[^`]*`/g, " ");                         // inline code spans
    s = s.replace(/\bhttps?:\/\/\S+/gi, " ");               // URLs
    s = s.replace(/<https?:\/\/[^>]+>/gi, " ");             // angle-bracket URLs
    s = s.replace(/\S*[\/\\]\S*/g, " ");                    // tokens with a slash/backslash = paths
    s = s.replace(/\b\w+\.(?:mjs|js|ts|tsx|jsx|json|md|sh|py|yml|yaml|html|css|sql|txt|feature)\b/gi, " "); // bare filenames
    s = s.replace(/^#{1,6}\s+/, "");                        // heading marker
    s = s.replace(/^[-*+]\s+/, "");                         // list bullet
    s = s.replace(/^\d+\.\s+/, "");                         // ordered-list marker
    out.push(s);
  }
  return out.join(" ");
}

function syllablesIn(word) {
  const w = word.toLowerCase().replace(/[^a-z]/g, "");
  if (!w) return 0;
  if (w.length <= 3) return 1; // "cat", "the", "a" -> 1 (the heuristic's floor for short words)
  const trimmed = w
    .replace(/(?:[^laeiouy]es|ed|[^laeiouy]e)$/, "") // silent trailing e / common endings
    .replace(/^y/, "");
  const groups = trimmed.match(/[aeiouy]{1,2}/g);
  return groups ? groups.length : 1;
}

const prose = extractProse(raw);
// Words = alphabetic tokens (numbers and symbols are not FK "words" and have no defined syllable count).
const words = prose.match(/[A-Za-z]+(?:'[A-Za-z]+)?/g) || [];
// Sentences = runs ended by . ! ? ; if prose exists with no terminator, it still reads as one sentence.
const terminators = (prose.match(/[.!?]+(?=\s|$)/g) || []).length;
const sentences = terminators > 0 ? terminators : (words.length > 0 ? 1 : 0);

if (words.length === 0 || sentences === 0) {
  console.error("readability: no countable prose (zero words or zero sentences) - cannot measure a grade; fail closed.");
  process.exit(2);
}

const syllables = words.reduce((a, w) => a + syllablesIn(w), 0);
const wordsPerSentence = words.length / sentences;
const syllablesPerWord = syllables / words.length;
const grade = 0.39 * wordsPerSentence + 11.8 * syllablesPerWord - 15.59;
const shown = Math.round(grade * 10) / 10;

console.log(
  `readability: Flesch-Kincaid grade ${shown}  (${words.length} words, ${sentences} sentence(s), ` +
  `${syllables} syllables; ${wordsPerSentence.toFixed(1)} words/sentence, ${syllablesPerWord.toFixed(2)} syllables/word)`,
);

if (maxGrade !== undefined) {
  if (grade > maxGrade) {
    console.log(`readability: grade ${shown} is ABOVE the target ${maxGrade} - rewrite before sending.`);
    process.exit(1);
  }
  console.log(`readability: grade ${shown} is at or below the target ${maxGrade}.`);
}
process.exit(0);
