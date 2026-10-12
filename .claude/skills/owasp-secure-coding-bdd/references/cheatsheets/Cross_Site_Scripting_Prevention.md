# Cross Site Scripting Prevention

## What it is

How to stop cross-site scripting (XSS): an attacker getting their script to run in another user's browser on
your site. This is the per-sheet guidance from the OWASP Cross Site Scripting Prevention Cheat Sheet, condensed
to the controls that hold and the attack they stop.

## The attack it stops

Weidman's web-application chapter calls XSS "perhaps the most common and most debated web application security
vulnerability," and describes the mechanism: "attackers can inject malicious scripts into an otherwise
innocuous site to be executed in the user's browser." She splits it into stored XSS (the script is saved on the
server, in a forum post or review, and runs for every viewer) and reflected XSS (the script rides in on a
request and is echoed back in the response). A working XSS can steal sessions, act as the victim, or deface the
page.

## Controls

From the cheat sheet (no single technique solves XSS; use these together):
1. **Use the framework's auto-escaping** and know its escape hatches (for example React's
   `dangerouslySetInnerHTML`).
2. **Contextual output encoding.** Encode untrusted data for exactly where it lands, because "browsers parse
   HTML, JS, URLs, and CSS differently": HTML-entity encoding in HTML bodies, attribute encoding in quoted
   attributes, a JavaScript encoder in script strings, CSS encoding in style values, URL encoding in
   parameters.
3. **Sanitize rich HTML** with a maintained library (such as DOMPurify) when users must submit formatted
   content that encoding would break.
4. **Prefer safe sinks** like `textContent` over `innerHTML`, and keep untrusted data out of dangerous
   contexts (script blocks, event handlers, `eval`).
5. **Defense in depth:** Content Security Policy, cookie attributes, and Trusted Types, none as the primary
   defense.

## @security scenario

```gherkin
@security @owasp:xss @usecase:stored-xss
Scenario: User-submitted content cannot inject an executable script
  Given a page that stores and renders user-submitted text
  When a user submits the comment "<script>alert(document.cookie)</script>"
  Then the stored value is rendered as inert text through contextual output encoding
  And no script executes in another user's browser
```

This scenario is the canonical copy. When you apply this sheet to real code, add it to the repo's shared
feature-file index (see `bdd-comprehensive-testing`, "Storing BDD scenarios permanently") and wire it into CI
(its "CI/CD wiring") so it runs as a blocking autotest in the same place as every other Gherkin scenario.

## The real guarantee

The thing that actually makes XSS safe is context-correct output encoding (or a vetted sanitizer for rich
HTML), applied by the framework at render time, so untrusted data can never become markup or script. The
`@security` scenario proves one payload is neutralized; the encoding is what neutralizes all of them. CSP is a
backstop for when encoding is missed, not the guarantee.

## Sources

- OWASP Cross Site Scripting Prevention Cheat Sheet (<https://cheatsheetseries.owasp.org/cheatsheets/Cross_Site_Scripting_Prevention_Cheat_Sheet.html>, retrieved 2026-10-10): framework auto-escaping, contextual output encoding, HTML sanitization, safe sinks, and defense-in-depth controls. `[documented]`
- Georgia Weidman, *Penetration Testing: A Hands-On Introduction to Hacking* (No Starch, 2014), Chapter 14 "Web Application Testing": the attacker view of XSS and the stored-versus-reflected split. `[documented]`
