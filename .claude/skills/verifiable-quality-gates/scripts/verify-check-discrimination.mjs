#!/usr/bin/env node
/**
 * verify-check-discrimination — the MUTATION gate (reference implementation).
 *
 * For each check that is expected to have a test, replace the check with a no-op that always
 * passes, run that check's test(s), and REQUIRE them to FAIL. A test that still passes against a
 * do-nothing check asserts nothing about detection — it is vacuous — and this gate blocks the
 * merge. Pairs with check-has-test.mjs (the coverage gate). See references/mutation-gate.md.
 *
 * Dependency-free (Node built-ins) and vendor-neutral. It shells out to a configurable test
 * command so it works with any runner that accepts file paths and exits non-zero on failure.
 * The reference no-op stub assumes Node checks (see NOOP); adapt it if your checks are in another
 * language.
 *
 * Config (JSON; path via argv[2] or ./verifiable-gates.config.json) — same keys as
 * check-has-test.mjs, plus:
 *   "testCommand": ["node", "--test"]   // test file paths are appended to this argv
 *
 * Exit 0 = every check's test fails when its check is a no-op (all discriminate).
 * Non-zero = a vacuous test was found, or a fail-closed condition (missing input, unmapped check,
 * runner could not start).
 *
 * SAFETY: this mutates check files on disk. It restores every one in a `finally`. In CI this runs
 * on an ephemeral checkout; if a local run is hard-killed mid-mutation, restore with your VCS
 * (e.g. re-checkout the checks directory).
 */
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { spawnSync } from "node:child_process";
import { loadConfig, enumerateChecks, execTestFiles, credits } from "./verifiable-lib.mjs";

function die(msg) {
  console.error(`[verify-check-discrimination] FAIL — ${msg}`);
  process.exit(1);
}

const NOOP = "#!/usr/bin/env node\n// temporarily stubbed by the discrimination gate\nprocess.exit(0);\n";

// --- config + enumerate (shared with the coverage gate; see verifiable-lib.mjs) ---
// Same owner as check-has-test: if the two gates enumerated checks or credited tests differently,
// a check could be "covered" by one and "unmapped" by the other. One lib, one answer.
const { cfg, checksDir, testsDir, checkRe, testRe, allowlist } = loadConfig(die, [
  "checksDir", "checkPattern", "testsDir", "testPattern", "allowlist", "testCommand",
]);
if (!Array.isArray(cfg.testCommand) || cfg.testCommand.length === 0) {
  die(`"testCommand" must be a non-empty argv array, e.g. ["node","--test"]`);
}

const checks = enumerateChecks(checksDir, checkRe);
const required = checks.filter((c) => !allowlist.has(c));
if (required.length === 0) {
  console.log("[verify-check-discrimination] OK — no non-allowlisted checks to mutate (nothing to do).");
  process.exit(0);
}

// --- map each required check to its crediting test files ----------------------
const testFiles = execTestFiles(testsDir, testRe);
const mapped = new Map(); // check basename -> [test file paths]
for (const c of required) {
  const files = testFiles.filter((tf) => credits(readFileSync(tf, "utf8"), c));
  if (files.length === 0) die(`required check has no test mapped to it: ${c} (coverage gate should have caught this)`);
  mapped.set(c, files);
}

// If this gate is itself invoked from inside a test runner (e.g. `node --test` wires it into the
// suite), the runner exports NODE_TEST_CONTEXT/NODE_TEST_WORKER_ID. A nested `node --test` that
// inherits those switches into child-reporter mode — it streams results over IPC and exits 0 even
// when assertions fail, which would make a FAILING (good) test look like it PASSED against the
// no-op and be reported as vacuous. Strip them so the inner runner's exit code is authoritative.
const childEnv = { ...process.env };
delete childEnv.NODE_TEST_CONTEXT;
delete childEnv.NODE_TEST_WORKER_ID;

// --- mutate one check at a time; its test(s) MUST fail -----------------------
const backups = new Map(); // path -> original source
const vacuous = [];
try {
  for (const c of required) {
    const checkPath = join(checksDir, c);
    if (!backups.has(checkPath)) backups.set(checkPath, readFileSync(checkPath, "utf8"));

    writeFileSync(checkPath, NOOP); // neutralize the check
    const files = mapped.get(c);
    const res = spawnSync(cfg.testCommand[0], [...cfg.testCommand.slice(1), ...files], {
      stdio: "pipe",
      encoding: "utf8",
      env: childEnv,
    });
    writeFileSync(checkPath, backups.get(checkPath)); // restore immediately so later runs see the real others

    if (res.error) die(`could not launch test runner "${cfg.testCommand.join(" ")}": ${res.error.message}`);
    if (res.status === 0) vacuous.push(c); // tests PASSED against a no-op → vacuous
  }
} finally {
  // Defensive sweep: restore anything a mid-loop crash left stubbed.
  for (const [p, src] of backups) {
    try {
      if (readFileSync(p, "utf8") === NOOP) writeFileSync(p, src);
    } catch {
      /* best effort; VCS is the backstop */
    }
  }
}

// --- verdict -----------------------------------------------------------------
if (vacuous.length) {
  console.error(
    `[verify-check-discrimination] FAIL — ${vacuous.length} check(s) have a VACUOUS test ` +
      `(it still passes when the check is a no-op):`
  );
  for (const c of vacuous) console.error(`  • ${c}`);
  console.error(
    `\nEach listed test asserts nothing tied to its check's detection, so a broken check would ship\n` +
      `green. Add a fixture that reproduces the real violation and asserts a non-zero exit ` +
      `(see check-test-patterns.md).`
  );
  process.exit(1);
}

console.log(
  `[verify-check-discrimination] OK — ${required.length} check(s) mutated; ` +
    `each FAILS when its check is a no-op (all genuinely discriminate).`
);
process.exit(0);
