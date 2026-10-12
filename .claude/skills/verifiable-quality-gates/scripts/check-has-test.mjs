#!/usr/bin/env node
/**
 * check-has-test — the COVERAGE gate (reference implementation).
 *
 * Proves that every automated check has a committed test that actually EXECS it. Pairs with
 * verify-check-discrimination.mjs (the mutation gate, which proves those tests DISCRIMINATE).
 *
 * Dependency-free (Node built-ins only) and vendor-neutral: it does not assume a particular test
 * runner. It credits a check when some test file both (a) references the check's file name and
 * (b) contains an exec indicator (it spawns a child process). That heuristic is intentionally
 * simple; a production version may prefer an AST pass that confirms the check's path is passed to
 * the exec call from a local binding (fewer false credits). See SKILL.md.
 *
 * Config (JSON; path via argv[2] or ./verifiable-gates.config.json):
 *   {
 *     "checksDir":    "scripts/ci",              // where the checks live
 *     "checkPattern": "^check-.*\\.(mjs|js)$",   // which files there are checks (basename regex)
 *     "testsDir":     "test/checks",             // where the check-tests live (searched recursively)
 *     "testPattern":  "\\.(test|spec)\\.(mjs|js|ts|tsx)$",
 *     "allowlist":    "scripts/ci/check-test-allowlist.json"  // shrink-only list of pre-existing untested checks
 *   }
 *
 * Exit 0 = every non-allowlisted check has a crediting test. Non-zero = missing input (fail closed)
 * or one or more untested checks.
 */
import { readFileSync } from "node:fs";
import { loadConfig, enumerateChecks, execTestFiles, credits } from "./verifiable-lib.mjs";

function die(msg) {
  console.error(`[check-has-test] FAIL — ${msg}`);
  process.exit(1);
}

// --- config + enumerate (shared with the mutation gate; see verifiable-lib.mjs) ---
// Both gates MUST load config, enumerate checks, and credit tests identically, or they drift
// (one gate counts a check as covered that the other does not). verifiable-lib.mjs is that one owner.
const { cfg, checksDir, testsDir, checkRe, testRe, allowlist } = loadConfig(die);
const checks = enumerateChecks(checksDir, checkRe);
if (checks.length === 0) die(`no checks matched ${cfg.checkPattern} in ${checksDir} (zero-scan)`);

// --- credit a check when some exec-test references its name -------------------
const credited = new Set();
for (const tf of execTestFiles(testsDir, testRe)) {
  const src = readFileSync(tf, "utf8");
  for (const c of checks) if (credits(src, c)) credited.add(c);
}

// --- verdict -----------------------------------------------------------------
const required = checks.filter((c) => !allowlist.has(c));
const untested = required.filter((c) => !credited.has(c));

if (untested.length) {
  console.error(
    `[check-has-test] FAIL — ${untested.length} check(s) have no committed test that execs them:`
  );
  for (const c of untested) console.error(`  • ${c}`);
  console.error(
    `\nAdd a test that spawns the real check and asserts its exit code (see check-test-patterns.md),\n` +
      `or — only for a pre-existing check — add it to ${cfg.allowlist} (shrink-only; burn it down).`
  );
  process.exit(1);
}

// Report stale allowlist entries (a check on the list that now HAS a test, or no longer exists).
const stale = [...allowlist].filter((c) => credited.has(c) || !checks.includes(c));
console.log(
  `[check-has-test] OK — ${checks.length} checks scanned, ${required.length} required, ` +
    `${credited.size} credited by a committed exec-test, ${allowlist.size} on the shrink-only allowlist.`
);
if (stale.length) {
  console.log(
    `  note: ${stale.length} allowlist entry(ies) can be REMOVED (now tested, or the check is gone): ${stale.join(", ")}`
  );
}
process.exit(0);
