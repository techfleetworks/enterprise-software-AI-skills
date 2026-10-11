# Input Validation

## What it is

How to confirm that incoming data fits what the application expects before any code acts on it. This is the per-sheet guidance from the OWASP Input Validation Cheat Sheet, condensed to the controls that hold and the trouble they head off. It also marks the line the sheet draws: validation reduces bad data, but it does not replace parameterized queries, output encoding, or authorization.

## The attack it stops

Loose input lets malformed, oversized, or nonsensical data reach business logic and storage, which drives invalid operations and resource exhaustion, and widens the door for injection and cross-site scripting downstream. The sheet gives a plain contrast: trying to block every bad string, such as rejecting apostrophes, throws out legitimate names like `O'Brien` while doing nothing to make a database query safe. It also warns about depth: converting text to an integer only fixes the type, it does not prove the quantity is acceptable, and a client-side check is trivially bypassed, so a server that trusts it accepts whatever an attacker sends.

## Controls

In the order the sheet presents them:

1. **Validate syntax and semantics.** Check the expected type and format, and also whether a value is reasonable for the action being performed (say, a booking whose end date lands after its start date, with related fields kept consistent).
2. **Define rules per field.** Fixed choices must be exact members of the allowed set (including drop-down values). Numbers and dates need type, format, and min/max bounds. Strings need length limits and required characters or structure. Objects need a defined set of permitted fields, a set of mandatory ones, and handling for entries that are absent or null. Arrays need min/max counts and validation of every item, including nested objects.
3. **Prefer allow-lists over deny-lists.** State what you accept and reject the rest; do not try to enumerate every malicious string. For free-form comments, an allow-list can permit broad Unicode while capping length, rather than forcing letters and digits only.
4. **Parse safely, then validate.** Enforce request size limits before buffering or parsing, and set parser limits such as maximum nesting depth (JSON allows limits on size, depth, and numbers). Use a maintained parser for the format, handle parse failures, and validate the parsed values before you process or store them.
5. **Decode once, in protocol order.** Decode according to the protocol, then validate the exact representation you will use, and do not decode it again downstream, since inconsistent decoding can void an earlier check.
6. **Validate structured data with a schema.** Use your framework's validators or a schema validator, and explicitly configure required and additional properties (listing a property does not make it required or reject unknown fields). Apply schemas to nested objects and set array item schemas and length limits. Keep business checks, like date ordering, next to the structural ones. Reject invalid requests with a clear error instead of continuing on partial data, and bind only the intended fields to your objects (see Mass Assignment).
7. **Handle free-form Unicode carefully.** Agree on one character encoding across components and reject malformed input, while preserving real punctuation and scripts in names and comments. Where consistent comparison needs normalization, apply the same normalization policy before validation, storage, and comparison; and recall that normalizing is not the same as sanitizing and is no stand-in for output encoding.
8. **Use regular expressions only for simple, structured fields.** Require a whole-value match (for example `fullmatch`), bound input length before matching, avoid catastrophic backtracking, prefer a non-backtracking engine or a match timeout, and treat a timeout as a validation failure. Test valid, invalid, and near-miss values.
9. **Sanitize rich content with a real library.** For user-authored HTML, use a maintained HTML sanitizer; validation and regexes cannot stand in for it.
10. **Treat uploads as untrusted metadata.** Validate filenames after protocol decoding and do not trust the extension or content type as proof of safe content; follow the File Upload sheet for content, size, storage, and serving.
11. **Validate email with a maintained library,** matching the addresses your mail system supports; format validity does not prove the mailbox exists or is owned by the sender.

The sheet also lists common pitfalls to avoid: relying on client-only checks, trusting data from internal APIs, feeds, queues, or stored records once it crosses a trust boundary, deny-listing or "cleaning" input, stopping at parsing or outer fields, assuming regex or Unicode normalization makes data safe, trusting upload metadata, and logging rejected input verbatim (record the failure and metadata without secrets or full bodies, and escape any untrusted value you keep so it is safe for the log format, which stops log injection).

## @security scenario

```gherkin
@security @owasp:input-validation @usecase:booking-date-order
Scenario: A booking request with an end date before its start date is rejected
  Given a booking endpoint that validates syntax and semantics on the server
  When a client submits a start date of "2026-05-10" and an end date of "2026-05-01"
  Then the request is rejected with a clear validation error
  And no partially validated booking is created or stored
```

This scenario is the canonical copy. When you apply this sheet to real code, add it to the repo's shared feature-file index (see `bdd-comprehensive-testing`, "Storing BDD scenarios permanently") and wire it into CI (its "CI/CD wiring") so it runs as a blocking autotest in the same place as every other Gherkin scenario.

## The real guarantee

The mechanism that actually holds is server-side validation against per-field allow-list rules that cover both syntax and semantics, applied before any business logic runs and never delegated to the client. The `@security` scenario proves one bad request is turned away; the server-enforced rule set is what turns away every request that breaks the field's contract. A test is a check; the server-side allow-list rule is the guarantee. Validation still is not a substitute for parameterized queries, output encoding, or authorization, which defend the places validation cannot.

## Sources

- OWASP Input Validation Cheat Sheet (<https://cheatsheetseries.owasp.org/cheatsheets/Input_Validation_Cheat_Sheet.html>, retrieved 2026-10-11): the syntax-and-semantics strategy, per-field rule table, allow-list preference, parse-then-validate and decode-once guidance, schema validation, free-form Unicode and regex handling, rich-content, upload, and email rules, and the list of common pitfalls. `[documented]`
