# Query Parameterization

## What it is

How to build database queries so that user input is always bound as data and can never alter the query's structure. This is the per-sheet guidance from the OWASP Query Parameterization Cheat Sheet, a derivative of the SQL Injection Prevention sheet, condensed to the working code patterns and the attack they stop. It shows parameterized queries across the common web languages and shows how to keep stored procedures safe when they build SQL dynamically.

## The attack it stops

SQL injection, filed under A05:2025-Injection in the OWASP Top 10, lets an attacker change the shape of a SQL statement so it steals data, modifies data, or even reaches command execution on the host operating system. The root cause is string concatenation: when input is pasted into the query text, attacker syntax becomes part of the command. Parameterization removes that by sending the statement and its values on separate tracks, so a bound value stays a value no matter what characters it holds. The sheet adds one caution: many client-side libraries only pretend to parameterize and actually concatenate before sending raw SQL, so parameterization must happen server-side.

## Controls

In the order the sheet presents them:

1. **Use prepared statements with bound parameters** as the primary way to query. The sheet gives working examples in many stacks, each binding the value rather than concatenating it:
   - **Java built-in:** `PreparedStatement` with a `?` placeholder and `setString`.
   - **Java with Hibernate:** a named HQL query with `setParameter`, or the Criteria API with `Restrictions.eq`.
   - **.NET built-in:** `OleDbCommand` with `command.Parameters.Add`.
   - **ASP.NET built-in:** `SqlCommand` with a typed `SqlParameter` (for example `@CustomerId`).
   - **Ruby with ActiveRecord:** condition hashes or `?`/named placeholders for create, read, update, and delete.
   - **Ruby built-in:** `db.prepare` with `?` placeholders, then `execute`.
   - **PHP with PDO:** `prepare` with named placeholders and `bindParam`.
   - **Cold Fusion built-in:** `<cfqueryparam>` with a declared `CFSQLType`.
   - **Perl with DBI:** `prepare` with `?` placeholders, then `execute` with the values.
   - **Rust with SQLx:** the compile-time-checked `query_as!` macro, or `query_as` with `.bind`.
2. **Still validate input.** Several examples note the value should really be validated too; parameterization and input validation work together, they do not replace each other.
3. **Keep parameterization on the server.** Do not rely on client-side query building, which often concatenates before the raw query reaches the server.
4. **Make stored procedures safe, including their dynamic SQL.** A stored procedure is not automatically safe. When it builds SQL dynamically, parameterize that SQL with bind variables so the inputs are treated as data, not possible code. The sheet shows both patterns:
   - **Normal stored procedure:** parameters passed in are naturally bound to their place in the query, so nothing special is needed (Oracle PL/SQL and SQL Server Transact-SQL examples).
   - **Dynamic SQL inside a procedure:** use bind variables, such as `:1` and `:2` with `EXECUTE IMMEDIATE ... USING` in Oracle, or named parameters with `sp_executesql` in SQL Server, rather than concatenating the inputs into the statement string.

## @security scenario

```gherkin
@security @owasp:query-parameterization @usecase:lookup-bound-value
Scenario: A product lookup binds the user value instead of concatenating it
  Given a product lookup that runs a prepared statement with a bound parameter
  When an attacker submits the search term "x' OR '1'='1"
  Then the query matches only rows whose value literally equals "x' OR '1'='1"
  And no extra rows are returned and the query structure is unchanged
```

This scenario is the canonical copy. When you apply this sheet to real code, add it to the repo's shared feature-file index (see `bdd-comprehensive-testing`, "Storing BDD scenarios permanently") and wire it into CI (its "CI/CD wiring") so it runs as a blocking autotest in the same place as every other Gherkin scenario.

## The real guarantee

The mechanism that actually makes injection impossible is the bound parameter: the driver ships the SQL text and the values on separate channels, so the value is never parsed as part of the statement, whatever it contains. The same holds inside a stored procedure only when its dynamic SQL uses bind variables. The `@security` scenario proves one payload is treated as a literal; binding the parameter server-side is what makes every payload a literal. A test is a check; the bound parameter is the guarantee.

## Sources

- OWASP Query Parameterization Cheat Sheet (<https://cheatsheetseries.owasp.org/cheatsheets/Query_Parameterization_Cheat_Sheet.html>, retrieved 2026-10-11): the server-side parameterization requirement, the prepared-statement examples across Java, Hibernate, .NET, ASP.NET, Ruby, PHP, Cold Fusion, Perl, and Rust, and the safe stored-procedure patterns with bind variables for Oracle and SQL Server dynamic SQL. `[documented]`
