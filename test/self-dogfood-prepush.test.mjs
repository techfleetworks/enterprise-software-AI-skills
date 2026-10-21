// Proves the repo's OWN armed pre-push hook (self-dogfood, ADR-0053) actually runs its gates and blocks a
// push when one fails, and that the zero-step arming is wired. It runs the real .githooks/pre-push against a
// throwaway package.json whose gate scripts are stubs (exit 0 or 1), so the result is controlled. The test
// FAILS if the hook stops running the gates or stops blocking on a failure.
import { test } from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtempSync, writeFileSync, existsSync, readFileSync, rmSync } from "node:fs";
import { resolve, join } from "node:path";
import { tmpdir } from "node:os";

const REPO = resolve(process.cwd());
const HOOK = resolve(REPO, ".githooks/pre-push");
// The gates the hook runs come from the repo's self-checks.json (ADR-0071), the SAME single source the hook
// itself reads, so this fixture stubs exactly the scripts the hook will invoke and the two can never drift.
// (That self-checks.json stays in parity with package.json is guarded by test/self-check-parity.test.mjs.)
const selfChecks = JSON.parse(readFileSync(resolve(REPO, "self-checks.json"), "utf8"));
const GATES = Object.keys(selfChecks.checks).filter((k) => selfChecks.checks[k].local === true);
const created = [];

// A throwaway npm package whose gate scripts are stubs. failing: a gate name to make exit 1 (others exit 0).
function fixture(failing = null) {
  const dir = mkdtempSync(join(tmpdir(), "selfdogfood-"));
  created.push(dir);
  const scripts = {};
  for (const g of GATES) scripts[g] = `node -e "process.exit(${g === failing ? 1 : 0})"`;
  writeFileSync(join(dir, "package.json"), JSON.stringify({ name: "fixture", version: "0.0.0", scripts }, null, 2) + "\n");
  return dir;
}

function runHook(cwd) {
  try {
    execFileSync("node", [HOOK], { cwd, stdio: "pipe" });
    return 0;
  } catch (e) {
    return e.status ?? 1;
  }
}

test("SELF-DOGFOOD pre-push: passes (0) when every gate passes", () => {
  assert.equal(runHook(fixture(null)), 0);
});

test("SELF-DOGFOOD pre-push: BLOCKS (non-zero) when a gate fails (discriminating)", () => {
  // If the hook stopped running gates (e.g. the GATES list were emptied), this would wrongly pass.
  assert.notEqual(runHook(fixture("check:links")), 0);
});

test("SELF-DOGFOOD pre-push: BLOCKS when a different gate fails too", () => {
  assert.notEqual(runHook(fixture("check:receipt")), 0);
});

test("SELF-DOGFOOD: the zero-step arming is wired (prepare -> install-hooks, hooks present)", () => {
  const pkg = JSON.parse(readFileSync(join(REPO, "package.json"), "utf8"));
  assert.equal(pkg.scripts.prepare, "node .githooks/install-hooks.mjs", "package.json prepare must arm the hook on npm install");
  assert.ok(existsSync(HOOK), ".githooks/pre-push must exist");
  assert.ok(existsSync(join(REPO, ".githooks/install-hooks.mjs")), ".githooks/install-hooks.mjs must exist");
});

process.on("exit", () => {
  for (const d of created) { try { rmSync(d, { recursive: true, force: true }); } catch { /* best-effort */ } }
});
