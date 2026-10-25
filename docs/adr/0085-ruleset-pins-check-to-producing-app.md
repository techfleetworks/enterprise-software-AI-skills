---
status: "accepted"
date: 2026-10-24
decision-makers: mdenner
---

# The scaffolded ruleset pins the required check to the app that produces it

## Context and Problem Statement

The ruleset `esk-genesis` scaffolds (`.github/rulesets/enterprise-gates.json`) required the status check by name
only, `{ "context": "enterprise-gates" }`, with no `integration_id` (issue #148). GitHub's REST documentation
describes `integration_id` as "The optional integration ID that this status check must originate from", so
without it the rule names the check but not its source: any actor that can post a commit status or check named
`enterprise-gates` on a pull request's head commit satisfies the rule, whether or not the real gate workflow
ran. Upstream's own `.github/rulesets/main-protection.json` had the same context-only shape. Pinning the source
of a required check is the usual hardening. This affects every consumer that applies the scaffolded ruleset.

The gates themselves are produced by the GitHub Actions workflow `esk-genesis` scaffolds. On github.com the
GitHub Actions app has id 15368 (observed on upstream's own check runs: `test (20)`, `test (24)`, `owasp-verbatim`
all report app `github-actions`, id `15368`).

## Decision

1. **Pin by default.** The scaffolded required check is `{ "context": requiredCheck, "integration_id": 15368 }`,
   the GitHub Actions app id on github.com, because `esk-genesis` scaffolds a GitHub Actions workflow and that is
   the expected producer. A status with the same name from any other source no longer satisfies the rule.
2. **Make the id overridable.** A new `--check-integration-id <app-id>` flag sets the id, for a host whose
   producer is not github.com's GitHub Actions (GitHub Enterprise Server, a GitHub App, a self-hosted CI that
   posts the status). `--check-integration-id none` opts out and scaffolds a context-only check (the prior
   behavior), for a host that cannot determine the id. A value that is neither a positive integer nor `none`
   fails closed (exit 2) rather than silently scaffolding an unpinned rule.
3. **Pin upstream too.** `.github/rulesets/main-protection.json` pins its three required checks (`test (20)`,
   `test (24)`, `routing`) to integration_id 15368, the same app that produces them.

`esk-genesis.mjs` is the installer, not a manifest gate, so there is no sha/provenance change; this ships in the
1.3.1 line. The behavior is pinned by discrimination tests: the default scaffold carries integration_id 15368, a
flag overrides it, `none` omits it, a bad value fails closed, and a guard test asserts every required check in
`main-protection.json` stays pinned.

## Consequences

* A consumer that applies the scaffolded ruleset gets a required check that only the GitHub Actions app can
  satisfy, so a forged or mislabeled status from another token or app no longer meets the rule. Upstream's own
  protection is hardened the same way.
* The scaffolded ruleset is written no-clobber (ADR-0066: `esk-genesis` writes it only when absent, because a
  consumer may already protect its branch), so the pin reaches a FRESH scaffold and this repo's own
  `main-protection.json`, not an existing consumer whose `enterprise-gates.json` was already scaffolded. An
  existing consumer picks up the pin by re-scaffolding (removing the file and re-running) or by adding
  `integration_id` to its committed ruleset and re-applying; `apply-ruleset.sh` applies whatever is committed.
  Because the ruleset legitimately does not converge on upgrade when its template changes, the consumer-upgrade
  harness (ADR-0070) excludes `.github/rulesets/enterprise-gates.json` from its byte-identity check while still
  requiring it to be present; every file `esk-genesis` refreshes on upgrade must still converge exactly.
* Honest limits: the default id 15368 is the GitHub Actions app on github.com; a GitHub Enterprise Server
  instance uses a different id, so a GHES consumer must pass `--check-integration-id <its-id>` (or `none`). The
  pin raises the bar but is not a complete authorization model: an actor who can trigger the real GitHub Actions
  workflow, or who holds a bypass role on the ruleset, is out of scope here. `main-protection.json` is the source
  of truth the test defends; it does not read live GitHub state (that needs an API call and admin).
