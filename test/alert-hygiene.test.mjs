// Discriminating tests for .claude/skills/sre-operational-readiness/scripts/check-alert-hygiene.mjs.
// Each rule must FAIL a violating alert and PASS its fixed equivalent; the inline ignore must
// suppress ONLY with a reason; a `- record:` block must not fold into an alert; zero alerts fails closed.
import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtempSync, writeFileSync, mkdirSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const REPO = resolve(dirname(fileURLToPath(import.meta.url)), "..");
// Resolve the gate in EITHER layout (upstream .claude/skills/<skill>/scripts, or a consumer's scripts/ci),
// because this test is copied verbatim into a consumer and must find the gate wherever it lives.
const UPSTREAM = resolve(REPO, ".claude/skills/sre-operational-readiness/scripts/check-alert-hygiene.mjs");
const CHECK = [UPSTREAM, resolve(REPO, "scripts/ci/check-alert-hygiene.mjs")].find((p) => existsSync(p)) ?? UPSTREAM;

function run(yaml) {
  const dir = mkdtempSync(join(tmpdir(), "alert-"));
  const f = join(dir, "rules.yml");
  writeFileSync(f, yaml);
  const r = spawnSync(process.execPath, [CHECK, f], { encoding: "utf8" });
  return { status: r.status, out: (r.stdout || "") + (r.stderr || "") };
}

// A complete, well-formed symptom paging alert. Individual tests delete one part to isolate a rule.
const GOOD = `groups:
  - name: api
    rules:
      - alert: HighErrorRate
        expr: sum(rate(http_requests_total{code=~"5.."}[5m])) / sum(rate(http_requests_total[5m])) > 0.05
        for: 5m
        labels:
          severity: page
        annotations:
          summary: "API error rate above SLO"
          runbook_url: "https://runbooks.example.com/api-error-rate"
`;

// --- well-formed alerts PASS -------------------------------------------------
test("PASSES a complete symptom paging alert", () => {
  const r = run(GOOD);
  assert.equal(r.status, 0, r.out);
});
test("PASSES a cause expr when it is a TICKET, not a page (cause-based-page discriminating)", () => {
  const yaml = GOOD
    .replace("severity: page", "severity: ticket")
    .replace(/expr: .*/, "expr: avg(node_cpu_seconds_total) > 0.9");
  assert.equal(run(yaml).status, 0, run(yaml).out);
});
test("PASSES a paging alert on a cause expr that ALSO carries a symptom (discriminating)", () => {
  const yaml = GOOD.replace(/expr: .*/, "expr: cpu_saturation_latency_seconds:p99 > 1");
  assert.equal(run(yaml).status, 0, run(yaml).out);
});
test("FLAGS a paging alert on a cause the old 8-token list missed - heap, connection pool (symptom-absence, discriminating)", () => {
  for (const expr of ["jvm_heap_used_bytes / jvm_heap_max_bytes > 0.9", "db_connections_active / db_connections_max > 0.9"]) {
    const yaml = GOOD.replace(/expr: .*/, `expr: ${expr}`);
    const r = run(yaml);
    assert.equal(r.status, 1, `${expr} should flag cause-based-page: ` + r.out);
    assert.match(r.out, /cause-based-page/);
  }
});

// --- each rule FAILS on its violation (discriminating, one per rule) ---------
test("FLAGS no-severity (exit 1)", () => {
  const r = run(GOOD.replace(/\s*severity: page/, ""));
  assert.equal(r.status, 1, r.out);
  assert.match(r.out, /no-severity/);
});
test("FLAGS no-summary when both summary and description are absent (exit 1)", () => {
  const r = run(GOOD.replace(/\s*summary: .*/, ""));
  assert.equal(r.status, 1, r.out);
  assert.match(r.out, /no-summary/);
});
test("does NOT flag no-summary when description is present instead (no false positive)", () => {
  const r = run(GOOD.replace('summary: "API error rate above SLO"', 'description: "API error rate above SLO"'));
  assert.equal(r.status, 0, r.out);
});
test("FLAGS no-runbook (exit 1)", () => {
  const r = run(GOOD.replace(/\s*runbook_url: .*/, ""));
  assert.equal(r.status, 1, r.out);
  assert.match(r.out, /no-runbook/);
});
test("FLAGS cause-based-page: a paging alert on CPU with no symptom (exit 1)", () => {
  const r = run(GOOD.replace(/expr: .*/, "expr: avg(node_cpu_seconds_total) > 0.9"));
  assert.equal(r.status, 1, r.out);
  assert.match(r.out, /cause-based-page/);
});
test("cause-based-page is NOT cleared by a symptom word inside a label matcher (discriminating)", () => {
  const r = run(GOOD.replace(/expr: .*/, 'expr: avg(node_cpu_seconds_total{job="http-api"}) > 0.9'));
  assert.equal(r.status, 1, r.out);
  assert.match(r.out, /cause-based-page/);
});
test("cause-based-page FLAGS a resource-saturation page (saturat is a cause, not a symptom)", () => {
  const r = run(GOOD.replace(/expr: .*/, "expr: node_cpu_saturation > 0.9"));
  assert.equal(r.status, 1, r.out);
  assert.match(r.out, /cause-based-page/);
});
test("cause-based-page reads only expr: a cause page is NOT cleared by a symptom word in summary (discriminating)", () => {
  const yaml = GOOD
    .replace(/expr: .*/, "expr: avg(node_memory_used_bytes) > 9e9")
    .replace("API error rate above SLO", "memory pressure");
  const r = run(yaml);
  assert.equal(r.status, 1, r.out);
  assert.match(r.out, /cause-based-page/);
});

// --- suppression semantics ---------------------------------------------------
test("an ignore directive WITH a reason suppresses the whole alert (exit 0)", () => {
  const yaml = GOOD
    .replace(/expr: .*/, "expr: avg(node_cpu_seconds_total) > 0.9")
    .replace("for: 5m", "for: 5m\n        # alert-hygiene:ignore capacity page by design, see ADR");
  assert.equal(run(yaml).status, 0, run(yaml).out);
});
test("a targeted ignore=rule suppresses only that rule (exit 0)", () => {
  const yaml = GOOD
    .replace(/expr: .*/, "expr: avg(node_cpu_seconds_total) > 0.9")
    .replace("for: 5m", "for: 5m\n        # alert-hygiene:ignore=cause-based-page deliberate capacity page");
  assert.equal(run(yaml).status, 0, run(yaml).out);
});
test("a targeted ignore for a DIFFERENT rule does NOT suppress the real one (discriminating)", () => {
  const yaml = GOOD
    .replace(/expr: .*/, "expr: avg(node_cpu_seconds_total) > 0.9")
    .replace("for: 5m", "for: 5m\n        # alert-hygiene:ignore=no-runbook unrelated");
  const r = run(yaml);
  assert.equal(r.status, 1, r.out);
  assert.match(r.out, /cause-based-page/);
});
test("a bare ignore with NO reason does NOT suppress (exit 1, discriminating)", () => {
  const yaml = GOOD
    .replace(/expr: .*/, "expr: avg(node_cpu_seconds_total) > 0.9")
    .replace("for: 5m", "for: 5m\n        # alert-hygiene:ignore");
  assert.equal(run(yaml).status, 1, run(yaml).out);
});

// --- record blocks are not alerts --------------------------------------------
test("a `- record:` block between two alerts is not folded into an alert (discriminating)", () => {
  const yaml = `groups:
  - name: api
    rules:
      - alert: NoRunbookHere
        expr: up == 0
        labels:
          severity: page
        annotations:
          summary: "target down"
      - record: job:requests:rate5m
        expr: sum(rate(http_requests_total[5m]))
`;
  const r = run(yaml);
  assert.equal(r.status, 1, r.out);
  assert.match(r.out, /no-runbook/);
  assert.match(r.out, /NoRunbookHere/);
});
test("a file with only recording rules fails closed (exit 2 — no alerts to check)", () => {
  const yaml = `groups:
  - name: api
    rules:
      - record: job:requests:rate5m
        expr: sum(rate(http_requests_total[5m]))
`;
  assert.equal(run(yaml).status, 2, run(yaml).out);
});

// --- fail closed on zero scan ------------------------------------------------
test("fails closed (exit 2) when a directory has no .yml/.yaml files", () => {
  const dir = mkdtempSync(join(tmpdir(), "alert-empty-"));
  mkdirSync(join(dir, "sub"));
  const r = spawnSync(process.execPath, [CHECK, dir], { encoding: "utf8" });
  assert.equal(r.status, 2, r.out);
});

// --- whole-repo travelling scope: --allow-empty + --ignore (ADR-0062) --------
// When this gate travels into a consumer the aggregator scans the whole tree ("."). Most repos have .yml
// (CI workflows, compose) but NO alert rules, so --allow-empty must pass BOTH "no .yml files" AND "no alert
// blocks in the .yml". The gate infra at scripts/ci is skipped, and a broken alert in a test/ fixture dir
// must not false-red (IGNORE_DIRS skips test dirs). Real alert rules elsewhere are still enforced.
function tree(files) {
  const dir = mkdtempSync(join(tmpdir(), "alert-tree-"));
  for (const [rel, src] of Object.entries(files)) {
    const f = join(dir, rel);
    mkdirSync(dirname(f), { recursive: true });
    writeFileSync(f, src);
  }
  return dir;
}
function runIn(cwd, args) {
  const r = spawnSync(process.execPath, [CHECK, ...args], { cwd, encoding: "utf8" });
  return { status: r.status, out: (r.stdout || "") + (r.stderr || "") };
}
const BAD_ALERT = "groups:\n  - name: x\n    rules:\n      - alert: HighCPU\n        expr: node_cpu_seconds_total > 0.9\n        labels:\n          severity: page\n";
const GOOD_ALERT = "groups:\n  - name: x\n    rules:\n      - alert: HighErrorRate\n        expr: rate(http_errors_total[5m]) > 0.05\n        labels:\n          severity: page\n        annotations:\n          summary: errors high\n          runbook_url: https://rb/x\n";

test("--allow-empty makes a repo with no .yml PASS (exit 0)", () => {
  assert.equal(runIn(tree({ "README.md": "# docs\n" }), ["--allow-empty", "."]).status, 0);
});
test("--allow-empty makes .yml with NO alert blocks PASS (CI workflow only; exit 0, key travel case)", () => {
  assert.equal(runIn(tree({ ".github/workflows/ci.yml": "name: ci\non: push\n" }), ["--allow-empty", "."]).status, 0);
});
test("WITHOUT --allow-empty a no-alert-block scan still fails closed (exit 2, discriminating)", () => {
  assert.equal(runIn(tree({ ".github/workflows/ci.yml": "name: ci\non: push\n" }), ["."]).status, 2);
});
test("still FLAGS a bad alert in product code under whole-repo scope (discriminating)", () => {
  const r = runIn(tree({ "monitoring/alerts.yml": BAD_ALERT }), ["--allow-empty", "--ignore", "scripts/ci", "."]);
  assert.equal(r.status, 1, r.out);
  assert.match(r.out, /cause-based-page/);
});
test("PASSES a well-formed symptom alert under whole-repo scope (no false positive)", () => {
  assert.equal(runIn(tree({ "monitoring/alerts.yml": GOOD_ALERT }), ["--allow-empty", "--ignore", "scripts/ci", "."]).status, 0);
});
test("does NOT flag a bad alert inside a test/ fixture dir (IGNORE_DIRS, no false positive)", () => {
  assert.equal(runIn(tree({ "test/fixtures/bad.yml": BAD_ALERT, "monitoring/ok.yml": GOOD_ALERT }), ["--allow-empty", "--ignore", "scripts/ci", "."]).status, 0);
});
test("--ignore with no path argument fails usage (exit 2)", () => {
  assert.equal(runIn(tree({ "monitoring/ok.yml": GOOD_ALERT }), ["--ignore"]).status, 2);
});
