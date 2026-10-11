# Insecure Direct Object Reference Prevention

## What it is

An insecure direct object reference (IDOR) happens when a user can reach or change data that belongs to
someone else by editing an identifier in a request. The identifier may live in a URL, a hidden field, a
parameter, or a filename, and the flaw is always the same: the server fetches the object but never confirms the
caller is allowed to touch it. This is the per-sheet guidance from the OWASP Insecure Direct Object Reference
Prevention Cheat Sheet, condensed to the controls that hold and the attack they stop.

## The attack it stops

When a profile page loads at a URL like `https://example.org/users/123`, the number is a straight pointer to a
database row. If the app does not check permission first, an attacker swaps `123` for `124` and reads another
person's record. The same trick works on a hidden `user_id` field in a POST body, letting the attacker edit
someone else's profile, and on filenames, where changing `annual-report.pdf` to `financial-statement.pdf` pulls
back a document the attacker should never see. Numeric keys, account numbers, tokens, and slugs are all fair
game.

## Controls

In the order the cheat sheet recommends:
1. **Check object-level authorization on every access.** For each object a user asks for, confirm that this
   user is allowed to act on it, and do it on the server for every request, not once at load time. Build the
   check into the structure of your framework instead of bolting it on by hand.
2. **Do not expose identifiers when you can avoid it.** Where possible, work out who the caller is from the
   session or token rather than trusting an id in the URL or body. In multi-step flows, carry the identifier in
   server-side session state so the client cannot tamper with it.
3. **Scope every lookup to what the caller owns.** Query within the current user's own records rather than the
   whole table. In Rails that is `@current_user.projects.find(params[:id])` instead of
   `Project.find(params[:id])`; the Java equivalent is `documentRepository.findByIdAndOwnerId(id, currentUser().getId())`.
4. **Or verify ownership right after fetching.** If you load the object first, compare its owner to the
   authenticated user and throw an access-denied error when they differ.
5. **Hide whether a sensitive object even exists.** When the fact that a record exists is itself private, map
   both "not found" and "not yours" to one identical response, such as a `404`, so the caller learns nothing.
6. **Use your framework's declarative guard.** Spring, for example, offers `@PreAuthorize` backed by an
   ownership-checking service, once method security is turned on with `@EnableMethodSecurity`.
7. **Add unguessable identifiers as defense in depth.** Replace sequential numeric keys with random strings or
   UUIDs, either in a separate column used in URLs or as the primary key itself. Do not rely on this alone, and
   do not try to encrypt identifiers, since getting that right is hard. Access control still has to run even
   when the id is impossible to guess.

## @security scenario

```gherkin
@security @owasp:idor @usecase:object-level-authorization
Scenario: A user cannot read another user's document by changing the id
  Given User A and User B each own a document
  And User A is authenticated
  When User A requests User B's document by changing the id in the URL
  Then the request is denied
  And the lookup is scoped to documents owned by the current user so no other user's object is returned
```

This scenario is the canonical copy. When you apply this sheet to real code, add it to the repo's shared
feature-file index (see `bdd-comprehensive-testing`, "Storing BDD scenarios permanently") and wire it into CI
(its "CI/CD wiring") so it runs as a blocking autotest in the same place as every other Gherkin scenario.

## The real guarantee

What actually stops IDOR is the authorization check that ties each object to the caller who is asking for it,
run fresh on every request. The `@security` scenario proves one user cannot grab another's document by editing
an id; the scoped lookup or ownership check is what makes that true for every object and every id. Random,
unguessable keys raise the bar but do not enforce anything on their own. A test is a check; the per-object
authorization check is the guarantee.

## Sources

- OWASP Insecure Direct Object Reference Prevention Cheat Sheet (<https://cheatsheetseries.owasp.org/cheatsheets/Insecure_Direct_Object_Reference_Prevention_Cheat_Sheet.html>, retrieved 2026-10-11): the mitigation controls (per-object authorization, scoped lookups, hiding identifiers, unguessable keys as defense in depth) and the Rails and Spring Boot examples. `[documented]`
