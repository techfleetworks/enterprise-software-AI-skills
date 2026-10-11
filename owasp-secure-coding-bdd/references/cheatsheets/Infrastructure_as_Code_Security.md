# Infrastructure as Code Security

## What it is

How to keep infrastructure-as-code (IaC) safe across its whole life: the templates and scripts that define and
spin up infrastructure get the same security treatment as application code, at every stage from writing it to
running the resources it creates. This is the per-sheet guidance from the OWASP Infrastructure as Code Security
Cheat Sheet, condensed to the controls that hold and the attack they stop.

## The attack it stops

Because IaC provisions real infrastructure from text files, one mistake in those files repeats itself across
every environment the code deploys to. A secret committed to Git exposes a credential to anyone who reads the
history. A too-broad permission grant in a template hands every resource it creates more access than it needs. An
unsigned build artifact can be swapped for a tampered one between build and runtime. Untagged or forgotten
resources become invisible "ghost" systems nobody patches. A single bad line, copied by the deploy, becomes a
fleet-wide weakness.

## Controls

The cheat sheet groups controls by the stage of the lifecycle where they apply.

Develop and distribute:
1. **IDE security plugins.** Run scanners like TFLint, Checkov, or Docker linters inside the editor so risks
   surface while the code is being written, not weeks later.
2. **Threat modeling early.** Map the risks up front so the high-value, high-exposure parts of the code get
   security attention from the start.
3. **Secrets handling.** Never keep tokens, passwords, or SSH keys in plain files or source control. Use a
   proper secrets store and scan with tools such as truffleHog, git-secrets, or GitGuardian to catch leaks.
4. **Version control.** Track every change to the IaC, and check infrastructure changes in alongside the feature
   that needs them (in the same branch or merge request), not in a separate commit.
5. **Least privilege.** Decide who may create, change, run, or delete the scripts, and cap each user's access to
   only what their job requires. The scripts themselves should grant each resource only the permissions it needs.
6. **Static analysis.** Scan the IaC on its own for misconfigurations and compliance gaps with tools like Snyk
   or Coverity.
7. **Dependency checks.** Review the open-source packages and libraries the IaC pulls in for known risks.
8. **Container image scanning.** Inspect image contents and build steps for vulnerabilities before use, with
   tools such as Trivy, Clair, or Anchore.
9. **CI/CD-integrated checks and consolidated reporting.** Run the security checks automatically in the pipeline
   on every change, keep a compliance history, and pull the results into one dashboard.
10. **Artifact signing.** Digitally sign build artifacts and verify the signature before use, so nothing can be
    swapped or altered between build and deploy.

Deploy:
1. **Inventory management.** When a resource is created, label, track, and log it. When one is removed, wipe its
   config, securely delete its data, and clear it from both the running system and the inventory.
2. **Tagging.** Tag cloud assets consistently and watch for untagged ones, which turn into unmonitored ghost
   resources that drive up cost and cause drift.
3. **Dynamic analysis.** Test the live environments and services the IaC will run on or talk to, using tools
   such as ZAP or Burp, to find risks that only show up in interaction.

Runtime:
1. **Immutable infrastructure.** Build each component to a fixed spec and never patch it in place. To change
   anything, provision fresh infrastructure from the new spec and retire the old.
2. **Logging.** Turn on both security and audit logging when provisioning, so you can assess risk, investigate
   incidents, and trace root causes.
3. **Monitoring.** Watch continuously for security and compliance violations and alert on them, using tools such
   as Prometheus and Grafana.
4. **Runtime threat detection.** Deploy a tool such as Falco to spot abnormal behavior and flag live attacks as
   they happen.

## @security scenario

```gherkin
@security @owasp:iac @usecase:no-secrets-in-iac
Scenario: An IaC change carrying a hardcoded secret is blocked before merge
  Given an infrastructure-as-code template committed to version control
  When a developer adds a plaintext credential and opens a merge request
  Then the pipeline secret scanner flags the credential and fails the check
  And the change cannot merge until the secret moves to the secrets store
```

This scenario is the canonical copy. When you apply this sheet to real code, add it to the repo's shared
feature-file index (see `bdd-comprehensive-testing`, "Storing BDD scenarios permanently") and wire it into CI
(its "CI/CD wiring") so it runs as a blocking autotest in the same place as every other Gherkin scenario.

## The real guarantee

The thing that actually keeps IaC safe is moving each check to the stage that owns it and running it
automatically: scanners catch secrets and misconfigurations before merge, least-privilege grants cap the blast
radius at provision time, and signing plus runtime detection guard what actually runs. The `@security` scenario
proves one leaked secret is stopped at the gate; the pipeline check and the secrets store are what stop every
such leak. A test is a check; the automated gate and least-privilege defaults are the guarantee.

## Sources

- OWASP Infrastructure as Code Security Cheat Sheet (<https://cheatsheetseries.owasp.org/cheatsheets/Infrastructure_as_Code_Security_Cheat_Sheet.html>, retrieved 2026-10-11): the lifecycle-staged controls across develop/distribute, deploy, and runtime, including secrets handling, least privilege, static and dynamic analysis, artifact signing, immutability, and runtime threat detection. `[documented]`
