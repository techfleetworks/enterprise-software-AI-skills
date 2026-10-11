# XML Security

## What it is

How to process XML safely beyond just external entities: handling malformed documents, validating structure and values against a strict schema, and surviving the resource-exhaustion tricks built into XML itself. This is the per-sheet guidance from the OWASP XML Security Cheat Sheet, condensed to the controls that hold and the attacks they stop. The sheet is long; this file keeps the defenses that hold across parsers and drops the parser-by-parser demos.

## The attack it stops

XML gives attackers several ways in. A malformed document (missing end tags, bad characters, deeply nested open tags) can make a parser spend far more time than a normal document, which an attacker multiplies into denial of service. A document with no schema or a loose schema lets an attacker inject extra tags or out-of-range values: the sheet's bookstore example closes an `id` tag early, slips in a bogus `<price>0</price>`, and buys an item without paying. Entity expansion payloads such as the Billion Laughs document (nested entities `&LOL9;` that fan out to billions of characters) crash the parser on memory or CPU. Remote schemas fetched over plain HTTP, or with loose file permissions, can be swapped (schema poisoning) to change the rules or trigger file retrieval.

## Controls

In the order the cheat sheet presents them:
1. **Use a standards-compliant parser and stop on the first fatal error.** When a document is malformed, let the parser fail, show an error, and do no further processing. Do not turn on "recovery" modes for untrusted input; their results are unpredictable and can corrupt data.
2. **Watch for asymmetric processing cost.** Compare the time a parser spends on a normal document versus a malformed version; a large gap is a DoS risk, especially when combined with an XML flood of many documents.
3. **Give every document a precise XML Schema (XSD), not a DTD.** A DTD cannot express tight restrictions; XSD can, so prefer it and validate against it.
4. **Validate the structure, not just well-formedness.** Reject documents with unexpected extra elements or elements in the wrong order, so tricks like the early-closed `id` tag fail.
5. **Pick the correct data type for each value.** Use `positiveInteger` where only positive numbers make sense (prevents a negative `quantity` crediting an account), use `decimal` for prices so `Infinity` and `NaN` are rejected, and avoid types whose special values can break math.
6. **Forbid divide-by-zero inputs.** Where a value is used as a denominator, constrain it to `positiveInteger` or add an assertion that it is not zero.
7. **Constrain every value with the tightest rule available:**
   - `enumeration` to allow only a fixed set (months, status colors, and so on): the ideal allow-list.
   - `minLength` / `maxLength` / `length` to bound string sizes and avoid overflow or underflow.
   - `pattern` to force a syntax, for example an SSN pattern `[0-9]{3}-[0-9]{2}-[0-9]{4}`.
   - `assertion` to express a custom rule against `$value`.
   - `minOccurs` / `maxOccurs` to bound how many of an element can appear. Never leave `maxOccurs="unbounded"` for untrusted input; set a real maximum.
8. **Defend against jumbo and small-but-explosive payloads.** Bound overall document size, element depth, and attribute count so depth and width attacks cannot exhaust resources; remember a tiny document can reference a huge external resource.
9. **Block entity-expansion attacks.** Billion Laughs, quadratic blowup, and recursive entity references all rely on DTD entities, so disable DTDs (see the XML External Entity Prevention guidance) or cap expansion hard. SOAP forbids DTDs outright; reject SOAP messages that carry one.
10. **Prevent schema poisoning.** Use a local, known-good copy of the schema instead of the reference inside the document; integrity-check the schema file; set file permissions so only trusted users can edit local schema files.
11. **Protect remote schema retrieval.** Fetch remote schemas only over HTTPS, keep certificate and hostname verification on, and stop retrieval if verification fails, so man-in-the-middle and DNS-cache poisoning cannot substitute content. Remember that a compromised legitimate host still serves bad content, so third-party-hosted schemas carry trust risk.
12. **Treat external entities and parameter entities as SSRF and file-retrieval vectors.** They can read local files, trigger outbound DNS and HTTP connections, scan internal ports, and brute-force credentials embedded in a URI; the only safe default is to not resolve them.

## @security scenario

```gherkin
@security @owasp:xml-security @usecase:schema-structure-tampering
Scenario: A loose XML document is rejected by strict schema validation
  Given an endpoint that validates each XML order against a strict XSD before processing
  When an attacker submits an order that closes the id tag early and injects an extra price element set to 0
  Then schema validation fails because the structure does not match the defined sequence
  And the order is rejected so the tampered zero price is never processed
```

This scenario is the canonical copy. When you apply this sheet to real code, add it to the repo's shared feature-file index (see `bdd-comprehensive-testing`, "Storing BDD scenarios permanently") and wire it into CI (its "CI/CD wiring") so it runs as a blocking autotest alongside every other Gherkin scenario.

## The real guarantee

The thing that actually makes structure and value tampering impossible is strict schema validation against a local, trusted XSD that pins every element's type, order, length, range, and count, run before the application reads any value. The `@security` scenario proves one tampered order is rejected; the strict schema is what makes every out-of-shape or out-of-range document fail the same way. A test is a check; the enforced schema (plus disabled DTDs for the expansion attacks) is the guarantee.

## Sources

- OWASP XML Security Cheat Sheet (<https://cheatsheetseries.owasp.org/cheatsheets/XML_Security_Cheat_Sheet.html>, retrieved 2026-10-11): handling malformed documents and recovery-mode risk, strict XSD validation of structure and data types (enumeration, length, pattern, assertion, occurrences), jumbo and entity-expansion payloads (Billion Laughs, quadratic blowup, recursive references), schema poisoning (local permissions, HTTPS, DNS), and the SSRF, port-scan, and file-retrieval uses of entities. `[documented]`
