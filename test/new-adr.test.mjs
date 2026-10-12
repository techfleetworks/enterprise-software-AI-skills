// Discriminating tests for .claude/skills/architectural-decision-records/scripts/new_adr.sh — the slug fallback and
// the id-allocation lock added in the Phase-2 content-correctness change.
//
// new_adr.sh is bash; CI (ubuntu) always has bash. Locally (e.g. Windows without Git-Bash on PATH)
// the suite skips rather than failing, so it never blocks local runs.
import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { basename, join, dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const REPO = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const NEW_ADR = resolve(REPO, ".claude/skills/architectural-decision-records/scripts/new_adr.sh");
// Probe that bash can actually RUN this script at its (possibly Windows) path, not merely that a
// `bash` exists: a WSL bash on a Windows PATH can't resolve "C:\...\new_adr.sh" and would make the
// tests fail red (exit 127) instead of skipping — the same false-red this commit removes elsewhere.
// `new_adr.sh -h` prints help and exits 0, so a 0 here means "runnable"; anything else → skip.
const bashOK = spawnSync("bash", [NEW_ADR, "-h"], { stdio: "ignore" }).status === 0;
const opts = { skip: bashOK ? false : "bash cannot run this script here (CI/ubuntu runs it)" };

function run(title, dir) {
  const r = spawnSync("bash", [NEW_ADR, "-d", dir, title], { encoding: "utf8" });
  return { status: r.status, path: (r.stdout || "").trim(), err: r.stderr || "" };
}

test("slug: a title with no [a-z0-9] falls back to 'decision', never NNNN-.md (discriminating)", opts, () => {
  const dir = mkdtempSync(join(tmpdir(), "adr-slug-"));
  const r = run("!!!", dir);
  assert.equal(r.status, 0, r.err);
  assert.match(basename(r.path), /^\d{4}-decision\.md$/, `got ${r.path}`);
});

test("slug: a normal title is kebab-cased", opts, () => {
  const dir = mkdtempSync(join(tmpdir(), "adr-slug2-"));
  const r = run("Use Postgres For Billing", dir);
  assert.equal(r.status, 0, r.err);
  assert.match(basename(r.path), /^\d{4}-use-postgres-for-billing\.md$/, `got ${r.path}`);
});

test("lock: the lock releases so sequential runs increment ids (no deadlock, trap works)", opts, () => {
  const dir = mkdtempSync(join(tmpdir(), "adr-lock-"));
  const a = run("first decision", dir);
  const b = run("second decision", dir);
  assert.equal(a.status, 0, a.err);
  assert.equal(b.status, 0, b.err); // would hang/fail if the first run left the lock held
  const na = Number(basename(a.path).slice(0, 4));
  const nb = Number(basename(b.path).slice(0, 4));
  assert.equal(nb, na + 1, `expected incrementing ids, got ${a.path} then ${b.path}`);
});
