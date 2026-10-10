#!/usr/bin/env node
// check-bdd-tags — every scenario must carry the full taxonomy, each value in-vocabulary.
//
// Dimensions (see SKILL.md "Categorization"): @audience (in the declared list, if one is configured),
// @usecase (present), @category (vocab), @quality (vocab, or a sibling alias like @security),
// @severity (vocab). A missing, typo'd, or invented tag fails the build, so the matrix, datastore,
// and log can't be fooled by a tag that merely looks valid.
//
//   node check-bdd-tags.mjs [featuresDir]   # default: ./features
//
// Exit 0 = all scenarios fully + validly tagged. Exit 1 = a problem, or zero feature files.
import { resolve } from "node:path";
import {
  findFeatureFiles, parseFeature, scenariosOf, loadConfig,
  CATEGORY, QUALITY, SEVERITY, tagValue, qualityOf,
} from "./bdd-lib.mjs";

const root = resolve(process.argv[2] ?? "features");
const files = findFeatureFiles(root);
if (files.length === 0) {
  console.error(`[check-bdd-tags] FAIL — no .feature files under ${root} (zero-scan; fail closed).`);
  process.exit(1);
}

let cfg;
try { cfg = loadConfig(root); }
catch (e) { console.error(`[check-bdd-tags] FAIL — ${e.message}`); process.exit(1); }
const audiences = Array.isArray(cfg.audiences) ? new Set(cfg.audiences) : null;
const problems = [];

for (const f of files) {
  const parsed = parseFeature(f);
  if (parsed.error) { problems.push(`${f}: unparseable — run check-gherkin-valid`); continue; }
  for (const s of scenariosOf(parsed, root)) {
    const where = `${s.file} » "${s.name}"`;
    const audience = tagValue(s.tags, "audience");
    const usecase = tagValue(s.tags, "usecase");
    const category = tagValue(s.tags, "category");
    const quality = qualityOf(s.tags);
    const severity = tagValue(s.tags, "severity");

    if (!audience) problems.push(`${where}: missing @audience:`);
    else if (audiences && !audiences.has(audience)) problems.push(`${where}: @audience:${audience} not in declared audiences`);
    if (!usecase) problems.push(`${where}: missing @usecase:`);
    if (!category) problems.push(`${where}: missing @category:`);
    else if (!CATEGORY.has(category)) problems.push(`${where}: @category:${category} not in vocabulary`);
    if (!quality) problems.push(`${where}: missing @quality: (or a sibling @security/@compliance/@reliability/@release-safety)`);
    else if (!QUALITY.has(quality)) problems.push(`${where}: @quality:${quality} not in vocabulary`);
    if (!severity) problems.push(`${where}: missing @severity:`);
    else if (!SEVERITY.has(severity)) problems.push(`${where}: @severity:${severity} not in vocabulary`);
  }
}

if (problems.length) {
  console.error(`[check-bdd-tags] FAIL — ${problems.length} tag problem(s):`);
  for (const p of problems) console.error("  • " + p);
  process.exit(1);
}
console.log("[check-bdd-tags] OK — every scenario carries the full, in-vocabulary taxonomy.");
process.exit(0);
