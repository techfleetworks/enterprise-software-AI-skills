// Discriminating tests for .claude/skills/sre-operational-readiness/scripts/check-alert-hygiene.mjs.
// Each rule must FAIL a violating alert and PASS its fixed equivalent; the inline ignore must
// suppress ONLY with a reason; a `- record:` block must not fold into an alert; zero alerts fails closed.
import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtempSync, writeFileSync, mkdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const REPO = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const CHECK = resolve(REPO, ".claude/skills/sre-operational-readiness/scripts/check-alert-hygiene.mjs");

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
