---
status: "accepted"
date: 2026-10-18
decision-makers: mdenner
---

# migration-safety and alert-hygiene travel to consumers via the allow-empty whole-repo scan

## Context and Problem Statement

ADR-0060 and ADR-0061 made `reference-links`, `no-ua-sniffing` and `owasp-lints` travel into consumer repos
through the manifest `invoke` field, with the scan scope frozen by the provenance gate. Two more engineering
gates were in the portability plan as "routing-gated": `check-migration-safety` (release-deployment-safety)
and `check-alert-hygiene` (sre-operational-readiness). Both are domain-file scanners, not whole-code scanners:
migration-safety reads `.sql`, alert-hygiene reads `.yml`/`.yaml`. Neither touches the `.mjs` gate infra, so
neither false-positives on `scripts/ci` the way the code-scan gates did. But both fail closed on a zero scan,
and that is the wrong default when the aggregator runs them over a whole consumer tree:

- A consumer with no SQL migrations makes migration-safety exit 2 (false red).
- A consumer almost always has `.yml` files that are not alert rules (CI workflows, compose files), so
  alert-hygiene finds files but zero alert blocks and exits 2 (false red). This second zero case is unique to
  alert-hygiene and is the common case, not the rare one.

Neither gate skipped `node_modules` or test directories either, so a `.sql` or `.yml` test fixture that holds
an intentionally unsafe pattern (to exercise the gate) would be scanned and reported as a real defect.

The plan's word was "routing-gated": run these only when the change touches migration or alert files. But the
travelling-gate model has no per-push file routing. The aggregator (`run-manifest-gates`) runs every manifest
gate over the whole tree on every push; routing lives in a separate change-type gate, not in the aggregator.

## Decision

Make both gates travel with the same `--allow-empty` plus `--ignore scripts/ci` pattern already proven for the
code-scan gates, rather than inventing per-push routing in the aggregator.

- Each gate gains `--allow-empty` (a zero scan under the manifest-fixed whole-repo scope passes instead of
  failing closed) and a repeatable `--ignore <relpath>` (skip a directory the gate must never lint). Each
  also gains the shared `IGNORE_DIRS` set (`node_modules`, `.git`, `dist`, `build`, `coverage`, `vendor`, and
  the test directories) so fixtures do not false-red. Manifest `invoke` for both is
  `["--allow-empty", "--ignore", "scripts/ci", "."]`.
- For alert-hygiene, `--allow-empty` covers **both** zero cases: no `.yml` files, and `.yml` files with no
  alert blocks. The second is the one that matters, because most consumers have workflow YAML and no alert
  rules. A consumer that does ship alert rules still has them enforced; a consumer that does not stays green.
- Each gate is marked `// bootstrap-v2-gate: <id>` (upstream-integrity requires the marker) and listed in the
  manifest with its skill, normalized sha256 (ADR-0058), test, `lane: required`, and the `invoke` above. Their
  `invoke` is frozen for consumers by the provenance comparison added in ADR-0061, so a consumer cannot widen
  `--ignore` to skip real migrations or alerts and still pass.

Why `--allow-empty` whole-repo and not routing: it is the mechanism already shipped, reviewed and
provenance-protected; it needs no new aggregator capability; and it degrades correctly (a repo without the
domain files is simply green). Routing would add a second, parallel way to decide whether a gate runs, which
is exactly the kind of duplicate mechanism the architecture rules warn against.

A second, smaller decision rides along. The copied gate tests must run in a consumer, not just the origin, so
the CONSUMER-TESTS meta-test can prove each travelling gate detects. The migration-safety and alert-hygiene
tests, and the `no-ua-sniffing` and `owasp-lints` tests from ADR-0061, hardcoded the upstream gate path and
would fail in a consumer. All four now resolve the gate in either layout (upstream `.claude/skills/...` or the
consumer's `scripts/ci`), matching `manifest-provenance.test.mjs`, and all five travelling-gate tests are now
in the CONSUMER-TESTS loop. This also closes a latent gap from ADR-0061: `no-ua-sniffing` and `owasp-lints`
were added to the manifest there, so genesis copied their tests into consumers, but those copies would have
failed on the hardcoded path and nothing checked. The meta-test now covers all five.

## Consequences

* A consumer now runs five travelling engineering checks over its own code: dangling links, UA sniffing, the
  two OWASP source lints, unsafe SQL migrations, and alert hygiene. Verified end to end: genesis a fresh
  consumer with clean product code (a safe migration, a CI workflow YAML, feature-detected JS) and all eight
  manifest gates pass; add a `DROP TABLE` migration and a cause-based paging alert with no annotations and
  migration-safety and alert-hygiene go red and the aggregator fails. The gate infra at `scripts/ci` and test
  fixtures are not scanned.
* The provenance binding from ADR-0061 already protects the new gates' `invoke`: confirmed in the end-to-end
  run that the consumer's committed `invoke` matches the published release, so a consumer cannot neuter either
  gate's scan scope and stay green.
* Honest limitation: `--allow-empty` means a repo with zero migrations or zero alert rules is green by
  definition. These gates prove that the migrations and alerts a repo **does** have are safe; they cannot
  require a repo to have them. That is correct for a portable floor. A repo that wants to require alerting or
  migrations enforces that with its own gate, not this one.
* Honest limitation: skipping the test directories means a repo owner could in principle relocate a real
  migration or alert rule under a `test`/`spec` directory to dodge the gate. This is the same accepted tradeoff
  as the code-scan gates in ADR-0061 (test dirs hold intentionally-unsafe fixtures that would otherwise
  false-red), and it is bounded by what the gate is for: a portable floor the repo owner opts into, not an
  adversarial sandbox against that owner. Real migrations live in `migrations/`/`db/` and real alert rules in
  `monitoring/`/`alerts/`, which are scanned.
* Honest limitation: alert-hygiene scans every `.yml`/`.yaml` outside the ignored directories and treats any
  `- alert:` block as a Prometheus alert. A non-Prometheus file with a coincidental `- alert:` key would be
  linted; the inline `# alert-hygiene:ignore <reason>` is the escape, and the direction is always to
  over-flag, never to hide a real gap.
