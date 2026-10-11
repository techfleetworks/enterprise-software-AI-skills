# Ruby on Rails

## What it is

Basic security guidance for Ruby on Rails apps: Rails hides a lot of tedious work and makes hard
tasks easy, which also makes it easy for a developer new to its internals to turn off a safe default
without realizing it. This is the per-sheet guidance from the OWASP Ruby on Rails Cheat Sheet,
condensed to the controls that hold and the attacks they stop.

## The attack it stops

Rails escapes output, signs sessions, and ships CSRF protection, so most holes come from a developer
stepping outside the safe path: calling `eval` or a shell on user input, concatenating a parameter
into a SQL string, marking untrusted text `html_safe`, redirecting to a user-supplied URL, or
exposing a record that belongs to another user because the controller never checks ownership. Each
one lets an attacker run commands, run their own SQL, inject script, phish through a trusted domain,
or read and change other people's data. The controls below keep the defaults on and cover the spots
Rails does not guard for you.

## Controls

In the order the cheat sheet presents them:

1. **Command injection.** Treat `eval`, `system`, backticks, `exec`, `spawn`, `open`, and the
   piped-command forms of `IO`/`Process` methods as last resorts on anything involving user input. If
   you truly need one, restrict values to an allow-list and validate the input as strictly as you can.
2. **SQL injection.** ActiveRecord covers many queries, but building a condition string from a
   parameter (for example `where("name like '" + name + "'")`) is injectable. Use a bound placeholder
   instead, such as `where("name like ?", ...)`, and wrap `LIKE` values with
   `ActiveRecord::Base.sanitize_sql_like`. Do not assemble SQL from user-controlled input.
3. **Cross-site scripting.** View output is escaped by default. Do not defeat that with `raw`,
   `<%== %>`, or `html_safe` on untrusted data; `html_safe` only asserts a string is already safe and
   is itself dangerous. For user rich text prefer a markup language (Markdown, Textile) over raw HTML,
   add a Content Security Policy to block script, and treat the `#sanitize` allow-list as imperfect.
   For user-supplied link targets, validate the URL to permit only `http` or `https` before rendering,
   since `link_to` does not enforce a scheme allow-list and a `javascript:` URL would run on click.
4. **Sessions.** The default cookie store does not expire on the server, so it can allow replay and
   should never hold sensitive data. Prefer a server-side store, for example
   `session_store :active_record_store`.
5. **Authentication.** Enforce TLS with `config.force_ssl = true`. Use the Rails 8 authentication
   generator (adapted to your app, including the sign-up flow) or a library like Devise. Enforce
   password strength, for example with the zxcvbn add-on and a minimum score such as `4`. OmniAuth
   supports external providers. For token auth use `devise_token_auth`. If you use tokens only you do
   not need CSRF protection, but any path still authenticated by cookies does.
6. **Insecure direct object reference / forceful browsing.** RESTful URLs are guessable, and a vanilla
   app has no built-in check that a record belongs to the current user. Enforce per-action
   authorization, ideally with a library such as CanCanCan or Pundit, so every operation on a record
   is authorized.
7. **CSRF.** Keep `protect_from_forgery` on in `ApplicationController`. Review every `except`
   exception consciously, remembering that Rails already skips CSRF on `GET`. Token-only APIs need no
   CSRF, but cookie-authenticated paths still do.
8. **Redirects and forwards.** For internal redirects, validate the target with `url_from` against the
   request host and give a fixed fallback (`redirect_to url_from(params[:url]) || "/"`). Do not treat
   a parsed URL path as validation, since a protocol-relative value slips through; keep Rails'
   open-redirect protection on and use an allow-list when you need specific destinations. If you must
   match by regex, parse the host and anchor patterns with `\A` and `\z` (never `^`/`$`), and check
   scheme and port too. Mapping a key to a stored URL is the safest form.
9. **Dynamic render paths.** Do not let user input choose the template or partial name in `render`, or
   an attacker could render an arbitrary view such as an admin page. Avoid user input in the view name
   entirely where you can.
10. **Cross-origin resource sharing.** When sharing resources with another domain, allow-list only the
    permitted origins, for example with `rack-cors`, rather than opening it up broadly.
11. **Security headers.** Set headers via `response.headers` or apply them app-wide with
    `ActionDispatch::Response.default_headers` (for example `X-Frame-Options: SAMEORIGIN`,
    `X-Content-Type-Options: nosniff`, `X-XSS-Protection: 0`). HSTS comes from `config.force_ssl`; the
    `secure_headers` gem adds CSP handling.
12. **Business logic bugs.** Automated tools rarely find these. Guard against them with code review,
    pair programming, and unit tests.
13. **Attack surface.** `config/routes.rb` defines what is reachable, so review it. Avoid a catch-all
    route like `match ':controller(/:action(/:id(.:format)))'` that exposes any public method.
14. **Sensitive files.** Exclude or carefully manage files that leak secrets or data, such as
    `config/database.yml`, `config/initializers/secret_token.rb`, `db/seeds.rb`, and
    `db/development.sqlite3`.
15. **Encryption.** Rely on vetted encryption rather than writing your own. Devise hashes passwords
    with bcrypt by default; production commonly uses a cost such as `10` stretches.
16. **Dependency updates.** Keep Rails and gems current and have a defined update process: routine
    updates on a monthly or quarterly cadence, weekly review of important security advisories, and an
    emergency path for exceptional cases. Audit your gems, since most are unsigned.

## @security scenario

```gherkin
@security @owasp:rails @usecase:idor-record-ownership
Scenario: One user cannot read another user's record by guessing its id
  Given a user is signed in
  When the user requests a record that belongs to a different account by its RESTful id
  Then an authorization policy check runs for that record before it is returned
  And the request is denied because the record is not owned by the signed-in user
  And no record data is included in the response
```

This scenario is the canonical copy. When you apply this sheet to real code, add it to the repo's
shared feature-file index (see `bdd-comprehensive-testing`, "Storing BDD scenarios permanently") and
wire it into CI (its "CI/CD wiring") so it runs as a blocking autotest next to every other Gherkin
scenario.

## The real guarantee

The thing that actually keeps one user out of another user's record is the per-action authorization
check: Rails makes the id guessable but adds no ownership check, so a Pundit or CanCanCan policy
asserted on every record access is what decides the request. The `@security` scenario proves one
guessed id is denied; the enforced policy is what makes every id denied. A test is a check; the
authorization policy is the guarantee.

## Sources

- OWASP Ruby on Rails Cheat Sheet (<https://cheatsheetseries.owasp.org/cheatsheets/Ruby_on_Rails_Cheat_Sheet.html>, retrieved 2026-10-11): the full control set above, covering command injection, SQL injection, XSS, sessions, authentication, insecure direct object reference, CSRF, redirects and forwards, dynamic render paths, CORS, security headers, business logic, attack surface, sensitive files, encryption, and dependency updates. `[documented]`
