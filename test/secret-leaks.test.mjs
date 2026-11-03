// Discriminating tests for .claude/skills/comprehensive-test-strategy/scripts/check-secret-leaks.mjs
//
// The gate resolves secret VALUES from the environment (never the config) and runs the REAL leak-check oracle
// over EVERY scanned artifact. These spawn the real gate against fixtures and assert its exit code. The
// load-bearing case: an artifact containing a secret value must FAIL (exit 1) and name the ENV-VAR (never the
// value); a no-op gate flips that, which is what discriminates. Fail-closed cases (unset env var, empty scan,
// missing config) must exit 2 - the gate never passes because the secrets were not wired.
import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtempSync, mkdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const REPO = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const GATE = resolve(REPO, ".claude/skills/comprehensive-test-strategy/scripts/check-secret-leaks.mjs");

const SECRET = "sup3r s3cret token value xyz"; // whole-token match target
const CLEAN = "build ok\nno sensitive material here\n";
const LEAKED = `startup log\ntoken = ${SECRET}\ndone\n`;

// Build a fixture: a scan dir seeded with files, plus a config. `env` overrides the child's environment.
function fixture(files = {}, cfgExtra = {}) {
  const root = mkdtempSync(join(tmpdir(), "leakgate-"));
  const dist = join(root, "dist");
  mkdirSync(dist);
  for (const [name, text] of Object.entries(files)) {
    const p = join(dist, name);
    mkdirSync(dirname(p), { recursive: true });
    writeFileSync(p, text);
  }
  const cfg = { secretEnvVars: ["SECRET_TOKEN"], scan: [dist], ...cfgExtra };
  const cfgPath = join(root, "secret-leak.config.json");
  writeFileSync(cfgPath, JSON.stringify(cfg));
  return { root, dist, cfgPath };
}
const run = (cfgPath, env = {}) =>
  spawnSync(process.execPath, [GATE, "--config", cfgPath], { encoding: "utf8", env: { ...process.env, ...env } });

test("PASSES when no artifact contains the secret (exit 0)", () => {
  const { cfgPath } = fixture({ "a.js": CLEAN, "b.js": CLEAN });
  const r = run(cfgPath, { SECRET_TOKEN: SECRET });
  assert.equal(r.status, 0, (r.stdout || "") + (r.stderr || ""));
  assert.match((r.stdout || "") + (r.stderr || ""), /0 leaks/);
});

test("FAILS when an artifact contains the secret (exit 1), names the ENV VAR, and withholds the value - discriminating", () => {
  const { cfgPath } = fixture({ "ok.js": CLEAN, "leaky.js": LEAKED });
  const r = run(cfgPath, { SECRET_TOKEN: SECRET });
  const out = (r.stdout || "") + (r.stderr || "");
  assert.equal(r.status, 1, out);
  assert.match(out, /SECRET_TOKEN leaked into/);
  assert.match(out, /leaky\.js/);
  assert.doesNotMatch(out, /sup3r s3cret token value xyz/); // the value must never be printed
});

test("a NESTED leaked artifact is still caught (whole-tree walk, discriminating)", () => {
  const { cfgPath } = fixture({ "sub/deep/leaky.js": LEAKED });
  assert.equal(run(cfgPath, { SECRET_TOKEN: SECRET }).status, 1);
});

test("fail-closed: a named env var that is UNSET exits 2 (not a silent pass)", () => {
  const { cfgPath } = fixture({ "a.js": CLEAN });
  const r = run(cfgPath, { SECRET_TOKEN: "" }); // explicitly empty -> unset
  assert.equal(r.status, 2, (r.stdout || "") + (r.stderr || ""));
});

test("fail-closed: an empty secretEnvVars exits 2", () => {
  const { cfgPath } = fixture({ "a.js": CLEAN }, { secretEnvVars: [] });
  assert.equal(run(cfgPath, { SECRET_TOKEN: SECRET }).status, 2);
});

test("fail-closed: an empty scan exits 2", () => {
  const { cfgPath } = fixture({ "a.js": CLEAN }, { scan: [] });
  assert.equal(run(cfgPath, { SECRET_TOKEN: SECRET }).status, 2);
});

test("fail-closed: an EMPTY surface (dir filtered to zero files) exits 2", () => {
  const { dist, cfgPath } = fixture({ "a.js": CLEAN }, { ext: [".log"] }); // only .log scanned; the .js is ignored
  void dist;
  assert.equal(run(cfgPath, { SECRET_TOKEN: SECRET }).status, 2);
});

test("fail-closed: a scan path that does not exist exits 2", () => {
  const root = mkdtempSync(join(tmpdir(), "leakgate-"));
  const cfgPath = join(root, "c.json");
  writeFileSync(cfgPath, JSON.stringify({ secretEnvVars: ["SECRET_TOKEN"], scan: [join(root, "nope")] }));
  assert.equal(run(cfgPath, { SECRET_TOKEN: SECRET }).status, 2);
});

test("fail-closed: a missing config exits 2", () => {
  const r = spawnSync(process.execPath, [GATE, "--config", join(tmpdir(), "nope-leak.json")], { encoding: "utf8", env: { ...process.env, SECRET_TOKEN: SECRET } });
  assert.equal(r.status, 2);
});

test("fail-closed: no --config exits 2", () => {
  assert.equal(spawnSync(process.execPath, [GATE], { encoding: "utf8" }).status, 2);
});

test("--help prints usage and exits 0", () => {
  const r = spawnSync(process.execPath, [GATE, "--help"], { encoding: "utf8" });
  assert.equal(r.status, 0);
  assert.match(r.stdout || "", /usage:/i);
});
