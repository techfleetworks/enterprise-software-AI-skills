# Secure Code Review

## What it is

Secure code review is a human reading source by hand to find the security flaws that scanners miss: logic
holes, broken trust boundaries, and context that only a person understands. It backs up SAST and DAST rather
than replacing them, and it comes in two shapes: a baseline pass over the whole codebase, and a diff pass over
just the change in a pull request. This is the per-sheet guidance from the OWASP Secure Code Review Cheat
Sheet, condensed to the practice and the gap it closes.

## The attack it stops

Automated tools are good at flagging known-bad patterns, but they cannot judge whether a workflow can be
skipped, whether one user can reach another user's record, or whether an access check actually runs after
login. When no human traces that logic, those flaws ship. An attacker then walks a multi-step process out of
order, swaps an object id to read someone else's data, or hits an admin route that was never guarded, and the
code passed every scan on the way in. Manual review is what catches the business-logic and authorization gaps
that no linter is shaped to see.

## Controls

Follow the sheet's methodology and checklist, in order:
1. **Prepare before reading.** Learn the architecture and business goals, pull in the threat model and past
   findings, and mark the high-risk, high-value parts. For a baseline pass also map every boundary and
   dependency and audit third-party libraries; for a diff pass identify the changed files, judge the impact on
   existing controls, and rank the risky edits first.
2. **Work a defined process.** A baseline review steps through architecture anti-patterns, entry points and
   input validation, authentication and authorization, data flow, business logic, crypto, error handling, and
   configuration. A diff review checks impact on current controls, new attack paths, security at changed
   boundaries, new integrations, and that nothing regressed.
3. **Hunt the common vulnerability classes.** Weak or missing server-side validation; injection in all its
   forms (SQL, XSS, path traversal, command, NoSQL); broken authentication and session handling; missing or
   bypassable access control; unsafe deserialization and XXE; and flawed cryptography.
4. **Trace data end to end.** Find every source (user input, uploads, API calls, DB reads, environment), follow
   it through validation and transformation, and check every sink (queries, file writes, rendered output, logs,
   outbound calls). Confirm validation and encoding at each trust boundary and that sensitive data is
   classified and protected.
5. **Review against attacker models.** Line up the work with the OWASP Top 10, STRIDE, attack trees, and abuse
   cases, and confirm defense in depth rather than a single control.
6. **Walk the checklists.** Server-side and allow-list validation, context-correct output encoding, safe file
   uploads, parameterized queries; strong password hashing, lockout, high-entropy session tokens, proper
   session lifecycle, MFA, secure cookie flags; server-side and default-deny authorization, IDOR and privilege-
   escalation checks, centralized decisions; strong algorithms and key management, certificate and hostname
   validation, secure randomness, correct IV and nonce handling; workflow and transaction integrity, race-
   condition and resource limits; secure defaults, no hardcoded secrets, safe error handling and logging,
   security headers, strong TLS, patched dependencies; and logging of security events with protected,
   tamper-resistant audit trails.
7. **Record each finding and wire it into the SDLC.** Write every issue up with type, severity, CWE, location,
   impact, and a concrete fix; run baseline reviews at project start, major releases, architecture changes, and
   after incidents, and diff reviews on every pull request and hotfix.

## @security scenario

```gherkin
@security @owasp:code-review @usecase:manual-review-gate-on-changes
Scenario: A risky change cannot merge without a secure code review
  Given a pull request that adds an endpoint returning a record by id
  When the change is opened for merge
  Then a security-focused review runs against the authorization and data-flow checklist
  And the review confirms the endpoint checks that the caller owns the requested record
  And the change is blocked from merging until any finding is fixed or formally accepted
```

This scenario is the canonical copy. When you apply this sheet to real code, add it to the repo's shared
feature-file index (see `bdd-comprehensive-testing`, "Storing BDD scenarios permanently") and wire it into CI
(its "CI/CD wiring") so the review gate runs as a blocking autotest in the same place as every other Gherkin
scenario.

## The real guarantee

What actually closes the gap is a human tracing logic and trust boundaries that tools cannot reason about: a
person following the data, asking whether a step can be skipped or an object swapped, and confirming the access
check runs. The `@security` scenario proves the review gate fires on a risky change; the reviewer's judgment
against the checklist is what finds the flaw. A test is a check; the manual review is the guarantee.

## Sources

- OWASP Secure Code Review Cheat Sheet (<https://cheatsheetseries.owasp.org/cheatsheets/Secure_Code_Review_Cheat_Sheet.html>, retrieved 2026-10-11): the baseline and diff methodologies, the vulnerability classes, the data-flow and threat-based techniques, the review checklists, and the SDLC integration summarized above. `[documented]`
