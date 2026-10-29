#!/usr/bin/env node
// leak-check - a reference secret-leak checker, and the worked example of a TESTED oracle.
//
//   node leak-check.mjs --secret "VALUE" [--secret "VALUE" ...] <output-file | ->
//
// It decides whether any secret VALUE appears in the output text. It is here as the concrete example behind
// the rule "a checker that decides pass or fail is itself tested before its 0-found counts" (see the skill's
// SKILL.md and references/combinatorial-testing.md): a naive substring match gets two things wrong that this
// checker gets right, each pinned by test/leak-check.test.mjs.
//
//   1. A punctuation / case / spacing / Unicode variant of a secret still leaks it. "Dr Example" leaks the
//      secret "Dr. Example". Both sides are normalized (Unicode NFKC, lowercased, every run of non-alphanumeric
//      characters becomes one space) before the compare, so the surface form does not hide the leak.
//   2. One value found inside a larger one is NOT a leak. "75k" is not leaked by "175k invested". The compare
//      is over WHOLE tokens, so a secret only matches when its token sequence appears as a run of whole tokens
//      in the output, never as a piece of a longer token.
//
// Limit (the other side of rule 2): because the match is whole-token, a secret EMBEDDED inside a larger
// alphanumeric token with no delimiter is NOT matched. A high-entropy machine secret like "ABCD1234" is
// reported clean inside "prefixABCD1234suffix" (but caught in "prefix ABCD1234 suffix"). For API keys and
// tokens that can be concatenated into a longer string, add a substring or entropy check; this checker is for
// human-readable secrets at token boundaries, not a universal data-loss tool.
//
// Exit codes:
//   0 = no secret found in the output (clean). Empty output is clean.
//   1 = at least one secret leaked (the leaked secrets are listed).
//   2 = fail closed: bad usage, an unreadable file, or no non-empty secret to check (an empty secret would
//       "match" everything, so a checker with nothing real to look for must not report a clean pass).

import { readFileSync } from "node:fs";

const USAGE =
  "usage: node leak-check.mjs --secret \"VALUE\" [--secret \"VALUE\" ...] <output-file | ->\n" +
  "  exits 1 if any secret appears in the output (as whole tokens, ignoring case/punctuation/spacing).";

const argv = process.argv.slice(2);
if (argv.includes("-h") || argv.includes("--help")) { console.log(USAGE); process.exit(0); }

const secrets = [];
const rest = [];
for (let i = 0; i < argv.length; i++) {
  const a = argv[i];
  if (a === "--secret") {
    const v = argv[++i];
    if (v === undefined || v.startsWith("--")) { console.error(`leak-check: --secret needs a value\n${USAGE}`); process.exit(2); }
    secrets.push(v);
  } else if (a.startsWith("--secret=")) {
    secrets.push(a.slice("--secret=".length));
  } else if (a.startsWith("--")) {
    console.error(`leak-check: unknown flag: ${a}\n${USAGE}`); process.exit(2);
  } else {
    rest.push(a);
  }
}

const file = rest[0];
if (!file) { console.error(USAGE); process.exit(2); }

let text;
try {
  text = file === "-" ? readFileSync(0, "utf8") : readFileSync(file, "utf8");
} catch (e) {
  console.error(`leak-check: cannot read ${file === "-" ? "stdin" : file}: ${e.message}`);
  process.exit(2);
}

// Normalize to a list of whole tokens: NFKC (fold width/compatibility forms), lowercase, split on every run
// of characters that are not letters or digits. "Dr. Example" and "Dr  EXAMPLE" both become ["dr","example"];
// "175k invested" becomes ["175k","invested"].
function tokens(s) {
  return s
    .normalize("NFKC")
    .toLowerCase()
    .split(/[^\p{L}\p{N}]+/u)
    .filter(Boolean);
}

// A secret leaks when its (non-empty) token sequence appears as a contiguous run of whole tokens in the text.
function leaks(secretToks, textToks) {
  if (secretToks.length === 0) return false;
  for (let i = 0; i + secretToks.length <= textToks.length; i++) {
    let hit = true;
    for (let j = 0; j < secretToks.length; j++) {
      if (textToks[i + j] !== secretToks[j]) { hit = false; break; }
    }
    if (hit) return true;
  }
  return false;
}

// Every secret must normalize to at least one token. A secret that does not (empty or all-punctuation) cannot
// be checked, and an unchecked secret must never read as "clean", so ANY unusable secret fails closed - not
// just the all-unusable case (a usable secret alongside an unusable one would otherwise hide the drop).
const unusable = secrets.filter((s) => tokens(s).length === 0);
if (secrets.length === 0 || unusable.length > 0) {
  const why = secrets.length === 0
    ? "no secret given"
    : `${unusable.length} secret(s) normalize to no tokens and cannot be checked: ${unusable.map((s) => JSON.stringify(s)).join(", ")}`;
  console.error(`leak-check: ${why} (an unchecked secret must not read as clean); fail closed.`);
  process.exit(2);
}

const textToks = tokens(text);
const leaked = secrets.filter((s) => leaks(tokens(s), textToks));

if (leaked.length === 0) {
  console.log(`leak-check: clean - none of ${secrets.length} secret(s) found in the output.`);
  process.exit(0);
}
console.log(`leak-check: LEAK - ${leaked.length} secret(s) found in the output:`);
for (const s of leaked) console.log(`  - ${JSON.stringify(s)}`);
process.exit(1);
