# XPath Injection Prevention

## What it is

How to stop XPath injection: an attacker making external input become part of an XPath expression's syntax so it changes which data the query selects from an XML document. This is the per-sheet guidance from the OWASP XPath Injection Prevention Cheat Sheet, condensed to the controls that hold and the attack they stop.

## The attack it stops

XPath pulls data out of XML documents. The flaw appears when input is concatenated into the expression text, letting the attacker rewrite the query's meaning instead of just supplying a value. The sheet's safe example shows the shape to aim for: an expression like `/catalog/book[@id=$book_id]` stays fixed while the external `requested_id` is supplied only as the value of `$book_id`. If that id were pasted into the string instead, an attacker could alter the predicate and read records the query was never meant to return. Note that compiling an expression does not separate its data from its syntax, so compiling a concatenated string is still vulnerable.

## Controls

In the cheat sheet's order of preference:
1. **Bind values to fixed expressions (primary defense).** Use an XPath API that supports variables, write the whole expression in application code, and pass external values separately, for example Python lxml's `xpath("/catalog/book[@id=$book_id]", book_id=requested_id)`. Never concatenate or interpolate input into the expression, even when you compile it afterward. For Java, use the resolver pattern from the Java Security Cheat Sheet. Check your API's docs, because accepting an XPath string or compiling it does not by itself mean the API binds variables.
2. **Fall back safely when the API cannot bind.** If binding is not available, switch to an API that supports it. When even that is impossible, run a fixed expression that returns an authorized record set, then do the matching against those values inside the application itself. Patching strings with hand-rolled quote escaping is no replacement for genuine variable binding.
3. **Keep the query structure under application control.** XPath variables stand in for values, not for expression fragments. If a user selects among query modes, translate each selection into one of several whole, predefined expressions the application owns, for instance routing `books` and `magazines` to `/catalog/book` and `/catalog/magazine`. Reject unknown choices, and never let users supply predicates, operators, function calls, or raw path pieces.
4. **Validate input as a complement, not a substitute.** Check values against expected types, lengths, and business rules per the Input Validation Cheat Sheet. Validation adds to binding; it does not make a dynamically built XPath expression safe on its own.
5. **Keep these separate controls in place (limit exposure and review).**
   - **Authorization:** verify that the caller is allowed to reach each resource it asks for; locking the query shape, constraining the path, or binding the identifier proves none of that by itself, so enforce least privilege.
   - **Error handling:** never expose raw XPath queries, document contents, or stack traces in messages returned to callers. Blanket error responses cut down on information leakage but stop no injection on their own.
   - **XML parsing:** harden the parser per the XML External Entity Prevention Cheat Sheet. Parser hardening addresses parser risks, not unsafe XPath construction, and binding values does not harden the parser.
   - **Code review:** locate each site that runs or compiles an XPath query, follow every expression back to text the application controls, and make sure outside values arrive there solely by means of bound variables. Confirm that unrecognized query-mode selections are turned away, and add correctness coverage for normal valid inputs, records that are absent, and attempts to read resources beyond what the caller may see.

## @security scenario

```gherkin
@security @owasp:xpath-injection @usecase:predicate-injection
Scenario: An XML catalog lookup rejects an XPath predicate injection payload
  Given a catalog endpoint that selects a book by id from an XML document
  When an attacker submits the id "1' or '1'='1"
  Then no unauthorized books are returned and the input is treated as a plain value
  And the id reaches the expression only as a bound variable, never as XPath syntax
```

This scenario is the canonical copy. When you apply this sheet to real code, add it to the repo's shared feature-file index (see `bdd-comprehensive-testing`, "Storing BDD scenarios permanently") and wire it into CI (its "CI/CD wiring") so it runs as a blocking autotest in the same place as every other Gherkin scenario.

## The real guarantee

The thing that actually makes XPath injection impossible is variable binding: the expression text is fixed in application code and the external value flows in only as a bound variable, so input can never become query syntax. The `@security` scenario proves one predicate payload is rejected; the bound variable (or a fixed expression plus in-code comparison) is what makes every payload safe. A test is a check; the bound XPath variable is the guarantee.

## Sources

- OWASP XPath Injection Prevention Cheat Sheet (<https://cheatsheetseries.owasp.org/cheatsheets/XPath_Injection_Prevention_Cheat_Sheet.html>, retrieved 2026-10-11): variable binding to fixed expressions, keeping query structure application-controlled with mapped choices, input validation as a complement, and the separate authorization, error-handling, XML-parsing, and code-review controls. `[documented]`
