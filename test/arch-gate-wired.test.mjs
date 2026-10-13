// Discriminating tests for the WIRED architecture gate (ADR-0015).
//
// test/arch-gate.test.mjs proves the gate ENGINE works on hand-built fixtures. This file proves the
// engine is actually WIRED to this repo and that the committed root config has teeth, so the live
// `npm run check:architecture` cannot quietly become a no-op. It guards:
//   1. the repo is green right now under its own committed config (the live state is real);
//   2. the committed config cannot be silently gutted OR weakened: every ratcheted include path and
//      both dash forbids and every no-web forbid must stay present (dropping one to get CI green is the
//      exact regression this catches);
//   3. EVERY house-style include path actually catches a planted em dash (per-entry, not one sample),
//      the en-dash forbid fires too, and the no-web rule catches a planted outbound call.
import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { writeFileSync, mkdtempSync, mkdirSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const REPO = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const GATE = resolve(REPO, ".claude/skills/judge-arch/scripts/arch-gate.mjs");
const CONFIG = JSON.parse(readFileSync(resolve(REPO, "arch-gate.config.json"), "utf8"));

// Paths this repo has ratcheted onto house-style-no-em-dash. Each MUST stay enforced. Dropping one (a
// plausible one-line edit to get CI green after a dash is reintroduced) has to turn this red, not pass
// silently. When you add a skill's path to the config's include, add it here too, so the guard grows
// with the ratchet. This is a deliberate guard-the-config duplicate, not drift: the config says what to
// enforce; this list says what must never silently leave enforcement.
const REQUIRED_INCLUDE = [
  ".claude/skills/**/*.md",
  ".claude/skills/**/*.mjs",
  ".claude/skills/**/*.feature",
  ".claude/skills/**/*.json",
  "always-on/**/*.md",
  "always-on/**/*.mjs",
  "README.md",
  "CONTRIBUTING.md",
  "CLAUDE.md",
  "docs/arch-reviews/README.md",
  "docs/audit/README.md",
];
const REQUIRED_DASH_FORBID = ["\\u2014", "\\u2013", "\\u2012", "\\u2015", "\\u2212"]; // em, en, figure, horizontal-bar, minus
const REQUIRED_WEB_FORBID = ["\\bfetch\\s*\\(", "\\baxios\\b", "new\\s+Response\\b", "require\\(['\"]https?:?['\"]\\)"];

function runGate(cwd) {
  const res = spawnSync(process.execPath, [GATE], { cwd, encoding: "utf8", timeout: 60000 });
  return { status: res.status, out: (res.stdout || "") + (res.stderr || "") };
}

// Turn an include glob into one concrete path under it: `.claude/skills/pattern-selector/**/*.md` -> `.claude/skills/pattern-selector/probe/probe.md`;
// a literal path like `.claude/skills/judge-arch/SKILL.md` stays itself.
function concretePath(glob) {
  return glob.split("/").map((seg) => (seg === "**" ? "probe" : seg.includes("*") ? seg.replace(/\*/g, "probe") : seg)).join("/");
}

// Copy the REAL committed root config into a throwaway dir, then drop in one file. Running the gate there
// exercises the exact rules the repo ships, not a hand-made stand-in, so it reacts if the config rots.
function withCommittedConfig(relPath, body) {
  const dir = mkdtempSync(join(tmpdir(), "arch-gate-wired-"));
  writeFileSync(join(dir, "arch-gate.config.json"), JSON.stringify(CONFIG, null, 2));
  writeFileSync(join(dir, "arch-gate.waivers.json"), "[]");
  const full = join(dir, relPath);
  mkdirSync(dirname(full), { recursive: true });
  writeFileSync(full, body);
  return dir;
}

const rule = (name) => (CONFIG.rules || []).find((r) => r.name === name);

test("wired: the repo is green under its own committed config (exit 0)", () => {
  const r = runGate(REPO);
  assert.equal(r.status, 0, `the live gate must pass on a clean repo, but it exited ${r.status}:\n${r.out}`);
  assert.match(r.out, /PASS/);
});

test("wired: the committed config cannot be silently gutted OR weakened", () => {
  const b = CONFIG.builtins || {};
  const anyBuiltin = b.emptyCatch || b.swallowReturn || b.keepInSync;
  assert.ok(Array.isArray(CONFIG.rules) && (CONFIG.rules.length > 0 || anyBuiltin),
    "the live config enforces nothing: no rules and no built-ins are on");

  const house = rule("house-style-no-em-dash");
  assert.ok(house, "the house-style-no-em-dash rule was removed from the live config");
  // Every ratcheted path must stay enforced (catches dropping a single include entry).
  for (const p of REQUIRED_INCLUDE) {
    assert.ok((house.include || []).includes(p), `house-style include no longer enforces ${p} (ratchet regressed)`);
  }
  // BOTH dash code points must stay forbidden (catches removing just the en-dash forbid).
  for (const f of REQUIRED_DASH_FORBID) {
    assert.ok((house.forbid || []).includes(f), `house-style no longer forbids ${f}`);
  }

  const web = rule("no-outbound-web-in-gate-scripts");
  assert.ok(web, "the no-outbound-web-in-gate-scripts rule was removed from the live config");
  assert.ok(Array.isArray(web.include) && web.include.length > 0, "no-web rule has an empty include (enforces nothing)");
  // Every known outbound pattern must stay forbidden (catches removing a subset, e.g. 3 of 4).
  for (const f of REQUIRED_WEB_FORBID) {
    assert.ok((web.forbid || []).includes(f), `no-web rule no longer forbids ${f} (removing a subset must be caught)`);
  }
});

test("wired: EVERY house-style include path actually catches a planted em dash (per-entry, discriminating)", () => {
  const house = rule("house-style-no-em-dash");
  for (const glob of house.include) {
    const target = concretePath(glob);
    const dirty = withCommittedConfig(target, "This line has an em dash — right here.\n");
    assert.equal(runGate(dirty).status, 1, `a planted em dash under ${glob} (${target}) must fail the live gate`);
  }
  // Clean twin on one representative proves it was the dash, not noise.
  const clean = withCommittedConfig(concretePath(house.include[0]), "This line has no dash at all.\n");
  assert.equal(runGate(clean).status, 0, "the same file without a dash must pass");
});

test("wired: the house-style rule catches a planted EN dash too (both forbids live)", () => {
  const house = rule("house-style-no-em-dash");
  const target = concretePath(house.include[0]);
  const dirty = withCommittedConfig(target, "This line has an en dash – right here.\n");
  assert.equal(runGate(dirty).status, 1, "a planted en dash must fail the live gate (the en-dash forbid must fire)");
});

test("wired: the house-style rule catches a planted minus sign too (all five dash forbids live)", () => {
  const house = rule("house-style-no-em-dash");
  const target = concretePath(house.include[0]);
  const dirty = withCommittedConfig(target, "This line has a minus sign − right here.\n");
  assert.equal(runGate(dirty).status, 1, "a planted minus sign must fail the live gate (the minus forbid must fire)");
});

test("wired: the committed no-web rule catches a planted outbound call (discriminating)", () => {
  const dirty = withCommittedConfig("svc/scripts/probe.mjs", 'const r = fetch("http://example.com");\n');
  assert.equal(runGate(dirty).status, 1, "a planted fetch() in a scripts file must fail the live gate");
  const clean = withCommittedConfig("svc/scripts/probe.mjs", "const r = compute();\n");
  assert.equal(runGate(clean).status, 0, "the same file without an outbound call must pass");
});
