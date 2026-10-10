#!/usr/bin/env node
// bdd-index-generate — (re)generate the centralized datastore from the feature files.
//
// The feature files are the single source of truth for scenario content; this derives the registry
// over them (features/bdd-index.json canonical + features/INDEX.md human view) so the two can never
// drift. Run it after changing scenarios; check-bdd-coverage fails the build if the committed files
// don't match a fresh regeneration.
//
//   node bdd-index-generate.mjs [featuresDir]            # write the datastore
//   node bdd-index-generate.mjs [featuresDir] --check    # verify it is in sync (exit 1 on drift)
import { resolve, join } from "node:path";
import { readFileSync, writeFileSync } from "node:fs";
import { buildIndex } from "./bdd-lib.mjs";

const root = resolve(process.argv[2] && !process.argv[2].startsWith("--") ? process.argv[2] : "features");
const check = process.argv.includes("--check");
const { json, md } = buildIndex(root);
const jsonPath = join(root, "bdd-index.json");
const mdPath = join(root, "INDEX.md");

if (check) {
  const read = (p) => { try { return readFileSync(p, "utf8"); } catch { return null; } };
  const drift = [];
  if (read(jsonPath) !== json) drift.push("bdd-index.json");
  if (read(mdPath) !== md) drift.push("INDEX.md");
  if (drift.length) {
    console.error(`[bdd-index] FAIL — datastore out of sync with the feature files: ${drift.join(", ")}. ` +
      `Run: node bdd-index-generate.mjs ${root}`);
    process.exit(1);
  }
  console.log("[bdd-index] OK — datastore matches the feature files.");
  process.exit(0);
}

writeFileSync(jsonPath, json);
writeFileSync(mdPath, md);
console.log(`[bdd-index] wrote ${jsonPath} and ${mdPath}.`);
process.exit(0);
