// bdd-lib.mjs — shared helpers for the BDD gates.
//
// The OFFICIAL @cucumber/gherkin parser is the oracle for "valid Gherkin": we never regex-parse
// feature files. Everything downstream (tags, the datastore, coverage) is derived from the parser's
// AST, so a malformed file fails validity before it can reach anything else.
import { readdirSync, readFileSync } from "node:fs";
import { join, relative, sep } from "node:path";
import { Parser, AstBuilder, GherkinClassicTokenMatcher } from "@cucumber/gherkin";
import { IdGenerator } from "@cucumber/messages";

// --- the controlled taxonomy (keep in lockstep with SKILL.md "Categorization") ----------------
export const CATEGORY = new Set([
  "happy", "edge", "error", "boundary", "negative", "adverse",
  "concurrency", "permission", "empty-overflow", "timeout",
]);
export const QUALITY = new Set([
  "functional", "security", "reliability", "release-safety",
  "compliance", "performance", "accessibility",
]);
export const SEVERITY = new Set(["critical", "high", "medium", "low"]);
// Sibling skills emit bare quality tags; treat them as equivalents of @quality:<x>.
export const QUALITY_ALIASES = new Set(["@security", "@compliance", "@reliability", "@release-safety"]);
export const LOG_EVENTS = new Set(["added", "updated", "removed", "reinstated", "waived", "verified"]);

export function findFeatureFiles(dir) {
  const out = [];
  let entries;
  try { entries = readdirSync(dir, { withFileTypes: true }); } catch { return out; }
  for (const e of entries) {
    const p = join(dir, e.name);
    if (e.isDirectory()) out.push(...findFeatureFiles(p));
    else if (e.name.endsWith(".feature")) out.push(p);
  }
  return out.sort();
}

function newParser() {
  return new Parser(new AstBuilder(IdGenerator.uuid()), new GherkinClassicTokenMatcher());
}

// Parse one file. Returns { file, doc } on success, or { file, error: { message, line } }.
export function parseFeature(file) {
  const src = readFileSync(file, "utf8");
  try {
    return { file, doc: newParser().parse(src) };
  } catch (e) {
    const errs = e.errors || [e];
    const first = errs[0] || {};
    const line = first.location && first.location.line;
    return { file, error: { message: errs.map((x) => x.message || String(x)).join("; "), line } };
  }
}

// Domain = the first path segment under the features root (features/<domain>/<feature>.feature).
export function domainOf(file, featuresRoot) {
  const rel = relative(featuresRoot, file).split(sep).join("/");
  const parts = rel.split("/");
  return parts.length > 1 ? parts[0] : "(root)";
}

// "@category:error" -> { key: "category", value: "error" }; "@security" -> { key: "@security" }.
export function tagKV(tag) {
  const m = /^@([a-z][a-z-]*):(.+)$/.exec(tag);
  return m ? { key: m[1], value: m[2] } : { key: tag };
}

export function tagValue(tags, key) {
  for (const t of tags) { const kv = tagKV(t); if (kv.key === key) return kv.value; }
  return undefined;
}

// Quality from @quality:<x> or a sibling alias (@security -> "security").
export function qualityOf(tags) {
  const v = tagValue(tags, "quality");
  if (v) return v;
  for (const t of tags) if (QUALITY_ALIASES.has(t)) return t.slice(1);
  return undefined;
}

// All scenarios in a parsed doc, with tags inherited from Feature and Rule, plus derived domain.
export function scenariosOf(parsed, featuresRoot) {
  const out = [];
  const feature = parsed.doc && parsed.doc.feature;
  if (!feature) return out;
  const names = (ts) => (ts || []).map((t) => t.name);
  const walk = (children, inherited) => {
    for (const c of children) {
      if (c.scenario) {
        out.push({
          name: c.scenario.name,
          tags: [...inherited, ...names(c.scenario.tags)],
          file: parsed.file,
          domain: domainOf(parsed.file, featuresRoot),
        });
      } else if (c.rule) {
        walk(c.rule.children, [...inherited, ...names(c.rule.tags)]);
      }
    }
  };
  walk(feature.children || [], names(feature.tags));
  return out;
}

// Build the canonical datastore (array of records) from the feature files, deterministically ordered.
export function buildIndex(featuresRoot) {
  const records = [];
  for (const f of findFeatureFiles(featuresRoot)) {
    const parsed = parseFeature(f);
    if (parsed.error) continue; // validity is check-gherkin-valid's job, not the index's
    for (const s of scenariosOf(parsed, featuresRoot)) {
      records.push({
        feature: relative(featuresRoot, f).split(sep).join("/"),
        scenario: s.name,
        domain: s.domain,
        audience: tagValue(s.tags, "audience") ?? null,
        usecase: tagValue(s.tags, "usecase") ?? null,
        category: tagValue(s.tags, "category") ?? null,
        quality: qualityOf(s.tags) ?? null,
        severity: tagValue(s.tags, "severity") ?? null,
        status: "covered",
      });
    }
  }
  records.sort((a, b) => (a.feature + "::" + a.scenario).localeCompare(b.feature + "::" + b.scenario));
  return { records, json: JSON.stringify(records, null, 2) + "\n", md: renderIndexMd(records) };
}

export function renderIndexMd(records) {
  const rows = records.map(
    (r) => `| ${r.feature} | ${r.scenario} | ${r.domain} | ${r.audience ?? ""} | ${r.usecase ?? ""} | ${r.category ?? ""} | ${r.quality ?? ""} | ${r.severity ?? ""} | ${r.status} |`,
  );
  return [
    "# BDD coverage index",
    "",
    "Generated from the feature files by `bdd-index-generate.mjs` — do not edit by hand.",
    "",
    "| Feature | Scenario | Domain | Audience | Use case | Category | Quality | Severity | Status |",
    "|---|---|---|---|---|---|---|---|---|",
    ...rows,
    "",
  ].join("\n");
}

// Load optional repo config: features/bdd-config.json -> { audiences: [...] }.
export function loadConfig(featuresRoot) {
  try { return JSON.parse(readFileSync(join(featuresRoot, "bdd-config.json"), "utf8")); }
  catch { return {}; }
}
