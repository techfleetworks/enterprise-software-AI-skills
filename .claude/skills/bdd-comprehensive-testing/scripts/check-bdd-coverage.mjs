#!/usr/bin/env node
// bootstrap-v2-consumer-gate: bdd-coverage
// check-bdd-coverage - the completeness gate, fail-closed. Proves the matrix, the datastore, and the
// append-only log all hold. Pairs with check-gherkin-valid (syntax) and check-bdd-tags (taxonomy).
//
//   node check-bdd-coverage.mjs [featuresDir]   # default: ./features
//
// Fails (exit 1) when:
//   1. zero feature files (fail closed),
//   2. a committed datastore (bdd-index.json / INDEX.md) is out of sync with the feature files. The datastore
//      is generated, so a repo may commit it or not (ADR-0108); when it is absent, the gates derive it,
//   3. a feature has only happy-path scenarios (no non-happy category),
//   4. a declared audience (features/bdd-config.json) has no scenario anywhere,
//   5. the coverage log (features/bdd-coverage-log/, one file per entry, or a legacy bdd-coverage-log.md) is
//      missing/empty, carries an unknown event, or was not a clean append (history edited). For the directory
//      log, BDD_LOG_BASE_REF names the git ref to check against; for the legacy file, BDD_LOG_BASE names a
//      file holding its previous version.
//
// The "a changed behavior must have a scenario / a new log entry" rules need the PR diff; wire them as a
// CI diff step if you want them mechanical, otherwise they rest on the author and the PR checklist. This
// gate proves the self-contained invariants above.
import { resolve, join } from "node:path";
import { readFileSync, existsSync, statSync } from "node:fs";
import {
  findFeatureFiles, parseFeature, scenariosOf, buildIndex, loadConfig,
  tagValue, LOG_EVENTS, coverageLogPath, readCoverageLog, verifyCoverageLogAgainstRef,
} from "./bdd-lib.mjs";

const root = resolve(process.argv[2] ?? "features");
const fail = (msg) => { console.error(`[check-bdd-coverage] FAIL - ${msg}`); process.exit(1); };
// Normalize line endings on read so a Windows checkout (core.autocrlf=true, CRLF on disk) does not read
// as spurious datastore drift or break the append-only check; the generator emits LF and CI is LF.
const norm = (s) => (s == null ? s : s.replace(/\r\n/g, "\n"));
const read = (p) => { try { return norm(readFileSync(p, "utf8")); } catch { return null; } };

const files = findFeatureFiles(root);
if (files.length === 0) fail(`no .feature files under ${root} (zero-scan; fail closed).`);

// 2 - a committed datastore must be in sync; an absent one is derived (it is generated, never hand-written)
const { records, json, md } = buildIndex(root);
const committed = [["bdd-index.json", json], ["INDEX.md", md]].filter(([f]) => existsSync(join(root, f)));
for (const [f, fresh] of committed) {
  if (read(join(root, f)) !== norm(fresh)) fail(`${f} is out of sync - run bdd-index-generate.mjs ${root}, or stop committing it (ADR-0108)`);
}
const storeNote = committed.length ? "datastore file(s) in sync" : "datastore derived from the feature files";

// 2b - every scenario must have at least one step (Given/When/Then). A step-less scenario is legal Gherkin but
// exercises nothing, so it must not count toward audience or category coverage.
const stepless = [];
for (const f of files) {
  const parsed = parseFeature(f);
  if (parsed.error) continue; // validity is check-gherkin-valid's job
  for (const s of scenariosOf(parsed, root)) if (!s.steps) stepless.push(`${s.name} (${f})`);
}
if (stepless.length) fail(`scenario(s) with no steps (Given/When/Then) exercise nothing: ${stepless.join("; ")}`);

// 3 - no feature may be happy-path-only
const byFeature = new Map();
for (const r of records) { if (!byFeature.has(r.feature)) byFeature.set(r.feature, []); byFeature.get(r.feature).push(r); }
const happyOnly = [...byFeature.entries()].filter(([, rs]) => rs.every((r) => r.category === "happy")).map(([f]) => f);
if (happyOnly.length) fail(`feature(s) have only happy-path scenarios (add non-happy paths): ${happyOnly.join(", ")}`);

// 4 - every declared audience is covered somewhere
let cfg;
try { cfg = loadConfig(root); } catch (e) { fail(e.message); }
if (Array.isArray(cfg.audiences)) {
  const covered = new Set(records.map((r) => r.audience));
  const uncovered = cfg.audiences.filter((a) => !covered.has(a));
  if (uncovered.length) fail(`declared audience(s) with no scenario: ${uncovered.join(", ")}`);
}

// 5 - the append-only coverage log
const logPath = coverageLogPath(root);
let log;
try { log = readCoverageLog(logPath); } catch (e) { fail(e.message); }
if (!log.trim()) fail(`coverage log missing or empty: ${logPath}`);
for (const m of log.matchAll(/(?:^|\s)event:\s*([a-z-]+)/gim)) {
  if (!LOG_EVENTS.has(m[1])) fail(`coverage log has an unknown event "${m[1]}" (allowed: ${[...LOG_EVENTS].join(", ")})`);
}
// Append-only is verifiable only against the previous revision of the log. For the directory log CI MUST
// export BDD_LOG_BASE_REF (a git ref such as origin/main); for the legacy file, BDD_LOG_BASE (e.g.
// `git show origin/main:features/bdd-coverage-log.md > base.md`). BDD_REQUIRE_LOG_BASE makes a missing base a
// hard failure. We never CLAIM "append-only" we didn't actually check - the success line reports exactly what
// was verified.
const isDirLog = statSync(logPath).isDirectory();
const baseRef = process.env.BDD_LOG_BASE_REF;
const basePath = process.env.BDD_LOG_BASE;
const require_base = process.env.BDD_REQUIRE_LOG_BASE;
let logNote;
if (isDirLog && baseRef) {
  try { logNote = verifyCoverageLogAgainstRef(logPath, baseRef); } catch (e) { fail(e.message); }
} else if (isDirLog) {
  if (require_base) fail("cannot verify append-only history: BDD_LOG_BASE_REF is unset but BDD_REQUIRE_LOG_BASE is set. In CI, export BDD_LOG_BASE_REF=origin/main.");
  logNote = "log append-only NOT verified (set BDD_LOG_BASE_REF to check history)";
} else if (basePath) {
  const base = read(basePath);
  if (base === null) {
    // base path given but unreadable - do NOT claim a guarantee we couldn't check
    if (require_base) fail(`BDD_LOG_BASE (${basePath}) is unreadable - cannot verify append-only history.`);
    logNote = "log append-only NOT verified (base unreadable)";
  } else if (base === "") {
    logNote = "log append-only verified (no prior history)"; // empty base = nothing to violate
  } else {
    if (!log.startsWith(base)) fail(`coverage log is not append-only - a prior entry was edited or removed (history must be immutable).`);
    logNote = "log append-only verified";
  }
} else if (require_base) {
  fail(`cannot verify append-only history: BDD_LOG_BASE is unset but BDD_REQUIRE_LOG_BASE is set. ` +
    `In CI, export BDD_LOG_BASE to the base-revision log (git show origin/main:features/bdd-coverage-log.md > base.md).`);
} else {
  logNote = "log append-only NOT verified (set BDD_LOG_BASE to check history)";
}

console.log(`[check-bdd-coverage] OK - ${records.length} scenario(s) across ${byFeature.size} feature(s); ${storeNote}; ${logNote}.`);
process.exit(0);
