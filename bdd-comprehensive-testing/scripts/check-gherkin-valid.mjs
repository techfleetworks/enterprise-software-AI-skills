#!/usr/bin/env node
// check-gherkin-valid — every .feature file must parse with the OFFICIAL Gherkin parser.
//
// "Valid Gherkin" is defined as what @cucumber/gherkin accepts, so there is no heuristic to be wrong
// about: legal syntax parses (no false positive), illegal syntax cannot (no false negative). This
// settles SYNTAX only; semantic/style quality is check-bdd-tags' job.
//
//   node check-gherkin-valid.mjs [featuresDir]   # default: ./features
//
// Exit 0 = all parse. Exit 1 = a parse error, or zero feature files found (fail closed).
import { resolve } from "node:path";
import { findFeatureFiles, parseFeature } from "./bdd-lib.mjs";

const root = resolve(process.argv[2] ?? "features");
const files = findFeatureFiles(root);
if (files.length === 0) {
  console.error(`[check-gherkin-valid] FAIL — no .feature files under ${root} (zero-scan; fail closed).`);
  process.exit(1);
}

const bad = files.map(parseFeature).filter((r) => r.error);
if (bad.length) {
  console.error(`[check-gherkin-valid] FAIL — ${bad.length} file(s) are not valid Gherkin:`);
  for (const b of bad) console.error(`  • ${b.file}${b.error.line ? `:${b.error.line}` : ""} — ${b.error.message}`);
  process.exit(1);
}
console.log(`[check-gherkin-valid] OK — ${files.length} feature file(s) parse cleanly.`);
process.exit(0);
