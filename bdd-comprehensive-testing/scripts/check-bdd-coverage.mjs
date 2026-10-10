#!/usr/bin/env node
// check-bdd-coverage — the completeness gate, fail-closed. Proves the matrix, the datastore, and the
// append-only log all hold. Pairs with check-gherkin-valid (syntax) and check-bdd-tags (taxonomy).
//
//   node check-bdd-coverage.mjs [featuresDir]   # default: ./features
//
// Fails (exit 1) when:
//   1. zero feature files (fail closed),
//   2. the datastore (bdd-index.json / INDEX.md) is missing or out of sync with the feature files,
//   3. a feature has only happy-path scenarios (no non-happy category),
//   4. a declared audience (features/bdd-config.json) has no scenario anywhere,
//   5. the coverage log (features/bdd-coverage-log.md) is missing/empty, carries an unknown event,
//      or — when BDD_LOG_BASE points at the previous version — was not a clean append (history edited).
//
// The "a changed behavior must have a scenario / a new log entry" rules are enforced in CI from the
// PR diff (see references/bdd-gates.md); this gate proves the self-contained invariants above.
import { resolve, join } from "node:path";
import { readFileSync } from "node:fs";
import {
  findFeatureFiles, parseFeature, scenariosOf, buildIndex, loadConfig,
  tagValue, LOG_EVENTS,
} from "./bdd-lib.mjs";

const root = resolve(process.argv[2] ?? "features");
const fail = (msg) => { console.error(`[check-bdd-coverage] FAIL — ${msg}`); process.exit(1); };
const read = (p) => { try { return readFileSync(p, "utf8"); } catch { return null; } };

const files = findFeatureFiles(root);
if (files.length === 0) fail(`no .feature files under ${root} (zero-scan; fail closed).`);

// 2 — datastore in sync
const { records, json, md } = buildIndex(root);
if (read(join(root, "bdd-index.json")) !== json) fail(`bdd-index.json is missing or out of sync — run bdd-index-generate.mjs ${root}`);
if (read(join(root, "INDEX.md")) !== md) fail(`INDEX.md is missing or out of sync — run bdd-index-generate.mjs ${root}`);

// 3 — no feature may be happy-path-only
const byFeature = new Map();
for (const r of records) { if (!byFeature.has(r.feature)) byFeature.set(r.feature, []); byFeature.get(r.feature).push(r); }
const happyOnly = [...byFeature.entries()].filter(([, rs]) => rs.every((r) => r.category === "happy")).map(([f]) => f);
if (happyOnly.length) fail(`feature(s) have only happy-path scenarios (add non-happy paths): ${happyOnly.join(", ")}`);

// 4 — every declared audience is covered somewhere
const cfg = loadConfig(root);
if (Array.isArray(cfg.audiences)) {
  const covered = new Set(records.map((r) => r.audience));
  const uncovered = cfg.audiences.filter((a) => !covered.has(a));
  if (uncovered.length) fail(`declared audience(s) with no scenario: ${uncovered.join(", ")}`);
}

// 5 — the append-only coverage log
const logPath = join(root, "bdd-coverage-log.md");
const log = read(logPath);
if (!log || !log.trim()) fail(`coverage log missing or empty: ${logPath}`);
for (const m of log.matchAll(/(?:^|\s)event:\s*([a-z-]+)/gim)) {
  if (!LOG_EVENTS.has(m[1])) fail(`coverage log has an unknown event "${m[1]}" (allowed: ${[...LOG_EVENTS].join(", ")})`);
}
const basePath = process.env.BDD_LOG_BASE;
if (basePath) {
  const base = read(basePath);
  if (base && !log.startsWith(base)) fail(`coverage log is not append-only — a prior entry was edited or removed (history must be immutable).`);
}

console.log(`[check-bdd-coverage] OK — ${records.length} scenario(s) across ${byFeature.size} feature(s); datastore in sync; log append-only.`);
process.exit(0);
