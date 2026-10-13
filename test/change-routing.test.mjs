// Discriminating tests for check-change-routing.mjs (the change-type -> required-artifact routing gate).
// Each test spawns the real gate and asserts its exit code: 0 clean, 1 a routing gap, 2 fail-closed.
// Mutation check: commenting out the trigger match or the requirement check in the gate turns the
// "fires but artifact missing -> exit 1" and the active-config tests green-when-they-should-be-red.
import test from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtempSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const SCRIPT = path.resolve(HERE, "..", ".claude", "skills", "judge-arch", "scripts", "check-change-routing.mjs");

function run(args) {
  const r = spawnSync(process.execPath, [SCRIPT, ...args], { encoding: "utf8" });
  return { status: r.status, out: (r.stdout || "") + (r.stderr || "") };
}
function tmp(content) {
  const dir = mkdtempSync(path.join(tmpdir(), "routing-"));
  const p = path.join(dir, "config.json");
  writeFileSync(p, typeof content === "string" ? content : JSON.stringify(content));
  return { dir, p, cleanup: () => rmSync(dir, { recursive: true, force: true }) };
}

const BASE = {
  rules: [
    { id: "new-skill-needs-adr", when: { added: ["**/SKILL.md"] }, requires: [{ artifact: "adr", changed: ["docs/adr/*.md"] }] },
    { id: "new-gate-needs-test", when: { added: ["**/scripts/check-*.mjs"] }, requires: [{ artifact: "test", changed: ["test/**/*.test.mjs"] }] },
  ],
};

test("hardening: the REAL routing config requires a test for a NON-check gate script (verify-*/run-*/lint)", () => {
  const REAL = path.resolve(HERE, "..", ".claude", "skills", "judge-arch", "assets", "routing-rules.config.json");
  const added = ".claude/skills/x/scripts/verify-foo.mjs"; // not named check-*, used to slip the old glob
  const bad = run(["--config", REAL, "--changed-list", added, "--added-list", added]);
  assert.equal(bad.status, 1, bad.out);
  assert.match(bad.out, /new-gate-needs-test/);
  const ok = run(["--config", REAL, "--changed-list", added + ",test/foo.test.mjs", "--added-list", added]);
  assert.equal(ok.status, 0, ok.out);
});

test("fires + required artifact present -> exit 0", () => {
  const c = tmp(BASE);
  const r = run(["--config", c.p, "--changed-list", "a/SKILL.md,docs/adr/0031-x.md", "--added-list", "a/SKILL.md"]);
  c.cleanup();
  assert.equal(r.status, 0, r.out);
});

test("fires + required artifact MISSING -> exit 1 (the core discrimination)", () => {
  const c = tmp(BASE);
  const r = run(["--config", c.p, "--changed-list", "a/SKILL.md", "--added-list", "a/SKILL.md"]);
  c.cleanup();
  assert.equal(r.status, 1, r.out);
  assert.match(r.out, /new-skill-needs-adr/);
});

test("fires + missing + valid unexpired waiver -> exit 0", () => {
  const cfg = { ...BASE, waivers: [{ rule: "new-skill-needs-adr", reason: "docs-only skill stub tracked in #123", approvedBy: "mdenner", expires: "2999-01-01" }] };
  const c = tmp(cfg);
  const r = run(["--config", c.p, "--changed-list", "a/SKILL.md", "--added-list", "a/SKILL.md"]);
  c.cleanup();
  assert.equal(r.status, 0, r.out);
});

test("fires + missing + EXPIRED waiver -> exit 1 (expired does not count)", () => {
  const cfg = { ...BASE, waivers: [{ rule: "new-skill-needs-adr", reason: "stale", approvedBy: "x", expires: "2000-01-01" }] };
  const c = tmp(cfg);
  const r = run(["--config", c.p, "--changed-list", "a/SKILL.md", "--added-list", "a/SKILL.md"]);
  c.cleanup();
  assert.equal(r.status, 1, r.out);
});

test("waiver with an unparseable expires date -> exit 2 (fail closed, never a permanent waiver)", () => {
  const cfg = { ...BASE, waivers: [{ rule: "new-skill-needs-adr", reason: "x", approvedBy: "x", expires: "whenever" }] };
  const c = tmp(cfg);
  const r = run(["--config", c.p, "--changed-list", "a/SKILL.md", "--added-list", "a/SKILL.md"]);
  c.cleanup();
  assert.equal(r.status, 2, r.out);
});

test("no rule fires -> exit 0", () => {
  const c = tmp(BASE);
  const r = run(["--config", c.p, "--changed-list", "README.md,docs/notes.md", "--added-list", ""]);
  c.cleanup();
  assert.equal(r.status, 0, r.out);
});

test("new-gate rule: added gate + test in same change -> 0; gate without test -> 1", () => {
  const c = tmp(BASE);
  const ok = run(["--config", c.p, "--changed-list", ".claude/skills/j/scripts/check-foo.mjs,test/foo.test.mjs", "--added-list", ".claude/skills/j/scripts/check-foo.mjs"]);
  const bad = run(["--config", c.p, "--changed-list", ".claude/skills/j/scripts/check-foo.mjs", "--added-list", ".claude/skills/j/scripts/check-foo.mjs"]);
  c.cleanup();
  assert.equal(ok.status, 0, ok.out);
  assert.equal(bad.status, 1, bad.out);
  assert.match(bad.out, /new-gate-needs-test/);
});

test("missing --changed-list -> exit 2", () => {
  const c = tmp(BASE);
  const r = run(["--config", c.p, "--added-list", ""]);
  c.cleanup();
  assert.equal(r.status, 2, r.out);
});

test("empty --changed-list -> exit 2", () => {
  const c = tmp(BASE);
  const r = run(["--config", c.p, "--changed-list", "", "--added-list", ""]);
  c.cleanup();
  assert.equal(r.status, 2, r.out);
});

test("missing config file -> exit 2", () => {
  const r = run(["--config", path.join(tmpdir(), "does-not-exist-routing.json"), "--changed-list", "a", "--added-list", ""]);
  assert.equal(r.status, 2, r.out);
});

test("malformed config -> exit 2", () => {
  const c = tmp("{ not valid json");
  const r = run(["--config", c.p, "--changed-list", "a", "--added-list", ""]);
  c.cleanup();
  assert.equal(r.status, 2, r.out);
});

test("rule keys on ADDED but --added-list not provided -> exit 2 (cannot evaluate; fail closed)", () => {
  const c = tmp(BASE);
  const r = run(["--config", c.p, "--changed-list", "a/SKILL.md"]);
  c.cleanup();
  assert.equal(r.status, 2, r.out);
  assert.match(r.out, /added-list/);
});

test("config with no rules -> exit 2", () => {
  const c = tmp({ rules: [] });
  const r = run(["--config", c.p, "--changed-list", "a", "--added-list", ""]);
  c.cleanup();
  assert.equal(r.status, 2, r.out);
});

test("a null rule element -> exit 2 (fail closed, not an uncaught throw)", () => {
  const c = tmp({ rules: [null] });
  const r = run(["--config", c.p, "--changed-list", "a", "--added-list", ""]);
  c.cleanup();
  assert.equal(r.status, 2, r.out);
});

test("a null waiver element -> exit 2 (fail closed)", () => {
  const c = tmp({ ...BASE, waivers: [null] });
  const r = run(["--config", c.p, "--changed-list", "a/SKILL.md", "--added-list", "a/SKILL.md"]);
  c.cleanup();
  assert.equal(r.status, 2, r.out);
});

test("the SHIPPED active config has teeth: a new SKILL.md without an ADR -> 1; with an ADR -> 0", () => {
  const bad = run(["--changed-list", "x/SKILL.md", "--added-list", "x/SKILL.md"]);
  const ok = run(["--changed-list", "x/SKILL.md,docs/adr/0099-x.md", "--added-list", "x/SKILL.md"]);
  assert.equal(bad.status, 1, bad.out);
  assert.equal(ok.status, 0, ok.out);
});
