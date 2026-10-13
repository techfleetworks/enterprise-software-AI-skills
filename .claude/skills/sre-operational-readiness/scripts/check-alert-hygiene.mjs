#!/usr/bin/env node
/**
 * check-alert-hygiene - flag alert rules that break the SRE alerting discipline before they ship.
 *
 * The structural half of sre-operational-readiness's "alert on symptoms, make every alert
 * actionable" rule. It scans Prometheus-style alerting-rule YAML (the de-facto format shared by
 * Prometheus, Alertmanager, Grafana-managed alerts, Mimir, Thanos and Loki) and fails (exit 1)
 * when an alert is missing the parts that make it safe to page on, so the skill's guidance cannot
 * be skipped by accident. Each rule enforces one item from references/alerting-and-oncall.md:
 *   no-severity       every alert needs a severity label, or you cannot tell a page from a ticket.
 *   no-summary        every alert needs a summary or description, or the responder learns nothing.
 *   no-runbook        every alert needs a runbook link, or there is no action attached to it.
 *   cause-based-page  a paging alert whose expression contains NO user-facing symptom token (it
 *                     watches a cause or resource signal, not a symptom like error rate, latency, or
 *                     SLO burn) pages a human for something that may not hurt a user. Page on
 *                     symptoms; make the cause a ticket. A reviewed custom-symptom page uses the ignore.
 * Dependency-free (Node built-ins), vendor-neutral. It ships and is copied with the skill.
 *
 *   node check-alert-hygiene.mjs <file-or-dir>...   # scan .yml/.yaml files (dirs scanned recursively)
 *
 * Suppressing a deliberate, reviewed exception: put an inline comment inside the alert block:
 *   # alert-hygiene:ignore <reason>                 (suppress every rule for that alert)
 *   # alert-hygiene:ignore=cause-based-page <reason> (suppress one rule for that alert)
 * The reason is REQUIRED; a bare `ignore` with no reason does NOT suppress (an unexplained waiver
 * is not a waiver, mirroring the arch-gate and migration-safety waiver discipline).
 *
 * Scope / limitations (honest): this is a block/regex linter, not a YAML parser. It splits a file
 * into alert blocks on `- alert:` / `- record:` markers and reads the labels and annotations by
 * line. A deeply nested or unusually formatted file can mis-split; the direction is always to
 * over-flag (a real gap is never hidden by a formatting quirk). The cause-based-page rule reads
 * only the `expr:` value, and before testing it strips the label-matcher blocks (`{job="http"}`)
 * and quoted strings, so a symptom word in a summary, a label value, or a string literal cannot
 * wrongly clear a real cause page. Use the inline ignore for a reviewed exception.
 *
 * Exit 0 = clean. 1 = one or more alerts fail a rule. 2 = bad usage / unreadable input / no alerts.
 */
import { readFileSync, readdirSync, statSync, existsSync } from "node:fs";
import { join, extname } from "node:path";

function die(msg) { console.error(`[check-alert-hygiene] FAIL - ${msg}`); process.exit(2); }

const inputs = process.argv.slice(2);
if (inputs.length === 0) die("no paths given. Usage: check-alert-hygiene.mjs <file-or-dir>...");

// --- collect .yml / .yaml files ----------------------------------------------
function collect(p) {
  if (!existsSync(p)) die(`path does not exist: ${p}`);
  const st = statSync(p);
  if (st.isDirectory()) return readdirSync(p).flatMap((n) => collect(join(p, n)));
  return [".yml", ".yaml"].includes(extname(p).toLowerCase()) ? [p] : [];
}
const files = inputs.flatMap(collect);
if (files.length === 0) die("no .yml/.yaml files found in the given path(s) (zero-scan - fail closed)");

// --- split a file into blocks on `- alert:` / `- record:` markers -------------
// A block spans from one marker line to the next (or EOF). We lint only `alert` blocks, so a
// `- record:` block between two alerts is its own block and is never folded into an alert.
const MARKER = /^\s*-\s+(alert|record)\s*:\s*(.*)$/;
function blocks(text) {
  const lines = text.split(/\r?\n/);
  const starts = [];
  lines.forEach((l, i) => { const m = l.match(MARKER); if (m) starts.push({ i, kind: m[1].toLowerCase(), name: (m[2] || "").trim() }); });
  const out = [];
  for (let k = 0; k < starts.length; k++) {
    if (starts[k].kind !== "alert") continue;
    const from = starts[k].i;
    const to = k + 1 < starts.length ? starts[k + 1].i : lines.length;
    out.push({ name: starts[k].name, line: from + 1, raw: lines.slice(from, to).join("\n") });
  }
  return out;
}

// Pull the `expr:` scalar value out of a block, including a `|`/`>` multi-line block scalar.
function exprOf(raw) {
  const lines = raw.split(/\r?\n/);
  for (let i = 0; i < lines.length; i++) {
    const m = lines[i].match(/^(\s*)expr\s*:\s*(.*)$/);
    if (!m) continue;
    const indent = m[1].length;
    let val = m[2].trim();
    if (val === "|" || val === ">" || val === "|-" || val === ">-" || val === "") {
      const body = [];
      for (let j = i + 1; j < lines.length; j++) {
        if (lines[j].trim() === "") { body.push(""); continue; }
        const li = lines[j].match(/^(\s*)/)[1].length;
        if (li <= indent) break;
        body.push(lines[j].trim());
      }
      val = body.join(" ");
    }
    return val;
  }
  return "";
}

// Inline ignore directives in a block. Returns {all, rules:Set}. Reason required (>= 3 chars).
function ignores(raw) {
  const out = { all: false, rules: new Set() };
  const re = /#\s*alert-hygiene:ignore(?:=([\w-]+))?\s+(\S.*)$/i;
  for (const line of raw.split(/\r?\n/)) {
    const m = line.match(re);
    if (!m) continue;
    if ((m[2] || "").trim().length < 3) continue; // unexplained ignore does not suppress
    if (m[1]) out.rules.add(m[1].toLowerCase()); else out.all = true;
  }
  return out;
}

// Match a metric-name token with underscores treated as boundaries, so `cpu` matches inside
// `node_cpu_seconds_total` but `load` does NOT match inside `payload`/`download` (a real letter
// on either side blocks it). `_` and digits are not letters, so they count as boundaries.
const tok = (words) => new RegExp(`(?<![a-z])(?:${words})(?![a-z])`, "i");
const PAGING = /\b(page|paging|pager|critical|crit|p1|sev-?1)\b/i;
// A page must watch a USER-FACING SYMPTOM. Rather than enumerate every resource CAUSE (cpu/mem/disk is only a
// handful - heap, connection pools, file descriptors, threads, bandwidth, GPU, temperature all slip such a
// list), flag any paging alert whose expression contains NO symptom token. That catches a page on any cause,
// known or not, and a reviewed custom-symptom page uses the inline ignore. `saturat*` is intentionally NOT a
// symptom: resource saturation is a cause, so a saturation-only page is still flagged.
const SYMPTOM = tok("error\\w*|request\\w*|latency|slo|budget|burn|availab\\w*|unavailab\\w*|success\\w*|fail\\w*|probe|http|5xx|4xx|2xx|ratio|p99|p95|p50|apdex|queue|timeout\\w*|reject\\w*|throttl\\w*|outage|downtime|deadline");

const problems = [];
let alertCount = 0;
for (const f of files) {
  let text;
  try { text = readFileSync(f, "utf8"); }
  catch (e) { die(`could not read ${f} (${e.message})`); }
  for (const b of blocks(text)) {
    alertCount++;
    const ig = ignores(b.raw);
    if (ig.all) continue;
    const label = b.name ? `alert "${b.name}"` : "alert";
    const add = (rule, why) => { if (!ig.rules.has(rule)) problems.push({ file: f, line: b.line, label, rule, why }); };

    const severity = (b.raw.match(/^\s*severity\s*:\s*["']?([A-Za-z0-9_-]+)/m) || [])[1] || "";
    if (!severity) add("no-severity", "no `severity` label, so a page cannot be told apart from a ticket. Add severity.");
    if (!/^\s*(summary|description)\s*:/m.test(b.raw)) add("no-summary", "no `summary` or `description` annotation, so the responder learns nothing. Add one.");
    if (!/^\s*runbook(_url)?\s*:/m.test(b.raw)) add("no-runbook", "no `runbook`/`runbook_url` annotation, so there is no action attached. Link a runbook.");

    const expr = exprOf(b.raw);
    // Test only the metric signal: drop label-matcher blocks and quoted strings so a symptom word
    // inside a label value (`{job="http-api"}`) cannot silently clear a real cause-based page.
    const signal = expr.replace(/\{[^{}]*\}/g, " ").replace(/"[^"]*"/g, " ").replace(/'[^']*'/g, " ");
    if (expr && PAGING.test(severity) && !SYMPTOM.test(signal)) {
      add("cause-based-page", "pages without a user-facing symptom in its expression (it watches a cause or resource signal, not a symptom). Alert on a symptom (error rate, latency, SLO burn, availability), or make this a ticket, not a page. If this metric IS your symptom, suppress with an inline ignore and a reason.");
    }
  }
}

if (alertCount === 0) die("no alert blocks found in the given .yml/.yaml file(s) (zero-scan - fail closed; point me at your alerting rules)");

if (problems.length) {
  console.error(`[check-alert-hygiene] FAIL - ${problems.length} alert-hygiene problem(s):`);
  for (const p of problems) console.error(`  * ${p.file}:${p.line}  [${p.rule}] ${p.label}: ${p.why}`);
  console.error(`\nFix per references/alerting-and-oncall.md, or - for a reviewed exception -\n` +
    `add an inline "# alert-hygiene:ignore <reason>" (or "=rule") inside that alert block.`);
  process.exit(1);
}
console.log(`[check-alert-hygiene] OK - ${alertCount} alert(s) across ${files.length} file(s), all with a severity, summary, and runbook, and no cause-based pages.`);
process.exit(0);
