# LDAP Injection Prevention

## What it is

How to stop LDAP injection: an attacker changing the meaning of an LDAP query by slipping special characters into input that your code pastes into a filter or distinguished name. This is the per-sheet guidance from the OWASP LDAP Injection Prevention Cheat Sheet, condensed to the controls that hold and the attack they stop.

## The attack it stops

When an application builds an LDAP statement from unsanitized user input, an attacker can bend that statement the same way SQL injection bends a query. The sheet shows the insecure pattern of concatenating input straight into a search filter, such as `"(&(uid=" + userInput + ")(objectClass=person))"`, where a crafted `userInput` rewrites the filter's logic. This is common because many LDAP interfaces lack safe parameterized queries and because LDAP is so often used to log users in. The payoff for the attacker is unauthorized access to directory data and changes to the LDAP tree.

## Controls

In the cheat sheet's order of preference:
1. **Escape every variable with the correct LDAP encoding function (primary defense).** Pick the encoder for the context where the value lands:
   - **Search filter context:** escape the characters that have meaning in filters, namely `*`, `(`, `)`, `\`, and NUL, following RFC 4515.
   - **Distinguished name context:** escape the DN special characters `\ # + < > , ; " =` plus leading or trailing spaces.
   - Use a real encoder rather than hand-rolled replacement, for example OWASP ESAPI's `encodeForLDAP(String)` for filter values and `encodeForDN(String)` for DN values, or the .NET `Encoder.LdapFilterEncode(string)` and `Encoder.LdapDistinguishedNameEncode(string)` methods. Prefer a parameterized filter where the API offers one, such as Java's `ctx.search(..., "(&(uid={0})(objectClass=person))", new Object[]{ userInput }, controls)`.
2. **Use a framework that escapes automatically (primary defense).** Where you can, build queries through a library that encodes values for you, such as LINQ to LDAP on .NET, so the escaping is not left to each call site.
3. **Apply least privilege (additional, defense in depth).** Give the LDAP binding account the smallest set of rights possible so a successful injection does less damage.
4. **Add allow-list input validation (additional, defense in depth).** Restrict input to a known-good set of characters and reject the rest before it reaches the query, for example a Java check like `userSN.matches("[\\w\\s]*")` (treat that pattern as illustrative, and choose an allow-list that fits your data). Normalize input before you validate it, and transform any special characters to safe values before adding them to the allow-list expression.

A note on bind authentication: an authenticated LDAP bind does not stop injection, so keep applying filter and DN escaping even when the app binds with valid credentials. Reject empty passwords before binding, because a nonempty name with an empty password can trigger an unauthenticated (anonymous) bind whose success does not prove the user's identity.

## @security scenario

```gherkin
@security @owasp:ldap-injection @usecase:search-filter-injection
Scenario: An LDAP user search rejects a filter injection payload
  Given a directory search endpoint that builds an LDAP filter from a username
  When an attacker submits the username "*)(objectClass=*"
  Then the search returns no unintended entries and the input is rejected
  And the value reaches the filter only as an escaped parameter, never as raw filter syntax
```

This scenario is the canonical copy. When you apply this sheet to real code, add it to the repo's shared feature-file index (see `bdd-comprehensive-testing`, "Storing BDD scenarios permanently") and wire it into CI (its "CI/CD wiring") so it runs as a blocking autotest in the same place as every other Gherkin scenario.

## The real guarantee

The thing that actually makes LDAP injection impossible is context-correct encoding of every untrusted value (or a parameterized filter that does it for you): once `*`, `(`, `)`, and the DN specials are escaped for the exact place they land, no input can become filter or DN syntax. The `@security` scenario proves one payload is rejected; the encoder applied at every call site is what makes every payload safe. A test is a check; the correct LDAP escaping is the guarantee.

## Sources

- OWASP LDAP Injection Prevention Cheat Sheet (<https://cheatsheetseries.owasp.org/cheatsheets/LDAP_Injection_Prevention_Cheat_Sheet.html>, retrieved 2026-10-11): the primary defenses (context-specific escaping for search filters and distinguished names, auto-escaping frameworks), the escape-character sets, the ESAPI and .NET encoder APIs, and the additional defenses (least privilege, allow-list validation, bind-authentication caveats). `[documented]`
