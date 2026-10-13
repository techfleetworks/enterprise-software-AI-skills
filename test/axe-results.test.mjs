// Discriminating tests for .claude/skills/universal-accessibility-wcag/scripts/check-axe-results.mjs
// (the VERDICT half of the accessibility gate — the browser runner run-axe.mjs is a documented
// scaffold, not tested here). A clean run passes; a high-impact violation fails; the allowlist
// suppresses only with a reason + a live expiry; bad input fails closed.
import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const REPO = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const CHECK = resolve(REPO, ".claude/skills/universal-accessibility-wcag/scripts/check-axe-results.mjs");

function run(results, config = {}) {
  const dir = mkdtempSync(join(tmpdir(), "axe-"));
  const rp = join(dir, "axe-results.json");
  const cp = join(dir, "axe-config.json");
  writeFileSync(rp, typeof results === "string" ? results : JSON.stringify(results));
  writeFileSync(cp, JSON.stringify(config));
  const r = spawnSync(process.execPath, [CHECK, "--results", rp, "--config", cp], { encoding: "utf8" });
  return { status: r.status, out: (r.stdout || "") + (r.stderr || "") };
}
const v = (id, impact, nodes = 1) => ({ id, impact, nodes: Array.from({ length: nodes }, () => ({})) });
const future = "2999-12-31", past = "2000-01-01";

// --- clean / threshold -------------------------------------------------------
test("PASSES a clean run (no violations)", () => {
  assert.equal(run({ url: "/", violations: [] }).status, 0);
});
test("FAILS a critical violation (discriminating)", () => {
  const r = run({ url: "/", violations: [v("image-alt", "critical")] });
  assert.equal(r.status, 1, r.out);
  assert.match(r.out, /image-alt/);
});
test("FAILS a serious violation (default failOn includes serious)", () => {
  assert.equal(run({ url: "/", violations: [v("color-contrast", "serious")] }).status, 1);
});
test("PASSES a moderate violation under the default threshold (discriminating)", () => {
  assert.equal(run({ url: "/", violations: [v("landmark-unique", "moderate")] }).status, 0);
});
test("failOn config is honored: ['critical'] lets a serious violation pass", () => {
  assert.equal(run({ url: "/", violations: [v("color-contrast", "serious")] }, { failOn: ["critical"] }).status, 0);
  assert.equal(run({ url: "/", violations: [v("image-alt", "critical")] }, { failOn: ["critical"] }).status, 1);
});

// --- allowlist discipline ----------------------------------------------------
test("a whitespace-only reason does NOT suppress a critical (fail closed, discriminating)", () => {
  const cfg = { allowlist: [{ rule: "color-contrast", reason: "   ", sc: "1.4.3", expires: future }] };
  const r = run({ url: "/", violations: [v("color-contrast", "critical")] }, cfg);
  assert.equal(r.status, 2, r.out);
  assert.match(r.out, /reason/i);
});
test("a valid, unexpired allowlist entry suppresses (exit 0)", () => {
  const cfg = { allowlist: [{ rule: "color-contrast", reason: "brand review pending", sc: "1.4.3", expires: future }] };
  assert.equal(run({ url: "/", violations: [v("color-contrast", "serious")] }, cfg).status, 0);
});
test("an EXPIRED allowlist entry no longer suppresses (exit 1, discriminating)", () => {
  const cfg = { allowlist: [{ rule: "color-contrast", reason: "was pending", sc: "1.4.3", expires: past }] };
  assert.equal(run({ url: "/", violations: [v("color-contrast", "serious")] }, cfg).status, 1);
});
test("an allowlist entry missing a reason fails closed (exit 2)", () => {
  const cfg = { allowlist: [{ rule: "color-contrast", expires: future }] };
  assert.equal(run({ url: "/", violations: [v("color-contrast", "serious")] }, cfg).status, 2);
});
test("an allowlist entry with an unparseable expires fails closed (exit 2)", () => {
  const cfg = { allowlist: [{ rule: "color-contrast", reason: "x", expires: "soon" }] };
  assert.equal(run({ url: "/", violations: [v("color-contrast", "serious")] }, cfg).status, 2);
});

// --- multi-page + fail-closed ------------------------------------------------
test("aggregates an ARRAY of page runs; one bad page fails the gate", () => {
  const r = run([{ url: "/", violations: [] }, { url: "/checkout", violations: [v("label", "critical")] }]);
  assert.equal(r.status, 1, r.out);
  assert.match(r.out, /checkout/);
});
test("fails closed (exit 2) on an empty results array (nothing scanned)", () => {
  assert.equal(run([]).status, 2);
});
test("fails closed (exit 2) on an unknown failOn impact", () => {
  assert.equal(run({ url: "/", violations: [] }, { failOn: ["catastrophic"] }).status, 2);
});
test("fails closed (exit 2) on a violation with a missing/unrecognized impact (no fail-open, discriminating)", () => {
  assert.equal(run({ url: "/", violations: [{ id: "image-alt", nodes: [{}] }] }).status, 2); // no impact field
  assert.equal(run({ url: "/", violations: [{ id: "x", impact: null, nodes: [{}] }] }).status, 2);
});
test("fails closed (exit 2) when failOn is an empty array (no vacuous green)", () => {
  assert.equal(run({ url: "/", violations: [v("image-alt", "critical")] }, { failOn: [] }).status, 2);
});
test("fails closed (exit 2) when the results file is missing", () => {
  const dir = mkdtempSync(join(tmpdir(), "axe-nr-"));
  const cp = join(dir, "c.json");
  writeFileSync(cp, "{}");
  const r = spawnSync(process.execPath, [CHECK, "--results", join(dir, "nope.json"), "--config", cp], { encoding: "utf8" });
  assert.equal(r.status, 2);
});
