// Tests for always-on/esk-paths.mjs (issue #174 PR-B, the activation layer). A no-op resolver (always returns the
// env value, or never derives) would flip the "enforcement on derives a path" and "unsafe id is refused" cases.
import { test } from "node:test";
import assert from "node:assert/strict";
import { join, resolve } from "node:path";
import { homedir } from "node:os";

// Load the module fresh per case so process.env changes are read at call time (the functions read env live).
const MOD = new URL("../always-on/esk-paths.mjs", import.meta.url);
async function load() { return import(`${MOD.href}?t=${Math.random()}`); }

function withEnv(vars, fn) {
  const saved = {};
  for (const k of Object.keys(vars)) { saved[k] = process.env[k]; if (vars[k] === undefined) delete process.env[k]; else process.env[k] = vars[k]; }
  try { return fn(); } finally { for (const k of Object.keys(saved)) { if (saved[k] === undefined) delete process.env[k]; else process.env[k] = saved[k]; } }
}

test("baseDir honors ESK_HOME, else ~/.claude/esk", async () => {
  const { baseDir } = await load();
  withEnv({ ESK_HOME: "/tmp/esk-base" }, () => assert.equal(baseDir(), resolve("/tmp/esk-base")));
  withEnv({ ESK_HOME: undefined }, () => assert.equal(baseDir(), join(homedir(), ".claude", "esk")));
});

test("isSafeSession rejects separators, traversal, and non-strings", async () => {
  const { isSafeSession } = await load();
  assert.ok(isSafeSession("abc-123_DEF.4"));
  for (const bad of ["..", ".", "a/b", "a\\b", "", "../x", null, undefined, 42, "a b"]) assert.equal(isSafeSession(bad), false, String(bad));
});

test("enforcementOn is true only when ESK_ENFORCE is exactly \"1\"", async () => {
  const { enforcementOn } = await load();
  withEnv({ ESK_ENFORCE: "1" }, () => assert.equal(enforcementOn(), true));
  for (const v of [undefined, "0", "true", "yes", ""]) withEnv({ ESK_ENFORCE: v }, () => assert.equal(enforcementOn(), false, String(v)));
});

test("sessionPaths returns the per-session layout under the base and throws on an unsafe id", async () => {
  const { sessionPaths } = await load();
  withEnv({ ESK_HOME: "/tmp/esk-base" }, () => {
    const b = resolve("/tmp/esk-base");
    const p = sessionPaths("sess1");
    assert.equal(p.record, join(b, "records", "sess1.json"));
    assert.equal(p.receipt, join(b, "receipts", "sess1.jsonl"));
    assert.equal(p.waivers, join(b, "waivers", "sess1.json"));
    assert.throws(() => sessionPaths("../escape"), /unsafe/);
  });
});

test("resolvePath: explicit env wins; enforcement-on derives; off or unsafe returns null", async () => {
  const { resolvePath } = await load();
  // explicit env wins regardless of enforcement
  withEnv({ ESK_TASK_RECORD: "/x/rec.json", ESK_ENFORCE: undefined }, () => assert.equal(resolvePath("record", "ESK_TASK_RECORD", "s1"), resolve("/x/rec.json")));
  // enforcement on, no explicit env: derive from base + session
  withEnv({ ESK_TASK_RECORD: undefined, ESK_ENFORCE: "1", ESK_HOME: "/tmp/esk-base" }, () => assert.equal(resolvePath("record", "ESK_TASK_RECORD", "s1"), join(resolve("/tmp/esk-base"), "records", "s1.json")));
  // enforcement OFF, no explicit env: null (not wired)
  withEnv({ ESK_TASK_RECORD: undefined, ESK_ENFORCE: undefined }, () => assert.equal(resolvePath("record", "ESK_TASK_RECORD", "s1"), null));
  // enforcement on but unsafe session: null (never derive from an unsafe id)
  withEnv({ ESK_TASK_RECORD: undefined, ESK_ENFORCE: "1", ESK_HOME: "/tmp/esk-base" }, () => assert.equal(resolvePath("record", "ESK_TASK_RECORD", "../x"), null));
});
