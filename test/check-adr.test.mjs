// Discriminating tests for architectural-decision-records/scripts/check_adr.sh — specifically the
// placeholder detection fixed in the content-correctness change: it must now catch <…> template
// placeholders and stop false-positiving on command args / fenced JSON.
//
// check_adr.sh is bash; CI (ubuntu) always has bash. Locally (e.g. Windows without Git-Bash on PATH)
// the suite skips rather than failing, so it never blocks local runs.
import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const REPO = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const CHECK = resolve(REPO, "architectural-decision-records/scripts/check_adr.sh");
const bashOK = spawnSync("bash", ["--version"], { stdio: "ignore" }).status === 0;
const opts = { skip: bashOK ? false : "bash not on PATH (CI runs this)" };

// A complete, valid ADR body. `<base>` is interpolated so the filename matches NNNN-kebab.md.
const CTX = "This is a sufficiently long context section to pass the forty character minimum easily.";
function adr(body) {
  const dir = mkdtempSync(join(tmpdir(), "adr-"));
  const f = join(dir, "0007-a-real-decision.md");
  writeFileSync(f, body);
  return f;
}
function run(body) {
  const r = spawnSync("bash", [CHECK, adr(body)], { encoding: "utf8" });
  return { status: r.status, out: (r.stdout || "") + (r.stderr || "") };
}

const VALID = `# 0007. A real decision

Date: 2026-10-10

## Status
Accepted

## Context
${CTX}

## Decision
We run \`gh api repos/<owner>/<repo>/rulesets\` and store this config:
\`\`\`json
{ "a": 1 }
\`\`\`
See <https://example.com/docs>.

## Consequences
Fine.
`;

test("passes a complete ADR (with <owner>/<repo> args + fenced JSON + autolink)", opts, () => {
  assert.equal(run(VALID).status, 0, run(VALID).out);
});
test("FLAGS a <short title> angle placeholder (discriminating)", opts, () => {
  const r = run(VALID.replace("A real decision", "<short title>"));
  assert.equal(r.status, 1);
  assert.match(r.out, /placeholder/);
});
test("FLAGS a {option 1} brace placeholder (discriminating)", opts, () => {
  const r = run(VALID.replace("We run", "We choose {option 1}; we run"));
  assert.equal(r.status, 1);
});
test("FLAGS an <ADR-00Y> reference stub (discriminating)", opts, () => {
  const r = run(VALID.replace("Accepted", "Superseded by <ADR-00Y>"));
  assert.equal(r.status, 1);
});
test("does NOT flag <owner>/<repo> command args alone (no false positive)", opts, () => {
  assert.equal(run(VALID).status, 0);
});
