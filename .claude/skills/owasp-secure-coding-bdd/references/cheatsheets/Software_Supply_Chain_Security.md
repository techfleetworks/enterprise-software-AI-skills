# Software Supply Chain Security

## What it is

How to reduce the risk that something you did not write, but depend on, gets compromised and drags your software
down with it. This is the per-sheet guidance from the OWASP Software Supply Chain Security Cheat Sheet, condensed
to the controls that hold and the attack they stop. Your supply chain spans every tool and component from your
IDE and version control through build tools, CI/CD, package managers, and the dependencies you pull in.

## The attack it stops

Because software is built from many parts, a flaw in any one of them can put the whole chain at risk, and the
damage spreads to everyone downstream. OWASP groups the threats into four buckets: source-code threats (VCS
exploits, malicious code slipped into a codebase, builds from an unauthorized branch), build-environment threats
(cache poisoning, a hijacked build account, publishing from an untrusted source), dependency threats (pulling in
a vulnerable or compromised package through confusion or typosquatting), and deployment or runtime threats (a
compromised CI/CD account, misconfiguration, shipping tampered binaries). Attackers do not have to be
sophisticated, especially against weak targets, and because suppliers feed many consumers, one compromise can
ripple outward, as the SolarWinds and Codecov incidents showed. The controls below defend each link.

## Controls

In the cheat sheet's order:

**General practices (apply across all threat types):**

1. **Implement strong access control.** Compromised accounts, especially privileged ones, are a top threat. Use
   least privilege and separation of duties, enforce MFA, rotate credentials, and never store, transmit, or
   commit credentials in clear text.
2. **Log and monitor.** Configure every system in the chain (VCS, build tools, delivery, artifact repos,
   runtime hosts) to log authentication attempts, config changes, and other telling events, with enough depth and
   breadth to support detection and response. Then actually watch those logs, preferably through a central SIEM or
   aggregator, so the data is actionable.
3. **Leverage security automation.** Automate scanning, monitoring, and testing with tools such as SAST, DAST,
   SCA, and container scanners for scale and consistency, while keeping the tools themselves maintained and
   configured and never treating them as a complete answer.

**Source-code threats:**

4. **Peer reviews.** Have experienced reviewers who know both the technology and secure coding check changes
   before they merge, looking for accidental flaws and deliberately malicious code, and document the results.
5. **Secure configuration of version control.** Apply strong access control and logging to the VCS, and use its
   own features such as protected branches and merge policies. Never commit secrets. Tools like Legitify can
   detect misconfigurations.
6. **Secure the development platform.** IDEs, plugins, and the systems running them can be attack vectors, so run
   endpoint security and threat assessments on dev machines, use only trusted and well-vetted tools and
   extensions, and include them in the system inventory.

**Dependency threats:**

7. **Assess suppliers.** Before adopting any third-party component, open-source or proprietary, evaluate the
   vendor and the specific offering: maturity, security history, and response to past bugs, plus relevant
   certifications such as FedRAMP or ISO for larger vendors. For open source, weigh maintenance, popularity,
   release status, maintainer count, dependency hygiene, test coverage, documentation, vulnerability-reporting
   process, and license fit.
8. **Understand and monitor dependencies.** Gain insight into direct and transitive dependencies using SBOMs,
   and automate both producing and consuming them in CI/CD. Then continuously check them against known
   vulnerabilities with tools such as OWASP Dependency-Check or retire.js and sources like the NVD, OSV, or the
   CISA KEV catalog.
9. **Use SAST on dependencies.** SAST works on open-source components too, not just your own code; just verify
   results manually since it produces false positives and negatives and is not a complete picture.
10. **Pin versions with a lockfile.** Limit dependencies to specific versions already verified as legitimate and
    secure, typically through a lockfile such as npm's package-lock.json, so a compromised version is not pulled
    in unnoticed.

**Build threats:**

11. **Inventory build tools.** Automatically collect and maintain an inventory of all build tools, their
    versions, and plugins, and watch vulnerability databases and vendor advisories for issues affecting them.
12. **Harden build tools.** Place build tools in segregated networks, use DLP and similar controls to detect and
    block exfiltration, disable or remove unused services, and keep pipeline configuration in version control.
13. **Enforce code signing.** As a consumer, accept only digitally signed components and validate the signature
    before use. As a signer, thoroughly harden the signing infrastructure, since its compromise enables further
    attacks.
14. **Use a private artifact repository.** Route artifacts through a private repo you control, review them before
    they are allowed in, and make sure the repo cannot be bypassed.
15. **Use source control for build scripts and config.** Keeping CI/CD config and scripts in a VCS brings
    reviews, merge rules, and visibility into every change to the build process.
16. **Verify provenance and generate enough metadata.** Produce provenance on the build platform (not a
    developer's laptop) that is hard to forge and links the result back to its builder, following SLSA 1.0, and
    verify it with tools such as the SLSA Verifier.
17. **Use ephemeral, isolated builds.** Shared or reused build environments invite cache poisoning and code
    injection, so build in temporary, isolated environments (VMs or containers) that are destroyed right after.
18. **Limit build parameters.** User-controllable build parameters add flexibility but also let an attacker with
    enough access alter how a build runs, so minimize or eliminate them.

**Deployment and runtime threats:**

19. **Scan the final build binary.** Do not assume the output is clean; run binary composition analysis to find
    exposed secrets, unauthorized components, and integrity problems, as both supplier and consumer.
20. **Monitor deployed software for vulnerabilities.** Security does not stop at deploy. Keep watching the live
    system holistically (code dependencies, container images, web servers, OS components) against newly
    discovered issues, backed by an accurate component inventory, and act on insecure config changes.

## @security scenario

```gherkin
@security @owasp:supply-chain @usecase:block-tampered-dependency
Scenario: A build refuses a dependency whose contents do not match the pinned, verified version
  Given a project that pins every dependency in a committed lockfile with recorded integrity hashes
  When the build pulls a package whose downloaded contents no longer match the pinned hash
  Then the build fails instead of installing the altered package
  And an SBOM and vulnerability scan flag the component for review before release
```

This scenario is the canonical copy. When you apply this sheet to real code, add it to the repo's shared
feature-file index (see `bdd-comprehensive-testing`, "Storing BDD scenarios permanently") and wire it into CI
(its "CI/CD wiring") so it runs as a blocking autotest in the same place as every other Gherkin scenario. Keep
the check beside the lockfile and dependency config it guards, so weakening pinning or hash verification fails
the build before it merges.

## The real guarantee

What actually keeps a tampered or swapped dependency out of your build is the pinned lockfile with verified
integrity hashes: the resolver accepts only the exact bytes you already vetted, so a compromised upstream
version cannot slip in. The `@security` scenario proves one altered package is rejected; the pinning and hash
verification are what hold for every package. A test is a check; the verified lockfile is the guarantee.

## Sources

- OWASP Software Supply Chain Security Cheat Sheet (<https://cheatsheetseries.owasp.org/cheatsheets/Software_Supply_Chain_Security_Cheat_Sheet.html>, retrieved 2026-10-11): the four threat categories and the general, source-code, dependency, build, and deployment/runtime controls, including access control, SBOMs, version pinning, code signing, provenance, ephemeral builds, and binary scanning. `[documented]`
