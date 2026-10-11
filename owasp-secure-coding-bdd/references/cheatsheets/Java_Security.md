# Java Security

## What it is

How to keep common Java server code from turning attacker-supplied text into executed commands, queries, markup,
or log forgery, and how to handle cryptography without rolling your own. This is the per-sheet guidance from the
OWASP Java Security Cheat Sheet, condensed to the controls that hold across each injection type plus the crypto
rules, with the attack each one stops.

## The attack it stops

Anyone who can reach the system can send hostile data: outside users, inside users, even admins. When Java code
glues that data into a SQL string, a JPQL string, an OS command, an XPath expression, an HTML response, a NoSQL
query object, or a raw log line, the attacker stops being a value and becomes part of the instruction. The result
is stolen or wrecked data, commands run on the host, cross-site scripting in the browser, or forged log entries
that frame a different user by smuggling in carriage-return and line-feed bytes. On the crypto side, hand-written
or misused primitives (a reused AES-GCM nonce, a raw Diffie-Hellman value used directly as a key) silently break
the confidentiality the code claims to provide.

## Controls

In the cheat sheet's order, per injection context and then cryptography:

1. **General injection stance.** Validate input against an allowlist and sanitize or encode output. When you must
   talk to another system, call the typed API your stack already gives you instead of assembling a command as a
   string.
2. **SQL.** Build every query as a parameterized `PreparedStatement` and bind each value with `setString`,
   `setInt`, and friends, so input is always a bound parameter and never query text.
3. **JPA / JPQL.** Use the Java Persistence query language with bound named parameters (`setParameter`), never a
   query assembled from concatenated input.
4. **Operating system.** Prefer a built-in Java API (for example `InetAddress.isReachable` for a ping) over
   shelling out with a command string you constructed.
5. **XPath.** Supply values through an `XPathVariableResolver` and reference them as `$variables` in the compiled
   expression rather than splicing input into the expression text. Also disable external entity resolution in
   production document parsing.
6. **HTML / JavaScript / CSS (XSS).** Apply context-specific output encoding (the OWASP Java Encoder, e.g.
   `Encode.forHtml`) when you render untrusted text. When markup is intentionally allowed, run it through an HTML
   sanitizer policy (`HtmlPolicyBuilder`) that permits only named elements and attributes. Validating the input
   covers business rules only and is no substitute for the encoding or sanitizing step on output.
7. **LDAP.** Covered by the dedicated LDAP Injection Prevention Cheat Sheet.
8. **NoSQL.** Check the expected type, length, and business format, then pass the value through the driver's typed
   query builder (for example `Filters.eq` with a fixed field name and a string value). Do not concatenate input
   into query text and do not accept client-supplied query or operator objects.
9. **Log injection.** Write logs in a structured format such as JSON (so CR and LF cannot forge new entries),
   cap the length of user-supplied values (for example Log4j `maxStringLength` or a bounded size), use
   parameterized logging with a constant pattern (`logger.warn("Login failed for user {}.", username)`) instead
   of string concatenation, and apply your XSS controls when logs are viewed in a browser.
10. **Cryptography, general.** Never write your own cryptographic routines. Where you can, avoid writing crypto
    at all and lean on a secret-management service, including your cloud provider's. When you must, prefer a
    vetted library such as Google Tink over hand-wiring JCA/JCE, keep your dependencies patched, and design so
    the algorithm can be swapped later.
11. **Encryption at rest.** Follow the algorithm choices in the Cryptographic Storage Cheat Sheet. With AES-GCM,
    use a fresh unique nonce for every operation under a given key and store the key securely.
12. **Encryption in transit.** For hybrid or asymmetric exchange, do not feed a raw Diffie-Hellman or ECDH
    result straight into an AES key; run it through a KDF such as HKDF-SHA-256 for extraction and expansion, and
    authenticate peer public keys independently before use.

## @security scenario

```gherkin
@security @owasp:java @usecase:jpql-parameterization
Scenario: A JPA lookup treats a malicious color name as data, not JPQL
  Given a Java service that loads a Color by friendly name through JPA
  When an attacker submits the name "yellow' OR '1'='1"
  Then the service runs a JPQL query with a bound named parameter for the name
  And the whole string is matched as one literal value so no extra rows are returned
  And nothing the attacker sent is parsed as query syntax
```

This scenario is the canonical copy. When you apply this sheet to real code, add it to the repo's shared
feature-file index (see `bdd-comprehensive-testing`, "Storing BDD scenarios permanently") and wire it into CI
(its "CI/CD wiring") so it runs as a blocking autotest in the same place as every other Gherkin scenario.

## The real guarantee

What actually keeps each context safe is the separation built into the right API: a bound parameter for SQL and
JPQL, a resolver variable for XPath, a typed filter for NoSQL, a context encoder or sanitizer policy for HTML, a
structured layout with a constant pattern for logs, and a vetted library with a fresh nonce and a proper KDF for
crypto. The `@security` scenario proves one JPQL payload is treated as data; the bound parameter is what makes
every payload data. A test is a check; the parameterized call and the typed API are the guarantee.

## Sources

- OWASP Java Security Cheat Sheet (<https://cheatsheetseries.owasp.org/cheatsheets/Java_Security_Cheat_Sheet.html>, retrieved 2026-10-11): the per-context injection defenses (SQL, JPA, OS, XPath, HTML/JS/CSS, NoSQL, log injection) and the cryptography guidance (prefer vetted libraries, AES-GCM nonce handling, KDF before key use). `[documented]`
