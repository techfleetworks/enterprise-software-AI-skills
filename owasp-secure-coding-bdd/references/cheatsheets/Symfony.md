# Symfony

## What it is

Security guidance for apps built on the Symfony framework: Symfony has strong built-in protections,
but a developer still has to understand them and use them correctly rather than route around them.
This is the per-sheet guidance from the OWASP Symfony Cheat Sheet, condensed to the controls that hold
and the attacks they stop.

## The attack it stops

Symfony escapes Twig output, adds CSRF tokens to forms, and binds Doctrine query parameters, so the
common holes come from stepping off the safe path: concatenating a query parameter into DQL, shelling
out with `exec` on user input, redirecting to a URL from the request, serving a file whose name the
user controls, or running production with debug details exposed. Each lets an attacker run their own
SQL or shell commands, phish through your domain, read files outside the intended folder, or harvest
internals from an error page. The controls below keep the defaults on and cover what Symfony leaves to
the developer.

## Controls

In the order the cheat sheet presents them:

1. **Cross-site scripting.** Twig escapes output by default when you wrap a variable in `{{ }}`, which
   neutralizes injected markup. Only use the `raw` filter on content you know is trusted; never on
   user input.
2. **CSRF.** The Form component adds and validates a CSRF token automatically (the hidden `_token`
   field, configurable per form). Without Forms, install `symfony/security-csrf`, enable
   `csrf_protection`, emit a token with the `csrf_token()` Twig function, and in the controller reject
   a missing or invalid token with `isCsrfTokenValid` using the same token id before any state change.
   CSRF validation is not authorization: check the caller's permission for the target separately.
3. **SQL injection.** Doctrine uses prepared statements, so building DQL by concatenating a parameter
   (for example `WHERE p.id = " . $id`) is the mistake to avoid. Use a safe form instead: a repository
   method like `findOneBy`, DQL with `setParameter`, or the DBAL query builder with `setParameter`.
4. **Command injection.** Do not pass user input into `exec`; a value like `test.txt && rm -rf .`
   would run. Prefer a native PHP function (such as `unlink`) or the Symfony Filesystem component's
   `remove` method over shelling out.
5. **Open redirection.** Do not redirect to a URL taken directly from a query parameter. Validate and
   sanitize the destination before redirecting so an attacker cannot send users to a malicious site.
6. **File uploads.** Validate type and size on the server, for example with the `File` constraint's
   `maxSize` and `mimeTypes` (as a PHP attribute or in a Symfony form), to block oversized uploads and
   unwanted types. Give every stored file a unique name so uploads cannot overwrite each other. Keep
   uploads outside the public directory, or configure the web server to deny direct access to the
   upload folder.
7. **Directory traversal.** Resolve both the base folder and the requested path with `realpath`,
   reject failures, and confirm the resolved path starts with the base plus a directory separator so a
   sibling folder cannot match. Alternatively, strip directory parts from the filename with `basename`.
   Check the caller's permission to the resolved file separately.
8. **Dependency vulnerabilities.** Keep Symfony components and third-party libraries current with
   `composer update`, and scan the `composer.lock` file for known issues using the Symfony Security
   Checker (`symfony check:security`).
9. **CORS.** Manage cross-origin rules with `nelmio/cors-bundle`, listing the allowed origins,
   methods, and headers per path rather than opening access broadly.
10. **Security headers.** Add headers such as `Strict-Transport-Security`, `X-Frame-Options`,
    `X-Content-Type-Options`, `Content-Security-Policy`, `X-Permitted-Cross-Domain-Policies`,
    `Referrer-Policy`, `Clear-Site-Data`, the Cross-Origin-Embedder/Opener/Resource policies, and
    `Cache-Control`. Apply them on every response by listening to the `ResponseEvent`, or configure
    them at the web server.
11. **Sessions and cookies.** Configure cookies under `framework.session`. For HTTPS, set
    `cookie_secure: true` explicitly (`auto` leaves it off for HTTP requests). Keep
    `cookie_httponly: true` so scripts cannot read the cookie, and set `cookie_samesite` to `lax` or
    `strict`. Remember `cookie_lifetime` is in seconds and does not enforce a server-side timeout;
    implement idle and absolute expiration yourself. Let Symfony manage sessions and disable PHP's
    `session.auto_start` to avoid conflicts.
12. **Authentication.** Symfony Security configures authentication in `config/packages/security.yaml`.
    Providers load users from a source such as a Doctrine entity by a property like email. Firewalls
    set the rules for different URL patterns, including the authenticator and how to handle
    unauthorized access. Access-control rules map path patterns to the roles required to reach them.
13. **Error handling disclosure.** By default Symfony shows detailed errors only in the development
    environment and a generic page in production; keep it that way, use custom error pages per status
    code, and rely on its logging for the detail instead of exposing it to users.
14. **Sensitive data.** Store configuration like API keys in environment variables, and for secret
    values use Symfony's secrets management, which encrypts them with generated cryptographic keys
    (`secrets:generate-keys`, then `secret:set`); keep the private key out of the repository. Note
    that an environment variable with the same name always overrides a secret.
15. **Production hardening (summary).** Turn debug off with `APP_ENV=prod`. Harden the PHP
    configuration. Configure a valid SSL certificate and redirect HTTP to HTTPS. Apply security
    headers. Set correct file and directory permissions. Back up the production database and critical
    files and keep a recovery plan. Scan dependencies for known vulnerabilities. Set up monitoring and
    error reporting to catch issues in production quickly.

## @security scenario

```gherkin
@security @owasp:symfony @usecase:dql-sql-injection
Scenario: A post lookup rejects a SQL injection payload in the id parameter
  Given a controller that fetches a post by the "id" query parameter from Doctrine
  When an attacker submits id as "1 OR 1=1"
  Then the value is passed through setParameter as a bound parameter, not concatenated into DQL
  And the query is treated as data so no extra rows are returned
  And no other post is exposed
```

This scenario is the canonical copy. When you apply this sheet to real code, add it to the repo's
shared feature-file index (see `bdd-comprehensive-testing`, "Storing BDD scenarios permanently") and
wire it into CI (its "CI/CD wiring") so it runs as a blocking autotest next to every other Gherkin
scenario.

## The real guarantee

The thing that actually stops the injection is the bound Doctrine parameter: when the id arrives
through `setParameter` instead of being pasted into the DQL string, the database treats it as a value
and no payload can become query logic. The `@security` scenario proves one payload is rejected; the
bound parameter is what makes every payload safe. A test is a check; the parameterized query is the
guarantee.

## Sources

- OWASP Symfony Cheat Sheet (<https://cheatsheetseries.owasp.org/cheatsheets/Symfony_Cheat_Sheet.html>, retrieved 2026-10-11): the full control set above, covering XSS, CSRF, SQL injection, command injection, open redirection, file uploads, directory traversal, dependency vulnerabilities, CORS, security headers, sessions and cookies, authentication, error handling disclosure, sensitive data, and production hardening. `[documented]`
