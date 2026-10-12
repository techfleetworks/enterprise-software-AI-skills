# Session Management

## What it is

How to issue, carry, and retire the session ID so an attacker cannot take over a logged-in user's session. This is the per-sheet guidance from the OWASP Session Management Cheat Sheet, condensed to the controls that hold and the attack they stop. The cheat sheet is long; this keeps the measures that actually block hijacking, fixation, and token theft.

## The attack it stops

HTTP has no memory of its own, so an application hands each user a session ID and trusts whoever sends it back. If an attacker can guess that ID, read it off the wire, steal it from the browser, or plant one of their own on the victim before login, they can impersonate that user completely. As an example, the source notes that a 64-bit random ID tried at 10,000 guesses per second against 100,000 live sessions would take roughly 585 years to hit, which is why strong entropy matters; a weak, predictable, or interceptable ID collapses that cost to nothing.

## Controls

In the cheat sheet's order:

1. **Give the ID strong, meaningless randomness.** Generate it with a CSPRNG, at least `64 bits` of entropy (prefer `128 bits` or more if you roll your own), so it cannot be guessed or predicted. Keep the value opaque: no PII, no user data, no application logic encoded in it; store that server side.
2. **Hide what the ID is.** Rename the framework default (such as `JSESSIONID` or `PHPSESSID`) to something plain like `id` so the name does not leak your stack.
3. **Prefer the framework's built-in session handling** over a home-grown one, and keep it patched to the current version.
4. **Protect the token at rest.** A tightly controlled store can hold the raw token, but anyone who reads it can replay it. Where read-only disclosure is in scope, store a one-way verifier instead: an identifier-plus-secret split where the server keeps the lookup identifier and a `SHA-256` hash of the verifier, compared in constant time. Never treat the identifier alone as proof. A fast hash is fine here; password hashes are not needed. Restrict access to the store and encrypt backups and replicas.
5. **Exchange the ID through cookies only.** Cookies allow expiry and scoping that URL parameters lack. Do not accept a session ID that arrives in a URL or other channel; URLs leak the ID into logs, history, bookmarks, and the `Referer` header, and they enable fixation.
6. **Require HTTPS for the whole session,** not just the login step, and set the `Secure` cookie attribute so the ID never travels in clear text. Do not flip a session between HTTP and HTTPS, and add HSTS.
7. **Set the cookie attributes.** Use `HttpOnly` to keep scripts from reading the cookie (blocks theft via XSS), `SameSite=Strict` (or `Lax`) as CSRF defense in depth, and the `__Host-` name prefix for session cookies. Leave `Domain` unset so the cookie stays on the origin host, and set `Path` as narrow as the app allows. Never use `SameSite=None` without `Secure`.
8. **Keep tokens out of web storage.** Do not put session IDs, JWTs, or any credential in `localStorage` or `sessionStorage`; any script in the origin can read them, so one XSS leaks everything. Prefer `HttpOnly` cookies or a backend-for-frontend. A web worker can isolate a secret in memory but does not make the app XSS-safe.
9. **Run strict, not permissive, session acceptance.** Only honor IDs the application itself created. If an unknown ID arrives, issue a fresh one, and flag the event as suspicious.
10. **Treat the ID as untrusted input.** Validate and filter it before use so it cannot feed SQL injection or stored XSS.
11. **Regenerate the ID on every privilege change.** At login, password change, role elevation, and similar events, mint a new ID and destroy the old one. This is the core defense against session fixation. Using separate ID names pre and post authentication helps.
12. **Reauthenticate after high-risk events,** such as a password or email change, a login from a new device or IP, or an account-recovery flow.
13. **Expire sessions.** Enforce an idle timeout (roughly 2 to 5 minutes for high-value apps, 15 to 30 for low risk) and an absolute timeout (for example 4 to 8 hours), and optionally a renewal timeout that rotates the ID mid-session. Enforce every timeout server side; the client cannot be trusted to time itself.
14. **Invalidate on both ends at logout and expiry.** Clearing the cookie is not enough; the server must actively destroy the session (for example `session_destroy()`, `HttpSession.invalidate()`, `Session.Abandon()`). Offer a clear, always-reachable logout control.
15. **Stop cached data from leaking.** Send `Cache-Control: no-store` on pages with session data, and `Clear-Site-Data` on logout to wipe the browser's copies.
16. **Detect and log session abuse.** Watch for guessing or brute-force bursts from an IP, for ID manipulation, and for mismatches when you bind the ID to properties like client IP or User-Agent (these raise detection but a skilled attacker can mimic them). Log the full session life cycle, but log a salted hash of the ID, never the raw ID, and exclude credentials. Decide and enforce a policy on simultaneous logins.
17. **Use a WAF as a backstop** when the code cannot be changed, to enforce cookie flags, counter fixation, and manage expiry.

## @security scenario

```gherkin
@security @owasp:session-management @usecase:session-fixation
Scenario: The session ID is regenerated when the user authenticates
  Given an anonymous visitor holding a pre-login session ID
  When that same visitor logs in successfully with valid credentials
  Then the server issues a brand new session ID and destroys the pre-login one
  And the old pre-login ID is no longer accepted on any request
```

This scenario is the canonical copy. When you apply this sheet to real code, add it to the repo's shared feature-file index (see `bdd-comprehensive-testing`, "Storing BDD scenarios permanently") and wire it into CI (its "CI/CD wiring") so it runs as a blocking autotest in the same place as every other Gherkin scenario.

## The real guarantee

The thing that actually defeats fixation is regenerating the ID at every privilege change and refusing any ID the app did not mint: an attacker who planted an ID before login ends up holding a dead value. The `@security` scenario proves one login rotates the ID; the regenerate-and-invalidate step, plus strict acceptance, is what makes a planted or stolen pre-login ID useless. A test is a check; destroying the old ID on privilege change is the guarantee.

## Sources

- OWASP Session Management Cheat Sheet (<https://cheatsheetseries.owasp.org/cheatsheets/Session_Management_Cheat_Sheet.html>, retrieved 2026-10-11): session ID entropy and opacity, cookie attributes, strict acceptance, regeneration on privilege change, timeouts, server-side invalidation, verifier-split storage, and abuse detection and logging. `[documented]`
