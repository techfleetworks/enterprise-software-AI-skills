# Laravel

## What it is

How to build Laravel apps that stay secure even though the framework is safe by default: keep the
secure defaults on, and do not reach for the flexible escape hatches in a way that reopens a hole.
This is the per-sheet guidance from the OWASP Laravel Cheat Sheet, condensed to the controls that
hold and the attacks they stop.

## The attack it stops

Laravel ships with protections turned on, so most trouble comes from a developer switching one off or
routing around it: running in production with debug output exposed, pasting request input into a raw
SQL fragment, echoing user data with the unescaped Blade syntax, letting the browser decide a model
column through mass assignment, or handing a user-supplied path to a download. Each of these turns a
framework that was safe into one that leaks data, runs attacker SQL, executes injected script, or
hands over files outside the intended folder. The controls below keep the defaults in place and close
the gaps the escape hatches open.

## Controls

In the order the cheat sheet presents them:

1. **Lock down the basics.** Turn debug off in production with `APP_DEBUG=false`. Generate the
   application key (`php artisan key:generate`); Laravel uses it for cookie encryption, signed URLs,
   reset tokens, and session encryption. Harden the PHP configuration. Set restrictive file and
   folder permissions (around `775` for directories and executables, `664` for non-executable files).
   Keep dependencies free of known vulnerabilities.
2. **Cookies and sessions.** When you change the defaults, keep the `EncryptCookies` middleware in
   the `web` group so client-side cookie data stays unreadable and tamper-resistant. Set
   `http_only` to `true` so scripts cannot read the session cookie. Leave `domain` as `null` unless
   subdomains must share the cookie, and prefer a `__Host-` prefixed cookie with `Secure` and
   `Path=/` for stronger isolation. Set `same_site` to `lax` or `strict`. For HTTPS-only apps set
   `secure` to `true` (use `null` for mixed HTTP/HTTPS so it applies only on secure requests). Keep
   the idle `lifetime` short (for example `15`), tighter for high-value apps.
3. **Authentication.** Guards decide how each request is authenticated and providers decide how users
   are loaded; configure both in `config/auth.php`. Prefer a first-party starter kit (Breeze,
   Fortify, or Jetstream) for login, registration, reset, verification, and two-factor. For API
   tokens use Passport (OAuth2) or Sanctum.
4. **Mass assignment.** Pick the fields you accept with `$request->only` or `$request->validated`
   instead of `$request->all`, so a user cannot set a column such as `is_admin`. Do not unguard
   models or set `$guarded` to an empty array, since that disables the built-in guard. Avoid
   `forceFill` and `forceCreate` unless you pass an already-validated array.
5. **SQL injection.** Eloquent and the query builder bind parameters for you, so normal queries are
   safe. For raw fragments (`whereRaw` and similar), always pass values as positional or named
   bindings rather than concatenating them into the string. Never let request input choose a column
   name or sort column; some drivers cannot bind identifiers, so validate against a fixed allow-list
   (for example `in:price,updated_at`). The same rule covers validation rules that take a column
   name, such as a unique rule with a user-chosen column.
6. **Cross-site scripting.** Blade's `{{ }}` echo escapes with `htmlspecialchars`, which is right for
   HTML text and quoted ordinary attributes but does not vet URL schemes or cover JavaScript and CSS
   contexts. Never put untrusted data inside the unescaped `{!! !!}` syntax. For data going into
   JavaScript use `Js::from`, and follow the XSS prevention cheat sheet for URLs, CSS, and other
   contexts.
7. **File uploads.** Validating type and size (`mimes`, `max`) is one layer but not enough on its
   own: the `mimes` rule reads content type and does not vet the user's extension or make a file safe
   to run. Generate your own stored filenames, keep uploads out of the webroot or on a separate host,
   make sure the server cannot execute them, and cap total storage and upload rate as well as
   per-file size. Never let user input build the storage path; strip directory parts with `basename`.
   Avoid processing XML (XXE, billion-laughs) and ZIP (zip-bomb) files where you can.
8. **Path traversal.** For downloads by filename, run the input through `basename` so a value like
   `../../.env` cannot escape the intended folder and expose credentials.
9. **Open redirection.** Do not redirect to a URL taken straight from request input, since it lets an
   attacker craft a trusted-looking link that lands on their own site for phishing.
10. **CSRF.** Keep the `VerifyCsrfToken` middleware in the `web` group. Emit the token in forms with
    the `@csrf` directive, and set the `X-CSRF-Token` header for AJAX. Only exclude genuinely
    stateless routes (APIs, webhooks); excluding anything else reopens CSRF.
11. **Command injection.** Prefer a PHP library over shelling out. If you must run a process, keep the
    program name fixed and pass arguments as a separate array (Symfony Process), and still validate
    the value, since argument separation alone does not stop option injection. Do not rely on
    `escapeshellcmd`; `escapeshellarg` only escapes one argument and still needs validation.
12. **Other dangerous functions.** Do not feed untrusted input to `unserialize`, `eval`, or
    `extract`, which enable object injection, code execution, and variable hijacking.
13. **Rate limiting.** Throttle routes with the `throttle` middleware per route or per group, or
    define a named limiter with `RateLimiter::for` keyed by user or IP. The `api` group is throttled
    by default; apply global limits to groups as needed.
14. **Security headers.** Add `X-Frame-Options`, `X-Content-Type-Options`, `Strict-Transport-Security`
    (HTTPS only), and `Content-Security-Policy` at the web server or in middleware.

## @security scenario

```gherkin
@security @owasp:laravel @usecase:mass-assignment-privilege-escalation
Scenario: A profile update cannot set a protected admin column
  Given an authenticated user submits a profile update
  When the request body includes an "is_admin" field set to true
  Then the update binds only fields returned by $request->validated
  And the "is_admin" column keeps its stored value
  And the saved model is never filled from $request->all or an unguarded model
```

This scenario is the canonical copy. When you apply this sheet to real code, add it to the repo's
shared feature-file index (see `bdd-comprehensive-testing`, "Storing BDD scenarios permanently") and
wire it into CI (its "CI/CD wiring") so it runs as a blocking autotest next to every other Gherkin
scenario.

## The real guarantee

The thing that actually protects the row is the explicit field allow-list on the write: when the code
binds only `$request->only` or `$request->validated` and never unguards the model, a column the user
was not meant to touch simply has no path into the save. The `@security` scenario proves one
protected field is ignored; the allow-listed write is what makes every extra field ignored. A test is
a check; the bound field list is the guarantee.

## Sources

- OWASP Laravel Cheat Sheet (<https://cheatsheetseries.owasp.org/cheatsheets/Laravel_Cheat_Sheet.html>, retrieved 2026-10-11): the full control set above, covering basics, cookies and sessions, authentication, mass assignment, SQL injection, XSS, file uploads, path traversal, open redirection, CSRF, command injection, other dangerous functions, rate limiting, and security headers. `[documented]`
