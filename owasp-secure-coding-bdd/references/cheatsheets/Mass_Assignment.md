# Mass Assignment

## What it is

How to stop mass assignment: an attacker setting object fields that the request was never meant to touch, by abusing a framework's automatic binding of request parameters onto objects. This is the per-sheet guidance from the OWASP Mass Assignment Cheat Sheet, condensed to the controls that hold and the attack they stop. The same flaw is also called autobinding (Spring MVC, ASP.NET MVC) and object injection (PHP).

## The attack it stops

Many frameworks copy incoming request parameters straight onto a model object by matching names. If the object has a sensitive field the form never shows, the attacker can add that field to the request and set it. The sheet's example is an account edit form that posts `userid`, `password`, and `email` onto a `User` object that also has an `isAdmin` boolean. The attacker simply appends `&isAdmin=true` to the request body, and the binder sets it, promoting the attacker to administrator. In 2012 GitHub was compromised this way: a user bound a public key onto an organization they did not own, gaining write access to its repositories.

## Controls

In the sheet's order of preference:

1. **Bind to a dedicated input object, not the domain object.** Define a Data Transfer Object (DTO) that contains only the fields the caller is allowed to edit, so a sensitive field like `isAdmin` is simply not present to be set. This is the recommended architectural fix.
2. **Allow-list the bindable fields** when you must bind to an object that has extra properties. Name the permitted fields explicitly so anything else is ignored. Framework hooks for this include Spring's `binder.setAllowedFields(...)`, Mongoose with underscore's `_.pick(req.body, ...)`, and Laravel Eloquent's `$fillable`.
3. **Do not rely on a block-list as your only defense.** Excluding named fields (for example Spring's `setDisallowedFields`, Eloquent's `$guarded`, or the `mongoose-mass-assign` `protect` flag) is fragile: a new or overlooked sensitive field stays bindable. CWE-915 recommends allow-lists over deny-lists; treat block-list examples as descriptions of existing mechanisms, not the design to copy.
4. **Review the full binding surface, not just top-level fields.** Field names can be guessed without source access, and binders can reach nested objects, so check exactly which inputs the binder exposes. Do not assume you are safe because a class lacks an empty constructor; frameworks such as Spring bind through constructors and setters alike.
5. **Keep authorization separate.** DTOs and field allow-lists limit which properties a request can write; they do not confirm the caller is allowed to act on that object or operation. Still authorize the requested object and action on every request.

Framework-specific allow-list mechanisms the sheet points to include Spring MVC `@InitBinder` with `setAllowedFields`, NodeJS + Mongoose safe-field lists, Laravel Eloquent `$fillable`, Ruby on Rails strong parameters, Django, ASP.NET MVC, Grails, Play, and JSON mappers (Jackson, GSON, JSON-Lib, Flexjson).

## @security scenario

```gherkin
@security @owasp:mass-assignment @usecase:account-edit
Scenario: An account-edit endpoint ignores an unauthorized privilege field
  Given an account-edit endpoint that binds the fields userid, password, and email
  When an attacker submits the form with an extra parameter "isAdmin=true"
  Then the isAdmin field is not changed because it is outside the bound field set
  And the saved account keeps its original privilege level
```

This scenario is the canonical copy. When you apply this sheet to real code, add it to the repo's shared feature-file index (see `bdd-comprehensive-testing`, "Storing BDD scenarios permanently") and wire it into CI (its "CI/CD wiring") so it runs as a blocking autotest alongside every other Gherkin scenario.

## The real guarantee

The thing that actually stops mass assignment is binding to a DTO (or an explicit allow-list) that has no sensitive field at all, so there is nothing for an extra parameter to set. The `@security` scenario proves one `isAdmin=true` payload is ignored; a bound object that only ever exposes editable fields is what makes every unexpected parameter equally inert. A test is a check; the fixed, allow-listed field set the binder can reach is the guarantee.

## Sources

- OWASP Mass Assignment Cheat Sheet (<https://cheatsheetseries.owasp.org/cheatsheets/Mass_Assignment_Cheat_Sheet.html>, retrieved 2026-10-11): the definition and alternative names, the `isAdmin` and GitHub examples, the DTO and allow-list solutions, the warning against block-lists, the note that authorization is still required, and the per-framework mechanisms. `[documented]`
