# NPM Security

## What it is

How to use npm safely as a JavaScript or Node.js developer: keeping secrets out of published
packages, pinning exactly what you install, blocking hostile install scripts, publishing through
short-lived credentials, and avoiding the package-naming tricks attackers use. This is the
per-sheet guidance from the OWASP NPM Security Cheat Sheet, condensed to the controls that hold and
the attack they stop.

## The attack it stops

The npm registry is huge and open, which is exactly what attackers exploit: they slip malicious
code into install scripts, register names that look like real packages so a typo or an AI
suggestion installs their code, and publish a public package that shadows your private one so a
build grabs theirs. A leaked publish token lets them ship a backdoor under your name. Any of these
can run arbitrary code on a developer's machine or in CI and harvest credentials. Locking down what
you publish, what you install, and who can publish is what shuts those paths.

## Controls

In the cheat sheet's order:
1. **Keep secrets out of the published tarball.** A file ignored by `.gitignore` is not
   automatically kept out of the package: if a `.npmignore` also exists, it alone decides what is
   excluded, so a secret dropped from git can still be shipped. Use the `files` allow-list in
   `package.json` to state exactly what belongs in the package, and run `npm publish --dry-run`
   first to review the archive before it goes out.
2. **Enforce the lockfile.** A plain install will quietly resolve different versions when
   `package.json` and the lockfile disagree, which defeats the point of pinning. Install from the
   lockfile only: `npm ci`, or `yarn install --frozen-lockfile`, so any mismatch aborts rather than
   pulling unintended versions into build and production.
3. **Shrink the install-script attack surface.** Package lifecycle hooks such as `postinstall` run
   arbitrary commands when a package is installed, and real incidents (eslint-scope, crossenv) have
   abused this to steal tokens. Vet third-party modules before adding them, wait before adopting
   brand-new versions, read the changelog first, and install with `--ignore-scripts`. Set
   `ignore-scripts=true` in `.npmrc` as the default, and when some package legitimately needs its
   scripts, allow just that one with a tool like `@lavamoat/allow-scripts`.
4. **Assess project health.** Use `npm outdated` to see which dependencies lag behind, upgrading
   deliberately after review rather than reflexively or never. Use `npm doctor` to confirm the
   registry is reachable, Git is present, versions are sane, folder permissions are right, and the
   local cache checksums are intact.
5. **Audit for known vulnerabilities continuously.** Because the npm ecosystem is so large, many
   popular packages have carried flaws. Scan dependencies for known issues as part of the developer
   workflow, not just once, and monitor your manifests so you get alerted when a new `CVE` starts
   affecting them (for example with OWASP Dependency-Track).
6. **Govern artifacts and the supply chain.** Consider a private registry or proxy such as
   Verdaccio to cache and control what packages flow in. Produce an SBOM (CycloneDX or SPDX) so you
   can trace what was built from what. Sign artifacts and build provenance with tooling like
   Sigstore or cosign so consumers verify integrity before installing, and when you verify, check
   both the expected issuer and the certificate identity, anchoring the identity regex and escaping
   literal dots, and never letting the untrusted package choose that policy. Favor registries that are
   immutable and access-controlled, scope and rotate CI and publisher tokens, verify signatures and the
   SBOM and the lockfile during CI, and automate alerts on unusual publishes with a written
   remediation playbook.
7. **Disclose vulnerabilities responsibly.** When you find a flaw, follow a responsible-disclosure
   process: coordinate privately with the vendor or maintainer so a fix and a release date are
   lined up before the issue goes public, giving affected users a way to remediate.
8. **Turn on two-factor authentication.** Require 2FA for publishing. npm offers an
   authorization-only mode and an authorization-and-write mode; enable the write-mode protection
   with `npm profile enable-2fa auth-and-writes` and save the emergency codes. Prefer interactive
   2FA publishing over token-based publishing where you can.
9. **Minimize access-token use.** Classic npm tokens are gone; prefer trusted publishing with OIDC
   so CI does not hold a long-lived credential. When a token is unavoidable, use a granular one
   scoped to only the packages, orgs, and permissions needed, read-only for installs, with the
   shortest practical expiry and source-IP limits where stable, stored in a CI secret store and
   never committed. Review with `npm token list` and revoke exposed or unused tokens with
   `npm token revoke`.
10. **Watch for typosquatting and slopsquatting.** Typosquatting publishes malicious packages whose
    names mimic popular ones to catch typos or lookalikes (cross-env, event-stream, eslint-scope);
    any package can read credentials through `process.env`. Slopsquatting exploits AI assistants
    that hallucinate plausible but nonexistent package names, which attackers then register. Before
    installing an AI-suggested or unfamiliar package, run `npm view <name>` to confirm it exists,
    check its download count, confirm it has a real repository with genuine history, be wary of
    very new packages, never blindly `npm install` AI suggestions, and add the existence check as a
    CI gate.
11. **Use trusted publishers for publishing.** Long-lived publish tokens can leak; trusted
    publishing with OIDC issues short-lived, workflow-specific credentials during CI that cannot be
    extracted or reused. Configure npm to accept publishes only from the workflow you authorized,
    and gain automatic provenance attestations that let users verify a package came from a
    legitimate source and was not tampered with.
12. **Prevent dependency-confusion attacks.** An attacker who learns your internal package name can
    publish a public package of the same name at a higher version, and a plain install may grab the
    public one. Attackers find those names in leaked manifests, job posts, and stack traces. Use
    scoped names like `@yourorg/package` for internal packages, point that scope at your private
    registry in `.npmrc`, and reserve the internal names on the public registry with placeholder
    publishes so nobody else can claim them.
13. **Verify documentation examples before copying them into production.** A library can be secure
    internally while its README teaches an insecure usage pattern, and copied examples pass every
    audit because the library code itself is fine. Documented cases include deriving keys with MD5
    single-iteration instead of the library's own PBKDF2, re-adding auth headers after a redirect
    downgrade, unanchored validation regexes that match attacker domains, and `Math.random()` for
    filenames where the library defaults to `crypto.randomBytes`. Treat README code like Stack
    Overflow code, prefer the library's secure internal defaults, validate security-sensitive
    parameters you pass in, and report insecure examples to maintainers.

Also: verify package install instructions against the real source repo and registry before pasting
them into a terminal (checking metadata with `npm info`), stay logged out of npm during daily work
so a stray credential cannot compromise your account, and append `--ignore-scripts` on installs to
cut the arbitrary-command risk.

## @security scenario

```gherkin
@security @owasp:npm @usecase:block-malicious-install
Scenario: A CI install blocks hostile scripts and unverified AI-suggested packages
  Given CI installs dependencies from the committed lockfile with scripts disabled by default
  When a build adds a newly suggested package whose name does not exist on the registry
  Then the existence check fails the build and no install-time script from any dependency runs
  And publishing uses a short-lived trusted-publisher credential rather than a stored long-lived token
```

This scenario is the canonical copy. When you apply this sheet to real code, add it to the repo's
shared feature-file index (see `bdd-comprehensive-testing`, "Storing BDD scenarios permanently")
and wire it into CI (its "CI/CD wiring") so it runs as a blocking autotest in the same place as
every other Gherkin scenario.

## The real guarantee

The thing that actually stops a hostile package is the combination that denies it a foothold: a
lockfile-only install so versions cannot drift, scripts off by default so install hooks cannot run,
an existence and provenance check so squatted names never resolve, and short-lived trusted-publisher
credentials so a leaked token cannot ship a backdoor under your name. The `@security` scenario
proves one hostile install is blocked; these defaults are what make every install and publish safe
by construction. A test is a check; the locked, script-free, verified pipeline is the guarantee.

## Sources

- OWASP NPM Security Cheat Sheet (<https://cheatsheetseries.owasp.org/cheatsheets/NPM_Security_Cheat_Sheet.html>, retrieved 2026-10-11): keeping secrets out of published tarballs, lockfile enforcement, ignoring run-scripts, project-health and vulnerability auditing, artifact governance and signing, responsible disclosure, 2FA, token minimization, typosquatting and slopsquatting, trusted publishers, dependency-confusion prevention, and verifying documentation examples. `[documented]`
