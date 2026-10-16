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
 *        --target <dir> (consumer repo; default: cwd), --yes (apply), --version <x.y.z> (pin override).
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

const sha256 = (file) => createHash("sha256").update(readFileSync(file)).digest("hex");

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
if (prior && Array.isArray(prior.gates)) {
  const priorUpstream = [...prior.gates.filter((g) => (g?.origin ?? "upstream") !== "repo-local"), ...(Array.isArray(prior.machinery) ? prior.machinery : [])];
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
    ...upstreamGates.map((g) => ({ id: g.id, origin: "upstream", skill: g.skill, script: g.script, sha256: g.sha256, test: g.test, lane: g.lane, ...(g.couples ? { couples: g.couples } : {}) })),
    ...repoLocal.map((r) => ({ id: r.id, origin: "repo-local", script: r.script, sha256: r.sha256, test: r.test, lane: r.lane })),
  ],
  ...(srcMachinery.length ? { machinery: srcMachinery.map((m) => ({ id: m.id, skill: m.skill, script: m.script, sha256: m.sha256, test: m.test })) } : {}),
  aggregator: { requiredCheck: src.aggregator?.requiredCheck || "enterprise-gates" },
};

const workflowPath = join(TARGET, ".github", "workflows", "enterprise-gates.yml");
const workflowExists = existsSync(workflowPath);

// The pre-push hook (a fast local pre-flight). Installed from the source template, if the source ships
// one, into the consumer's .githooks/pre-push; git finds it once core.hooksPath is set (below). Optional
// so a source without the template still bootstraps cleanly.
const hookTemplate = join(SOURCE, ".claude", "skills", "bootstrap", "templates", "pre-push");
const hookPath = join(TARGET, ".githooks", "pre-push");
const hookAvailable = existsSync(hookTemplate);
const hookExists = existsSync(hookPath);
const installHook = hookAvailable && !hookExists;
const WORKFLOW = `# Bootstrap-v2 enterprise gates: one required check that runs every gate the manifest lists.
# Generated by esk-genesis (ADR-0047). Re-run esk-genesis to keep it current.
name: enterprise-gates

on:
  pull_request:
  push:
    branches: [main]

permissions:
  contents: read

jobs:
  enterprise-gates:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 24
      # Fetch the pinned upstream release manifest so the provenance gate can verify this repo's
      # committed manifest against it. 404 (no release for this version) leaves the file absent, which
      # provenance treats as "not published" and fails closed; any other error fails this step.
      - name: Fetch upstream manifest for provenance
        run: |
          v=$(node -p "require('./gate-manifest.json').version")
          url="https://github.com/${upstreamRepo}/releases/download/v\${v}/gate-manifest.json"
          code=$(curl -sSL -o /tmp/upstream-manifest.json -w '%{http_code}' "$url" || echo 000)
          if [ "$code" = "404" ]; then rm -f /tmp/upstream-manifest.json; fi
          if [ "$code" != "200" ] && [ "$code" != "404" ]; then echo "upstream fetch failed: HTTP $code"; exit 1; fi
      # The gates default their repo-root resolution to their UPSTREAM location
      # (.claude/skills/<skill>/scripts, four levels up). In a consumer they live in scripts/ci (two
      # levels up), so the workspace env below tells each gate where the repo root, manifest, and gate
      # dir actually are. Without this, the gates would resolve above the repo and misread everything.
      - name: Run the enterprise gates
        env:
          GATE_REPO_ROOT: \${{ github.workspace }}
          GATE_MANIFEST_FILE: \${{ github.workspace }}/gate-manifest.json
          GATE_DIR: \${{ github.workspace }}/scripts/ci
          GATE_UPSTREAM_FILE: /tmp/upstream-manifest.json
          GATE_UPSTREAM_REPO: ${upstreamRepo}
        run: node scripts/ci/run-manifest-gates.mjs
`;

// --- is there anything to do? ------------------------------------------------
const needCopy = (c) => !existsSync(c.to) || sha256(c.from) !== sha256(c.to);
const pendingCopies = copies.filter(needCopy);
const manifestChanged = !prior || JSON.stringify(prior) !== JSON.stringify(consumerManifest);
const nothingToDo = problems.length === 0 && pendingCopies.length === 0 && removals.length === 0 && !manifestChanged && workflowExists && !installHook;

// --- print the plan ----------------------------------------------------------
console.log(`\nEnterprise gates ${fresh ? "genesis" : "reconcile"} plan`);
console.log(`  source:   ${SOURCE} (upstream ${upstreamRepo}, version ${version})`);
console.log(`  target:   ${TARGET}`);
console.log(`  manifest: ${consumerManifestPath}${prior ? ` (currently pinned ${prior.version})` : " (will be created)"}`);
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
if (!workflowExists) console.log(`    - scaffold .github/workflows/enterprise-gates.yml (the single required check)`);
if (installHook) console.log(`    - install the pre-push hook (.githooks/pre-push) and point core.hooksPath at it`);
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
const writeTracked = (file, data) => { const isNew = !existsSync(file); ensureDir(file); writeFileSync(file, data); if (isNew) createdNew.push(file); };
const copyTracked = (from, to) => { const isNew = !existsSync(to); ensureDir(to); copyFileSync(from, to); if (isNew) createdNew.push(to); if (sha256(to) !== sha256(from)) throw new Error(`copy verification failed for ${to}`); };
try {
  if (prior) copyFileSync(consumerManifestPath, consumerManifestPath + ".esk.bak");
  for (const c of pendingCopies) copyTracked(c.from, c.to);
  if (manifestChanged) writeTracked(consumerManifestPath, JSON.stringify(consumerManifest, null, 2) + "\n");
  if (!workflowExists) writeTracked(workflowPath, WORKFLOW);
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
  let restored = false;
  if (prior && existsSync(consumerManifestPath + ".esk.bak")) {
    try { copyFileSync(consumerManifestPath + ".esk.bak", consumerManifestPath); restored = true; } catch { /* best-effort */ }
  }
  die(`apply failed (${e.message}); rolled back ${createdNew.length} newly-created file(s)${restored ? " and restored the prior manifest from .esk.bak" : ""}.`);
}

console.log(`\n[esk-genesis] OK: ${fresh ? "bootstrapped" : "reconciled"} ${TARGET} to ${upstreamRepo}@${version}.`);
console.log(`Next: commit these files, then an admin makes "${consumerManifest.aggregator.requiredCheck}" a required status check so the gates block merges.`);
if (!workflowExists) console.log(`A workflow was scaffolded; review it before committing.`);
if (installHook) console.log(`A pre-push hook was installed (.githooks/pre-push); it runs the offline gates before each push. Each clone needs core.hooksPath set to .githooks (this run set it if the target is a git repo).`);
process.exit(0);
