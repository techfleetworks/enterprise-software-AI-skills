# CI/CD Security

## What it is

How to keep the build-and-deploy pipeline itself from becoming the way an attacker ships code to production.
This is the per-sheet guidance from the OWASP CI/CD Security Cheat Sheet, condensed to the controls that hold and
the attack they stop. The pipeline runs with high privilege and touches source, secrets, and release machinery,
so it is a prize target, not plumbing you can ignore.

## The attack it stops

A pipeline moves code from a commit all the way to a running production system with little human touch, and it
does so using powerful identities. An attacker who slips in anywhere along that path can hijack that reach: push
or auto-merge unreviewed code, poison a dependency the build pulls down, read secrets out of a log or image,
tamper with an artifact between steps, or hide inside a system nobody is watching. The Codecov and SolarWinds
breaches show how far one pipeline compromise spreads to everyone downstream. OWASP groups the biggest of these
into its Top 10 CI/CD risks, from weak flow control and identity management through poisoned execution, credential
leaks, unverified artifacts, and thin logging. The controls below close those gaps.

## Controls

In the cheat sheet's order:

1. **Secure the configuration of every CI/CD component.** Do not trust vendor defaults on SCM systems and build
   servers. Change settings only with understanding and through proper change management, keep the supporting
   operating systems, containers, and servers patched and inventoried, and harden them against standards such as
   CIS Benchmarks or STIGs.
2. **Lock down the SCM.** Turn off auto-merge, require a review that cannot be skipped before any merge, use
   protected branches, require signed commits, enable MFA, limit and vet outside contributors, avoid handing out
   default permissions, block forking of private repos, and stop anyone from flipping a repo to public. Tools like
   Legitify can scan for these misconfigurations.
3. **Harden the pipeline and its runners.** Build on isolated nodes, secure SCM-to-pipeline traffic with TLS 1.2
   or higher, restrict access by IP where you can, and keep the CI config file outside the built repo (or review
   it before every merge if it lives alongside the code). Add SAST, DAST, and IaC scanning to the pipeline, require
   a manual review and approval gate before any production deploy, never run build containers with `--privileged`,
   version-control the pipeline config, and enforce MFA.
4. **Manage secrets.** Never hardcode secrets in repos or pipeline config; scan for leaked ones with tools such as
   gitleaks or git-secrets and keep them from being committed at all. Strip secrets out of images and binaries,
   encrypt them at rest in a vault, and make sure they are never printed to the console, written to logs, or saved
   in shell history. Shrink the blast radius with short-lived credentials or one-time passwords and with IP or
   context restrictions, and reach for a dedicated store like HashiCorp Vault or AWS Secrets Manager.
5. **Apply least privilege.** Deny by default and justify every grant. Give pipeline secrets, each step's access
   to other resources, and the OS user that runs the job only the minimum they need. Avoid sharing credentials
   across pipelines, especially across pipelines of different sensitivity, and never let the pipeline's OS account
   run as root.
6. **Manage the identity lifecycle.** Use a central identity provider instead of local or shared accounts, block
   self-provisioning, and allow only email domains the organization controls. Keep an accurate inventory of every
   identity (owner, provider, last used, granted versus actually used permissions) so you can spot over-privileged
   or stale ones, and deprovision identities when they are no longer needed.
7. **Control third-party dependencies.** Guard against dependency-chain abuse such as confusion, typosquatting,
   and hijacked maintainer accounts. Configure the package manager so references are immutable, pin to versions
   known to be good, and verify each download's hash against a known-good checksum using a lockfile. Enforce the
   lockfile, prefer a single private feed, use scoped packages or ID prefixes to blunt confusion attacks, and
   commit the package-manager config (such as `.npmrc`) to source control.
8. **Govern plug-ins and integrations.** Treat each extension like a software purchase: let only a few users
   install them, and vet the vendor's reputation, security track record, popularity, maintenance, and any risky
   config it demands before approval. After install, patch it, keep it in config management, and remove it once it
   is no longer needed.
9. **Assure integrity end to end.** Require signed commits before merge, verify dependency hashes, and sign your
   own code with tools such as Sigstore while hardening the signing process itself. A framework like in-toto can
   tie the steps together so inputs and outputs cannot be swapped out mid-pipeline.
10. **Build visibility through logging and monitoring.** Match logging to your log-management policy, emit a
    parsable format such as JSON or syslog, and choose content and verbosity carefully while never logging
    plaintext passwords, tokens, or keys. Ship aggregated logs to a central system or SIEM and tune alerts for
    anomalies, remembering that detection will never be perfect.

## @security scenario

```gherkin
@security @owasp:ci-cd @usecase:block-unreviewed-production-deploy
Scenario: An unreviewed commit cannot reach production through the pipeline
  Given a protected main branch with auto-merge disabled and mandatory review enabled
  When an attacker pushes a commit and tries to merge and deploy it without an approved review
  Then the merge is blocked until a required reviewer approves the change
  And the production deploy stage halts for a manual approval gate before release
```

This scenario is the canonical copy. When you apply this sheet to real code, add it to the repo's shared
feature-file index (see `bdd-comprehensive-testing`, "Storing BDD scenarios permanently") and wire it into CI
(its "CI/CD wiring") so it runs as a blocking autotest in the same place as every other Gherkin scenario. The
check belongs next to the pipeline config it protects, so a change that weakens the review or approval gate
fails before it merges.

## The real guarantee

What actually keeps bad code out of production is the enforced flow control: a review that cannot be bypassed,
protected branches, and a manual gate before deploy, backed by least-privilege identities so a single
compromise cannot do much. The `@security` scenario proves one unreviewed path is blocked; the branch
protection and approval rules are what block every path. A test is a check; the enforced gate is the guarantee.

## Sources

- OWASP CI/CD Security Cheat Sheet (<https://cheatsheetseries.owasp.org/cheatsheets/CI_CD_Security_Cheat_Sheet.html>, retrieved 2026-10-11): the Top 10 CI/CD risks and the controls across secure configuration, SCM and pipeline hardening, secrets management, least privilege, identity lifecycle, dependency and plug-in management, integrity assurance, and logging and monitoring. `[documented]`
