# DotNet Security

## What it is

Practical secure-coding tips for .NET and ASP.NET, organized around the OWASP Top 10 and then a set of
topic-specific areas (configuration, data access, Web Forms, WCF, and more). This is the per-sheet guidance from
the OWASP DotNet Security Cheat Sheet, condensed to the controls that hold while still covering every distinct
control the sheet gives.

## The attack it stops

.NET bundles strong security primitives, but they fail when they are skipped or wired up wrong. A cookie without
`HttpOnly` can be read by injected script, a session that never expires stays stealable, a concatenated SQL
string becomes an injection point, a missing `[Authorize]` leaves an admin action open, a leaked connection
string or secret in `web.config` hands over the keys, a `BinaryFormatter` deserialize runs attacker objects, and
a reflected redirect sends users to a phishing page. The controls below close these across the whole stack.

## Controls

Following the sheet's OWASP Top 10 order, then its topic sections:

**A01 Broken access control.** Set `CookieHttpOnly = true` so scripts cannot read cookies. Shorten session
lifetime and set `SlidingExpiration = false` for an absolute lifetime (sliding is a usability-versus-risk
trade-off). Require SSL on cookies and forms (`requireSSL="true"`). Throttle login, registration, and password
reset to blunt brute force, and consider a CAPTCHA. Do not build your own auth or session handling; use what .NET
provides. Give identical responses whether or not an account exists, in both wording and timing, to prevent
account enumeration. Authorize every externally reachable endpoint with `[Authorize]` at the method or, better,
controller level, or check roles in code. For object references, confirm the current user actually owns the
record before returning or editing it.

**A02 Cryptographic failures.** Never write your own crypto; avoid writing crypto at all and prefer a secrets
manager or your cloud provider's. For hashing use a strong algorithm (SHA-512 for general hashing), but for
passwords use ASP.NET Core Identity's `PasswordHasher<TUser>`, not a general-purpose hash and not
`KeyDerivation.Pbkdf2` called directly. Follow the Authentication guidance for password length and breached-
password screening, allowing long passphrases without forced character rules. Encrypt restorable sensitive data
with a strong algorithm such as AES-256, protect keys above all other assets, and use TLS 1.2 or newer everywhere
with SSL disabled. Strip identifying response headers (version, server, `X-Powered-By`) and add security headers
(`X-Content-Type-Options`, `X-Frame-Options`, HSTS, CSP) via `web.config` or `Startup.cs`. For local storage use
DPAPI, or the Cryptographic Storage algorithm guidance; the sheet's AES-GCM and ECDH samples need a fresh nonce
per operation, secure key storage, and expert review.

**A03 Injection.** Prefer an ORM or stored procedures; where you must write SQL, use parameterized queries and
never concatenate strings into a command (this is still possible to get wrong inside an ORM or procedure).
Connect to the database with a least-privilege account, not an admin. For OS commands, call
`System.Diagnostics.Process.Start` but do not assume it stops an attacker breaking out of one argument into
another; allow-list input, accept only simple alphanumeric characters where possible, do not try to sanitize
special characters without removing them, and avoid methods with no security guarantee (`ArgumentList` escapes
some characters but is documented as unsafe with untrusted input). Consider encoding arguments as Base64 and
decoding them in the receiver. For LDAP, escape the special characters required for Distinguished Names.

**A04 Insecure design.** Design-level flaws are out of scope here; see the Secure Product Design guidance.

**A05 Security misconfiguration.** Turn debug and trace off in production. Use no default passwords. Redirect HTTP
to HTTPS (`UseHttpsRedirection` or a request handler). For CSRF, validate anti-forgery tokens on every state
change: send the token on POST/PUT, validate with `[ValidateAntiForgeryToken]` (or globally with
`AutoValidateAntiforgeryToken`), remove the token cookie on logout, and attach the token to AJAX requests. In .NET
Core 2.0+ the framework can generate and validate the token automatically.

**A06 Vulnerable and outdated components.** Keep the framework patched and NuGet packages current, run a
dependency checker in the build and act on high or critical findings, and add SCA tooling to CI/CD.

**A07 Identification and authentication failures.** Use ASP.NET Core Identity, which hashes with PBKDF2 and a
per-user salt by default. Configure password length per NIST (at least 15 characters without MFA, or 8 with MFA)
without forced composition rules, add Unicode code-point length validation, and add breached-password screening.
Set a cookie policy with `HttpOnly`, a bounded expiry, and sliding expiration off.

**A08 Software and data integrity failures.** Sign assemblies and executables, sign NuGet packages, and review
code and config changes for malicious additions. Do not put unsigned or unencrypted serialized objects onto the
wire, and check integrity or signatures on any serialized data you receive. Do not use `BinaryFormatter`;
prefer safe serializers (`XmlSerializer`, `DataContractSerializer`, `BinaryReader`/`BinaryWriter`, or
`System.Text.Json`).

**A09 Security logging and monitoring failures.** Log all login, access-control, and server-side validation
failures with enough user context to identify abuse, and set up monitoring and alerting. Do not log vague
messages (log the stack trace, message, and user id instead) and never log passwords or other sensitive data. Use
the built-in `ILogger`, set `lockoutOnFailure: true` on sign-in so failed attempts count toward lockout, and add
monitoring such as Application Insights.

**A10 Server-side request forgery.** Validate and sanitize any user input used to build a request, allow-list
permitted protocols and domains, verify addresses with `IPAddress.TryParse()` and `Uri.CheckHostName()`, do not
follow HTTP redirects, and do not forward raw upstream responses to the user.

**Older Top 10 items still relevant.** XXE: configure XML parsers so external entities are not processed. XSS: do
not trust user data, prefer allow-lists, rely on MVC output encoding and the AntiXSS encoder, avoid `[AllowHTML]`
and `@Html.Raw` unless the content is known safe, and enable a Content Security Policy. Insecure deserialization:
never take serialized objects from sources you do not trust, validate input, avoid rebuilding domain objects, and
run the deserialization under restricted permissions. Unvalidated redirects: check return URLs with `Url.IsLocalUrl`
before redirecting.

**Configuration and deployment.** Lock down config files and remove unused settings. Keep secrets out of
source-controlled config: use User Secrets in development and a managed secret store (Key Vault, AWS Secrets
Manager, Vault) via Managed or Workload Identity in production; on legacy Framework use Configuration Builders, and
only as a last resort encrypt `web.config` sections with `aspnet_regiis -pe`. Upgrade ClickOnce apps for TLS 1.2+.

**Data access.** Use parameterized SQL for all access without exception and never a concatenated
`SqlCommand` string. Allow-list values from the user with enums (validated via `Enum.IsDefined`), `TryParse`, or
lookups. Apply least privilege to the database user. Entity Framework prevents injection, but ad hoc EF queries
are just as vulnerable; prefer integrated authentication over SQL authentication, and use Always Encrypted for
sensitive data where available.

**ASP.NET Web Forms.** Always use HTTPS, enable `requireSSL` and `HttpOnly` on cookies, implement `customErrors`,
turn tracing off, and use `ViewStateUserKey` (or a manual double-submit anti-CSRF token) for CSRF protection.
Consider HSTS in IIS and remove the version and server headers. Do not disable `validateRequest`, use the
`AntiXssEncoder`, allow-list accepted values, and validate URIs with `Uri.IsWellFormedUriString`.

**Forms authentication.** Prefer cookie persistence, do not trust the request URI for session or authorization,
shorten the timeout, disable sliding expiration without HTTPS (and consider disabling it even with HTTPS), enforce
access controls against `User.Identity`, and review password storage (the default Membership SHA-1 is weak; prefer
ASP.NET Identity's PBKDF2).

**XAML and Windows Forms.** Work within Internet Zone constraints, use ClickOnce deployment, and run with partial
trust, requesting only the permissions the app needs.

**WCF.** Use HTTPS for REST regardless of method and keep sensitive values out of URLs, avoid `BasicHttpBinding`
(no default security) in favor of `WSHttpBinding`, combine transport and message security
(`TransportWithMessageCredential`), and fuzz-test the implementation.

## @security scenario

```gherkin
@security @owasp:dotnet @usecase:parameterized-data-access
Scenario: A .NET data-access call rejects a SQL injection payload
  Given an ASP.NET endpoint that queries the database through parameterized commands
  When a caller submits an input value containing SQL such as "' OR '1'='1"
  Then the value is bound as a parameter and treated as data, not SQL
  And no string-concatenated query is ever executed against the database
```

This scenario is the canonical copy. When you apply this sheet to real code, add it to the repo's shared
feature-file index (see `bdd-comprehensive-testing`, "Storing BDD scenarios permanently") and wire it into CI
(its "CI/CD wiring") so it runs as a blocking autotest in the same place as every other Gherkin scenario.

## The real guarantee

What actually protects a .NET application is using the framework's own hardened primitives correctly: parameterized
commands and an ORM for data access, ASP.NET Core Identity for password hashing, `[Authorize]` and ownership checks
for access, anti-forgery tokens for CSRF, a managed secret store for keys, and safe serializers in place of
`BinaryFormatter`. The `@security` scenario proves one injection payload is bound as data; the parameterized
command is what makes every payload safe. A test is a check; the correct use of the built-in control is the
guarantee.

## Sources

- OWASP DotNet Security Cheat Sheet (<https://cheatsheetseries.owasp.org/cheatsheets/DotNet_Security_Cheat_Sheet.html>, retrieved 2026-10-11): the OWASP Top 10 controls (A01 through A10 plus the older XXE, XSS, deserialization, and redirect items) and the topic sections on configuration and deployment, data access, Web Forms, Forms authentication, XAML, Windows Forms, and WCF summarized above. `[documented]`
