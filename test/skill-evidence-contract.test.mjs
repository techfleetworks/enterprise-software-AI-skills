// Discriminating tests for skeptical-audit/scripts/check-skill-evidence-contract.mjs
import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtempSync, writeFileSync, mkdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const REPO = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const CHECK = resolve(REPO, "skeptical-audit/scripts/check-skill-evidence-contract.mjs");

const COMPLIANT = `# A skill

## Evidence & skeptical assessment (required)
See skeptical-audit/references/evidence-discipline.md for the contract.

Definition of done: the evidence ledger is attached.
`;
const NONCOMPLIANT = `# A skill\n\nNo evidence section here.\n`;

// skills: { "id": true|false }  → writes <root>/<id>/SKILL.md compliant or not; writes allow.json.
function fixture(skills, allowlist = []) {
  const root = mkdtempSync(join(tmpdir(), "esc-"));
  for (const [id, ok] of Object.entries(skills)) {
    const dir = join(root, ...id.split("/"));
    mkdirSync(dir, { recursive: true });
    writeFileSync(join(dir, "SKILL.md"), ok ? COMPLIANT : NONCOMPLIANT);
  }
  writeFileSync(join(root, "allow.json"), JSON.stringify(allowlist));
  return root;
}
function run(root, extra = []) {
  const r = spawnSync(process.execPath, [CHECK, root, "--allowlist", join(root, "allow.json"), ...extra], { encoding: "utf8" });
  return { status: r.status, out: (r.stdout || "") + (r.stderr || "") };
}

test("passes when a non-allowlisted skill carries the contract", () => {
  assert.equal(run(fixture({ alpha: true })).status, 0);
});
test("FLAGS a non-allowlisted skill missing the contract (discriminating)", () => {
  const r = run(fixture({ alpha: false }));
  assert.equal(r.status, 1);
  assert.match(r.out, /alpha/);
});
test("grandfathers a non-compliant skill that is on the allowlist", () => {
  assert.equal(run(fixture({ alpha: false }, ["alpha"])).status, 0);
});
test("reports an allowlisted skill that now complies (removable)", () => {
  const r = run(fixture({ alpha: true }, ["alpha"]));
  assert.equal(r.status, 0);
  assert.match(r.out, /REMOVED|remove/i);
});
test("fails closed on zero skills", () => {
  const root = mkdtempSync(join(tmpdir(), "esc-"));
  writeFileSync(join(root, "allow.json"), "[]");
  assert.equal(run(root).status, 1);
});
test("fails closed when the allowlist file is missing", () => {
  const root = mkdtempSync(join(tmpdir(), "esc-"));
  mkdirSync(join(root, "alpha"), { recursive: true });
  writeFileSync(join(root, "alpha", "SKILL.md"), COMPLIANT);
  const r = spawnSync(process.execPath, [CHECK, root, "--allowlist", join(root, "nope.json")], { encoding: "utf8" });
  assert.equal(r.status, 1);
});
test("the REAL repo passes (2 compliant + 13 allowlisted)", () => {
  const r = spawnSync(process.execPath, [CHECK, REPO], { encoding: "utf8" });
  assert.equal(r.status, 0, (r.stdout || "") + (r.stderr || ""));
});
