// Step definitions for features/repo-process/arch-review-change-key.feature (#213, ADR-0114).
// Drives the REAL check-arch-review-coverage gate against throwaway log fixtures, and scans this repo's real
// review-log folder, so a regressed key-shape rule or a SHA-keyed entry turns these scenarios red.
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, readdirSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";
import assert from "node:assert/strict";

const REPO = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..");
const GATE = join(REPO, ".claude/skills/judge-arch/scripts/check-arch-review-coverage.mjs");
const QS = ["boundary", "ownership", "dependency", "error-handling"];
const SHA = { "40-hex": "0".repeat(40), "64-hex": "a".repeat(64) };

function writeLog(change, file) {
  const matrix = { [file]: {} };
  for (const q of QS) matrix[file][q] = { verdict: "cleared", evidence: `rg ${q} -> clean (${file}:1)` };
  const entry = { date: "2026-11-04", change, scope: [file], matrix, findings: [], grepCommands: ["rg request -> none"], archGate: "pass", verdict: "PASS" };
  const p = join(mkdtempSync(join(tmpdir(), "ark-")), "log.jsonl");
  writeFileSync(p, JSON.stringify(entry) + "\n");
  return p;
}
const runGate = (log, change, file) =>
  spawnSync(process.execPath, [GATE, "--log", log, "--change", change, "--changed-list", file], { encoding: "utf8" });

export default function ({ Given, When, Then }) {
  Given(/^a review log whose entry is keyed on branch "([^"]+)" and fully reviews "([^"]+)"$/, (world, branch, file) => {
    world.log = writeLog(branch, file);
    world.file = file;
  });
  When(/^the coverage gate is run for "([^"]+)" with --change set to a (40-hex|64-hex) commit SHA$/, (world, file, shape) => {
    world.result = runGate(world.log, SHA[shape], file);
  });
  When(/^the coverage gate is run for "([^"]+)" with --change set to the branch "([^"]+)"$/, (world, file, branch) => {
    world.result = runGate(world.log, branch, file);
  });
  Then(/^the coverage gate fails and names the commit-SHA footgun$/, (world) => {
    assert.equal(world.result.status, 1, (world.result.stdout || "") + (world.result.stderr || ""));
    assert.match(world.result.stderr, /commit SHA|permanently unsatisfiable/i);
  });
  Then(/^the coverage gate passes$/, (world) => {
    assert.equal(world.result.status, 0, (world.result.stdout || "") + (world.result.stderr || ""));
  });

  Given(/^this repository's docs\/arch-reviews\/entries folder$/, (world) => {
    world.dir = join(REPO, "docs/arch-reviews/entries");
    assert.ok(existsSync(world.dir), "the review-log entries folder must exist in this repo");
  });
  When(/^every entry's change key is inspected$/, (world) => {
    world.offenders = [];
    for (const f of readdirSync(world.dir).filter((n) => n.endsWith(".json"))) {
      let change;
      try { change = JSON.parse(readFileSync(join(world.dir, f), "utf8")).change; }
      catch (e) { world.offenders.push(`${f}: unparseable (${e.message})`); continue; }
      if (typeof change === "string" && (/^[0-9a-f]{40}$/i.test(change) || /^[0-9a-f]{64}$/i.test(change))) world.offenders.push(`${f}: "${change}"`);
    }
  });
  Then(/^none is a 40-hex or 64-hex commit SHA$/, (world) => {
    assert.deepEqual(world.offenders, [], `entries keyed on a commit SHA (unsatisfiable, #213): ${world.offenders.join(", ")}`);
  });
}
