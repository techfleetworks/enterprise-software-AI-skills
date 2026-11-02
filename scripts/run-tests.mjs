#!/usr/bin/env node
// run-tests - run every test/*.test.mjs with node --test (ADR-0108).
//
// The test list used to be spelled out in package.json, so every PR that added a test edited the same line and
// two open PRs conflicted on it. This finds the files instead. It matches only the `.test.mjs` suffix (bare
// `node --test` discovery would also run check-has-test.mjs, a CLI script, as a failing test), works on Node 20
// (a positional glob needs Node 21), and fails closed when it finds no test files, so it can never pass by
// running zero tests.
//
//   node scripts/run-tests.mjs [testDir]    # default: <repo>/test
import { readdirSync, realpathSync } from "node:fs";
import { join, dirname, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { spawnSync } from "node:child_process";

// Every test file under dir, sorted, as paths under dir.
export function listTestFiles(dir) {
  return readdirSync(dir).filter((n) => n.endsWith(".test.mjs")).sort().map((n) => join(dir, n));
}

// Run as a script, not imported. Compare REAL paths: import.meta.url is the resolved path, argv[1] is not, so a
// checkout reached through a symlink or junction would otherwise skip the run and exit 0 with zero tests.
if (process.argv[1] && import.meta.url === pathToFileURL(realpathSync(process.argv[1])).href) {
  const dir = resolve(process.argv[2] ?? resolve(dirname(fileURLToPath(import.meta.url)), "..", "test"));
  let files;
  try { files = listTestFiles(dir); }
  catch (e) { console.error(`[run-tests] FAIL - cannot read ${dir}: ${e.message}`); process.exit(2); }
  if (files.length === 0) {
    console.error(`[run-tests] FAIL - no *.test.mjs files under ${dir} (fail closed: zero tests is not a pass).`);
    process.exit(2);
  }
  const r = spawnSync(process.execPath, ["--test", ...files], { stdio: "inherit" });
  if (r.error) { console.error(`[run-tests] FAIL - could not start node --test: ${r.error.message}`); process.exit(2); }
  process.exit(r.status ?? 1);
}
