# HTTP Security Response Headers

## What it is

How to use HTTP response headers to harden a web application inside the browser, based on the OWASP HTTP
Security Response Headers Cheat Sheet. These headers are a low-effort, high-value layer: with a handful of
response headers you can blunt cross-site scripting, clickjacking, protocol downgrade, cross-origin side
channels, information disclosure, and unsafe caching. They matter for responses the browser actually renders
or interprets, and many are meaningless on a JSON REST API response that is never rendered.

## The attack it stops

These headers push back on several browser-side attacks at once. They stop framing-based clickjacking, where
your page is loaded invisibly inside an attacker's page and the user is tricked into clicking it. They stop
MIME sniffing confusion, where the browser guesses a content type and runs a non-script resource as script.
They defend against protocol downgrade and interception by forcing HTTPS on return visits. They limit referrer
leakage of paths and query strings to third parties, and feature abuse where an injection silently switches on
the camera, microphone, or geolocation. They raise the bar on cross-origin side-channel attacks such as
Spectre, reduce tech-stack fingerprinting from chatty response headers, keep sensitive responses out of shared
caches, and make user-provided downloads save instead of executing inline. No single header is a full defense;
they work as layers that shrink the attack surface.

## Controls

### Headers to set

- **`Strict-Transport-Security` (HSTS).** Force HTTPS on future visits even if the user types http.
  Recommended value `max-age=63072000; includeSubDomains; preload`. Understand it before enabling: a long
  `max-age` combined with an expired or revoked certificate can lock out legitimate users until the max-age
  elapses. Meet the published preload requirements before requesting preload inclusion.
- **`Content-Security-Policy` (CSP).** Declare which origins may supply scripts and other content, which
  detects and mitigates XSS and data injection. It is powerful but complex to author and maintain, and it is
  only meaningful for responses that load and interpret code, not for a REST API that returns non-rendered
  data. Its `frame-ancestors` directive is the modern replacement for `X-Frame-Options`.
- **`X-Content-Type-Options`.** Set `nosniff` so the browser honors the declared `Content-Type` instead of
  guessing it. This blocks MIME sniffing, which can turn a non-executable type into an executable one (MIME
  confusion). Pair it with correct `Content-Type` values everywhere.
- **`X-Frame-Options`.** The legacy clickjacking control that stops your page from being loaded in a
  `<frame>`, `<iframe>`, `<embed>`, or `<object>`. Prefer CSP `frame-ancestors` where supported; otherwise use
  `DENY`. It only helps on responses with something to interact with, not on redirects or JSON API responses.
- **`Referrer-Policy`.** Control how much of the referring URL is sent in the `Referer` header. Modern
  browsers default to `strict-origin-when-cross-origin` (same-origin requests send origin, path, and query;
  cross-origin requests send only the origin; HTTPS-to-HTTP requests send nothing), but set it explicitly
  rather than relying on the default.
- **`Content-Type`.** Always send the correct media type, with a charset for HTML (`text/html; charset=UTF-8`).
  A wrong type can cause an untrusted resource (say an uploaded image) to be interpreted as HTML, which enables
  XSS; the `charset` attribute is needed to prevent XSS in HTML pages. This is only a vulnerability when the
  content is rendered by the client and the resource is untrusted.
- **`Cache-Control`.** Govern caching of sensitive responses. Use `no-store` to keep sensitive responses out
  of compliant HTTP caches, and `private` to limit caching to the user's own (non-shared) cache. Do not rely
  on default caching for protected content. Note that `no-cache` does not prevent storage; it allows caching
  but requires revalidation before reuse. And `no-store` does not reach the Cache API, which ignores HTTP
  caching headers, so sensitive responses must be explicitly excluded from application-managed caches and any
  existing entries removed.
- **Cross-origin isolation trio.** These work together against Spectre-class cross-origin reads:
  `Cross-Origin-Opener-Policy` set to `same-origin` keeps a top-level document out of a shared
  browsing-context group with cross-origin documents; `Cross-Origin-Embedder-Policy` set to `require-corp`
  stops the document loading cross-origin resources that have not granted permission through CORP or CORS; and
  `Cross-Origin-Resource-Policy` set to `same-site` limits which origins may embed a given resource, blocking
  the response before it enters an attacker process. These are browser concepts and add little on non-browser
  or REST clients.
- **`Permissions-Policy` (formerly Feature-Policy).** Allow or deny specific browser features per origin, in
  the top-level page and in embedded frames, so an injection cannot silently enable them. Disable what the
  site does not need, for example `geolocation=(), camera=(), microphone=()`.
- **`Access-Control-Allow-Origin`.** This CORS header relaxes the Same Origin Policy, so use it narrowly. Name
  specific origins (for example `https://yoursite.com`) rather than `*`, and never expose sensitive content on
  a URL that returns `*`. A public API meant for any origin may legitimately need `*`. Allow-list known,
  trusted origins explicitly; do not reflect the request's `Origin` header back unconditionally, which turns
  the allow-list into "any origin." Only set `Access-Control-Allow-Credentials: true` alongside a specific
  allow-listed origin, never alongside `*`: credentials plus a wildcard would let any site make
  authenticated cross-origin requests.
- **`X-Robots-Tag`.** Control how compliant crawlers index non-HTML resources such as PDFs and images. Use
  `noindex, nofollow` for private or sensitive content and `index, follow` for public content, with directives
  like `noarchive`, `nosnippet`, or `noimageindex` as needed. Only compliant crawlers obey it, and they must
  still fetch the resource to read the header.
- **`X-DNS-Prefetch-Control`.** The browser default (DNS prefetching on) suits most sites, but if you do not
  control the links on a page, set `off` to avoid leaking information to those domains through DNS lookups. It
  is not a standardized, fully supported feature, so do not depend on it for anything production-sensitive.
- **Secure file download headers.** When serving user-provided files, `Content-Disposition: attachment` forces
  a download instead of inline rendering, `Content-Type: application/octet-stream` suits unknown or binary
  files, and `X-Content-Type-Options: nosniff` must be present to stop MIME sniffing. Together they reduce XSS
  and unintended execution of the file.

### Headers to remove or disable

- **Fingerprinting headers.** Strip or blank the `Server` detail (for example set it to a non-informative
  `webserver`), remove every `X-Powered-By` header, and disable the .NET version headers `X-AspNet-Version`
  (via `enableVersionHeader="false"` in `web.config`) and `X-AspNetMvc-Version` (via
  `MvcHandler.DisableMvcResponseHeader = true`). Removing them raises the bar, though attackers have other
  ways to fingerprint a stack.
- **`X-XSS-Protection`.** The legacy browser XSS filter can itself introduce vulnerabilities in otherwise safe
  sites, so do not rely on it. Turn it off with `0` and depend on a CSP that disallows inline JavaScript
  instead.
- **`Expect-CT`.** Effectively obsolete now that mainstream clients require Certificate Transparency. Do not
  use it, and remove it where present.
- **`Public-Key-Pins` (HPKP).** Removed from Chromium in 2018 and unsupported by modern browsers. Do not use
  it; remove any `Public-Key-Pins` or `Public-Key-Pins-Report-Only` headers and rely on Certificate
  Transparency and CAA DNS records instead.

### Set-Cookie

`Set-Cookie` is not a security header in itself, but its attributes are critical to session security. Send one
`Set-Cookie` header per cookie and configure the attributes per the OWASP Session Management Cheat Sheet.

### Setting headers across platforms, and verifying

The sheet gives examples for PHP, Apache, IIS, HAProxy, Nginx, and Express (via the `helmet` package). Two
platform gotchas are worth calling out: in Apache, `Header set` (onsuccess) and `Header always set` write to
separate tables and can produce duplicate headers, so unset a header in both contexts before using
`always set`; in Nginx, `add_header` only applies to some status codes unless you append `always`. Verify the
deployed result with a scanner such as Mozilla Observatory (which checks the homepage) or a crawler-based tool
that checks every page.

## @security scenario

```gherkin
@security @owasp:http-headers @usecase:response-hardening-headers
Scenario: A rendered page response ships the baseline security headers
  Given an endpoint that returns an HTML page the browser will render
  When a client requests the page over HTTPS
  Then the response sets "Strict-Transport-Security" with a long "max-age", "X-Content-Type-Options: nosniff", and a "Content-Security-Policy" that restricts script sources
  And the response omits fingerprinting headers such as a detailed "Server" value and any "X-Powered-By"
```

This scenario is the canonical copy. When you apply this sheet to real code, add it to the repo's shared
feature-file index (see `bdd-comprehensive-testing`, "Storing BDD scenarios permanently") and wire it into CI
(its "CI/CD wiring") so it runs as a blocking autotest in the same place as every other Gherkin scenario.

## The real guarantee

Response headers are browser-enforced hints. They help only in conforming browsers and only on responses that
are actually rendered or interpreted, and several of them (`X-XSS-Protection`, `Expect-CT`, `Public-Key-Pins`)
are things to remove rather than add. A header does not fix the underlying bug: HSTS does not fix a broken
certificate, CSP does not remove the XSS sink, and `nosniff` does not correct a wrong `Content-Type`. The
guarantee is the server generating correct, safe responses (right media types, no secrets in cacheable
responses, HTTPS everywhere, narrow CORS) with these headers as defense in depth. The scenario checks that
specific headers are present or absent; the real protection is the correct server behavior behind them.

## Sources

- OWASP HTTP Security Response Headers Cheat Sheet (<https://cheatsheetseries.owasp.org/cheatsheets/HTTP_Headers_Cheat_Sheet.html>, retrieved 2026-10-11): every header above with its recommended value and caveats, the headers to remove (`X-XSS-Protection`, `Expect-CT`, `Public-Key-Pins`, the fingerprinting headers), the platform-setting gotchas (Apache onsuccess versus always, Nginx `always`), and the verification tools. `[documented]`
- OWASP Secure Headers Project, Response Headers (<https://owasp.github.io/www-project-secure-headers/response-headers/>, retrieved 2026-10-11): the project reference the sheet points to for the current recommended header set. `[documented]`
