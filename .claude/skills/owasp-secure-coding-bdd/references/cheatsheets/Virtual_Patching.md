# Virtual Patching

## What it is

How to block a known flaw at an enforcement layer, such as a WAF, while the real code fix is still
being built, so the window of exposure shrinks without touching the vulnerable application. This is
the per-sheet guidance from the OWASP Virtual Patching Cheat Sheet, condensed to the methodology and
the gap it covers.

## The attack it stops

The failure here is the long wait between the day a flaw becomes known and the day a code fix ships.
In the real world a source fix is often slow: the developers are busy, the code belongs to a vendor
you cannot edit, or a change means a whole new project. During that gap the known exploit path stays
open and attackers use it. A virtual patch cuts that gap by catching the matching attack traffic at
a filtering layer right away. It is not a substitute for the code fix: it only covers traffic the
layer inspects and attack shapes its rules recognize, so you still finish the real fix and keep
testing for ways around the rule.

## Controls

The cheat sheet frames virtual patching as a repeatable workflow that mirrors incident response, with
two guiding tenets for the rules themselves.

Set up before any incident (Preparation):
- **Watch for vulnerability news.** Subscribe to vendor alert lists for the commercial software you
  run, so you learn about flaws and their patches early.
- **Pre-authorize the process.** Agree on a fast review-and-rollout path ahead of time. Test both
  attack payloads and normal user workflows, since an over-broad rule can block valid transactions
  even with the code unchanged. Define your monitoring and rollback triggers before you turn on
  blocking.
- **Install the tool in advance.** Deploy the enforcement layer (for example ModSecurity, embedded or
  as a reverse proxy) before you need it, so you are not seeking approvals mid-incident. Keep it ready
  even if you do not use it day to day.
- **Log carefully.** Capture the rule ID, time, affected endpoint, the enforcement outcome, and a
  correlation ID. Do not blindly record full query strings, headers, cookies, or bodies, because
  alerts can leak passwords and payment data; redact sensitive fields first.

Learn of the flaw (Identification). This comes either proactively, through your own penetration tests
and source-code reviews, or reactively, through a vendor pre-warning, a public disclosure, or a live
security incident, with an active attack being the most urgent case.

Study the flaw (Analysis):
1. Decide whether virtual patching even fits; it suits injection-style flaws best and may not cover
   other categories well.
2. Log the flaw in your ticketing system (Jira, ThreadFix, or similar) for tracking and metrics.
3. Name it with a public identifier such as a CVE, or assign your own ID if you found it yourself.
4. Rate its impact, since an information leak is not the same severity as an injection flaw.
5. Record which software versions are affected.
6. Note the configuration needed to trigger it, since some flaws only appear under certain settings.
7. Collect any proof-of-concept code or payloads, which help you build and test the patch.

Write the rule (Virtual Patch Creation), aiming for two tenets: no false positives (never block
legitimate traffic) and no false negatives (never miss the attack, even when the attacker tries to
evade). You cannot always hit both perfectly, so treat it as risk reduction, not a complete fix.
- **Prefer a positive (allow-list) model.** Define exactly what valid input looks like (character
  set, length, and so on) and reject the rest. Review your audit logs to learn the expected input, for
  example a `reqID` parameter that should only be digits, then write a rule that accepts only that.
  This gives stronger protection but is manual and harder to scale across a large or dynamic site, so
  apply it selectively at the flagged location.
- **Use a negative (block-list) model when speed matters.** Detect the specific known attack, for
  example a single quote used to break out of a query. These rules go up faster but are more prone to
  evasion.
- **Avoid exploit-specific rules.** Do not just block the exact payload from the report, such as one
  literal `<script>alert('XSS Test')</script>` string; a rule that narrow has little lasting value.
- **Automate at scale.** When flaws pile up, convert tool output (for example XML from a DAST scan)
  into rules using CRS scripts, ThreadFix, or a WAF's own import feature.

Roll out and verify (Implementation/Testing). Start every rule in log-only mode to confirm it does
not block real users, request a retest from whoever found the flaw, and if an evasion gets through, go
back to Analysis and tighten the rule. Use tools beyond a browser, such as `curl`, `wget`, or a local
proxy like ZAP, to exercise the patch.

Close the loop (Recovery/Follow-Up). Record the virtual patch in your normal change-management and
patch-management process with proper tickets and the rule IDs. Re-assess periodically so you can
retire the virtual patch once the real code fix lands, and run reports on which patches have fired to
show the value they delivered during the exposure window.

## @security scenario

```gherkin
@security @owasp:virtual-patching @usecase:block-known-injection
Scenario: A WAF rule blocks a known injection flaw before the code fix ships
  Given a known SQL injection flaw in the reqID parameter of a vendor plugin
  And an allow-list virtual patch that accepts only integer values for reqID
  When an attacker sends reqID=1' or 1='1 to the affected endpoint
  Then the enforcement layer rejects the request and logs the rule ID
  And a normal request with reqID=42 is allowed through unchanged
```

This scenario is the canonical copy. When you apply this sheet to real infrastructure, add it to the
repo's shared feature-file index (see `bdd-comprehensive-testing`, "Storing BDD scenarios
permanently") and wire it into CI (its "CI/CD wiring") so it runs as a blocking autotest in the same
place as every other Gherkin scenario. Run the rule in log-only mode first, and keep the legitimate
request in the scenario so CI catches a rule that starts blocking valid traffic.

## The real guarantee

The thing that actually shrinks the exposure window is the enforcement-layer rule standing in front
of the flaw, plus the discipline to keep the real code fix moving. The `@security` scenario proves one
payload is blocked and one valid request still passes; the rule and the ongoing code fix are what
protect users until the vulnerability is gone. A test is a check; the virtual patch is a stopgap, and
the code fix is the guarantee that finally removes the flaw.

## Sources

- OWASP Virtual Patching Cheat Sheet (<https://cheatsheetseries.owasp.org/cheatsheets/Virtual_Patching_Cheat_Sheet.html>, retrieved 2026-10-11): the six-phase methodology (preparation, identification, analysis, patch creation, implementation/testing, recovery), the positive-vs-negative rule models, the no-false-positive/no-false-negative tenets, and the ModSecurity allow-list example. `[documented]`
