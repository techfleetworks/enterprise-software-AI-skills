# Clickjacking Defense

## What it is

How to defend against clickjacking (also called UI redress): an attacker loading your page in a hidden or
disguised frame so a victim's clicks land on your controls instead of what they think they are clicking. This
is the per-sheet guidance from the OWASP Clickjacking Defense Cheat Sheet, condensed to the controls that hold
and the attack they stop.

## The attack it stops

An attacker embeds your real page in an `<iframe>` on a site they control, makes it invisible or overlays it on
decoy content, and positions it so the victim's click actually activates a sensitive control on your page (a
"Confirm", "Delete", or "Pay" button) while the victim believes they are interacting with the attacker's page.
A related trick, DoubleClickjacking, abuses the timing of a double-click across separate top-level windows to
land a click on a sensitive control, which the ordinary framing defenses do not cover.

## Controls

The cheat sheet gives three independent frame-based mechanisms (prefer the first, and combine more than one for
defense in depth), plus safeguards for DoubleClickjacking:

1. **CSP `frame-ancestors` (preferred).** Send a `Content-Security-Policy` response header that names who may
   frame the page. Use `frame-ancestors 'none'` to forbid all framing (recommended unless you have a framing
   need), `'self'` to allow only your own site, or an explicit list such as
   `'self' https://*.somesite.com https://myfriend.site.com` to authorize specific origins. The single quotes
   are required on `'none'` and `'self'` but not on host expressions, and a wildcard like
   `https://*.somesite.com` matches subdomains only, so add the bare host separately if you need it. This
   directive obsoletes `X-Frame-Options`; the spec says `X-Frame-Options` must be ignored when `frame-ancestors`
   is enforced, but some old browsers (for example Chrome 40 and Firefox 35) did the opposite.
2. **`X-Frame-Options` response header (legacy companion).** Set it on every HTML response as `DENY` (no
   framing, recommended) or `SAMEORIGIN` (only your own site) to cover browsers that predate `frame-ancestors`.
   Avoid `ALLOW-FROM uri`: it is obsolete, fails in modern browsers, and fails open when unsupported, leaving
   no protection at all. Apply it as a real HTTP header (via a filter, the web server, or a WAF), not a
   `<meta>` tag, because a meta-tag `X-Frame-Options` does not work (the same is true for `frame-ancestors`).
   Know its limits: it is per-page, only one header and one value are honored (so there is no "self plus one
   third party"), nested frames break under `SAMEORIGIN` and `ALLOW-FROM`, and proxies may add or strip it.
3. **`SameSite` cookies (defense in depth).** Mark session cookies `SameSite=Strict` or `SameSite=Lax` so they
   are withheld from cross-site iframe requests, which defeats clickjacking that depends on those cookies for
   authentication. It does not block framing itself, does not withhold cookies on same-site requests (an
   attacker-controlled sibling subdomain on the same scheme can be same-site yet a different origin), gives no
   protection when the attack needs no authentication, and is unsupported by a small share of browsers, so pair
   it with `frame-ancestors` rather than relying on it.
4. **Legacy frame-breaking script (fallback for old browsers).** For browsers without `X-Frame-Options`, put a
   style in `<head>` that hides the body (`body{display:none !important;}`) under an element id, then a script
   that removes that style when the page is top-level (`self === top`) and otherwise navigates out with
   `top.location = self.location`. Do not use the naive `if (top!=self) top.location.href=self.location.href`:
   it is defeated by double framing (the descendant-frame navigation policy blocks setting `parent.location`),
   by an `onBeforeUnload` handler that prompts the user to cancel the escape, by repeatedly navigating to a
   `204 No Content` page to flush the navigation silently, and by disabling JavaScript in the subframe (Chrome
   `sandbox`, Firefox `designMode`).
5. **`window.confirm()` for content that must stay frameable (supplementary only).** A confirmation dialog can
   tell the user what action they are about to take. Treat it as supplementary, because browsers can suppress
   simple dialogs (for example a sandboxed frame without `allow-modals`, where `confirm()` returns `false`), so
   only perform the action when the result is `true`.
6. **DoubleClickjacking safeguards (separate-window attack).** DoubleClickjacking lands a click on a sensitive
   control in another, top-level window, so framing defenses like `X-Frame-Options` and `frame-ancestors` do
   not stop it, and neither `Lax` nor `Strict` `SameSite` verifies intent. On pages your own application serves
   (consent screens, payment confirmations, account-security settings pages), make any high-risk action depend
   on two things: the user reviewing exactly what they are about to approve, and the action passing a
   transaction authorization that the server enforces. A confirmation button on its own is not enough to stop
   UI redress. You may additionally gray out sensitive controls until some prior interaction has occurred, but
   lean on that only as a supplement, because a stray mouse move or keypress does not demonstrate that the user
   understood or approved. When you do gray a control out, mark it disabled from the outset and confirm it can
   still be re-enabled and triggered by mouse, keyboard, touch, or assistive technology, since a click can
   arrive through any of them. Continue to apply the framing defenses above against frame-based attacks.

## @security scenario

```gherkin
@security @owasp:clickjacking @usecase:block-iframe-embedding
Scenario: A sensitive page refuses to render inside an attacker's iframe
  Given the account-settings page is served with "Content-Security-Policy: frame-ancestors 'none'"
  When an attacker page at "https://evil.com" loads it inside an "<iframe>"
  Then the browser refuses to render the page in the frame
  And the user cannot be tricked into clicking its controls through an overlay
```

This scenario is the canonical copy. When you apply this sheet to real code, add it to the repo's shared
feature-file index (see `bdd-comprehensive-testing`, "Storing BDD scenarios permanently") and wire it into CI
(its "CI/CD wiring") so it runs as a blocking autotest alongside every other Gherkin scenario.

## The real guarantee

The structural control is that the browser enforces the framing policy itself: with `frame-ancestors` (or
`X-Frame-Options`) sent on every HTML response, it refuses to render the page in any frame whose ancestor
origin is not on the list, so there is no hidden overlay for an attacker to trick a click through. The
`@security` scenario proves one `evil.com` iframe is blocked; the per-response, browser-enforced
`frame-ancestors` policy is what blocks every unauthorized framer. Note the one case it does not cover:
DoubleClickjacking targets a top-level window, so framing headers do not apply, and the guarantee there is
server-enforced transaction authorization on the sensitive action, not a client-side check.

## Sources

- OWASP Clickjacking Defense Cheat Sheet (<https://cheatsheetseries.owasp.org/cheatsheets/Clickjacking_Defense_Cheat_Sheet.html>, retrieved 2026-10-11): the framing defenses (`frame-ancestors` and `X-Frame-Options`, including values, mistakes, and limitations), `SameSite` cookies as defense in depth, the legacy frame-breaking script and the attacks that defeat naive ones (double framing, `onBeforeUnload`, 204 no-content flushing, restricted zones), `window.confirm()` as a supplement, and DoubleClickjacking safeguards. `[documented]`
