// bootstrap-v2-helper: bdd-lib
// bdd-lib.mjs - shared helpers for the BDD gates.
//
// The OFFICIAL @cucumber/gherkin parser is the oracle for "valid Gherkin": we never regex-parse
// feature files. Everything downstream (tags, the datastore, coverage) is derived from the parser's
// AST, so a malformed file fails validity before it can reach anything else.
import { readdirSync, readFileSync, existsSync, statSync } from "node:fs";
import { join, relative, sep } from "node:path";
import { spawnSync } from "node:child_process";
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

// --- the append-only coverage log (ADR-0108) ---------------------------------------------------
// The log is a DIRECTORY, features/bdd-coverage-log/, with one Markdown file per entry named
// `<YYYYMMDDTHHMMSSZ>-<slug>.md`. Two open pull requests add two different new files, so they cannot
// conflict on the log on any host. A legacy single features/bdd-coverage-log.md still reads. (This skill
// installs on its own, so it keeps its own reader; judge-arch's entry-log.mjs holds the same rules.)
export const LOG_ENTRY_NAME = /^\d{8}T\d{6}Z-[a-z0-9][a-z0-9._-]*\.md$/;
const lf = (s) => s.replace(/\r\n/g, "\n");

// The log location under a features root: the directory when it exists, else the legacy file.
export function coverageLogPath(featuresRoot) {
  const dir = join(featuresRoot, "bdd-coverage-log");
  return existsSync(dir) ? dir : join(featuresRoot, "bdd-coverage-log.md");
}

// The whole log as text, entries oldest first. Throws an Error naming a missing log or a bad entry name.
export function readCoverageLog(path) {
  if (!existsSync(path)) throw new Error(`coverage log missing: ${path}`);
  if (!statSync(path).isDirectory()) return lf(readFileSync(path, "utf8"));
  // Every file but the README is an entry, whatever its extension, so a misnamed entry fails instead of
  // being skipped.
  const names = readdirSync(path).filter((n) => n !== "README.md").sort();
  const bad = names.filter((n) => !LOG_ENTRY_NAME.test(n));
  if (bad.length) throw new Error(`coverage log entry name(s) not in the <YYYYMMDDTHHMMSSZ>-<slug>.md form: ${bad.join(", ")}`);
  return names.map((n) => lf(readFileSync(join(path, n), "utf8"))).join("\n");
}

// Verify a directory log only grew against a git ref: every entry the ref has must still be here, unchanged
// (line endings aside; the README may change). Two git commands whatever the history size. Returns a note;
// throws an Error naming each edited or removed entry, or a git failure (fail closed).
export function verifyCoverageLogAgainstRef(dir, ref) {
  const git = (...a) => {
    const r = spawnSync("git", ["-c", "core.autocrlf=input", "-c", "core.quotePath=false", ...a], { cwd: dir, encoding: "utf8" });
    if (r.status !== 0) throw new Error(`git ${a.join(" ")} failed: ${(r.stderr || "").trim() || `exit ${r.status}`} (cannot verify append-only; fail closed)`);
    return r.stdout;
  };
  // --end-of-options: the ref comes from CI env, so a value like "--output=<file>" must be read as a ref (and
  // fail), never as a git option.
  const count = git("ls-tree", "--name-only", "--end-of-options", ref).split("\n").filter((n) => n && n !== "README.md").length;
  const problems = git("diff", "--no-renames", "--relative", "--name-status", "--diff-filter=DMT", "--end-of-options", ref, "--", ".", ":!README.md")
    .split("\n").filter(Boolean).map((l) => {
      const [status, name] = l.split("\t");
      return `${name} was ${status === "D" ? "removed" : "edited"}`;
    });
  if (problems.length) throw new Error(`coverage log is not append-only against ${ref}: ${problems.join("; ")} (history must be immutable)`);
  return count ? `log append-only verified against ${ref}` : `log append-only verified (no prior entries at ${ref})`;
}

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
          steps: (c.scenario.steps || []).length,
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
    "Generated from the feature files by `bdd-index-generate.mjs` - do not edit by hand.",
    "",
    "| Feature | Scenario | Domain | Audience | Use case | Category | Quality | Severity | Status |",
    "|---|---|---|---|---|---|---|---|---|",
    ...rows,
    "",
  ].join("\n");
}

// Load optional repo config: features/bdd-config.json -> { audiences: [...] }.
// Absent is fine (return {}); but a PRESENT-but-corrupt config must NOT silently disable the audience
// gates - throw so the calling gate fails closed. (A malformed config that reads as "no config" would
// turn off the declared-audience checks without anyone noticing.)
export function loadConfig(featuresRoot) {
  const p = join(featuresRoot, "bdd-config.json");
  let raw;
  try { raw = readFileSync(p, "utf8"); }
  catch (e) { if (e.code === "ENOENT") return {}; throw e; }
  try { return JSON.parse(raw); }
  catch (e) { throw new Error(`${p} is present but not valid JSON: ${e.message}`); }
}
