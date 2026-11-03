#!/usr/bin/env node
// bootstrap-v2-consumer-gate: secret-leak
/**
 * check-secret-leaks - fail when any known secret VALUE appears in the configured build output, by running
 * the leak-check oracle over EVERY scanned artifact for EVERY configured secret.
 *
 * leak-check.mjs is the single-invocation oracle and the ONE owner of "does this value appear as whole
 * tokens in this text" (its NFKC/case/punctuation normalization, its whole-token compare). This gate does
 * NOT re-implement that: it resolves the secret VALUES from the CI environment, walks the scan surface, and
 * runs the real leak-check per artifact. The compare lives in one place; this gate decides which secrets and
 * which artifacts, and keeps the values out of its own output.
 *
 * Secret values are NEVER in the committed config. The config names the ENVIRONMENT VARIABLES that hold them
 * (resolved from process.env at run time, where CI already holds real secrets), so nothing secret is stored
 * in the repo.
 *
 *   node check-secret-leaks.mjs --config <secret-leak.config.json>
 *
 * Config (JSON):
 *   {
 *     "secretEnvVars": ["API_KEY", "DB_PASSWORD"],  // names only; values come from process.env (non-empty)
 *     "scan": ["dist", "build.log"],                // files and/or directories (dirs scanned recursively, non-empty)
 *     "ext": [".js", ".html", ".map", ".log"],      // inside a scanned DIRECTORY, only these extensions (optional; default all files)
 *     "exclude": ["dist/vendor"]                     // path substrings to skip (optional)
 *   }
 *
 * Exit codes:
 *   0 = no configured secret appears in any scanned artifact. Prints how many artifacts and secrets.
 *   1 = a secret leaked. Reports the artifact and the ENV-VAR NAME (never the value).
 *   2 = fail closed: bad usage; missing or non-JSON config; an empty secretEnvVars; a named env var that is
 *       UNSET or empty (a secret we cannot check for is not a pass); an empty scan; a scan path that does not
 *       exist; an EMPTY surface (zero files); an unreadable artifact; or leak-check failing closed (exit 2).
 *
 * Boundary: this scans built OUTPUT for KNOWN secret values. Scanning SOURCE for secret-shaped strings is a
 * different job owned by owasp-secure-coding-bdd's lints; this gate does not duplicate it.
 *
 * Security limit: leak-check takes secret values as process arguments, so the values appear in this gate's
 * child-process argv (visible to local process listing). That is acceptable on an ephemeral CI runner; the
 * gate never writes a value to disk and never prints one. Dependency-free; it shells out to leak-check.mjs.
 */
import { readFileSync, readdirSync, existsSync, statSync } from "node:fs";
import { resolve, dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";

function die(msg) { console.error(`[check-secret-leaks] FAIL - ${msg}`); process.exit(2); }

const args = process.argv.slice(2);
if (args.includes("-h") || args.includes("--help")) {
  console.log("usage: node check-secret-leaks.mjs --config <secret-leak.config.json>");
  process.exit(0);
}
const opt = (n) => { const i = args.indexOf(n); return i >= 0 ? args[i + 1] : undefined; };
const configPath = opt("--config");
if (!configPath) die("missing --config <secret-leak.config.json>");
if (!existsSync(resolve(configPath))) die(`config not found: ${configPath}`);

let cfg;
try { cfg = JSON.parse(readFileSync(resolve(configPath), "utf8")); }
catch (e) { die(`config is not valid JSON (${e.message})`); }

const envNames = cfg.secretEnvVars;
if (!Array.isArray(envNames) || envNames.length === 0) die(`config needs a non-empty "secretEnvVars" array of environment-variable names`);
const scan = cfg.scan;
if (!Array.isArray(scan) || scan.length === 0) die(`config needs a non-empty "scan" array of files and/or directories`);
const exts = Array.isArray(cfg.ext) ? cfg.ext.map(String) : null; // null = all files inside a directory
const exclude = Array.isArray(cfg.exclude) ? cfg.exclude.map(String) : [];

// Resolve secret values from the environment. A named var that is unset or empty is a FAIL-CLOSED error: we
// cannot prove an artifact is free of a secret we were never given. This is the gate's whole honesty - it
// never passes because the secrets simply were not wired.
const secrets = []; // { name, value }
for (const name of envNames) {
  const value = process.env[String(name)];
  if (value === undefined || value === "") die(`env var "${name}" is unset or empty - cannot check for a secret we do not have (wire it in CI, or remove it from secretEnvVars)`);
  secrets.push({ name: String(name), value });
}

const LEAK_CHECK = resolve(dirname(fileURLToPath(import.meta.url)), "leak-check.mjs");
if (!existsSync(LEAK_CHECK)) die(`leak-check.mjs not found next to this gate at ${LEAK_CHECK}`);

const isExcluded = (p) => exclude.some((frag) => p.replace(/\\/g, "/").includes(frag));
const matchesExt = (name) => !exts || exts.length === 0 || exts.some((e) => name.endsWith(e));
// A scan entry may be a single file (taken as-is) or a directory (walked recursively; ext filter applies).
function collect(entry) {
  const abs = resolve(entry);
  if (!existsSync(abs)) die(`scan path does not exist: ${entry}`);
  const st = statSync(abs);
  if (st.isFile()) return isExcluded(abs) ? [] : [abs];
  if (!st.isDirectory()) die(`scan path is neither a file nor a directory: ${entry}`);
  const out = [];
  const walk = (dir) => {
    let ents;
    try { ents = readdirSync(dir, { withFileTypes: true }); }
    catch (e) { die(`cannot read directory ${dir}: ${e.message}`); }
    for (const e of ents) {
      const p = join(dir, e.name);
      if (isExcluded(p)) continue;
      if (e.isDirectory()) walk(p);
      else if (e.isFile() && matchesExt(e.name)) out.push(p);
    }
  };
  walk(abs);
  return out;
}

const files = [...new Set(scan.flatMap(collect))].sort();
if (files.length === 0) die(`no files to scan under ${JSON.stringify(scan)} (an unscanned surface is not a pass)`);

// Run leak-check ONE secret at a time per file, so a non-zero exit maps to a specific env-var NAME without
// ever printing the value. leak-check's own stdout (which would echo the leaked value) is captured and NOT
// forwarded - only the file and the env-var name are reported.
const leaks = []; // { file, name }
for (const file of files) {
  for (const { name, value } of secrets) {
    const r = spawnSync(process.execPath, [LEAK_CHECK, "--secret", value, file], { encoding: "utf8" });
    if (r.error) die(`could not run leak-check on ${file}: ${r.error.message}`);
    // Fail closed WITHOUT forwarding leak-check's stderr: on a zero-token ("effectively empty") secret
    // leak-check echoes the value via JSON.stringify, so interpolating its output here could print a secret.
    // Report only the file and the env-var NAME; the value never leaves the environment (F1, ADR-0113).
    if (r.status === 2) die(`leak-check could not check secret "${name}" on ${file} - it failed closed; child output withheld`);
    if (r.status === 1) leaks.push({ file, name });
    else if (r.status !== 0) die(`leak-check returned an unexpected exit ${r.status} on ${file}`);
  }
}

if (leaks.length) {
  console.error(`[check-secret-leaks] FAIL - ${leaks.length} secret leak(s) in built output (values withheld):`);
  for (const l of leaks) console.error(`  • ${l.name} leaked into ${l.file}`);
  console.error(`\nRemove the secret from the artifact (do not commit the config value). See comprehensive-test-strategy/references/combinatorial-testing.md.`);
  process.exit(1);
}

console.log(`[check-secret-leaks] OK - ${files.length} artifact(s) scanned for ${secrets.length} secret(s), 0 leaks.`);
process.exit(0);
