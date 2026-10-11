# Error Handling

## What it is

How to respond to an unexpected failure without leaking clues about how the app is built. The
pattern is one global handler that returns a plain, generic error to the caller while the real
details go to the server-side log. This is the per-sheet guidance from the OWASP Error Handling
Cheat Sheet, condensed to the controls that hold and the attack they stop.

## The attack it stops

An attack usually starts with reconnaissance: the attacker probes the app to learn its stack,
versions, and weak spots. A raw error page hands that over. The sheet shows a Java stack trace
that spills the framework and server versions (Struts2 and `Apache Tomcat/7.0.56`) straight to the
user, and a database warning that exposes a SQL error and the install path
(`D:\app\index_new.php on line 188`), which also marks a likely injection point. Each leaked
detail shortens the attacker's path to a working exploit. A generic response with details kept
server-side gives them nothing to work with.

## Controls

The sheet's approach, in order:

1. **Install a single global error handler** at the application's runtime or configuration level,
   so no unexpected failure escapes with its details intact.
2. **Return a generic response to the caller.** Send a short, fixed message such as a retry
   prompt, with no stack trace, version, path, or query text. For REST APIs, format it with
   RFC 7807 / RFC 9457 Problem Details (`application/problem+json` or `application/problem+xml`).
   The sample handlers also set an `X-ERROR` response header to flag the error to the client.
3. **Log the full details server-side** where only operators can read them, and never in the
   response. Use the Logging Cheat Sheet for how to do the logging itself.
4. **Use the right status class.** Return `5xx` for genuine server-side faults, and `4xx` for
   problems caused by the client (for example unauthorized access or an over-large body). Do not
   put implementation details in the body of either.
5. **Keep developer error pages out of production.** Verbose or debug pages (such as ASP.NET
   Core's developer exception page) belong only in development; production uses the generic
   handler.
6. **Wire the handler per stack:** a `web.xml` `error-page` plus a JSP error page for classic
   Java; an `@RestControllerAdvice` with `@ExceptionHandler` returning a `ProblemDetail` for
   Spring; a dedicated error controller registered via `UseExceptionHandler` for ASP.NET Core;
   registered `ExceptionLogger` and `ExceptionHandler` classes (with `customErrors mode=RemoteOnly`)
   for ASP.NET Web API.
7. **Cover every failure mode and monitor for `5xx`.** Aim to handle all paths that can fail, and
   watch the `5xx` rate, since a rising count signals inputs the app cannot handle.

## @security scenario

```gherkin
@security @owasp:error-handling @usecase:no-stack-trace-leak
Scenario: An unhandled server error returns a generic message, not internals
  Given a REST API with a global error handler and a request that triggers an unexpected exception
  When the client receives the response
  Then the status is 500 and the body is a generic Problem Details message
  And the response contains no stack trace, framework version, file path, or SQL text
```

This scenario is the canonical copy. When you apply this sheet to real code, add it to the repo's
shared feature-file index (see `bdd-comprehensive-testing`, "Storing BDD scenarios permanently")
and wire it into CI (its "CI/CD wiring") so it runs as a blocking autotest in the same place as
every other Gherkin scenario.

## The real guarantee

What actually stops the information leak is the global handler that turns every unexpected failure
into one generic response while the details go only to the server log. The `@security` scenario
proves one triggered exception returns nothing useful to an attacker; the centralized handler is
what makes that true for every failure path, including ones no test foresaw. A test is a check;
the global handler and its generic response are the guarantee.

## Sources

- OWASP Error Handling Cheat Sheet (<https://cheatsheetseries.owasp.org/cheatsheets/Error_Handling_Cheat_Sheet.html>, retrieved 2026-10-11): the recon-via-error-messages threat with its stack-trace and SQL-warning examples, the global-handler-plus-generic-response approach, the per-stack configurations, Problem Details formatting, and the 4xx/5xx and monitoring guidance summarized above. `[documented]`
