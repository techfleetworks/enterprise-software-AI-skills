# HTTP Strict Transport Security

## What it is

How to use the HSTS response header so a browser, once it has seen your site, refuses to talk to it over
plain HTTP and will not let the user click through a bad-certificate warning. This is the per-sheet
guidance from the OWASP HTTP Strict Transport Security Cheat Sheet, condensed to the controls that hold
and the attack they stop.

## The attack it stops

Even on an HTTPS site, the first request a user makes is often plain HTTP: they type the bare domain,
follow an old `http://` bookmark, or hit a stray HTTP link. A man-in-the-middle on that first hop can keep
the user on HTTP and strip the encryption, or present a bogus certificate and hope the user accepts the
warning. HSTS removes both openings: a supported browser that has recorded the policy rewrites every
request for the domain to HTTPS before it leaves, and it makes the certificate error impossible to
override.

## Controls

In the cheat sheet's order:

1. **Send the `Strict-Transport-Security` header over HTTPS** with a `max-age` in seconds. A long life
   such as `max-age=63072000` (two years) tells the browser to stay on HTTPS for that long.
2. **Add `includeSubDomains` when every current and future subdomain is HTTPS.** This extends the policy
   down the tree; without it the rule covers only the exact host that sent it, which leaves cookie-based
   attacks from subdomains open.
3. **Roll out with a short `max-age` first.** Start with something small like `max-age=86400` (one day)
   so an early mistake expires quickly, then raise it once the site is proven healthy on HTTPS.
4. **Use `preload` only with full awareness of the consequences.** Adding `preload` (for example
   `max-age=63072000; includeSubDomains; preload`) and submitting the domain to the preload list bakes
   HTTPS-only into browsers before the first visit, but reversing it is slow and can lock users out of the
   site and its subdomains if you ever need HTTP again, so read the removal process before you send it.
5. **Keep the privacy trade-off in view.** The persistent HSTS state can be abused to track users without
   cookies, so treat it as a known side effect of the policy.
6. **Still set the `Secure` flag on cookies.** HSTS with `includeSubDomains` blocks most subdomain cookie
   attacks, but the cookie `Secure` attribute is a separate, necessary defense that stops some of what
   remains.

## @security scenario

```gherkin
@security @owasp:hsts @usecase:https-downgrade-resistance
Scenario: A returning browser refuses HTTP and will not bypass a cert warning
  Given the site has sent Strict-Transport-Security with a long max-age and includeSubDomains over HTTPS
  When the user later follows an http:// link to the domain or a subdomain
  Then the browser rewrites the request to HTTPS before any plaintext leaves the device
  And when a man-in-the-middle presents an invalid certificate, the browser blocks it with no click-through
```

This scenario is the canonical copy. When you apply this sheet to real code, add it to the repo's shared
feature-file index (see `bdd-comprehensive-testing`, "Storing BDD scenarios permanently") and wire it into
CI (its "CI/CD wiring") so it runs as a blocking autotest alongside every other Gherkin scenario.

## The real guarantee

What actually stops the downgrade is the browser's recorded HSTS policy: once it holds the header, the
upgrade to HTTPS happens inside the client before any request goes out, and the certificate warning can no
longer be waived. The `@security` scenario proves one return visit is upgraded and one bad certificate is
refused; the header, with a long `max-age` and `includeSubDomains`, is what makes every later request to
the domain behave that way. A test is a check; the delivered HSTS policy is the guarantee.

## Sources

- OWASP HTTP Strict Transport Security Cheat Sheet (<https://cheatsheetseries.owasp.org/cheatsheets/HTTP_Strict_Transport_Security_Cheat_Sheet.html>, retrieved 2026-10-11): the header directives (`max-age`, `includeSubDomains`, `preload`), the short-max-age rollout advice, the preload warning, the tracking-privacy caveat, and the subdomain-cookie and `Secure`-flag notes. `[documented]`
