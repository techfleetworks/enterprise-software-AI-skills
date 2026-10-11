# Unvalidated Redirects and Forwards

## What it is

How to stop an app from sending a user to an attacker-chosen destination. The hole opens when a redirect target
or an internal forward target comes straight from untrusted input, with no check that the target is safe. This
is the per-sheet guidance from the OWASP Unvalidated Redirects and Forwards Cheat Sheet, condensed to the
controls that hold and the attack they stop.

## The attack it stops

When code redirects to whatever a request parameter says, an attacker can craft a link that starts on your
trusted site but bounces the victim somewhere malicious. The cheat sheet gives the concrete case: a page like
`http://example.com/example.php?url=http://malicious.example.com` reads the `url` parameter and redirects to it.
The victim sees the link pointing at `example.com`, trusts it, and clicks, but lands on the attacker's site.
That makes a convincing phishing lure for stealing credentials, because the first hop really is your domain. The
forward version is worse in a different way: an attacker builds a URL such as
`http://www.example.com/function.jsp?fwd=admin.jsp` that slips past the app's access-control check and then
forwards them into a privileged function they should never reach.

## Controls

The cheat sheet lists safe approaches roughly in order of how much protection they give:
1. **Do not use redirects and forwards at all** if you can avoid them.
2. **Never take the destination directly from user input.** If you redirect or forward, do not let the request
   supply the raw target URL.
3. **Map a short name, ID, or token to the real URL on the server (preferred).** Let the user send only a key,
   then look up the full destination server-side. This gives the strongest protection against tampering. Watch
   that it does not become an enumeration bug where someone cycles through IDs to discover every target.
4. **If user input is unavoidable, validate and authorize it.** Confirm the supplied value is valid, fits the
   app, and that this user is allowed to be sent there.
5. **For a local return URL, lean on a framework helper that refuses off-site targets,** such as ASP.NET Core
   `LocalRedirect` or `IsLocalUrl`.
6. **For required external destinations, use an explicit allowlist built from parsed URL parts.** Match against
   known-good destinations, not raw strings.
7. **Show an interstitial "you are leaving our site" page.** Force redirects through a notice that displays the
   destination clearly and makes the user click to confirm.

**Validating URLs safely:**
- Use a maintained URL parser that matches both the redirect API and how browsers read URLs.
- Check the parsed scheme, the canonical host, and the effective port each against an allowlist you spell out,
  and pin the path too when only certain endpoints are allowed.
- Reject userinfo (the `user@` part) and any ambiguous input.
- Redirect using the already-validated URL object, not a string you reassemble afterward.
- Never use raw prefix or suffix string matching; userinfo tricks and lookalike hostnames slip past it.
- Even with validation, a server-side lookup from an approved ID stays the better choice over accepting
  arbitrary URLs.

## @security scenario

```gherkin
@security @owasp:open-redirect @usecase:phishing-redirect-blocked
Scenario: A redirect endpoint refuses an attacker-controlled external URL
  Given a redirect endpoint that only sends users to allowlisted destinations
  When an attacker requests the endpoint with url set to "http://malicious.example.com"
  Then the redirect is refused and the user is not sent to the attacker's site
  And the destination is resolved from a server-side allowlist rather than from the raw parameter
```

This scenario is the canonical copy. When you apply this sheet to real code, add it to the repo's shared
feature-file index (see `bdd-comprehensive-testing`, "Storing BDD scenarios permanently") and wire it into CI
(its "CI/CD wiring") so it runs as a blocking autotest in the same place as every other Gherkin scenario.

## The real guarantee

What actually closes the hole is keeping the destination out of the attacker's hands: resolve it from a
server-side allowlist or ID map so the request never supplies a raw target, and when input is unavoidable,
validate the parsed scheme, host, and port against known-good values. The `@security` scenario proves one
malicious URL is refused; the server-side allowlist is what makes every crafted target fail. A test is a check;
the server-controlled destination is the guarantee.

## Sources

- OWASP Unvalidated Redirects and Forwards Cheat Sheet (<https://cheatsheetseries.owasp.org/cheatsheets/Unvalidated_Redirects_and_Forwards_Cheat_Sheet.html>, retrieved 2026-10-11): the ordered prevention list (avoid, server-side ID mapping, validate and authorize, framework local-redirect helpers, parsed-component allowlisting, interstitial page) and the safe URL-validation rules summarized above. `[documented]`
