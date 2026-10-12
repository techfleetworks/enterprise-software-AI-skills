# Node.js Security

## What it is

How to build and run Node.js server applications so that the single-threaded, event-driven runtime stays safe
and responsive. This is the per-sheet guidance from the OWASP Node.js Security Cheat Sheet, condensed to the
controls that hold while still covering every distinct one. It spans application code, error handling, server
configuration, and the platform and dependencies underneath.

## The attack it stops

Node.js runs on one event loop, so a single slow operation can stall every request at once. Attackers exploit
this with huge request bodies, crafted regular expressions, or expensive CPU work to starve the server, which
is a denial of service. They also reach for the usual web holes: injecting into `eval` or `child_process.exec`
to run commands, guessing passwords through unthrottled logins, forging requests, polluting duplicate
parameters, and reading fields the response should never include. A missed error on a promise, an EventEmitter,
or an async callback can crash the process or leave it in an unknown state.

## Controls

**Application code**
1. **Use flat promise chains.** Replace deeply nested callbacks with a flat chain that ends in `.catch`, or use
   `async`/`await` inside `try`/`catch`, so errors and results are not lost in the nesting.
2. **Limit request body size.** Cap the bytes you accept, and set different limits per content type since JSON
   parsing blocks the loop. Validate the real content against the declared `Content-Type`, because an attacker
   can change that header to slip past a size check.
3. **Do not block the event loop.** Run every blocking operation asynchronously. When one step depends on
   another, place the dependent work inside the same callback so the order is guaranteed and race conditions
   (for example an auth check that a later synchronous action ignores) cannot happen.
4. **Validate all input.** Prefer an allowlist of accepted values; otherwise check against an expected shape and
   escape anything dangerous. Remember that a query string can parse into a string, an array, or a nested
   object, so validate the actual parsed type.
5. **Escape output for its context.** Encode to match where the value lands, following the XSS prevention
   guidance per context. A basic HTML escaper does not cover script, CSS, or URL contexts. To render
   user-supplied HTML, run it through a maintained sanitizer rather than escaping.
6. **Log application activity.** Use a logging library to record activity for debugging, incident response, and
   intrusion detection, and route errors to their own log.
7. **Monitor the event loop.** Watch response latency, and when the server is overloaded, shed new requests
   with a `503` so the service stays up for current users.
8. **Defend against brute force.** Throttle repeated attempts, especially on login, with rising delays or
   per-IP rate limits, add CAPTCHA, and lock accounts after too many failures.
9. **Use anti-CSRF tokens.** Protect state-changing requests with CSRF tokens from a currently maintained
   package; the once-common `csurf` middleware is deprecated and unpatched.
10. **Remove unused routes.** Delete endpoints no one uses. Frameworks that auto-generate REST routes can expose
    paths you never meant to ship, so know and disable the ones you do not need.
11. **Prevent HTTP parameter pollution.** When the same parameter name arrives more than once it becomes an
    array that the app may read unpredictably; use middleware that reduces it to a single, predictable value.
12. **Return only what is needed.** Shape responses to the specific fields the operation requires, so user
    records do not leak emails, birth dates, or other sensitive fields by default.
13. **Use object property descriptors.** Set `writable`, `enumerable`, and `configurable` deliberately, and use
    `Object.preventExtensions()` to stop new properties from being bolted on.
14. **Enforce access control lists.** Give each role only the resources it needs, following least privilege.

**Platform permission model**
15. **Restrict runtime privileges with the Node permission model.** Launch with `--permission` to deny by
    default, then grant narrow access such as `--allow-fs-read` and `--allow-fs-write` on specific paths, and
    the child-process, worker, addon, or WASI flags only when required. Note that symbolic links are followed
    even when they point outside an allowed path, so keep relative symlinks out of allowed directories.

**Error and exception handling**
16. **Handle `uncaughtException`.** Bind the event to clean up resources and log details, then exit the process
    rather than resuming in an unknown state, and never show stack traces to users.
17. **Listen for EventEmitter errors.** Always attach an `error` listener to EventEmitter objects; an
    unhandled emitted error is thrown and can crash the app.
18. **Handle errors in async callbacks.** Follow the error-first callback convention and actually check that
    first argument, since Express route handling does not catch errors raised inside async calls on its own.

**Server configuration**
19. **Set cookie flags correctly.** Mark session cookies `httpOnly` so client scripts cannot read them,
    `Secure` so they travel only over HTTPS, and `SameSite` to blunt CSRF.
20. **Send the right security headers.** Use a headers middleware to set HSTS, frame protection against
    clickjacking, `X-XSS-Protection: 0` to disable the legacy auditor, a strong Content Security Policy,
    `X-Content-Type-Options: nosniff`, cache control on sensitive pages, the IE no-open header, and removal of
    the `X-Powered-By` technology banner.

**Platform and dependencies**
21. **Keep packages current.** Track known-vulnerable dependencies with audit and scanning tools and update
    promptly.
22. **Avoid dangerous functions.** Keep user input away from `eval`, `child_process.exec`, and unsanitized `fs`
    paths. Treat `node:vm` as not a security sandbox and do not run untrusted code in it.
23. **Avoid evil regexes.** Steer clear of patterns with grouped repetition and overlapping alternation that a
    crafted input can push into exponential matching time (ReDoS).
24. **Run security linters.** Enforce strict linting with security-focused rule sets that flag patterns like
    `eval` and `child_process`, while knowing linters do not replace dedicated static analysis tools.
25. **Use strict mode.** Put `"use strict"` at the top of your code so unsafe legacy behavior throws instead of
    failing silently.
26. **Follow general secure-design principles.** Apply the broader security-by-design practices that hold for
    any web application regardless of runtime.

## @security scenario

```gherkin
@security @owasp:nodejs @usecase:event-loop-availability
Scenario: A flood of oversized requests cannot stall the event loop
  Given a Node.js service with per-content-type body size limits and event-loop monitoring
  When an attacker sends many requests with oversized or malformed JSON bodies
  Then requests exceeding the configured size limit are rejected before parsing
  And while the loop is overloaded new requests receive a 503 so current users keep being served
```

This scenario is the canonical copy. When you apply this sheet to real code, add it to the repo's shared
feature-file index (see `bdd-comprehensive-testing`, "Storing BDD scenarios permanently") and wire it into CI
(its "CI/CD wiring") so it runs as a blocking autotest in the same place as every other Gherkin scenario.

## The real guarantee

The thing that actually keeps a Node.js service available is respecting the single event loop: bound every
input, run blocking work asynchronously, and shed load before the loop stalls. The `@security` scenario proves
one flood is survived; the size limits and loop monitoring together are what make every flood survivable. The
rest of the sheet extends the same idea across injection, auth abuse, and error handling, where the control, not
the test, is what holds. A test is a check; the bounded, non-blocking design is the guarantee.

## Sources

- OWASP Node.js Security Cheat Sheet (<https://cheatsheetseries.owasp.org/cheatsheets/Nodejs_Security_Cheat_Sheet.html>, retrieved 2026-10-11): the full set of application, permission-model, error-handling, server-configuration, and platform controls condensed above. `[documented]`
