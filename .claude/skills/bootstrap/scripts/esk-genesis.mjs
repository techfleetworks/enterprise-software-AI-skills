#!/usr/bin/env node
/**
 * esk-genesis.mjs: bootstrap (and reconcile) a consumer repo's bootstrap-v2 gates from the upstream
 * skills repo's single source of truth, gate-manifest.json (ADR-0046, ADR-0047).
 *
 * WHAT: Installs the gates a consumer repo must run, keyed off the upstream manifest, so a consumer gets
 *       exactly the gates the pinned skills version ships, with no per-dev guesswork. It:
 *       - copies each upstream gate and machinery script into the consumer's scripts/ci/, and each
 *         gate's test into the consumer, verifying every copy against the manifest sha256;
 *       - writes the consumer's gate-manifest.json (version pin + the upstream gates and machinery),
 *         and PRESERVES any gate the consumer already had that the upstream does not ship, recording it
 *         as origin "repo-local" (its file is never touched);
 *       - scaffolds .github/workflows/enterprise-gates.yml, which runs the aggregator (one required
 *         check) after fetching the upstream release manifest so the provenance gate can verify it.
 *       Re-running RECONCILES: a changed upstream script is re-copied, a gate dropped upstream is removed
 *       (its script and test deleted), repo-local gates are left alone, and an up-to-date repo is a no-op.
 *
 * HOW:  Reads the SOURCE manifest (the upstream repo's gate-manifest.json) and resolves each gate's
 *       content at <source>/.claude/skills/<skill>/scripts/<basename>. Copies into <target> at the
 *       manifest's script path, hash-checking against the manifest. Detects repo-local gates by scanning
 *       the consumer's scripts/ci for check-*.mjs not shipped upstream. Nothing is written without --yes.
 *
 * WHY:  The upstream manifest is the one source of truth (ADR-0046); parity proves the committed scripts
 *       match it, provenance proves it matches the release, presence proves the skeleton exists, and the
 *       aggregator runs them. This is the step that PUTS that machinery into a consumer repo and keeps it
 *       synced, so "the skills are enforced here" becomes a fact rather than a hope.
 *
 * SAFE BY DEFAULT: with no --yes it prints the plan and writes nothing.
 *
 *   node esk-genesis.mjs --source <skills-repo> --target <consumer-repo>          # plan only
 *   node esk-genesis.mjs --source <skills-repo> --target <consumer-repo> --yes    # apply (backs up first)
 *
 * Flags: --source <dir> (upstream skills repo; default: resolved from this script's location),
 *        --target <dir> (consumer repo; default: cwd), --yes (apply), --version <x.y.z> (pin override),
 *        --adopt-existing (take over a pre-existing FOREIGN gate-manifest.json: back it up and replace it,
 *        keep its gate scripts as repo-local, delete nothing; without it a foreign manifest is refused),
 *        --code-owners "<@user ...>" (scaffold .github/CODEOWNERS over the enforcement paths, no-clobber, and
 *        print the one-time ruleset setting to require code-owner review; opt-in, the human backstop decision).
 *
 * Exit: 0 = success / already current (or a clean plan). 1 = a problem the user must act on (e.g. a
 * source hash mismatch). 2 = bad usage or an unreadable/unwritable path (fail closed).
 */
import { readFileSync, writeFileSync, existsSync, mkdirSync, copyFileSync, rmSync, readdirSync, statSync, chmodSync } from "node:fs";
import { resolve, dirname, join, basename, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { createHash } from "node:crypto";
import { spawnSync } from "node:child_process";

const args = process.argv.slice(2);
const flag = (n) => args.includes(n);
const opt = (n) => { const i = args.indexOf(n); return i >= 0 ? args[i + 1] : undefined; };
const die = (msg) => { console.error(`[esk-genesis] FAIL: ${msg}`); process.exit(2); };

// Resolve the upstream skills repo: --source, else walk up from this script to the dir holding
// gate-manifest.json and always-on/ (the same shape findRepoRoot in esk-init uses).
function findSkillsRepo(start) {
  let dir = start;
  for (let i = 0; i < 12; i++) {
    if (existsSync(join(dir, "gate-manifest.json")) && existsSync(join(dir, ".claude", "skills"))) return dir;
    const up = dirname(dir);
    if (up === dir) break;
    dir = up;
  }
  return start;
}
const SOURCE = resolve(opt("--source") || findSkillsRepo(dirname(fileURLToPath(import.meta.url))));
const TARGET = resolve(opt("--target") || process.cwd());
const apply = flag("--yes");

// Hash LINE-ENDING-STABLY (ADR-0058): normalize CRLF to LF before hashing, so a source script verifies
// against the manifest the same on Windows (CRLF) and Linux/CI (LF). Copy verification still holds (both
// sides normalized), and an adopted repo-local gate's recorded sha is the stable LF hash.
const sha256 = (file) => createHash("sha256").update(readFileSync(file, "utf8").replace(/\r\n/g, "\n")).digest("hex");
// Same LF-stable hash for an in-memory string (the generated workflow), so a byte-identical workflow on disk
// is left alone and a stale one IS detected and refreshed on upgrade (ADR-0069).
const sha256str = (s) => createHash("sha256").update(String(s).replace(/\r\n/g, "\n")).digest("hex");

// --- read and validate the upstream source manifest ---------------------------
const srcManifestPath = join(SOURCE, "gate-manifest.json");
if (!existsSync(srcManifestPath)) die(`no gate-manifest.json under the source repo ${SOURCE} (pass --source <skills-repo>).`);
let src;
try { src = JSON.parse(readFileSync(srcManifestPath, "utf8")); } catch (e) { die(`cannot parse ${srcManifestPath}: ${e.message}`); }
if (!src || typeof src !== "object" || !Array.isArray(src.gates)) die(`${srcManifestPath} is not a gate manifest (no gates array).`);
const version = opt("--version") || src.version;
if (typeof version !== "string" || !/^\d+\.\d+\.\d+$/.test(version)) die(`no valid semver version to pin (source version "${src.version}").`);
const upstreamRepo = typeof src.generatedFrom === "string" ? src.generatedFrom.split("@")[0] : "techfleetworks/enterprise-software-AI-skills";
// The repo name is interpolated into the scaffolded workflow (a shell command and a YAML value), so a
// manifest with shell/YAML metacharacters in generatedFrom could inject into a consumer's CI. Constrain
// it to owner/repo and fail closed otherwise.
if (!/^[A-Za-z0-9._-]+\/[A-Za-z0-9._-]+$/.test(upstreamRepo)) die(`source generatedFrom repo "${upstreamRepo}" is not a plain owner/repo; refusing to scaffold a workflow from it.`);

// Path containment: every file this tool writes to or deletes in the consumer must stay under TARGET, and
// every source it reads must stay under SOURCE. The manifest is read before any consumer-side gate can
// vet it, so this is the least-trusted input and the only writer in the system; guard it like the gates do.
const within = (base, p) => { const r = resolve(base, p); return r.startsWith(base + sep) ? r : null; }; // strict: a file target is never the repo root itself
const safeSkill = (s) => typeof s === "string" && !s.includes("/") && !s.includes("\\") && !s.includes("..");

// The upstream gates + machinery, each resolved to its source content path. repo-local entries in the
// source (should be none) are ignored: genesis ships only upstream-owned gates.
const upstreamGates = src.gates.filter((g) => (g?.origin ?? "upstream") !== "repo-local");
const srcMachinery = Array.isArray(src.machinery) ? src.machinery : [];
const sourceContentOf = (entry) => {
  if (typeof entry?.skill !== "string" || typeof entry?.script !== "string") return null;
  return join(SOURCE, ".claude", "skills", entry.skill, "scripts", basename(entry.script));
};

// --- plan: what to copy, what to remove, what repo-local to preserve ----------
const consumerManifestPath = join(TARGET, "gate-manifest.json");
let prior = null;
if (existsSync(consumerManifestPath)) {
  try { prior = JSON.parse(readFileSync(consumerManifestPath, "utf8")); } catch (e) { die(`the consumer's existing ${consumerManifestPath} is not valid JSON (${e.message}); fix or remove it first.`); }
}
const fresh = !prior;

// Existing-enforcement guard (ADR-0052). Reconcile treats every prior non-repo-local gate as "upstream we
// installed" and DELETES any that the new upstream set no longer ships. That is correct for a manifest WE
// wrote, but catastrophic for a FOREIGN gate-manifest.json (one that predates this tool, or belongs to a
// different enforcement system that happens to use the same filename): reconcile would schedule its gates
// for deletion and silently stomp the consumer's own enforcement. So reconcile only against a manifest we
// recognize as ours by its bootstrap-v2 provenance: a "generatedFrom: owner/repo@x.y.z" AND an
// "aggregator.requiredCheck". A prior manifest without both is foreign; refuse by default, and require an
// explicit --adopt-existing to take it over (it is backed up and replaced; its gate scripts are preserved
// as repo-local, nothing is deleted).
function looksLikeOurManifest(m) {
  if (!m || typeof m !== "object") return false;
  const gf = typeof m.generatedFrom === "string" && /^[A-Za-z0-9._-]+\/[A-Za-z0-9._-]+@\d+\.\d+\.\d+$/.test(m.generatedFrom);
  const agg = m.aggregator && typeof m.aggregator === "object" && typeof m.aggregator.requiredCheck === "string";
  return Boolean(gf && agg);
}
const adoptExisting = flag("--adopt-existing");
const foreignPrior = Boolean(prior) && !looksLikeOurManifest(prior);
if (foreignPrior && !adoptExisting) {
  console.error(`[esk-genesis] FAIL: ${consumerManifestPath} already exists but was not generated by this tool`);
  console.error(`  (it has no bootstrap-v2 provenance: a "generatedFrom": "owner/repo@x.y.z" and an "aggregator.requiredCheck").`);
  console.error(`  Reconciling against it could DELETE the gates it lists, because reconcile removes any non-repo-local`);
  console.error(`  gate the upstream no longer ships. Refusing by default so this tool can never silently stomp a repo's`);
  console.error(`  own enforcement. If this repo already has its own enforcement and you mean to adopt it, re-run with`);
  console.error(`  --adopt-existing: the existing gate-manifest.json is backed up to .esk.bak and replaced, its gate`);
  console.error(`  scripts under scripts/ci are kept as repo-local (nothing deleted). Otherwise move or rename the file first.`);
  process.exit(1);
}
// Only a manifest we recognize as ours drives reconcile deletions; a foreign one being adopted is treated as
// a fresh layering (no removals), so its gates survive as repo-local.
const priorForReconcile = looksLikeOurManifest(prior) ? prior : null;

// Copies: every upstream gate + machinery script, and every gate test.
const copies = []; // { from, to, sha256 (expected), label }
const problems = [];
const addEntryCopies = (entry, kind) => {
  if (!safeSkill(entry?.skill)) { problems.push(`${kind} "${entry?.id}": skill "${entry?.skill}" must be a plain directory name (no path separators or "..").`); return; }
  if (typeof entry.script !== "string") { problems.push(`${kind} "${entry?.id}": script must be a string.`); return; }
  // Fail closed on a missing/non-string sha256: an unverified source must never be installed, and an
  // undefined hash would poison the consumer manifest.
  if (typeof entry.sha256 !== "string") { problems.push(`${kind} "${entry.id}": no string sha256 in the manifest; refusing to install unverified content.`); return; }
  const to = within(TARGET, entry.script);
  if (!to) { problems.push(`${kind} "${entry.id}": destination ${entry.script} escapes the target repo (path traversal).`); return; }
  const from = sourceContentOf(entry);
  if (!from) { problems.push(`${kind} "${entry.id}": no skill/script to resolve a source from.`); return; }
  if (!existsSync(from)) { problems.push(`${kind} "${entry.id}": source script ${from} does not exist.`); return; }
  if (sha256(from) !== entry.sha256) {
    problems.push(`${kind} "${entry.id}": source ${from} does not match the manifest sha256 (the source repo is itself out of integrity; run its upstream-integrity gate).`);
    return;
  }
  copies.push({ from, to, label: `${kind} ${entry.id} -> ${entry.script}` });
  if (kind === "gate" && typeof entry.test === "string") {
    const testTo = within(TARGET, entry.test);
    if (!testTo) { problems.push(`gate "${entry.id}": test path ${entry.test} escapes the target repo (path traversal).`); return; }
    const testFrom = join(SOURCE, entry.test);
    if (existsSync(testFrom)) copies.push({ from: testFrom, to: testTo, label: `test for ${entry.id} -> ${entry.test}` });
    else problems.push(`gate "${entry.id}": source test ${entry.test} does not exist in the source repo.`);
  }
};
for (const g of upstreamGates) addEntryCopies(g, "gate");
for (const m of srcMachinery) addEntryCopies(m, "machinery");

// Removals: an upstream gate the PRIOR consumer manifest had that this version no longer ships.
const newUpstreamScripts = new Set([...upstreamGates, ...srcMachinery].map((e) => e.script));
const removals = [];
if (priorForReconcile && Array.isArray(priorForReconcile.gates)) {
  const priorUpstream = [...priorForReconcile.gates.filter((g) => (g?.origin ?? "upstream") !== "repo-local"), ...(Array.isArray(priorForReconcile.machinery) ? priorForReconcile.machinery : [])];
  for (const e of priorUpstream) {
    if (typeof e?.script === "string" && !newUpstreamScripts.has(e.script)) {
      // Only ever remove paths contained in TARGET, even though they come from the prior committed
      // manifest: a tampered prior manifest must not turn reconcile into an arbitrary-delete primitive.
      const abs = within(TARGET, e.script);
      if (!abs) { problems.push(`dropped gate "${e.id}": prior script ${e.script} escapes the target repo; refusing to delete.`); continue; }
      let testAbs = null;
      if (typeof e.test === "string") {
        testAbs = within(TARGET, e.test);
        if (!testAbs) { problems.push(`dropped gate "${e.id}": prior test ${e.test} escapes the target repo; refusing to delete.`); continue; }
      }
      removals.push({ script: e.script, scriptAbs: abs, test: typeof e.test === "string" ? e.test : null, testAbs, id: e.id });
    }
  }
}

// Repo-local gates: committed check-*.mjs in the consumer's scripts/ci that the upstream does not ship.
// Preserve the file; record it as origin repo-local so parity's allow-list does not flag it.
const CI_DIR = join(TARGET, "scripts", "ci");
const upstreamBasenames = new Set([...upstreamGates, ...srcMachinery].map((e) => basename(e.script)));
// A gate dropped from upstream this version is still on disk now but is scheduled for removal; it is NOT
// repo-local, so exclude it from repo-local detection or reconcile would re-adopt a gate it is deleting.
const removalBasenames = new Set(removals.map((r) => basename(r.script)));
const repoLocal = [];
if (existsSync(CI_DIR)) {
  let names = [];
  try { names = readdirSync(CI_DIR).filter((n) => n.startsWith("check-") && n.endsWith(".mjs")); } catch { names = []; }
  for (const name of names) {
    if (upstreamBasenames.has(name)) continue; // shipped upstream, handled above
    if (removalBasenames.has(name)) continue; // a dropped upstream gate being removed, not repo-local
    const id = name.replace(/^check-/, "").replace(/\.mjs$/, "");
    const abs = join(CI_DIR, name);
    const testRel = join("test", `${id}.test.mjs`).replace(/\\/g, "/");
    repoLocal.push({ id, origin: "repo-local", script: `scripts/ci/${name}`, sha256: sha256(abs), test: testRel, lane: "required", hasTest: existsSync(join(TARGET, testRel)) });
  }
}

// The consumer manifest we will write: upstream gates + machinery verbatim from the source, plus the
// preserved repo-local gates. version is the pin.
const consumerManifest = {
  version,
  generatedFrom: `${upstreamRepo}@${version}`,
  gates: [
    ...upstreamGates.map((g) => ({ id: g.id, origin: "upstream", skill: g.skill, script: g.script, sha256: g.sha256, test: g.test, lane: g.lane, ...(g.invoke ? { invoke: g.invoke } : {}), ...(g.couples ? { couples: g.couples } : {}) })),
    ...repoLocal.map((r) => ({ id: r.id, origin: "repo-local", script: r.script, sha256: r.sha256, test: r.test, lane: r.lane })),
  ],
  // Machinery entries carry NO `test` field in the consumer manifest: esk-genesis copies gate tests but not
  // machinery tests (they are not in the gate matrix and never run in a consumer), so naming them would point
  // at files that do not exist (#128). Provenance compares machinery by id + sha256 only, so omitting test is
  // provenance-safe.
  ...(srcMachinery.length ? { machinery: srcMachinery.map((m) => ({ id: m.id, skill: m.skill, script: m.script, sha256: m.sha256 })) } : {}),
  aggregator: { requiredCheck: src.aggregator?.requiredCheck || "enterprise-gates" },
};

const workflowPath = join(TARGET, ".github", "workflows", "enterprise-gates.yml");
const workflowExists = existsSync(workflowPath);

// Scaffold a branch ruleset that REQUIRES the enterprise-gates check (ADR-0066), so a consumer has the
// source-of-truth to apply with scripts/apply-ruleset.sh, and travel that script so applying it is one admin
// command. The gates RUN once the workflow is scaffolded, but they only BLOCK a merge once this ruleset is
// applied; the always-on enforcement nudge keeps asking until it is. No-clobber on the ruleset (a consumer may
// already protect its branch); apply-ruleset.sh travels and stays current like the gate scripts.
const requiredCheck = src.aggregator?.requiredCheck || "enterprise-gates";
const rulesetPath = join(TARGET, ".github", "rulesets", "enterprise-gates.json");
const rulesetExists = existsSync(rulesetPath);
const RULESET = JSON.stringify({
  name: "enterprise-gates",
  target: "branch",
  enforcement: "active",
  conditions: { ref_name: { include: ["~DEFAULT_BRANCH"], exclude: [] } },
  rules: [
    { type: "deletion" },
    { type: "non_fast_forward" },
    { type: "required_status_checks", parameters: { strict_required_status_checks_policy: true, required_status_checks: [{ context: requiredCheck }] } },
  ],
}, null, 2) + "\n";
const applyScriptSrc = join(SOURCE, "scripts", "apply-ruleset.sh");
const applyScriptDst = join(TARGET, "scripts", "apply-ruleset.sh");
const installApplyScript = existsSync(applyScriptSrc) && (!existsSync(applyScriptDst) || sha256(applyScriptSrc) !== sha256(applyScriptDst));

// The pre-push hook (a fast local pre-flight). Installed from the source template, if the source ships
// one, into the consumer's .githooks/pre-push; git finds it once core.hooksPath is set (below). Optional
// so a source without the template still bootstraps cleanly.
const hookTemplate = join(SOURCE, ".claude", "skills", "bootstrap", "templates", "pre-push");
const hookPath = join(TARGET, ".githooks", "pre-push");
const hookAvailable = existsSync(hookTemplate);
const hookExists = existsSync(hookPath);
// Refresh on upgrade: install when absent OR when the on-disk hook differs from the current template, the same
// refresh the gate scripts and apply-ruleset.sh get. No-clobber here was the v1.2.0->1.2.1 bug: a fixed hook
// never reached an existing consumer (ADR-0069). The ruleset JSON and CODEOWNERS stay no-clobber on purpose.
const installHook = hookAvailable && (!hookExists || sha256(hookTemplate) !== sha256(hookPath));

// The install-hooks helper + a package.json "prepare" script arm the pre-push hook on `npm install`, so a
// fresh clone needs zero manual `git config` (ADR-0050). Optional: only if the source ships the helper.
const helperTemplate = join(SOURCE, ".claude", "skills", "bootstrap", "templates", "install-hooks.mjs");
const helperPath = join(TARGET, ".githooks", "install-hooks.mjs");
const helperAvailable = existsSync(helperTemplate);
const installHelper = helperAvailable && (!existsSync(helperPath) || sha256(helperTemplate) !== sha256(helperPath));
// Decide the package.json "prepare" wiring (no-clobber): add it only if there is a package.json with no
// prepare script; if a prepare exists without the helper, warn; if no package.json, warn (non-npm repo).
const pkgPath = join(TARGET, "package.json");
let prepareAction = "none"; // "add" | "warn-existing" | "warn-nopkg" | "warn-malformed" | "none"
let pkgObj = null;
let pkgParseErr = "";
if (helperAvailable) {
  if (existsSync(pkgPath)) {
    try { pkgObj = JSON.parse(readFileSync(pkgPath, "utf8")); } catch (e) { pkgObj = null; pkgParseErr = e.message; }
    const prep = pkgObj && pkgObj.scripts && typeof pkgObj.scripts.prepare === "string" ? pkgObj.scripts.prepare : "";
    if (!pkgObj) prepareAction = "warn-malformed"; // exists but not valid JSON: say so, do not claim it is absent
    else if (!prep) prepareAction = "add";
    else if (!prep.includes("install-hooks.mjs")) prepareAction = "warn-existing";
    else prepareAction = "none"; // already wired
  } else {
    prepareAction = "warn-nopkg";
  }
}
const WORKFLOW = `# Bootstrap-v2 enterprise gates: ONE check line per gate (visibility), plus one required summary check.
# Generated by esk-genesis (ADR-0047, per-skill matrix ADR-0065). Re-run esk-genesis to keep it current.
#
# How it works: the 'setup' job reads the manifest and emits the gate ids; the 'gate' job runs once per gate
# (a matrix generated from the manifest, so every gate the manifest lists gets its own check line - no manual
# per-gate wiring, no drift), running that gate AND its discrimination test in the consumer; and the final
# 'enterprise-gates' job is the SINGLE required check - it needs every matrix job and is green only if they
# all passed. Make 'enterprise-gates' the required status check in branch protection (not the per-gate jobs):
# it is green iff every manifest gate passed, and it stays correct as the gate set changes.
name: enterprise-gates

on:
  pull_request:
  push:
    branches: [main]

permissions:
  contents: read

jobs:
  setup:
    runs-on: ubuntu-latest
    outputs:
      gates: \${{ steps.matrix.outputs.gates }}
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 24
      # Emit the gate ids (from the manifest) as the matrix. A BARE assignment, so a non-zero exit from
      # gate-matrix FAILS this step: under bash -eo pipefail, 'echo "x=$(cmd)"' masks cmd's exit code, which
      # would let a bad or empty manifest slip through as an empty matrix that runs zero checks and looks green.
      - id: matrix
        env:
          GATE_MANIFEST_FILE: \${{ github.workspace }}/gate-manifest.json
        run: |
          gates=$(node scripts/ci/gate-matrix.mjs)
          echo "gates=$gates" >> "$GITHUB_OUTPUT"

  gate:
    needs: setup
    runs-on: ubuntu-latest
    name: gate (\${{ matrix.gate }})
    strategy:
      fail-fast: false
      matrix:
        gate: \${{ fromJSON(needs.setup.outputs.gates) }}
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 24
      # Fetch the pinned upstream release manifest so the provenance gate can verify this repo's committed
      # manifest. 404 (no release for this version) leaves the file absent, which provenance treats as "not
      # published" and fails closed; any other error fails this step.
      - name: Fetch upstream manifest for provenance
        run: |
          v=$(node -p "require('./gate-manifest.json').version")
          url="https://github.com/${upstreamRepo}/releases/download/v\${v}/gate-manifest.json"
          code=$(curl -sSL -o /tmp/upstream-manifest.json -w '%{http_code}' "$url" || echo 000)
          if [ "$code" = "404" ]; then rm -f /tmp/upstream-manifest.json; fi
          if [ "$code" != "200" ] && [ "$code" != "404" ]; then echo "upstream fetch failed: HTTP $code"; exit 1; fi
      # The gates default their repo-root resolution to their UPSTREAM location (four levels up). In a
      # consumer they live in scripts/ci (two levels up), so this env tells each gate where the repo root,
      # manifest, and gate dir actually are. --only runs just THIS matrix gate, reusing every aggregator
      # safeguard (within-repo, invoke validation, lane, fail-closed).
      - name: Run gate \${{ matrix.gate }}
        env:
          GATE_REPO_ROOT: \${{ github.workspace }}
          GATE_MANIFEST_FILE: \${{ github.workspace }}/gate-manifest.json
          GATE_DIR: \${{ github.workspace }}/scripts/ci
          GATE_UPSTREAM_FILE: /tmp/upstream-manifest.json
          GATE_UPSTREAM_REPO: ${upstreamRepo}
        run: node scripts/ci/run-manifest-gates.mjs --only "\${{ matrix.gate }}"
      # Run the gate's discrimination test IN the consumer, so a copied gate that was neutered (made
      # vacuous) is caught here, not just upstream. The manifest guarantees each gate ships a test, and
      # genesis copies it; a missing test file is therefore a real problem, so fail rather than skip.
      # GATE_DIR points the test at the gate copy CI actually runs (scripts/ci), so a repo that ALSO vendors
      # the skills under .claude/skills does not accidentally exercise that copy instead (issue #112).
      - name: Run \${{ matrix.gate }} discrimination test
        env:
          GATE_DIR: \${{ github.workspace }}/scripts/ci
        run: |
          t="test/\${{ matrix.gate }}.test.mjs"
          if [ ! -f "$t" ]; then echo "missing discrimination test $t (gate may be unverified)"; exit 1; fi
          node --test "$t"

  enterprise-gates:
    needs: [setup, gate]
    if: always()
    runs-on: ubuntu-latest
    steps:
      # The single REQUIRED check. Green only if every per-gate matrix job succeeded. 'if: always()' so this
      # runs even when a gate failed; it then reports the failure. Require THIS check in branch protection.
      - name: All enterprise gates must pass
        run: |
          if [ "\${{ needs.gate.result }}" != "success" ]; then
            echo "One or more enterprise gates failed (see the per-gate checks above)."; exit 1
          fi
          echo "All enterprise gates passed."
`;

// Optional CODEOWNERS scaffold (ADR-0055): the human backstop behind the gates. Opt-in via --code-owners
// "<@owner ...>" because it needs a named owner the installer cannot guess, and it is the point where the
// bootstrap skill asks the user whether they want code-owner review (sign-off decision D4). It owns exactly
// the enforcement surfaces, so weakening a gate always takes a named owner's review. No-clobber: an existing
// CODEOWNERS is never overwritten. Committing it is necessary but NOT sufficient; the repo ruleset must also
// require code-owner review on these paths, a one-time repo-settings change the installer prints but cannot make.
const codeOwnersRaw = opt("--code-owners");
const OWNER_RE = /^@[A-Za-z0-9](?:[A-Za-z0-9-]{0,38})(?:\/[A-Za-z0-9._-]+)?$/; // @user or @org/team
let codeOwners = [];
if (typeof codeOwnersRaw === "string") {
  codeOwners = codeOwnersRaw.split(/[\s,]+/).filter(Boolean);
  const bad = codeOwners.filter((o) => !OWNER_RE.test(o));
  if (codeOwners.length === 0) problems.push(`--code-owners was given but no owner was parsed; pass one or more @user / @org/team handles.`);
  for (const o of bad) problems.push(`--code-owners "${o}" is not a valid owner (expected @user or @org/team); refusing to write it into CODEOWNERS.`);
}
const wantCodeowners = codeOwners.length > 0;
const codeownersPath = join(TARGET, ".github", "CODEOWNERS");
const codeownersExists = existsSync(codeownersPath);
// "add" only when requested and absent; "warn-existing" when requested but one is already there (no-clobber).
const codeownersAction = wantCodeowners ? (codeownersExists ? "warn-existing" : "add") : "none";
function codeownersBody(owners) {
  const line = owners.join(" ");
  return [
    "# Code owners for the enterprise enforcement machinery (scaffolded by esk-genesis, ADR-0055).",
    "# A change to these paths cannot merge without a named owner's review, so weakening the gates always",
    "# takes human sign-off, not just a green check.",
    "#",
    "# NOTE: this only takes effect once the repo ruleset REQUIRES review from code owners on these paths.",
    "# Committing this file is necessary but NOT sufficient; enabling that rule is a one-time repo-settings",
    "# change (Settings > Rules, or a ruleset with require_code_owner_review on these paths).",
    "",
    `/scripts/ci/            ${line}`,
    `/gate-manifest.json     ${line}`,
    `/.github/workflows/     ${line}`,
    `/.github/CODEOWNERS     ${line}`,
    "",
  ].join("\n");
}

// --- is there anything to do? ------------------------------------------------
const needCopy = (c) => !existsSync(c.to) || sha256(c.from) !== sha256(c.to);
const pendingCopies = copies.filter(needCopy);
const manifestChanged = !prior || JSON.stringify(prior) !== JSON.stringify(consumerManifest);
// codeownersAction "warn-existing" is also NOT nothing-to-do: the user asked for code-owner coverage and we
// must still surface the no-clobber advisory (we left their CODEOWNERS alone; confirm it covers the paths),
// not swallow it behind "already current". Only "none" (no --code-owners) counts as nothing to do here.
// The workflow is generated and esk-genesis-owned (its header says "Re-run esk-genesis to keep it current"),
// so refresh it when the on-disk copy differs from what we would generate now - the refresh that lets a
// workflow fix (e.g. v1.2.1's GATE_DIR discrimination-test step) reach an existing consumer on upgrade (ADR-0069).
const workflowChanged = !workflowExists || sha256str(WORKFLOW) !== sha256(workflowPath);
const nothingToDo = problems.length === 0 && pendingCopies.length === 0 && removals.length === 0 && !manifestChanged && !workflowChanged && rulesetExists && !installApplyScript && !installHook && !installHelper && prepareAction !== "add" && codeownersAction === "none";

// --- print the plan ----------------------------------------------------------
console.log(`\nEnterprise gates ${fresh ? "genesis" : foreignPrior ? "ADOPT (replacing a foreign manifest)" : "reconcile"} plan`);
console.log(`  source:   ${SOURCE} (upstream ${upstreamRepo}, version ${version})`);
console.log(`  target:   ${TARGET}`);
console.log(`  manifest: ${consumerManifestPath}${prior ? (foreignPrior ? ` (foreign manifest present; it will be backed up to .esk.bak and replaced, its gates kept as repo-local)` : ` (currently pinned ${prior.version})`) : " (will be created)"}`);
if (problems.length) {
  console.error(`  BLOCKERS (nothing will be written):`);
  for (const p of problems) console.error(`    ! ${p}`);
  process.exit(1);
}
if (nothingToDo) {
  console.log(`  result:   already current. Nothing to change.`);
  process.exit(0);
}
console.log(`  changes:`);
for (const c of pendingCopies) console.log(`    - copy ${c.label}`);
for (const r of removals) console.log(`    - remove dropped upstream gate ${r.script}${r.test ? ` and ${r.test}` : ""}`);
for (const r of repoLocal) console.log(`    - preserve repo-local gate ${r.script} (recorded as adopted${r.hasTest ? "" : "; WARNING: no test at " + r.test + " - parity will flag it until you add one"})`);
if (manifestChanged) console.log(`    - ${prior ? "update" : "write"} gate-manifest.json (pin ${version})`);
if (workflowChanged) console.log(`    - ${workflowExists ? "update" : "scaffold"} .github/workflows/enterprise-gates.yml (the single required check)`);
if (!rulesetExists) console.log(`    - scaffold .github/rulesets/enterprise-gates.json (requires the "${requiredCheck}" check; apply it with scripts/apply-ruleset.sh to BLOCK merges)`);
if (installApplyScript) console.log(`    - ${existsSync(applyScriptDst) ? "update" : "install"} scripts/apply-ruleset.sh (one admin command to turn enforcement on)`);
if (installHook) console.log(`    - ${hookExists ? "update" : "install"} the pre-push hook (.githooks/pre-push)${hookExists ? "" : " and point core.hooksPath at it"}`);
if (installHelper) console.log(`    - ${existsSync(helperPath) ? "update" : "install"} the hook auto-arm helper (.githooks/install-hooks.mjs)`);
if (prepareAction === "add") console.log(`    - add a package.json "prepare" script so the hook arms on npm install`);
if (prepareAction === "warn-existing") console.log(`    - NOTE: package.json already has a "prepare" script; add 'node .githooks/install-hooks.mjs' to it to auto-arm the hook`);
if (prepareAction === "warn-nopkg") console.log(`    - NOTE: no package.json, so the hook is not auto-armed; run 'git config core.hooksPath .githooks' once per clone`);
if (prepareAction === "warn-malformed") console.log(`    - NOTE: package.json exists but is not valid JSON (${pkgParseErr}); fix it, then re-run to wire the prepare script. The hook is not auto-armed meanwhile.`);
if (codeownersAction === "add") console.log(`    - scaffold .github/CODEOWNERS (enforcement paths owned by ${codeOwners.join(" ")}); then enable "require code-owner review" on the ruleset`);
if (codeownersAction === "warn-existing") console.log(`    - NOTE: .github/CODEOWNERS already exists; leaving it as is. Add the enforcement paths (scripts/ci/, gate-manifest.json, .github/workflows/, .github/CODEOWNERS) owned by ${codeOwners.join(" ")} yourself if they are not covered.`);
console.log(`  safety:   back up an existing gate-manifest.json first; copies are hash-verified against the manifest.`);

if (!apply) {
  console.log(`\nThis is a dry run. Re-run with --yes to apply.`);
  process.exit(0);
}

// --- apply -------------------------------------------------------------------
// Ordering + rollback: write everything (copies, manifest, workflow) FIRST and do removals LAST, so a
// mid-apply failure never leaves a gate deleted while the manifest still references it. Track every file
// we newly create so that, on any failure, we delete them (undo a partial fresh install). On reconcile we
// also restore the manifest from its .esk.bak so a half-written new manifest never references
// just-deleted new scripts. An overwritten pre-existing SCRIPT is not auto-restored (a re-run heals it).
const ensureDir = (file) => { const d = dirname(file); if (!existsSync(d)) mkdirSync(d, { recursive: true }); };
const createdNew = [];
let hooksPathSet = false; // set true only if WE change core.hooksPath, so rollback can restore it
let pkgBackup = null; // original package.json text, captured if we edit it, so rollback can restore it
const writeTracked = (file, data) => { const isNew = !existsSync(file); ensureDir(file); writeFileSync(file, data); if (isNew) createdNew.push(file); };
const copyTracked = (from, to) => { const isNew = !existsSync(to); ensureDir(to); copyFileSync(from, to); if (isNew) createdNew.push(to); if (sha256(to) !== sha256(from)) throw new Error(`copy verification failed for ${to}`); };
try {
  if (prior) copyFileSync(consumerManifestPath, consumerManifestPath + ".esk.bak");
  for (const c of pendingCopies) copyTracked(c.from, c.to);
  if (manifestChanged) writeTracked(consumerManifestPath, JSON.stringify(consumerManifest, null, 2) + "\n");
  if (workflowChanged) writeTracked(workflowPath, WORKFLOW);
  if (!rulesetExists) writeTracked(rulesetPath, RULESET); // no-clobber: only when absent
  if (installApplyScript) {
    copyTracked(applyScriptSrc, applyScriptDst);
    try { chmodSync(applyScriptDst, 0o755); } catch { /* exec bit is best-effort; git on the consumer may set it */ }
  }
  if (codeownersAction === "add") writeTracked(codeownersPath, codeownersBody(codeOwners)); // no-clobber: only when absent
  if (installHook) {
    copyTracked(hookTemplate, hookPath);
    try { chmodSync(hookPath, 0o755); } catch { /* exec bit is best-effort; git on the consumer may set it */ }
    // Point git at the committed hooks dir, but NEVER clobber an existing core.hooksPath (a consumer may
    // already route hooks to husky or another dir; overwriting it would silently disable those hooks).
    // Per-clone, best-effort: the hook file is committed regardless, and a later `git config core.hooksPath
    // .githooks` turns it on. This never fails the install.
    if (existsSync(join(TARGET, ".git"))) {
      let current = "";
      try { const r = spawnSync("git", ["-C", TARGET, "config", "--get", "core.hooksPath"], { encoding: "utf8" }); current = (r.stdout || "").trim(); } catch { /* best-effort */ }
      if (current && current !== ".githooks") {
        console.error(`  ! core.hooksPath is already set to "${current}"; leaving it as is. Merge the pre-push hook into ${current}/ (or set core.hooksPath to .githooks) to enable it.`);
      } else if (!current) {
        try { spawnSync("git", ["-C", TARGET, "config", "core.hooksPath", ".githooks"], { stdio: "ignore" }); hooksPathSet = true; } catch { /* best-effort */ }
      }
    }
  }
  if (installHelper) {
    copyTracked(helperTemplate, helperPath);
    try { chmodSync(helperPath, 0o755); } catch { /* best-effort */ }
  }
  if (prepareAction === "add" && pkgObj) {
    // Add the prepare script without disturbing anything else in package.json: capture the original for
    // rollback, reuse the file's own indent and trailing-newline so the diff is one added line, not a
    // whole-file reformat that fights prettier/editorconfig.
    pkgBackup = readFileSync(pkgPath, "utf8");
    const indentMatch = pkgBackup.match(/\n([ \t]+)"/);
    const indent = indentMatch ? indentMatch[1] : "  ";
    const trailingNl = pkgBackup.endsWith("\n") ? "\n" : "";
    pkgObj.scripts = pkgObj.scripts && typeof pkgObj.scripts === "object" ? pkgObj.scripts : {};
    pkgObj.scripts.prepare = "node .githooks/install-hooks.mjs";
    writeFileSync(pkgPath, JSON.stringify(pkgObj, null, indent) + trailingNl);
  }
  // Removals LAST, only files that were upstream gates and are gone this version (paths already contained).
  for (const r of removals) {
    for (const abs of [r.scriptAbs, r.testAbs].filter(Boolean)) {
      if (existsSync(abs)) rmSync(abs);
    }
  }
} catch (e) {
  // Roll back a partial install: delete files we newly created this run, then (on reconcile) restore the
  // manifest from its backup so it never references a just-deleted new script. Overwritten pre-existing
  // scripts are left for a re-run to heal.
  for (const f of createdNew) { try { if (existsSync(f)) rmSync(f); } catch { /* best-effort */ } }
  // If we set core.hooksPath this run (it had no prior value), unset it so a rollback leaves git config as
  // it found it. We only ever set it when there was no prior value, so unsetting is the correct inverse.
  if (hooksPathSet) { try { spawnSync("git", ["-C", TARGET, "config", "--unset", "core.hooksPath"], { stdio: "ignore" }); } catch { /* best-effort */ } }
  if (pkgBackup !== null) { try { writeFileSync(pkgPath, pkgBackup); } catch { /* best-effort */ } }
  let restored = false;
  if (prior && existsSync(consumerManifestPath + ".esk.bak")) {
    try { copyFileSync(consumerManifestPath + ".esk.bak", consumerManifestPath); restored = true; } catch { /* best-effort */ }
  }
  die(`apply failed (${e.message}); rolled back ${createdNew.length} newly-created file(s)${restored ? " and restored the prior manifest from .esk.bak" : ""}.`);
}

console.log(`\n[esk-genesis] OK: ${fresh ? "bootstrapped" : "reconciled"} ${TARGET} to ${upstreamRepo}@${version}.`);
console.log(`Next: commit these files, then an admin makes "${consumerManifest.aggregator.requiredCheck}" a required status check so the gates block merges.`);
if (workflowChanged) console.log(`The enterprise-gates.yml workflow was ${workflowExists ? "updated" : "scaffolded"}; review it before committing.`);
if (installHook) console.log(`The pre-push hook (.githooks/pre-push) was ${hookExists ? "updated" : "installed"}; it runs the offline gates before each push.`);
if (prepareAction === "add") console.log(`A package.json "prepare" script was added, so every clone arms the hook automatically on 'npm install'. Zero per-clone setup.`);
else if (prepareAction === "warn-existing") console.log(`Your package.json already has a "prepare" script; add 'node .githooks/install-hooks.mjs' to it so the hook arms on 'npm install'.`);
else if (prepareAction === "warn-nopkg") console.log(`No package.json here, so the hook is not auto-armed; run 'git config core.hooksPath .githooks' once per clone (or add an equivalent setup step).`);
else if (prepareAction === "warn-malformed") console.log(`package.json is not valid JSON (${pkgParseErr}); fix it, then re-run so the hook can auto-arm. Until then, run 'git config core.hooksPath .githooks' once per clone.`);
if (codeownersAction === "add") {
  console.log(`A .github/CODEOWNERS was scaffolded (enforcement paths owned by ${codeOwners.join(" ")}).`);
  console.log(`It only takes effect once the repo REQUIRES code-owner review on those paths: enable "Require review from`);
  console.log(`Code Owners" on the branch ruleset for the default branch (Settings > Rules), or set require_code_owner_review`);
  console.log(`in the ruleset. Until then a named owner's sign-off is documented but not enforced.`);
} else if (codeownersAction === "warn-existing") {
  console.log(`.github/CODEOWNERS already exists; it was left as is. Make sure it covers scripts/ci/, gate-manifest.json,`);
  console.log(`.github/workflows/, and .github/CODEOWNERS (owned by ${codeOwners.join(" ")}), then require code-owner review on those paths.`);
}
process.exit(0);
