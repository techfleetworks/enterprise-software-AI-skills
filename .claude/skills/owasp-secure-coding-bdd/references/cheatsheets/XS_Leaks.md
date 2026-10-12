# Cross-Site Leaks (XS-Leaks)

## What it is

How to stop a malicious site from inferring private facts about your logged-in users by watching the side
effects of cross-site requests. This is the per-sheet guidance from the OWASP Cross-Site Leaks (XS-Leaks)
Cheat Sheet, condensed to the browser side-channels it describes and the isolation controls that close them.
XS-Leaks do not read your responses; they read the small observable signals around a response to answer
yes-or-no questions about the victim.

## The attack it stops

The Same-Origin Policy stops a cross-origin site from reading your responses, but it leaves small signals
observable: whether a request succeeded or failed, how many frames a page loaded, whether an element gained
focus, how long a resource took to load. An attacker lures the logged-in victim to a page they control, makes
cross-site requests to your app, and watches those signals to deduce answers such as "is this user logged
in," "is this user an admin," "is this the account with ID 1337," or "is a given email in this user's
contacts." Each answer is usually a single bit, but enumerated in a loop these bits expose private data and
de-anonymize the user.

## Controls

The sheet pairs each side-channel with an isolation control. In its own words:

- **SameSite cookies.** Set the `SameSite` attribute on session cookies. `Strict` never sends the cookie from
  another site; `Lax` (the Chromium default when the attribute is absent) sends it only on top-level GET
  navigations; `None` sends it cross-site but requires HTTPS. This is defense in depth that shrinks the attack
  surface for many XS-Leaks and for CSRF, but on its own it does not close window-based leaks such as frame
  counting and navigation. Note that "site" here means scheme plus registrable domain (eTLD+1), not origin, so
  the port and subdomain do not matter.
- **Framing protection.** If other origins have no reason to frame your pages, block it so an attacker cannot
  embed you and watch focus, blur, or frame signals (the element-ID focus attack relies on framing). Use the
  Content Security Policy `frame-ancestors` directive, with `X-Frame-Options` as a fallback for older
  browsers. This also defends against clickjacking.
- **Fetch Metadata request headers.** The browser attaches these automatically, so use them on the server to
  build a resource isolation policy. Reject a request whose `Sec-Fetch-Dest` is `iframe` when the endpoint
  should never be framed, and reject a request whose `Sec-Fetch-Site` is `cross-site` when the endpoint should
  only be reached from your own site. Check browser support and add a safe fallback for when the header is
  absent.
- **Subresource tokens for error-event leaks.** Attacks that load an endpoint as a script or image and watch
  `onload` versus `onerror` can tell existence or status apart. Guard a sensitive endpoint with a long,
  unpredictable, per-user token that the back end validates, so an attacker who cannot guess the token cannot
  trigger the distinguishing event. It works, but it adds real implementation overhead.
- **Cross-Origin-Resource-Policy (CORP).** Return this response header so the browser refuses to let other
  sites load your resources at all, including static images. Use `same-origin` or `same-site` to isolate, and
  `cross-origin` only where sharing is intended.
- **Strict postMessage targetOrigin.** When you send with `postMessage`, always pass the exact target origin
  and never the wildcard `*`. A wildcard lets any window that obtains a reference read the message, leaking
  the data to an attacker-controlled page.
- **Cross-Origin-Opener-Policy (COOP).** Set this header (for example `same-origin`) so a document you open,
  or that opens you, does not share your browsing context group and cannot reach your `window` object. This
  closes frame-counting leaks that read `window.frames.length` on an opened window.
- **Cache-timing protection.** A resource served from cache loads far faster than one from the server, and an
  attacker can time a shared resource to learn whether the victim has access to it. Add a unique per-user
  token to the URL of such a resource so the attacker cannot address the same cache entry, or set
  `Cache-Control: no-store` on resources worth protecting, accepting the reload cost.

## @security scenario

```gherkin
@security @owasp:xs-leaks
Scenario: A sensitive endpoint rejects a cross-site request so no error-event oracle leaks
  Given an authenticated endpoint that applies a Fetch Metadata resource isolation policy
  When a request arrives with the header Sec-Fetch-Site set to "cross-site"
  Then the server responds 403 and returns no resource
  And the attacker's page cannot tell from onload or onerror whether the resource exists
```

This scenario is the canonical copy. When you apply this sheet to real code, add it to the repo's shared
feature-file index (see `bdd-comprehensive-testing`, "Storing BDD scenarios permanently") and wire it into CI
(its "CI/CD wiring") so it runs as a blocking autotest alongside every other Gherkin scenario.

## The real guarantee

What actually stops an XS-Leak is isolation enforced by the browser from server-set headers: SameSite cookies
so cross-site requests carry no session, Fetch Metadata and CORP so cross-site loads are refused, COOP so an
opener cannot touch your window, and a strict targetOrigin so a message reaches only its intended origin. The
`@security` scenario proves one cross-site request is refused; the isolation policy on the endpoint is what
refuses every cross-site probe and removes the oracle. A test is a check; the browser-enforced isolation is
the guarantee.

## Sources

- OWASP Cross-Site Leaks (XS-Leaks) Cheat Sheet (<https://cheatsheetseries.owasp.org/cheatsheets/XS_Leaks_Cheat_Sheet.html>, retrieved 2026-10-11): the side-channels (element-ID focus and blur, error events, postMessage, frame counting, cache timing) and their defenses (SameSite cookies, framing protection via frame-ancestors and X-Frame-Options, Fetch Metadata Sec-Fetch-Dest and Sec-Fetch-Site, subresource tokens, CORP, strict postMessage targetOrigin, COOP, and cache-timing protection). `[documented]`
