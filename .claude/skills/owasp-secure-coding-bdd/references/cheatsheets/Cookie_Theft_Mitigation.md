# Cookie Theft Mitigation

## What it is

How to limit the damage when a valid session cookie is stolen, and how to spot the theft, based on the OWASP
Cookie Theft Mitigation Cheat Sheet. Strong login (two-factor, passkeys) raises the bar on stealing a
password, but a session cookie is a bearer credential: whoever holds a live one can act as the user until it
expires or the server kills it. Hardening the login does nothing against a stolen cookie. This sheet is about
the controls that shrink that window and detect misuse. Detection complements prevention; it does not replace
it.

## The attack it stops

An attacker who obtains a live session cookie (through malware on the device, a phishing page, or an
application flaw such as cross-site scripting) can replay it from their own machine and take over the session
for its remaining lifetime, with no password and no second factor. Until the cookie expires or is revoked,
holding it is equivalent to holding the user's credentials. The opening for defenders: when the cookie is
replayed from a different place or device, the surrounding request environment usually changes, and that
change is detectable.

## Controls

1. **Prevent first.** Apply the preventive session controls from the OWASP Session Management Cheat Sheet
   (secure cookie attributes and the rest), then layer detection on top. Detection never substitutes for
   prevention.
2. **Record a baseline when the session is created.** Store, server-side, the request environment at session
   establishment so later requests can be compared to it. The core signals the sheet names are the client IP
   address, the `User-Agent` header, the `Accept-Language` header, and a timestamp (`Date`). Read these from
   the request on the server (for example Express `req.get()`), and use a server-generated timestamp, never a
   client-supplied one.
3. **Add device- and OS-sensitive headers as extra signals.** `Accept` and `Accept-Encoding` tend to shift
   with the device and OS, so they are useful monitoring targets alongside the core four.
4. **Treat Client Hints as optional signals.** The `Sec-CH-*` User-Agent Client Hint headers (for example
   `sec-ch-ua`, `sec-ch-ua-platform`, `sec-ch-ua-mobile`, `sec-ch-ua-model`, and the rest of the family)
   describe the browser, device, and user preferences. They differ from the `Sec-Fetch-*` Fetch Metadata
   headers, which describe request context. Client Hints can be absent depending on browser support, whether
   the server asked for them, and client permissions, so lean on them only as soft, supporting signals.
5. **Compare each request to the baseline by meaning, not raw equality.** On incoming requests, compare the
   current environment to the stored baseline. A plain value match is too brittle: switching Wi-Fi changes the
   IP, updating the browser changes the `User-Agent`. Judge whether the meaning has shifted materially (for
   example a jump to a different geographic region) rather than whether the bytes differ.
6. **Expect false positives and false negatives, and tune for them.** A region change can be a traveling user
   rather than an attacker (false positive), and an attacker in the same country as the victim can slip past an
   IP-geo check (false negative). No single signal is proof, so weigh signals together and set sensitivity
   deliberately.
7. **Validate a suspect session with account-bound reauthentication.** When you believe a session has been
   hijacked, the dependable answer is to make the user prove who they are once more: lock down or kill the
   running session, send them back through authentication, and hand out a brand-new cookie, at which point the
   stolen one stops working. A CAPTCHA is the wrong tool for this gate; it may throttle scripted abuse, but
   clearing it shows only that a human is present, not that whoever sent the request holds an authenticator
   tied to that one account, and such proof of possession is exactly what authentication demands. Stopping the
   single suspicious request also falls short by itself: you have to restrict or invalidate the questionable
   session as well, and let access resume only once the user has re-authenticated with an account-bound
   authenticator.
8. **Deliver the check as middleware or at a WAF, and write the comparisons defensively.** These checks are
   usually implemented as middleware or provided by a Web Application Firewall in front of the app. Comparison
   helpers must handle missing headers and legitimate change without erroring, and the request handler must
   either end the response or pass control onward (for example Express middleware must end the response or call
   `next()`).
9. **Tune by path if the comparison is costly.** If comparing on every request hurts performance, prioritize
   by path and concentrate the checks on endpoints that view or modify sensitive data.
10. **Consider Device Bound Session Credentials (DBSC), and know its limits.** DBSC ties session renewal to a
    signing key kept on the device: each time a short-lived cookie is reissued, the browser has to prove it
    still holds that key, which makes keeping a session alive from a machine of their own hard for a thief. The
    scheme is no cure, though. Everyday requests keep presenting the cookie as a plain bearer token, so one
    that has been lifted stays good for whatever lifetime is left on it. DBSC likewise offers nothing while the
    intruder remains inside the compromised browser or device, since from there they can mint new cookies or
    exercise the protected key directly. Weigh all of that when you decide how long sessions should live and
    how your incident response will run.

## @security scenario

```gherkin
@security @owasp:cookie-theft @usecase:stolen-cookie-replay
Scenario: A replayed session cookie from a new environment forces reauthentication
  Given a session whose baseline IP region and "User-Agent" were stored when it was created
  When a request carrying that cookie arrives on a sensitive endpoint from a different region and device
  Then the request is blocked and the suspect session is restricted or invalidated
  And access is restored only after reauthentication with an account-bound authenticator
```

This scenario is the canonical copy. When you apply this sheet to real code, add it to the repo's shared
feature-file index (see `bdd-comprehensive-testing`, "Storing BDD scenarios permanently") and wire it into CI
(its "CI/CD wiring") so it runs as a blocking autotest in the same place as every other Gherkin scenario.

## The real guarantee

Environment comparison is probabilistic: it produces both false positives and false negatives, so it can
raise suspicion but it cannot by itself prove a cookie was stolen. What actually ends an attacker's access is
invalidating the suspect session and forcing reauthentication with an account-bound authenticator, backed by
the preventive cookie controls that make theft harder in the first place. DBSC raises the cost of refreshing a
session from another device but leaves a stolen cookie replayable for its lifetime. The scenario proves one
replay is caught; the guarantee is the reauthentication and session invalidation behind it, not the comparison
heuristic.

## Sources

- OWASP Cookie Theft Mitigation Cheat Sheet (<https://cheatsheetseries.owasp.org/cheatsheets/Cookie_Theft_Mitigation_Cheat_Sheet.html>, retrieved 2026-10-11): the environment signals to baseline and compare (IP, `User-Agent`, `Accept-Language`, `Date`, `Accept`, `Accept-Encoding`, `Sec-CH-*`), the false positive and false negative limits, account-bound reauthentication over CAPTCHA, and the DBSC scope and limits. `[documented]`
- NIST SP 800-63B-4, Authentication and Authenticator Management (<https://pages.nist.gov/800-63-4/sp800-63b.html>, retrieved 2026-10-11): the basis for treating possession of an account-bound authenticator, not a solved CAPTCHA, as authentication. `[documented]`
- Device Bound Session Credentials explainer (<https://github.com/w3c/webappsec-dbsc/blob/main/README.md>, retrieved 2026-10-11): the DBSC refresh design and its stated non-goals. `[documented]`
