# Logging Vocabulary

## What it is

A shared set of standard names for the security events an application writes to its logs, so that one keyword means the same thing in every service. This is the per-sheet guidance from the OWASP Application Logging Vocabulary Cheat Sheet, condensed to the naming rules, the event groups it covers, and what belongs in a log entry versus what must stay out. When every app emits the same terms, a monitoring team can key alerts off those terms across the whole estate instead of learning each project's private wording.

## The attack it stops

This sheet addresses an incident you cannot detect or reconstruct because the logs are missing, inconsistent, or leaking secrets. If one service calls a failed login `loginError` and another calls it `auth_fail_2`, no single alert catches both, and an attack slides past unnoticed; the cited breach research puts the average time to spot a breach at roughly 200 days. The flip side is just as bad: a log that records a password, token, or key turns the log store itself into the thing an attacker wants to steal. A consistent vocabulary plus strict exclusion of secrets is what makes an attack visible without creating a new target.

## Controls

1. **Trap the event first.** You can only log what your error handling catches, so good exception handling is the starting point. Decide which events matter by threat modeling: what could go wrong, what the impact would be, and who would try it.
2. **Use one entry format.** Write each event as a structured record (the sheet uses JSON) with a fixed set of fields: `datetime`, `appid`, `event`, `level`, `description`, and request context such as `useragent`, `source_ip`, `host_ip`, `hostname`, `protocol`, `port`, `request_uri`, `request_method`, `region`, and `geo`.
3. **Stamp time consistently.** Record every timestamp in ISO 8601 with a UTC offset so entries from different hosts line up.
4. **Name events by convention.** Each `event` value starts with a category prefix, then the action, then optional detail after a colon, as in `authn_login_success:joebob1` or `authz_fail:joebob1,resource`. The prefix is what alerting rules match on.
5. **Cover the standard event groups.** The vocabulary defines prefixes for authentication (`authn`, including lockouts, impossible-travel, and token create/revoke/reuse), authorization (`authz`, including admin actions), input validation (`input`), encryption failures (`crypt`), excessive use and rate limits (`excess`), file uploads (`upload`), sensitive-data create/read/update/delete (`sensitive`), privilege changes (`privilege`), sequence and out-of-order anomalies (`sequence`), session lifecycle (`session`), system and startup/shutdown/crash events (`sys`), user management (`user`), MCP server events such as prompt injection (`mcp`), and outright malicious behavior (`malicious`, covering things like repeated 404s, attack tooling, SQLi probes, CORS and CSP violations, and CSRF).
6. **Treat detail fields as optional and weigh the privacy cost.** Everything after the event type can be left out. Fields like a user IP help detection but may count as personal data under privacy law, so balance their value against your duty as a data steward.
7. **Never log secrets.** Keep passwords, keys, certificates, tokens, source code, and other private or secret values out of log entries entirely.

## @security scenario

```gherkin
@security @owasp:logging-vocabulary @usecase:detectable-auth-events
Scenario: A failed login emits a standard, secret-free security event
  Given an application that logs security events
  When a login attempt fails
  Then a structured event is written whose name uses the standard prefix "authn_login_fail"
  And the entry carries an ISO 8601 timestamp with UTC offset so hosts align
  And the entry contains no password, token, key, or other secret value
```

This scenario is the canonical copy. When you apply this sheet to real code, add it to the repo's shared feature-file index (see `bdd-comprehensive-testing`, "Storing BDD scenarios permanently") and wire it into CI (its "CI/CD wiring") so it runs as a blocking autotest in the same place as every other Gherkin scenario.

## The real guarantee

What actually makes an attack detectable is that every service emits the same event names in the same structured format, so one alert rule matches them all and no entry leaks a secret. The `@security` scenario proves one failed login is named and scrubbed correctly; the shared vocabulary and the exclusion rule are what make every event across every app searchable and safe. A test is a check; the consistent, secret-free event name is the guarantee.

## Sources

- OWASP Application Logging Vocabulary Cheat Sheet (<https://cheatsheetseries.owasp.org/cheatsheets/Logging_Vocabulary_Cheat_Sheet.html>, retrieved 2026-10-11): the event-naming convention, the structured entry format and ISO 8601 timestamp rule, the full list of event-category prefixes, the optional-field privacy guidance, and the rule against logging secrets. `[documented]`
