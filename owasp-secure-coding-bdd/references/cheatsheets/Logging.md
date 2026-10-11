# Logging

## What it is

How to build application logging that is actually useful for security: recording the right events
with enough detail to investigate, while keeping secrets out, resisting tampering, and surviving
attack. This is the per-sheet guidance from the OWASP Logging Cheat Sheet, condensed to the
controls that hold and the failures they prevent.

## The attack it stops

Logs are a defense, so attackers target them, and weak logging fails you in two directions. If you
log too little, a credential-stuffing or account-takeover run leaves no trace and you learn about
the breach far too late. If you log carelessly, you create new holes: passwords, tokens, or PII
land in a file that becomes a prize for an attacker; unsanitized input lets someone forge or wreck
entries by injecting carriage returns and line feeds (log injection, CWE-117); and a flood of
entries fills the disk and takes the service down. The sheet frames these as attacks on log
confidentiality, integrity, availability, and accountability, including an attacker who forges
entries or erases their own tracks. The controls below make logs both informative and hard to
abuse.

## Controls

The sheet's guidance, grouped as it presents it:

1. **Log security events from the application code itself,** which knows the user, roles, and
   context that infrastructure logs cannot see. Treat any event data from another trust zone as
   untrusted.
2. **Always log the key security events:** input and output validation failures; authentication
   successes and failures (repeated failures flag brute-force, credential-stuffing, and spraying);
   authorization failures; session-management failures; application errors and system start-ups,
   shut-downs, and logging initialization; use of higher-risk functions (user administration,
   admin privileges, default or break-glass accounts, access to sensitive data, key use or
   rotation, system-object create or delete, data import and export, user-generated content
   especially file uploads, deserialization failures, backend TLS and certificate failures);
   legal opt-ins; and suspicious business-logic activity such as out-of-order steps or limit
   evasion.
3. **Record "when, where, who, and what" for each entry:** timestamps in a standard format, an
   interaction identifier, the app and host identity, the code or page location, the source
   address and user identity, and the event type, severity, and description. Add action, object,
   result, and reason where useful.
4. **Never log sensitive data.** Keep out passwords, session IDs (hash if you must track them),
   access tokens, encryption keys and secrets, connection strings, payment or bank data, source
   code, regulated or non-consented data, and PII. Mask, hash, or sanitize what remains. Only log
   what is legally allowed, and never drop events just because they come from "known" users.
5. **Sanitize and encode every logged value** to stop log injection: neutralize CR, LF, and
   delimiter characters, and encode for the output format. If writing to a database, apply the SQL
   Injection guidance.
6. **Validate event data from other trust zones before logging.** If a field is malformed, omit or
   safely replace it and record the validation failure with bounded context, rather than throwing
   away the whole event.
7. **Store and transmit logs safely.** Prefer a separate partition or a dedicated write-only
   database account, keep logs out of web-accessible paths, and send to a central system (SIEM)
   using a standard format such as syslog over TLS.
8. **Make logging robust.** A failure in the logging path must not crash the app or leak data, and
   logging must not be exploitable to exhaust disk or transaction-log space (a DoS route).
9. **Keep logging controllable but not defeatable.** Allow log-level changes through approved
   change control only; never allow logging, or compliance-required events, to be switched off
   entirely; verify the level periodically.
10. **Build one shared log handler,** ideally a tested, reusable module, rather than ad-hoc logging
    scattered across the code.
11. **Verify logging like any other feature:** include it in code review and security, fuzz,
    penetration, and performance testing; confirm events are classified consistently; test
    behavior when connectivity, disk, or write permissions fail; and check access controls on the
    stored logs.
12. **Protect logs at rest and in transit.** Add tamper detection, copy to read-only media
    quickly, restrict and review read access, record all access, and use secure transport over
    untrusted networks.
13. **Monitor, alert, and dispose on schedule.** Feed logs into existing monitoring, alert
    responsible teams on serious events, and keep data for the required retention period and no
    longer.

## @security scenario

```gherkin
@security @owasp:logging @usecase:no-secret-and-no-injection
Scenario: A failed login is logged safely without secrets or injected entries
  Given an authentication endpoint that logs security events through the shared log handler
  When an attacker submits a wrong password containing carriage-return and line-feed characters
  Then one authentication-failure event is recorded with user, source address, and timestamp
  And the password is absent and the CR and LF characters are neutralized so no forged line is written
```

This scenario is the canonical copy. When you apply this sheet to real code, add it to the repo's
shared feature-file index (see `bdd-comprehensive-testing`, "Storing BDD scenarios permanently")
and wire it into CI (its "CI/CD wiring") so it runs as a blocking autotest in the same place as
every other Gherkin scenario.

## The real guarantee

What actually makes logging a defense rather than a liability is the shared handler that logs the
right security events, strips secrets, and encodes every value before it is written. The
`@security` scenario proves one failed login is recorded safely and cannot be poisoned; the shared
handler and its sanitize-and-encode step are what make that hold for every event. A test is a
check; the centralized, sanitizing log handler is the guarantee.

## Sources

- OWASP Logging Cheat Sheet (<https://cheatsheetseries.owasp.org/cheatsheets/Logging_Cheat_Sheet.html>, retrieved 2026-10-11): the security events to log, the when/where/who/what attributes, the data to exclude, log-injection sanitization and encoding, the shared handler and verification steps, log storage and protection at rest and in transit, and the attacks-on-logs model summarized above. `[documented]`
