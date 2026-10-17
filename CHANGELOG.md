# Changelog

All notable changes to this repository are recorded here. Dates are ISO (YYYY-MM-DD). This project follows
semantic versioning for the skills library and its gates.

## 1.1.0 - 2026-10-16

Adoption and enforcement hardening. 1.0.0 made the skills required and shown; 1.1.0 makes turning them on, and
staying current, close to automatic, and makes the installer safe to run against a repo that already has its
own enforcement. The skills and gates themselves are unchanged; this release is about getting them switched on
reliably and keeping them from going stale. No action is needed to keep using 1.0.0; upgrade to pick up the
adoption tooling below.

### Getting protected, with fewer steps

- The installer arms the local pre-push gates with zero extra steps on `npm install`, and this repo now
  dogfoods that on itself: clone, `npm install`, and your next push runs the fast offline gates locally
  (ADR-0053). CI stays the authority; the hook is an early-catch convenience.
- A committed repo hook now travels. `esk-init` writes a portable `${CLAUDE_PROJECT_DIR}` emitter path for a
  committed, repo-scoped settings file, and refuses to commit a machine-specific path, so a shared hook is not
  dead on every other clone. The decision is keyed on the resolved user-level target, case-folded on Windows
  (ADR-0051).

### Staying current

- When a session starts on an install that is behind the repo, the always-on hook now injects a loud,
  persistent nudge: it states the version gap, explains the benefit, gives the one-step sync command, and asks
  the agent to relay it and offer to run it. It keeps this up every session (up to a cap, then a quiet
  one-liner), restarts on a new version, and clears the moment you sync (ADR-0054).

### Safe to adopt, including over an existing system

- `esk-genesis` refuses by default to reconcile against a foreign `gate-manifest.json` (one it did not write),
  because reconcile would delete gates it does not own. Take one over deliberately with `--adopt-existing`,
  which backs it up and keeps the existing gates as repo-local, deleting nothing (ADR-0052).
- `esk-genesis --code-owners "<@user ...>"` scaffolds a `.github/CODEOWNERS` over the enforcement paths
  (no-clobber, fail-closed on an invalid handle) and prints the one-time ruleset setting to require code-owner
  review. The `bootstrap` skill now asks the user whether they want it, as an informed choice (ADR-0055).
- The `bootstrap` skill documents the two installers plainly: `esk-init` turns the directive on for sessions;
  `esk-genesis` installs the CI gates that block a merge. A fully protected repo runs both.

### Honest limits (unchanged from the design)

- A `git pull` never arms anything by itself; the realistic zero-friction path is one `npm install`. Git runs
  no code on pull and will not auto-run a cloned repo's hooks, by design.
- A scaffolded `CODEOWNERS` is necessary but not sufficient: a human still enables the require-code-owner-review
  ruleset rule, which the installer cannot do. The local pre-push runs the fast offline gates only; the full
  test suite, routing, and provenance stay CI's job.

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
