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

// ADR-0104: hooks receive absolute paths; the routing globs and receipts are repo-relative. An identity toRepoPath
// (the pre-fix behavior) flips every inside-the-root case below.
test("toRepoPath makes an absolute path inside the root repo-relative (Windows and POSIX) - discriminating", async () => {
  const { toRepoPath } = await load();
  assert.equal(toRepoPath("C:\\Users\\dev\\repo\\src\\domain\\orders\\repository.ts", "C:\\Users\\dev\\repo"), "src/domain/orders/repository.ts");
  assert.equal(toRepoPath("c:/users/dev/repo/docs/adr/0200-x.md", "C:\\Users\\dev\\repo"), "docs/adr/0200-x.md");
  assert.equal(toRepoPath("C:\\Users\\dev\\repo\\src\\a.ts", "C:/Users/dev/repo/"), "src/a.ts");
  assert.equal(toRepoPath("/home/dev/repo/src/domain/orders/repository.ts", "/home/dev/repo"), "src/domain/orders/repository.ts");
  assert.equal(toRepoPath("/home/dev/repo/./prisma/../prisma/schema.prisma", "/home/dev/repo"), "prisma/schema.prisma");
});

test("toRepoPath passes a path outside the root, or in another path family, through unchanged (forward slashes)", async () => {
  const { toRepoPath } = await load();
  assert.equal(toRepoPath("/home/dev/elsewhere/src/a.ts", "/home/dev/repo"), "/home/dev/elsewhere/src/a.ts");
  assert.equal(toRepoPath("/home/dev/repo-two/src/a.ts", "/home/dev/repo"), "/home/dev/repo-two/src/a.ts"); // a sibling with a shared prefix is outside
  assert.equal(toRepoPath("D:\\other\\src\\a.ts", "C:\\Users\\dev\\repo"), "D:/other/src/a.ts");
  assert.equal(toRepoPath("C:\\Users\\dev\\repo\\src\\a.ts", "/home/dev/repo"), "C:/Users/dev/repo/src/a.ts");
  assert.equal(toRepoPath("/home/dev/repo", "/home/dev/repo"), "/home/dev/repo"); // the root itself is not a file in it
});

test("toRepoPath leaves an already-relative path relative (forward slashes, no leading ./)", async () => {
  const { toRepoPath } = await load();
  assert.equal(toRepoPath("src\\a.ts", "/home/dev/repo"), "src/a.ts");
  assert.equal(toRepoPath("./src/a.ts", "C:\\repo"), "src/a.ts");
  assert.equal(toRepoPath("C:\\repo\\src\\a.ts", null), "C:/repo/src/a.ts"); // no root: only the separators change
});

test("projectRoot prefers CLAUDE_PROJECT_DIR, then the payload cwd, then the process cwd", async () => {
  const { projectRoot } = await load();
  withEnv({ CLAUDE_PROJECT_DIR: "/proj" }, () => assert.equal(projectRoot({ cwd: "/other" }), "/proj"));
  withEnv({ CLAUDE_PROJECT_DIR: undefined }, () => assert.equal(projectRoot({ cwd: "/other" }), "/other"));
  withEnv({ CLAUDE_PROJECT_DIR: undefined }, () => assert.equal(projectRoot({}), process.cwd()));
});
