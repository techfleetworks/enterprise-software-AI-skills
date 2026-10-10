#!/usr/bin/env node
// check-arch-rules-discriminate — prove the mechanical review layer actually DETECTS (mutation-test
// the reviewer). Runs arch-gate against a set of planted violations (one per question) and requires
// it to flag every one. If arch-gate reports nothing (e.g. it was no-opped), or a planted violation
// slips through, the mechanical floor is vacuous/incomplete and the build fails. The planted cases it
// can't yet catch are the backlog for the arch-encode ratchet. See references/review-log-and-coverage.md.
//
//   node check-arch-rules-discriminate.mjs [--arch-gate <path>] [--fixtures <dir>]
//
// Exit 0 = every planted violation flagged. Exit 1 = a slip-through or missing input (fail closed).
import { readFileSync, existsSync } from "node:fs";
import { resolve, join, dirname } from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const die = (m) => { console.error(`[check-arch-rules-discriminate] FAIL — ${m}`); process.exit(1); };
const args = process.argv.slice(2);
const opt = (n) => { const i = args.indexOf(n); return i >= 0 ? args[i + 1] : undefined; };
const here = dirname(fileURLToPath(import.meta.url));

const archGate = resolve(opt("--arch-gate") ?? join(here, "arch-gate.mjs"));
const fixtures = resolve(opt("--fixtures") ?? join(here, "..", "assets", "discriminate-fixtures"));

if (!existsSync(archGate)) die(`arch-gate not found: ${archGate}`);
const plantedPath = join(fixtures, "planted.json");
if (!existsSync(plantedPath)) die(`planted manifest not found: ${plantedPath}`);
let planted;
try { planted = JSON.parse(readFileSync(plantedPath, "utf8")); }
catch (e) { die(`planted.json is not valid JSON: ${e.message}`); }
if (!Array.isArray(planted) || planted.length === 0) die("planted.json must be a non-empty array of fixture files.");

const res = spawnSync(process.execPath, [archGate], { cwd: fixtures, encoding: "utf8" });
const out = (res.stdout || "") + (res.stderr || "");
if (res.error) die(`could not run arch-gate: ${res.error.message}`);
if (res.status === 0) {
  die(`arch-gate reported NO violations on the planted fixtures — the mechanical layer is not detecting ` +
    `(vacuous). A broken/no-opped arch-gate would ship green behind this. Output:\n${out}`);
}

const normalized = out.split("\\").join("/");
const missed = planted.filter((f) => !normalized.includes(f));
if (missed.length) {
  die(`arch-gate did not flag ${missed.length} planted violation(s): ${missed.join(", ")} — these slip ` +
    `through the mechanical layer. Encode a rule for each (arch-encode). Output:\n${out}`);
}
console.log(`[check-arch-rules-discriminate] OK — all ${planted.length} planted violation(s) flagged by ` +
  `arch-gate; the mechanical detection floor discriminates.`);
process.exit(0);
