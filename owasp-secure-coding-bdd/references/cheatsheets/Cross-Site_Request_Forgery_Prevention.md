# Cross-Site Request Forgery Prevention

## What it is

How to stop Cross-Site Request Forgery (CSRF): an attacker making a logged-in user's browser send a
state-changing request the user never meant to send. This is the per-sheet guidance from the OWASP Cross-Site
Request Forgery Prevention Cheat Sheet, condensed to the controls that hold and the attack they stop.

## The attack it stops

Because browsers attach a site's cookies (including the session cookie) to every request to that site, a page
the victim visits elsewhere can quietly fire a request at your app, and the server cannot tell it apart from a
genuine one. A malicious page, email, or ad gets the authenticated victim's browser to submit, say, a password
change, a funds transfer, or a purchase, using the victim's own session, usually without the victim noticing
until after the action is done. The damage is bounded only by what that user is allowed to do, which for an
admin account can be a lot.

## Controls

In the cheat sheet's order of preference:

1. **Use the framework's built-in protection first.** Before hand-rolling anything, check whether your stack
   already ships CSRF defense and turn it on, because built-ins are maintained upstream and avoid subtle
   mistakes. The sheet names ASP.NET anti-forgery tokens and Go 1.25's standard-library `CrossOriginProtection`
   (a Fetch-Metadata defense that validates `Sec-Fetch-Site`).
2. **Add CSRF tokens to every state-changing request and validate them server-side** when there is no built-in.
   Two token patterns:
   - **Synchronizer token pattern (stateful apps).** The server generates a token (once per session, or per
     request for a shorter attack window at some usability cost, such as breaking the "Back" button), stores it
     in the session, and checks that each request carries a token that both exists and matches. Reject and log
     on mismatch or absence. Tokens must be unique per session, secret, and unpredictable (generated with a
     CSPRNG). Deliver the token in the response body and accept it back as a hidden form field or a custom
     header; never put it in a cookie for this pattern, and never leak it in a URL or logs (a GET can leak it
     through history, log files, and `Referer`). A custom header is safer than a hidden field because
     custom-header requests are subject to the same-origin policy.
   - **Double-submit cookie (stateless apps).** Prefer the **Signed Double-Submit Cookie**: bind the token to
     session-specific data (such as the session ID) with HMAC and a server-side secret, because a plain signed
     or random token without session binding still falls to cookie injection. Build the HMAC from a
     session-dependent value that rotates each login (not a static email or user ID), the secret key, and a
     random anti-collision value; do not add a timestamp (a CSRF token is not an access token, so a new session
     issues a new token). Store it in a cookie that is `Secure` but not `HttpOnly` (the client script must read
     it), submit it back as a header or form field, and validate by recomputing the HMAC for the current
     session and comparing in constant time. The **Naive Double-Submit Cookie** (match a random cookie against
     a request value) is discouraged: it falls to cookie injection from a sibling subdomain, DNS takeover, or
     plaintext-HTTP injection on a non-`__Host-` cookie, and the submitted value must come from a header or
     form field, never a cookie-against-cookie check.
3. **Fetch Metadata headers (modern-browser targets).** Use `Sec-Fetch-Site` as the primary signal: reject
   unsafe methods (`POST`, `PUT`, `PATCH`, `DELETE`) when it is `cross-site`, allow `same-origin`, treat
   `same-site` as trusted only if you trust sibling subdomains, and allow `none` for user-driven top-level
   navigations. Refine with `Sec-Fetch-Mode`, `Sec-Fetch-Dest`, and `Sec-Fetch-User`, and ignore values the
   spec does not list. A fallback to origin verification is mandatory because some legacy browsers omit these
   headers; when they are absent, fail closed on sensitive endpoints or fall back to tokens or origin checks
   elsewhere. It requires trustworthy (HTTPS) URLs end to end (enforce with HSTS) and no state changes on safe
   methods. Add `Vary: Sec-Fetch-Site, Origin` so caches do not cross responses, start in log-only mode, watch
   user-agent coverage, and document any cross-origin endpoints you exempt.
4. **Custom request headers for AJAX/API endpoints.** When you do not use `<form>` tags, require a custom
   header such as `X-CSRF-Token` (framework conventions include `X-XSRF-Token`, `CSRF-Token`, and
   `X-CSRFToken`). The browser preflights any request carrying a custom header, so its presence proves the
   request was not a simple cross-site one; no token or server state is needed. If the API allows credentialed
   CORS (`Access-Control-Allow-Credentials: true`), never pair it with `Access-Control-Allow-Origin: *`;
   allowlist only origins you control, and avoid broad subdomain regexes that a subdomain takeover could abuse.
5. **Block simple requests where you can.** `<form>` submissions are "simple" requests that browsers send
   cross-origin with no preflight, so protect them with tokens. Rejecting the simple content types
   (`application/x-www-form-urlencoded`, `multipart/form-data`, `text/plain`) forces a CORS preflight on JSON
   APIs.
6. **Defend against client-side CSRF.** When your own same-origin JavaScript builds requests from
   attacker-controllable inputs (the URL, `window.name`, `document.referrer`, `postMessage`), tokens and
   SameSite do not help. Keep requests independent of such inputs, validate input strictly (format and allowed
   values, limited to non-state-changing use), or drive requests from a predefined safe list chosen by a switch
   value.
7. **Add at least one defense-in-depth layer:**
   - **SameSite cookies.** Set session cookies `SameSite=Lax` or `Strict` (`Strict` blocks all cross-site
     sends; `Lax` still allows safe-method top-level navigations; `None` requires `Secure`). It is defense in
     depth, not a standalone fix: `Lax` does not stop a state-changing `GET`, SameSite is scoped to the
     registrable domain so sibling subdomains count as same-site, top-level navigation and window-opening
     tricks slip through, coverage is not universal, and it does nothing for client-side CSRF. Do not scope the
     cookie to a parent domain, because every subdomain would then share it. It can stand alone only in narrow
     cases: no registrable domain shared with untrusted hosts, no safe-method state changes, `SameSite=Strict`
     (or `Lax` plus the `__Host-` prefix and a `GET` audit), Origin or Referer checks in place, and acceptance
     that unsupported browsers are excluded.
   - **Verify the origin with standard headers.** Compare the source origin (`Origin`, or `Referer` when
     `Origin` is absent) against the target origin and reject on mismatch; these are forbidden headers that only
     the browser can set. Make the target-origin check exact so `example.org.attacker.com` fails (match through
     the trailing `/`). Behind proxies, derive the target origin from server config (most trustworthy), the
     `Host` header, or `X-Forwarded-Host` only from a trusted proxy that strips client-supplied values. Treat
     `Origin: null` and missing headers as not-same-origin, never allowlist literal `null`, and fall back to a
     server-validated token rather than skipping the check.
   - **Cookie prefixes.** Name CSRF and session cookies with `__Host-` (no `Domain`, path `/`, `Secure`, not
     writable from a subdomain) or the weaker `__Secure-` prefix to resist cookie injection and overwrite.
   - **User-interaction defenses for sensitive actions.** For high-risk operations (password change, money
     transfer) require re-authentication or a one-time token. Do not use CAPTCHA for CSRF: it proves a human,
     not intent, and a solved response can be sourced from another session.
8. **Never use GET for state-changing operations**, and if one exists anyway, protect it like any other
   state-changing request.
9. **Guard login forms (login CSRF).** An unauthenticated login form is still a target: an attacker can log a
   victim into the attacker's account and capture what the victim then enters. Use pre-sessions with a token in
   the login form, and destroy the pre-session and issue a fresh session on login to avoid session fixation.

**Overarching caveats.** XSS defeats every CSRF defense, so preventing XSS (see the XSS Prevention Cheat Sheet)
is a prerequisite, not an alternative. Client-side token-attachment helpers do not replace server-side
validation: prefer your HTTP client's maintained CSRF integration (for example Angular's `HttpClient` XSRF
support or Axios's `withXSRFToken`) over global request overrides, restrict token attachment to trusted
same-origin or allowlisted destinations so it is not disclosed to a third party, and keep `GET`, `HEAD`, and
`OPTIONS` free of state changes.

## @security scenario

```gherkin
@security @owasp:csrf @usecase:state-change-requires-token
Scenario: A funds-transfer POST without a valid CSRF token is rejected
  Given an authenticated user session on the banking app
  And the server issued a per-session synchronizer token stored in the session
  When a cross-site page submits a POST to "/transfer" using the victim's cookies but no matching CSRF token
  Then the server rejects the request with "403" and makes no transfer
  And the attempt is logged as a possible CSRF event
```

This scenario is the canonical copy. When you apply this sheet to real code, add it to the repo's shared
feature-file index (see `bdd-comprehensive-testing`, "Storing BDD scenarios permanently") and wire it into CI
(its "CI/CD wiring") so it runs as a blocking autotest alongside every other Gherkin scenario.

## The real guarantee

What actually stops CSRF is that every state-changing request must prove it came from your own application
through something an attacker's cross-site page cannot supply: a secret, session-bound token it cannot read
(synchronizer, or HMAC signed double-submit), or a browser-set signal it cannot spoof (`Sec-Fetch-Site` or a
verified `Origin`). The `@security` scenario proves one forged transfer is blocked; the server-side token
comparison (constant-time, bound to the session) is what makes every forged request fail. A test is a check;
the mandatory server-side validation on the owning endpoint is the guarantee. Because XSS can read the token,
XSS prevention is part of that guarantee too.

## Sources

- OWASP Cross-Site Request Forgery Prevention Cheat Sheet (<https://cheatsheetseries.owasp.org/cheatsheets/Cross-Site_Request_Forgery_Prevention_Cheat_Sheet.html>, retrieved 2026-10-11): the ordered CSRF defenses (built-in framework protection, synchronizer tokens, signed and naive double-submit cookies, Fetch Metadata `Sec-Fetch-Site`, custom request headers, blocking simple requests and content types, client-side CSRF mitigations, SameSite cookies, standard-header origin verification, cookie prefixes, user-interaction defenses, and login-CSRF handling). `[documented]`
