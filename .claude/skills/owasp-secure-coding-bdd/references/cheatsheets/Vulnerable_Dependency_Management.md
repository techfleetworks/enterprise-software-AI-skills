# Vulnerable Dependency Management

## What it is

How to react when a third-party library your project depends on turns out to carry a known
security flaw: how to confirm it, who decides whether to accept the risk, and which path to take
depending on whether a fixed version exists yet. This is the per-sheet guidance from the OWASP
Vulnerable Dependency Management Cheat Sheet, condensed to the controls that hold and the attack
they stop.

## The attack it stops

Projects lean on outside libraries to handle parsing, HTTP, file formats, and more, which means
part of the application's security now rests on code the team did not write. This is the risk
behind "using components with known vulnerabilities." When a flaw in such a library becomes public
and the project keeps shipping the affected version, an attacker can reach the weak code through
the application and exploit it. Scanning early and handling each finding deliberately, rather than
silencing the alert, is what keeps a known flaw from staying live in production.

## Controls

In the cheat sheet's order:
1. **Scan from day one, and use good tooling.** Run automated dependency analysis from the start
   of the project rather than bolting it on near the end, when the backlog of findings can stall
   the work. Pick a scanner that pulls from several trustworthy feeds, so it catches both
   responsibly disclosed flaws (which usually get a `CVE` in the public database) and
   full-disclosure flaws (which often never get a CVE and can slip past tools that read only one
   source). Make sure the tool can mark a finding as a false positive. Free options named include
   `OWASP Dependency-Check`, `npm audit`, `OWASP Dependency-Track`, `Trivy`, and `Grype`;
   commercial ones include `Snyk`, `JFrog Xray`, and `Renovate`.
2. **Route the risk-acceptance decision to the right person.** If someone wants to accept the risk
   of a finding instead of fixing it, that call belongs to the Chief Risk Officer (or the CISO as
   a fallback), based on the development team's technical analysis and the flaw's `CVSS` score,
   not to a developer acting alone.
3. **Act on the direct dependency, not the transitive one.** When the flaw lives in a transitive
   dependency, make the change at the first-level dependency that pulls it in, because editing a
   transitive dependency directly tends to destabilize the application and requires fully tracing
   the chain of calls, which is slow.
4. **Case 1 - a patched version exists.** Bump the dependency on a test environment and run the
   suite. If everything passes, promote it. If a call signature changed, adapt your code and
   re-run. If the fix only lands in a breaking major version or is pinned by a transitive
   dependency, move to Case 5 and use Case 2 as an interim shield. If the new version needs a
   runtime you cannot provide yet, raise it with the provider and apply Case 2 while you wait.
5. **Case 2 - a fix is coming but will take months.** If the provider gives a workaround, apply
   and validate it, then deploy. Find the reachable calls into the affected functions and the
   conditions needed to exploit them; wrap a call with an allow-list check only when that check
   blocks the exploit conditions on every affected path, otherwise disable or isolate the feature.
   Treat any wrapper as temporary and keep the real upgrade on the plan. Reuse a provider-supplied
   exploit as a regression test, but do not assume blocking that one payload means safety: try
   variants and every reachable path. Note the handled `CVE` in the project README, and if you add
   the dependency to an ignore list, scope the entry to that one CVE so other flaws in the same
   library still surface.
6. **Case 3 - no fix will ever come.** This is the costly last-resort path where the only input is
   the `CVE`. Locate where the dependency is used (the IDE or package manager helps for transitive
   cases), then read the CVE description plus the upstream advisory, issue, and fix to learn the
   real defective behavior and the exact change needed; a weakness category alone does not tell you
   what check prevents exploitation. Write a unit test that reproduces the flaw, and hold your
   in-house patch to a strict bar: the test must fail against the unpatched library and pass
   against the patched one, the library's own tests must still pass, and only then suppress the
   scanner alert, scoped per CVE. Expect the tool to keep flagging the version anyway, since a
   version number does not reveal whether a fix was applied. For an open-source library, consider
   contributing your patch upstream.
7. **Case 4 - the provider does not know yet.** When you learn of the flaw from a full-disclosure
   post or a penetration test, notify the provider first. If they cooperate, follow Case 2; if not,
   follow Case 3, analyzing the disclosure post or pentest findings in place of a CVE writeup.
8. **Case 5 - a fix exists but you cannot adopt it.** The fix is public but stuck on a version
   line you cannot run (breaking major, transitive pin, or an unmaintained line). Confirm the
   upgrade is truly blocked by attempting it as in Case 1, and record the exact blocker to re-test
   later. Then backport: isolate only the security-relevant change from unrelated refactoring,
   keep the patch minimal, and verify it with a test that fails unpatched and passes patched while
   both test suites stay green. Publish the patched artifact to the registry or proxy the build
   already trusts, give it a version traceable to the upstream it came from, and record its
   provenance. Expect the scanner to keep flagging it, so suppress per CVE. Treat the backport as a
   standing commitment, re-patching each new release and CVE, and drop it the moment the fixed
   version becomes adoptable.
9. **Prefer maintained backports over private patches where you can.** When the dependency is an
   operating system package, use the patched build the distribution ships (Debian and Red Hat backport
   fixes into the shipped stable version) instead of keeping a private patch. For language
   packages, weigh maintaining the patch yourself against paying a provider, judging a provider on
   ecosystem and severity coverage, published patch and provenance, delivery as a drop-in artifact,
   and a clean exit path.

## @security scenario

```gherkin
@security @owasp:dependency-management @usecase:known-cve-remediation
Scenario: A known-vulnerable dependency is remediated and proven, not just silenced
  Given a scanner flags a direct dependency for a published CVE
  When the team applies the fix path for the case that matches the finding
  Then a test reproducing the flaw fails against the vulnerable version and passes against the fixed one
  And any scanner suppression is scoped to that single CVE after the test proves the fix
```

This scenario is the canonical copy. When you apply this sheet to real code, add it to the repo's
shared feature-file index (see `bdd-comprehensive-testing`, "Storing BDD scenarios permanently")
and wire it into CI (its "CI/CD wiring") so it runs as a blocking autotest in the same place as
every other Gherkin scenario.

## The real guarantee

The thing that actually closes a vulnerable dependency is a test that fails on the broken version
and passes on the fixed one, tied to a remediation applied at the direct dependency: it proves the
flaw is gone rather than hidden. Silencing the scanner or editing a version string records a fix
without making one. The `@security` scenario proves one CVE is remediated and verified; the
failing-then-passing test and the scoped suppression are what keep every handled flaw honest. A
test is a check; the reproduced-and-fixed flaw is the guarantee.

## Sources

- OWASP Vulnerable Dependency Management Cheat Sheet (<https://cheatsheetseries.owasp.org/cheatsheets/Vulnerable_Dependency_Management_Cheat_Sheet.html>, retrieved 2026-10-11): disclosure types and detection tooling, the Chief Risk Officer risk-acceptance decision, acting on direct over transitive dependencies, the five remediation cases including in-house patching and backporting, and preferring maintained backports. `[documented]`
