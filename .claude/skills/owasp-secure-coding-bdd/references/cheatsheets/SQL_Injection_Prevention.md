# SQL Injection Prevention

## What it is

How to stop SQL injection: an attacker getting the database to run input as SQL instead of treating it as
data. This is the per-sheet guidance from the OWASP SQL Injection Prevention Cheat Sheet, condensed to the
controls that hold and the attack they stop.

## The attack it stops

When code builds a query by pasting user input into a SQL string, an attacker can change what the query does.
Weidman's web-application chapter shows the classic case: if "a developer fails to sanitize user input when
interacting with the database, you may find that you can perform a SQL injection attack to manipulate the
queries sent to it." On a login form that runs `SELECT id FROM users WHERE username='$username' AND
password='$password'`, submitting the username `' OR '1'='1` turns the WHERE clause always-true and logs the
attacker in as the first user, with no valid password. The same hole can read, change, or destroy data, and
can sometimes run commands on the database host.

## Controls

In the cheat sheet's order of preference:
1. **Prepared statements with parameterized queries (primary defense).** Keep the SQL and the data separate so
   input is always a bound value, never part of the query text.
2. **Stored procedures**, when written safely (no dynamic SQL built from input inside them).
3. **Allow-list input validation** for the parts of a query that cannot be bound, such as a table name,
   column name, or sort direction. Map user choices to a fixed set of known-safe values.
4. **Escaping input** only as a last resort; the cheat sheet marks it "STRONGLY DISCOURAGED" because it is
   fragile and database-specific.
Plus least privilege on the database account as an additional, secondary defense.

## @security scenario

```gherkin
@security @owasp:sql-injection @usecase:login-auth-bypass
Scenario: A login form rejects a SQL injection authentication-bypass payload
  Given a login endpoint backed by a SQL database
  When an attacker submits the username "' OR '1'='1" with any password
  Then the credentials are rejected and no session is created
  And the query runs as a parameterized statement so the input is treated as data, not SQL
```

This scenario is the canonical copy. When you apply this sheet to real code, add it to the repo's shared
feature-file index (see `bdd-comprehensive-testing`, "Storing BDD scenarios permanently") and wire it into CI
(its "CI/CD wiring") so it runs as a blocking autotest in the same place as every other Gherkin scenario.

## The real guarantee

The thing that actually makes injection impossible on a query is the parameterized statement: the driver sends
the SQL and the parameters separately, so no input can become SQL. The `@security` scenario proves one
payload is rejected; the parameterized query is what makes every payload safe. A test is a check; the bound
parameter is the guarantee.

## Sources

- OWASP SQL Injection Prevention Cheat Sheet (<https://cheatsheetseries.owasp.org/cheatsheets/SQL_Injection_Prevention_Cheat_Sheet.html>, retrieved 2026-10-10): the ordered defenses (prepared statements, stored procedures, allow-list validation, escaping discouraged) and least privilege. `[documented]`
- Georgia Weidman, *Penetration Testing: A Hands-On Introduction to Hacking* (No Starch, 2014), Chapter 14 "Web Application Testing": the attacker view of SQL injection and the `' OR '1'='1` login-bypass example. `[documented]`
