// Discriminating tests for scripts/apply-ruleset.sh - the install step that makes the live repo's protection
// match the committed ruleset(s). Issue #152: on a PRIVATE repo whose plan does not include rulesets, the
// GitHub API refuses with HTTP 403. The script must (a) not swallow a failed LOOKUP with `|| true` and march
// on, and (b) turn a refusal into an actionable explanation instead of aborting on gh's raw error.
//
// apply-ruleset.sh is bash and shells out to a fake `gh` on PATH; CI (ubuntu) always has bash. Locally
// (e.g. Windows without a Git-Bash that can reach the temp paths) the suite SKIPS rather than failing red.
import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtempSync, mkdirSync, writeFileSync, copyFileSync, chmodSync } from "node:fs";
import { tmpdir, platform } from "node:os";
import { join, dirname, resolve, delimiter } from "node:path";
import { fileURLToPath } from "node:url";

const REPO = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const SCRIPT_SRC = resolve(REPO, "scripts/apply-ruleset.sh");

// A fake `gh` that refuses with a plan 403 on the chosen operation and succeeds otherwise. The real `node`
// stays reachable (we only PREPEND the fake-bin dir to PATH). FAKE_GH_FAIL selects "lookup" (GET) or "create".
const FAKE_GH = `#!/usr/bin/env bash
op="get"
for a in "$@"; do
  [ "$a" = "POST" ] && op="post"
  [ "$a" = "PUT" ] && op="put"
done
[ "\${1:-}" = "api" ] || exit 0
if { [ "$FAKE_GH_FAIL" = "lookup" ] && [ "$op" = "get" ]; } || { [ "$FAKE_GH_FAIL" = "create" ] && [ "$op" = "post" ]; }; then
  echo "HTTP 403: Upgrade to GitHub Pro or make this repository public" >&2
  exit 1
fi
exit 0
`;

// Build an isolated tree: <root>/scripts/apply-ruleset.sh (copy) + <root>/.github/rulesets/enterprise-gates.json
// + <root>/bin/gh (fake). Returns the paths and the PATH string with the fake bin prepended.
function build() {
  const root = mkdtempSync(join(tmpdir(), "applyrs-"));
  mkdirSync(join(root, "scripts"), { recursive: true });
  mkdirSync(join(root, ".github", "rulesets"), { recursive: true });
  mkdirSync(join(root, "bin"), { recursive: true });
  copyFileSync(SCRIPT_SRC, join(root, "scripts", "apply-ruleset.sh"));
  writeFileSync(
    join(root, ".github", "rulesets", "enterprise-gates.json"),
    JSON.stringify({ name: "enterprise-gates", enforcement: "active" }) + "\n",
  );
  const gh = join(root, "bin", "gh");
  writeFileSync(gh, FAKE_GH);
  try { chmodSync(gh, 0o755); } catch { /* best effort; msys honors the shebang */ }
  const PATH = join(root, "bin") + delimiter + process.env.PATH;
  return { root, script: join(root, "scripts", "apply-ruleset.sh"), PATH };
}

// Probe: can the spawned bash REACH the script AND resolve `gh` to our fake on the custom PATH? If not (WSL on
// a Windows PATH, exec-bit stripped, etc.) skip rather than false-red. CI (ubuntu) resolves both and runs.
const probe = build();
const reach = spawnSync("bash", ["-c", 'test -f "$1" && command -v gh >/dev/null', "_", probe.script], {
  env: { ...process.env, PATH: probe.PATH, FAKE_GH_FAIL: "none" },
  stdio: "ignore",
});
const opts = { skip: reach.status === 0 ? false : "bash cannot reach the script or the fake gh here (CI/ubuntu runs it)" };

function run(failOn) {
  const b = build();
  const r = spawnSync("bash", [b.script, "owner/repo"], {
    encoding: "utf8",
    env: { ...process.env, PATH: b.PATH, FAKE_GH_FAIL: failOn },
  });
  return { status: r.status, out: (r.stdout || "") + (r.stderr || "") };
}

// 1. A failed LOOKUP must stop with an explanation - NOT be swallowed by `|| true` so the script marches on.
// Discriminating: the old script swallowed the lookup 403 and then SUCCEEDED via the create call (exit 0).
test("FAILS with guidance when the ruleset LOOKUP is refused (no silent `|| true`)", opts, () => {
  const r = run("lookup");
  assert.notEqual(r.status, 0, r.out);
  assert.match(r.out, /could not look up a ruleset/i);
  assert.match(r.out, /plan that includes repository rulesets/i);
});

// 2. A failed CREATE must be turned into actionable guidance - not gh's raw error under set -e.
// Discriminating: the old script aborted with only gh's raw "HTTP 403..." and none of this guidance text.
test("FAILS with actionable options when the ruleset CREATE is refused (plan 403)", opts, () => {
  const r = run("create");
  assert.notEqual(r.status, 0, r.out);
  assert.match(r.out, /could not create a ruleset/i);
  assert.match(r.out, /Your options:/);
  assert.match(r.out, /Make the repository public/);
  assert.match(r.out, /re-run this script once your plan allows/i);
});

// 3. The happy path still applies cleanly when gh accepts (no false positive from the new error handling).
test("SUCCEEDS and records the marker when gh accepts the ruleset", opts, () => {
  const r = run("none");
  assert.equal(r.status, 0, r.out);
  assert.match(r.out, /Done\. Live protection on owner\/repo/i);
});
