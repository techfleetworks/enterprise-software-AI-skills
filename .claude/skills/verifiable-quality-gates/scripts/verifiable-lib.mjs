// verifiable-lib.mjs - shared helpers for the two verifiable-quality gates.
//
// check-has-test (coverage) and verify-check-discrimination (mutation) both load the same config,
// enumerate the same checks, walk the same tests, and credit a test to a check the same way. That is
// ONE fact about "how a test is tied to a check" - it must live in one place, or the two gates drift
// (add a runner token to one and not the other and they silently disagree). This is that one place.
import { readFileSync, readdirSync, statSync, existsSync } from "node:fs";
import { join, resolve } from "node:path";

// A test that spawns no child process cannot exec a check.
export const EXEC = /\b(execFileSync|execSync|spawnSync|execFile|spawn|exec)\s*\(/;

// Strip // and /* */ comments while PRESERVING string literals, so a check name or an exec call that appears
// only inside a comment does not credit a test. Strings are kept because the check's file name legitimately
// appears inside a string (the path argument to spawn), so stripping strings would drop real credits.
export function stripComments(src) {
  let out = "";
  const n = src.length;
  for (let i = 0; i < n; i++) {
    const c = src[i], d = src[i + 1];
    if (c === '"' || c === "'" || c === "`") { // copy a string literal verbatim, honoring escapes
      const q = c; out += c; i++;
      while (i < n) {
        if (src[i] === "\\") { out += src[i] + (src[i + 1] || ""); i += 2; continue; }
        out += src[i];
        if (src[i] === q) break;
        i++;
      }
      continue;
    }
    if (c === "/" && d === "/") { while (i < n && src[i] !== "\n") i++; out += "\n"; continue; }
    if (c === "/" && d === "*") { i += 2; while (i < n && !(src[i] === "*" && src[i + 1] === "/")) i++; i++; continue; }
    out += c;
  }
  return out;
}

// Load + validate the verifiable-gates config. Fail-closed via the caller's `die` so each gate keeps
// its own [name] prefix. `requiredKeys` lets the mutation gate also require "testCommand".
export function loadConfig(die, requiredKeys = ["checksDir", "checkPattern", "testsDir", "testPattern", "allowlist"]) {
  const configPath = resolve(process.argv[2] ?? "verifiable-gates.config.json");
  if (!existsSync(configPath)) die(`config not found: ${configPath}`);
  let cfg;
  try { cfg = JSON.parse(readFileSync(configPath, "utf8")); }
  catch (e) { die(`config is not valid JSON (${e.message})`); }
  for (const k of requiredKeys) if (!cfg[k]) die(`config is missing "${k}"`);

  const checksDir = resolve(cfg.checksDir);
  const testsDir = resolve(cfg.testsDir);
  if (!existsSync(checksDir)) die(`checksDir does not exist: ${checksDir}`);
  if (!existsSync(testsDir)) die(`testsDir does not exist: ${testsDir}`);

  let arr;
  try { arr = JSON.parse(readFileSync(resolve(cfg.allowlist), "utf8")); }
  catch (e) { die(`allowlist not found or invalid JSON at ${cfg.allowlist} (${e.message})`); }
  if (!Array.isArray(arr)) die(`allowlist must be a JSON array at ${cfg.allowlist}`);

  return { cfg, configPath, checksDir, testsDir, checkRe: new RegExp(cfg.checkPattern), testRe: new RegExp(cfg.testPattern), allowlist: new Set(arr) };
}

// Check files = basenames in checksDir matching the check pattern.
export function enumerateChecks(checksDir, checkRe) {
  return readdirSync(checksDir).filter((f) => checkRe.test(f));
}

// Recursively collect test files under testsDir matching the test pattern.
export function walkTests(dir, testRe) {
  const out = [];
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) out.push(...walkTests(p, testRe));
    else if (testRe.test(name)) out.push(p);
  }
  return out;
}

// Test files that actually spawn a child process (only those can exec a check).
export function execTestFiles(testsDir, testRe) {
  return walkTests(testsDir, testRe).filter((tf) => EXEC.test(stripComments(readFileSync(tf, "utf8"))));
}

// The single crediting heuristic: a test file credits a check if it references the check's name.
// (Documented limitation: substring match; a stricter version would AST-confirm the check's path is
// the exec argument - see check-test-patterns.md.)
export function credits(testSrc, checkName) {
  return stripComments(testSrc).includes(checkName);
}
