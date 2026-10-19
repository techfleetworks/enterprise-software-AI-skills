# Coverage map: what enforces each skill

This is the honest record of how each of the 16 skills is actually enforced. A skill can be held to by one of
three things, and they are not equal. We say which, per skill, so a green board is never mistaken for more than
it is: the mechanical gates prove floors that a computer can check, and the rest is human judgment.

The three tiers:

- **Travels (CI-enforced in a consumer).** A gate in `gate-manifest.json` that `esk-genesis` installs into an
  adopting repo, so it runs on every pull request there and blocks a merge once enforcement is on. These need
  no consumer setup beyond adoption.
- **Local gate (runs where wired; does not travel).** A real gate, but it needs something the consumer
  provides (a feature-file suite, a test report, a conformance record) or it governs this repo's own gate
  authoring. It does not install into a consumer as a blocking check.
- **Human review and directive (no mechanical gate).** The discipline is judgment a computer cannot grade. It
  is carried by the always-on directive (the agent is told to apply it) and by the `judge-arch` fresh-context
  review, not by a pass/fail check. This is not a gap to be closed later; some things are genuinely judgment.

## Per-skill

| Skill | What enforces it | Tier |
|---|---|---|
| `owasp-secure-coding-bdd` | `owasp-lints` (travels); `check-verbatim`, `check-cheatsheet-catalog`, `check-security-coverage` (local/repo-self) | Travels |
| `release-deployment-safety` | `migration-safety` (travels) | Travels |
| `sre-operational-readiness` | `alert-hygiene` (travels) | Travels |
| `compliance-data-lifecycle` | `untagged-pii`, `retention-basis` (travel) | Travels |
| `universal-browser-device-support` | `no-ua-sniffing` (travels) | Travels |
| `judge-arch` | `arch-gate`, `reference-links` (travel); the fresh-context review (required by the directive and the PR checklist, not by a mechanical check); plus the gate-system machinery (`skill-gate-parity`, `manifest-provenance`, `bootstrap-presence`, `check-upstream-manifest-integrity`, `check-change-routing`, `check-skill-receipt`, `check-arch-review-coverage`, `check-arch-rules-discriminate`) | Travels + review |
| `architectural-decision-records` | `check_adr.sh` (ADR format) + `check-change-routing` (requires an ADR for architectural changes) | Local gate |
| `bdd-comprehensive-testing` | `check-gherkin-valid`, `check-bdd-tags`, `check-bdd-coverage`, `check-bdd-executed` (need the consumer's feature suite + framework) | Local gate |
| `comprehensive-test-strategy` | `check-test-shape` (needs a live JUnit report from the consumer's test run) | Local gate |
| `universal-accessibility-wcag` | `check-a11y-checklist` (needs a human-authored conformance record), `check-axe-results` (needs a browser run) | Local gate |
| `verifiable-quality-gates` | `check-has-test`, the coverage/mutation engines (govern gate authoring in this repo) | Local / repo-self |
| `skeptical-audit` | `claim-lint`, `check-skill-evidence-contract` (repo-self); the evidence discipline on every claim | Repo-self + directive |
| `pattern-selector` | `check-catalog-completeness` keeps the pattern catalog whole; selecting the right pattern is judgment | Human review |
| `enterprise-architecture-standards` | the `judge-arch` four-question review; no dedicated gate | Human review |
| `arch-encode` | the practice of turning a caught mistake into a rule; carried by the directive | Human review |
| `usability-ux-universal-design` | the always-on directive and human review; no mechanical gate | Human review |

## The travelling gate inventory

These are the gates in `gate-manifest.json` that install into a consumer and run in its CI. Eight engineering
gates and three self-protection gates, behind one required `enterprise-gates` check:

- Engineering: `reference-links`, `no-ua-sniffing`, `owasp-lints`, `migration-safety`, `alert-hygiene`,
  `arch-gate`, `untagged-pii`, `retention-basis`.
- Self-protection: `skill-gate-parity`, `manifest-provenance`, `bootstrap-presence`.

## The honest total

Of the sixteen skills: **six travel** as CI gates into an adopting repo; **four more have a local gate** that
runs once the consumer wires its input (BDD suite, test report, accessibility record); **two more**
(`skeptical-audit`, `verifiable-quality-gates`) have repo-self gates that govern this repo's own authoring; and
**four are human judgment** (architecture design, pattern choice, turning mistakes into rules, usability). No
gate can grade those last four, so they stay with the directive and the review. The map above is kept accurate
by `test/coverage-map.test.mjs`, which fails if a skill or a manifest gate is missing from it.
