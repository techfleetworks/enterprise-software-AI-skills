// Guards the #150 (ADR-0089) contract end to end: the aggregator (run-manifest-gates) tells a VACUOUS pass from a
// real one by matching a marker string in each gate's output. That only works if every --allow-empty gate keeps
// printing exactly what the aggregator's VACUOUS_MARKER matches. This test reads the aggregator's actual regex and
// asserts each real gate's vacuous-branch output matches it, so a reworded gate message OR a changed aggregator
// regex that would silently un-fix #150 (render a vacuous pass as a plain ✓ again) fails CI. The AGG #150 tests in
// run-manifest-gates.test.mjs cover the aggregator's RENDERING of the marker; this covers that the real gates
// actually PRODUCE it. Needs no bash; pure node.
import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { resolve, dirname, join, basename } from "node:path";
import { fileURLToPath } from "node:url";

const REPO = resolve(dirname(fileURLToPath(import.meta.url)), "..");

// Pull the aggregator's VACUOUS_MARKER regex straight from its source, so this test is bound to the REAL thing the
// aggregator keys on, not a copy that could drift from it.
const aggSrc = readFileSync(resolve(REPO, ".claude/skills/judge-arch/scripts/run-manifest-gates.mjs"), "utf8");
const m = aggSrc.match(/VACUOUS_MARKER\s*=\s*\/(.+?)\/\s*;/);
assert.ok(m, "could not find VACUOUS_MARKER in run-manifest-gates.mjs - the contract test cannot bind to the aggregator");
const MARKER = new RegExp(m[1]);

// The five --allow-empty gates, at their real skill paths.
const GATES = [
  "universal-browser-device-support/scripts/check-no-ua-sniffing",
  "owasp-secure-coding-bdd/scripts/check-owasp-lints",
  "release-deployment-safety/scripts/check-migration-safety",
  "sre-operational-readiness/scripts/check-alert-hygiene",
  "compliance-data-lifecycle/scripts/check-untagged-pii",
];

for (const g of GATES) {
  test(`vacuous-marker contract: ${basename(g)} prints the marker the aggregator keys on, on an empty scope`, () => {
    const dir = mkdtempSync(join(tmpdir(), "vac-"));
    try {
      const r = spawnSync("node", [resolve(REPO, ".claude/skills", g + ".mjs"), "--allow-empty", dir], { encoding: "utf8" });
      const out = (r.stdout || "") + (r.stderr || "");
      assert.equal(r.status, 0, `${g} should exit 0 on an empty scope with --allow-empty:\n${out}`);
      assert.match(out, MARKER,
        `${g} must print the aggregator's vacuous marker on a nothing-in-scope pass. If its wording changed, update ` +
        `VACUOUS_MARKER in run-manifest-gates.mjs to match, or the aggregator will silently render this gate's vacuous ` +
        `pass as a real ✓ again (#150).`);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
}
