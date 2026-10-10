// Discriminating tests for judge-arch/scripts/arch-gate.mjs
//
// Each test builds a throwaway fixture directory (its own config, waivers, and source files) and
// runs the REAL gate with cwd set there, per check-test-patterns.md. Covered:
//   S3b  the emptyCatch regex is ReDoS-safe (a crafted non-empty catch completes fast, not >5s)
//        AND still DETECTS a genuinely empty catch (the check isn't neutered by the fix)
//   S3a  a rule's `message` reaches the report output
//   S6   waivers must carry rule+reason+approvedBy+expires (fail closed), expire, and glob-match only
import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { writeFileSync, mkdtempSync, chmodSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const REPO = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const CHECK = resolve(REPO, "judge-arch/scripts/arch-gate.mjs");

// Create a fixture dir; `files` maps relative name -> contents (config/waivers written as JSON).
function fixture({ config, waivers, files = {} }) {
  const dir = mkdtempSync(join(tmpdir(), "arch-gate-"));
  writeFileSync(join(dir, "arch-gate.config.json"), JSON.stringify(config, null, 2));
  if (waivers !== undefined) writeFileSync(join(dir, "arch-gate.waivers.json"), JSON.stringify(waivers, null, 2));
  for (const [name, body] of Object.entries(files)) writeFileSync(join(dir, name), body);
  return dir;
}

function runGate(dir, args = [], timeout = 10000) {
  const started = Date.now();
  const res = spawnSync(process.execPath, [CHECK, ...args], { cwd: dir, encoding: "utf8", timeout });
  return { status: res.status, signal: res.signal, out: (res.stdout || "") + (res.stderr || ""), ms: Date.now() - started };
}

const EMPTY_CATCH = "function f(){ try { g(); } catch (e) {} }\n";
// A NON-empty catch padded with balanced block comments + a trailing char that forces the final
// brace to fail — the exact shape that made the old nested-quantifier regex backtrack forever.
const REDOS_PROBE = "function f(){ try { g(); } catch (e) {" + "/* x */ ".repeat(800) + "X } }\n";

test("S3b: ReDoS probe completes fast and does not hang the gate", () => {
  const dir = fixture({ config: { builtins: { emptyCatch: true } }, files: { "probe.js": REDOS_PROBE } });
  const r = runGate(dir);
  assert.notEqual(r.signal, "SIGTERM", "gate timed out — regex is still ReDoS-able");
  assert.ok(typeof r.status === "number", "gate did not exit cleanly");
  assert.ok(r.ms < 4000, `gate took ${r.ms}ms — expected sub-second on ~6KB`);
});

test("S3b: emptyCatch still DETECTS a genuinely empty catch (exit 1) — discriminating", () => {
  const dir = fixture({ config: { builtins: { emptyCatch: true } }, files: { "empty.js": EMPTY_CATCH } });
  const r = runGate(dir);
  assert.equal(r.status, 1, "an empty catch should fail the gate");
  assert.match(r.out, /catch block does nothing/);
});

test("S3a: a rule's message is printed in the report — discriminating", () => {
  const MSG = "route handlers must not import supabase directly; go through a service";
  const dir = fixture({
    config: { rules: [{ name: "no-db-in-routes", include: ["**/*.js"], forbid: ["from\\('supabase'\\)"], message: MSG }] },
    files: { "route.js": "const x = from('supabase');\n" },
  });
  const r = runGate(dir);
  assert.equal(r.status, 1);
  assert.match(r.out, new RegExp(MSG.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
});

test("S6: a waiver missing required fields fails closed (exit 2) — discriminating", () => {
  const dir = fixture({
    config: { builtins: { emptyCatch: true } },
    waivers: [{ rule: "catch block does nothing (recover, retry, or report — pick one)", path: "empty.js" }],
    files: { "empty.js": EMPTY_CATCH },
  });
  const r = runGate(dir);
  assert.equal(r.status, 2, "an unattributed/never-expiring waiver must be rejected");
  assert.match(r.out, /missing required field/);
});

test("S6: a valid, non-expired waiver suppresses the violation (exit 0)", () => {
  const RULE = "catch block does nothing (recover, retry, or report — pick one)";
  const dir = fixture({
    config: { builtins: { emptyCatch: true } },
    waivers: [{ rule: RULE, path: "empty.js", reason: "legacy", approvedBy: "tester", expires: "2999-01-01" }],
    files: { "empty.js": EMPTY_CATCH },
  });
  const r = runGate(dir);
  assert.equal(r.status, 0, "a complete, future-dated waiver should suppress");
});

test("S6: an expired waiver no longer suppresses (exit 1)", () => {
  const RULE = "catch block does nothing (recover, retry, or report — pick one)";
  const dir = fixture({
    config: { builtins: { emptyCatch: true } },
    waivers: [{ rule: RULE, path: "empty.js", reason: "legacy", approvedBy: "tester", expires: "2000-01-01" }],
    files: { "empty.js": EMPTY_CATCH },
  });
  const r = runGate(dir);
  assert.equal(r.status, 1, "an expired waiver must stop suppressing");
});

// Finding C (docs/arch-reviews/log.jsonl): a file that is present and stat-able but UNREADABLE must
// be REPORTED, not silently skipped — otherwise it ships unscanned with no diagnostic. This exercises
// the read-failure branch (arch-gate.mjs read catch). chmod 000 is enforced for the owner on POSIX
// non-root (incl. the Linux CI runner, the authoritative `test (20)/(24)` gate); on Windows and when
// running as root the OS won't remove read permission, so the test self-detects that and SKIPS rather
// than asserting a condition the platform can't create. One code path runs everywhere (ADR-0002).
test("Finding C: arch-gate reports (does not silently skip) an unreadable existing file", (t) => {
  const dir = fixture({ config: {}, files: { "locked.mjs": "export const x = 1;\n" } });
  const victim = join(dir, "locked.mjs");
  let enforced = false;
  try { chmodSync(victim, 0o000); readFileSync(victim, "utf8"); }
  catch { enforced = true; }
  if (!enforced) { chmodSync(victim, 0o644); return t.skip("OS/privilege does not enforce chmod 000 here (Windows or root)"); }
  const r = runGate(dir);
  chmodSync(victim, 0o644); // restore so the throwaway fixture can be cleaned up
  assert.match(r.out, /could not read[^\n]*locked\.mjs/i,
    "an unreadable but present code file must produce a WARNING, not a silent skip");
});
