// The repo commits its OWN always-on hook at .claude/settings.json so that anyone who works in the
// repo gets the directive, and a git pull updates both the wiring and the directive together. This test
// keeps that committed hook honest: valid JSON, both events, exec form, referencing the repo's emitter
// via ${CLAUDE_PROJECT_DIR}. If someone edits it into a broken or copy-based shape, this fails.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, existsSync } from "node:fs";
import { join, dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const REPO = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const SETTINGS = join(REPO, ".claude", "settings.json");

test("the committed project settings exist and are valid JSON", () => {
  assert.ok(existsSync(SETTINGS), ".claude/settings.json must be committed");
  JSON.parse(readFileSync(SETTINGS, "utf8")); // throws if invalid
});

for (const event of ["SessionStart", "SubagentStart"]) {
  test(`${event} hook references the repo emitter in exec form (no shell, ${"$"}{CLAUDE_PROJECT_DIR})`, () => {
    const s = JSON.parse(readFileSync(SETTINGS, "utf8"));
    const groups = s.hooks?.[event] || [];
    const hooks = groups.flatMap((g) => g.hooks || []);
    const ours = hooks.find((h) => (h.args || []).some((a) => String(a).includes("emit-directive.mjs")));
    assert.ok(ours, `${event} must have a hook referencing always-on/emit-directive.mjs`);
    assert.equal(ours.command, "node", "must be exec form (command: node)");
    assert.ok(!("shell" in ours), "must NOT use a shell (exec form, so it does not depend on bash)");
    assert.ok(ours.args.some((a) => String(a).includes("${CLAUDE_PROJECT_DIR}")), "must be repo-relative via ${CLAUDE_PROJECT_DIR} so a pull updates it");
    assert.ok(ours.args.includes(event), `must pass the event name "${event}" to the emitter`);
  });
}

test("the committed hook points at the repo (reference), never a copied ~/.claude path (the staleness trap)", () => {
  const raw = readFileSync(SETTINGS, "utf8");
  assert.doesNotMatch(raw, /\$HOME|readFileSync|enterprise-skills-always-on\.md/, "must not copy or read a ~/.claude copy; reference the repo emitter instead");
});

// The CLAUDE.md layer: zero-setup, no-approval, pull-updated auto-load for anyone working in the repo.
test("the committed CLAUDE.md imports the directive (relative, so it loads with no approval prompt)", () => {
  const claudeMd = join(REPO, "CLAUDE.md");
  assert.ok(existsSync(claudeMd), "a project CLAUDE.md must be committed so the directive auto-loads");
  const raw = readFileSync(claudeMd, "utf8");
  // the import must be a bare relative @path on its own (not wrapped in backticks, which disables it)
  assert.match(raw, /(?:^|\n)@always-on\/enterprise-skills-always-on\.md\s*$/m, "CLAUDE.md must import @always-on/enterprise-skills-always-on.md (relative, un-backticked)");
  assert.doesNotMatch(raw, /`@always-on/, "the import must not be inside backticks, which would disable it");
  // and it must not sit inside a fenced code block, which would also stop it loading
  const lines = raw.split(/\r?\n/);
  const importIdx = lines.findIndex((l) => /^@always-on\/enterprise-skills-always-on\.md\s*$/.test(l));
  const fencesBefore = lines.slice(0, importIdx).filter((l) => /^\s*```/.test(l)).length;
  assert.equal(fencesBefore % 2, 0, "the @import line must not be inside a fenced code block");
});
test("the imported directive file exists where CLAUDE.md points", () => {
  assert.ok(existsSync(join(REPO, "always-on", "enterprise-skills-always-on.md")), "the imported directive file must exist");
});
