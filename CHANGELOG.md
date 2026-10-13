# Changelog

All notable changes to this repository are recorded here. Dates are ISO (YYYY-MM-DD). This project follows
semantic versioning for the skills library and its gates.

## 1.0.0 - 2026-10-13

First stable release: a vendor-neutral library of enterprise engineering skills for AI coding agents, with the
mechanical gates that keep each skill's guarantees honest, plus the always-on layer and the receipt that make a
skill not just available but required and shown.

### The skills

Sixteen always-on skills, each written to the same depth (a cited evidence section, a claim-to-proof map, stated
limitations), each loadable on a `git pull` from `.claude/skills/`:

- Engineering: enterprise-architecture-standards, pattern-selector, architectural-decision-records,
  owasp-secure-coding-bdd (one reference file per OWASP cheat sheet, 137 of them), bdd-comprehensive-testing,
  comprehensive-test-strategy, release-deployment-safety, sre-operational-readiness, compliance-data-lifecycle,
  judge-arch, arch-encode, verifiable-quality-gates, skeptical-audit.
- Universal UI requirements: universal-accessibility-wcag, universal-browser-device-support,
  usability-ux-universal-design.

### Enforcement, not trust

- An always-on directive reaches every in-repo session (committed `CLAUDE.md` import and `.claude/settings.json`
  hook) and, through the installer, any session on a machine, so the relevant skills are required, not optional.
- Mechanical gates, each with a discriminating test proven to detect (and mutation-checked): the architecture
  gate, routing (change-type to required-artifact), reference-link integrity, the OWASP coverage and lint and
  catalog gates, migration-safety, alert-hygiene, PII and retention gates, the a11y checklist and axe verdict,
  UA-sniffing, the BDD gherkin/coverage/tags gates, the test-shape gate, the claim-lint and evidence-contract
  gates, the coverage and mutation meta-gates, and the ADR gates.
- A fresh-context judge-arch review on every change, recorded in an append-only log.
- A skill-application receipt per change (`docs/skill-receipts/log.jsonl`): every skill covered, each applied
  one grounded in a real skill heading, a verbatim quote from it, and files in the change. The gate proves the
  receipt is grounded, not that the work is good, so a human still reviews it.

### Honest limits (stated, not hidden)

The gates prove routed artifacts exist and the repo passes its checks; no required check reads the review log or
the receipt for truth, and a review's quality and a receipt's honesty remain a human-review concern. A couple of
gates are dependency-free text linters with documented blind spots (the evidence contract is presence-based; the
UA-sniffing linter covers the sniffing surface, not an AST). The merge-blocking CI wiring for the receipt and
review-coverage gates is deferred to the techfleetnetwork CI/CD release.

### Before the release

A full post-rewrite re-audit and a final adversarial false-negative / false-positive pass over every gate closed
about twenty holes (see `docs/adr/0033` through `docs/adr/0040`), so 1.0 ships gates that resist the natural
evasions, each pinned by an adversarial test.
