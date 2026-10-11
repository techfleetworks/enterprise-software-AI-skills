# Bean Validation

## What it is

How to validate input in Java once, on the domain model, using Jakarta Bean Validation (Hibernate Validator) so the
same constraints hold across every application tier. This is the per-sheet guidance from the OWASP Bean Validation
Cheat Sheet, condensed to the controls that define the constraints and the attack sloppy input lets through.

## The attack it stops

When each layer checks input its own way (or not at all), malformed, oversized, or out-of-range values slip past
into business logic, persistence, and responses: a 10-megabyte "message," a negative rating, a birth date in the
future, a title full of control characters. Declaring the rules once on the model and enforcing them with `@Valid`
makes the allowlist travel with the data, so a bad value is rejected at the boundary instead of corrupting state
downstream. The one trap to avoid: validation is input hygiene, not an output-encoding substitute, which is why the
deprecated `@SafeHtml` must not be leaned on for XSS defense.

## Controls

Following the cheat sheet, from setup through message handling:

1. **Setup.** Add the Hibernate Validator dependency and enable validation in the framework (for Spring MVC,
   `<mvc:annotation-driven />`). Match the namespace to your stack: legacy `javax.validation` or current
   `jakarta.validation`, with API and provider versions that fit the app.
2. **Apply and trigger.** Put constraint annotations on fields, properties, or classes (and, from Bean Validation
   1.1, on parameters, return values, and constructors), then mark the object `@Valid` where it crosses a layer so
   the constraints actually run.
3. **Handle errors.** The validator reports failures through a `BindingResult` holding a `List<ObjectError>`.
   Check `hasErrors()`, return an error status such as HTTP 400, and in real code add logging and a proper error
   page rather than the bare message loop shown in the examples.
4. **`@Pattern`.** Require a `CharSequence` to match a regex (for example letters, digits, and spaces only); reach
   for the OWASP Validation Regex Repository for vetted expressions.
5. **`@Digits`.** Bound a number to a maximum count of integer and fractional digits (for example three integer
   digits, zero fractional for an age).
6. **`@Size`.** Keep a `CharSequence`, `Collection`, `Map`, or array within an inclusive minimum and maximum
   length (for example 10 to 500 characters).
7. **`@Past` / `@Future`.** Require a date to fall before or after now; use a real date type such as
   `java.util.Date`, because these do not validate date strings.
8. **`@Min` / `@Max` (combining).** Stack annotations to express a range, for example `@Min(1)` with `@Max(5)` for
   a one-to-five rating.
9. **Cascading.** Put `@Valid` on a nested bean reference so validating the parent walks the whole object graph in
   one pass.
10. **Additional Hibernate constraints.** Convenience checks beyond JSR 303 include `@CreditCardNumber`, `@EAN`,
    `@Email`, `@Length`, `@Range`, `@ScriptAssert`, and `@URL`. Do not use the deprecated `@SafeHtml`.
11. **Custom constraints.** You can define your own constraints when the built-ins fall short (details are outside
    this sheet).
12. **Error messages.** Give an annotation a message ID (for example `message="article.title.error"`) and resolve
    it through a configured `MessageSource` for customized, localizable text.

## @security scenario

```gherkin
@security @owasp:bean-validation @usecase:size-boundary-enforced
Scenario: An oversized message is rejected at the boundary by @Size
  Given a Message model whose text field is annotated @Size(min = 10, max = 500)
  And the controller marks the incoming object @Valid
  When an attacker posts a body of 50000 characters
  Then validation fails and the BindingResult reports the error
  And the controller returns HTTP 400 without passing the value to the service layer
```

This scenario is the canonical copy. When you apply this sheet to real code, add it to the repo's shared
feature-file index (see `bdd-comprehensive-testing`, "Storing BDD scenarios permanently") and wire it into CI
(its "CI/CD wiring") so it runs as a blocking autotest in the same place as every other Gherkin scenario.

## The real guarantee

What actually holds the line is the constraint declared on the model plus the `@Valid` trigger: the rule lives with
the data and runs at every tier that validates, so no caller can forget it and no layer gets an unchecked value.
The `@security` scenario proves one oversized payload is rejected; the `@Size` constraint and its `@Valid` trigger
are what reject every out-of-bounds value. A test is a check; the model-level constraint is the guarantee. Remember
it guards input shape, not output safety, so keep context encoding downstream.

## Sources

- OWASP Bean Validation Cheat Sheet (<https://cheatsheetseries.owasp.org/cheatsheets/Bean_Validation_Cheat_Sheet.html>, retrieved 2026-10-11): the setup and `@Valid` triggering model, the predefined constraints (`@Pattern`, `@Digits`, `@Size`, `@Past`/`@Future`, `@Min`/`@Max`), cascading, the additional Hibernate constraints with the `@SafeHtml` deprecation, custom constraints, and message IDs. `[documented]`
