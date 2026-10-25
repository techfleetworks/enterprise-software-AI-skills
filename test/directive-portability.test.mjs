// Discriminating tests for #132 (ADR-0088): the always-on directive the hook delivers to a CONSUMER session
// must name only universal things (the skills + the evidence rule), never this repo's own contributor process
// (a review log, a skill receipt, named CI checks, CONTRIBUTING.md, apply-ruleset.sh) that a consumer does not
// have. The upstream-only process moved to upstream-contributor-process.md, loaded only by this repo's CLAUDE.md
// import, never by the emitter. These tests fail against the pre-split directive, where those artifacts were in
// the one file the emitter prints.
import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { readFileSync, mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { resolve, dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const REPO = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const UNIVERSAL = join(REPO, "always-on", "enterprise-skills-always-on.md");
const UPSTREAM = join(REPO, "always-on", "upstream-contributor-process.md");
const EMITTER = join(REPO, "always-on", "emit-directive.mjs");

// Artifacts that exist ONLY in this authoring repo, not in a consumer bootstrapped by esk-genesis. The universal
// directive (and thus the emitter's output) must name none of them.
const UPSTREAM_ONLY = [
  "check:receipt",
  "check:architecture",
  "docs/arch-reviews/log.jsonl",
  "docs/skill-receipts/log.jsonl",
  "CONTRIBUTING.md",
  "apply-ruleset.sh",
  // Also guard the rest of the upstream-only surface named by the ADR/CHANGELOG, so a future re-add of any of
  // these phrasings into the universal directive is caught, not just the paths/scripts above.
  "routing",
  "pull request",
  "PR template",
];

test("the universal directive names NO upstream-only artifact (safe to deliver to a consumer)", () => {
  const u = readFileSync(UNIVERSAL, "utf8");
  for (const tok of UPSTREAM_ONLY) {
    assert.ok(!u.includes(tok), `universal directive must not name "${tok}" (a consumer has no such file/script); move it to upstream-contributor-process.md`);
  }
});

test("the universal directive still carries the universal core (skills mandatory + evidence rule)", () => {
  const u = readFileSync(UNIVERSAL, "utf8");
  assert.match(u, /mandatory for every task/);
  assert.match(u, /enterprise-architecture-standards/);
  assert.match(u, /skeptical-audit/);
  assert.match(u, /evidence state/i);
});

test("the upstream contributor process DOES carry the repo-specific artifacts (they moved, not vanished)", () => {
  const p = readFileSync(UPSTREAM, "utf8");
  for (const tok of ["docs/arch-reviews/log.jsonl", "docs/skill-receipts/log.jsonl", "check:receipt", "CONTRIBUTING.md"]) {
    assert.ok(p.includes(tok), `upstream-contributor-process.md must still name "${tok}"`);
  }
  assert.match(p, /Before you open or update a pull request/);
});

test("this repo's CLAUDE.md imports BOTH the universal directive and the upstream process (un-backticked)", () => {
  const raw = readFileSync(join(REPO, "CLAUDE.md"), "utf8");
  assert.match(raw, /(?:^|\n)@always-on\/enterprise-skills-always-on\.md\s*$/m, "must import the universal directive");
  assert.match(raw, /(?:^|\n)@always-on\/upstream-contributor-process\.md\s*$/m, "must import the upstream contributor process");
  assert.doesNotMatch(raw, /`@always-on/, "an import inside backticks is disabled");
});

test("END TO END: what the emitter injects (a consumer session's directive) names no upstream-only artifact", () => {
  // Run the emitter exactly as the hook does, with nudges off and an isolated HOME so nothing ambient leaks in.
  const home = mkdtempSync(join(tmpdir(), "esk-home-"));
  const r = spawnSync(process.execPath, [EMITTER, "SessionStart"], {
    encoding: "utf8",
    env: { ...process.env, HOME: home, USERPROFILE: home, ESK_NUDGE_DISABLE: "1" },
  });
  assert.equal(r.status, 0, r.stderr);
  const ctx = JSON.parse(r.stdout).hookSpecificOutput.additionalContext;
  assert.match(ctx, /mandatory for every task/, "the emitted directive must still carry the universal core");
  for (const tok of UPSTREAM_ONLY) {
    assert.ok(!ctx.includes(tok), `the emitted (consumer-delivered) directive must not name "${tok}"`);
  }
});
