#!/usr/bin/env node
// subagent-claim - downgrade a subagent's verification claims before the parent passes them to the operator
// (issue #176, deliverable 7). The audited main session said it sees only each agent's final report, so a
// subagent's "fix verified, gate green" could reach the operator as if the parent had checked it. The parent must
// not launder a subagent's claim: unless the parent RE-RAN it (a command whose exit code and output the parent
// recorded), every verification phrase is relabelled "reported by a subagent, not re-run by the parent".
//
// Use as a library (downgradeSubagentClaims) or a filter: node subagent-claim.mjs [--rerun] < report > out
const VERIFY_PHRASES = /\b(re-?verified|verified|confirmed|gate green|all green|tests? (?:pass(?:ing|ed)?|green)|fixed|resolved|works now)\b/gi;

// Return the report with each verification phrase tagged as reported-not-verified, and a banner, UNLESS reRun is
// true (the parent re-ran it, so the claim stands as the parent's own). Idempotent on already-tagged text.
const BANNER = "Reported by a subagent (not re-run here):\n";
export function downgradeSubagentClaims(report, { reRun = false } = {}) {
  if (reRun || typeof report !== "string" || report.trim() === "") return report;
  const tagged = report.replace(VERIFY_PHRASES, (m, _g, offset, s) => {
    // do not double-tag if this phrase is already followed by the tag
    if (s.slice(offset).toLowerCase().startsWith(m.toLowerCase() + " [reported by a subagent")) return m;
    return `${m} [reported by a subagent, not re-run by the parent]`;
  });
  // Idempotent: do not stack the banner if the report already carries it.
  return tagged.startsWith(BANNER) ? tagged : BANNER + tagged;
}

// CLI filter: stdin -> stdout.
if (import.meta.url === `file://${process.argv[1]}` || process.argv[1] && import.meta.url.endsWith(process.argv[1].split(/[\\/]/).pop())) {
  const reRun = process.argv.includes("--rerun");
  let raw = "";
  process.stdin.on("data", (d) => (raw += d));
  process.stdin.on("end", () => { process.stdout.write(downgradeSubagentClaims(raw, { reRun })); });
}
