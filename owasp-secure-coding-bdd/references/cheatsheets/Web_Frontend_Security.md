# Web Frontend Security

## What it is

How browser-side code should treat data so it never becomes an injection or data-leak vector.
This is the per-sheet guidance from the OWASP Web Frontend Security Cheat Sheet (formerly the AJAX
Security Cheat Sheet), condensed to the controls that hold and the attack they stop. Everything
rests on one habit of mind: assume every value is hostile until you have checked it and processed
it safely. That net is cast wide. It takes in whatever the user types, the bodies of API responses,
data arriving through third-party integrations, replies from your own internal services and
microservices, values read back from caches, anything held in browser storage such as
`localStorage` and `sessionStorage`, and the contents of hidden form fields.

## The attack it stops

The central attack is cross-site scripting (XSS): untrusted data reaches a browser sink that parses
it as code, so the attacker's markup or script runs in the victim's page with the victim's
privileges. The sheet's example is assigning an API response straight to `innerHTML`, where a value
like `<img src=abc onerror=alert('xss!')>` executes. The listed consequences are stolen session
cookies, defacement, redirects to malicious sites, unauthorized actions performed as the user (such
as API calls on their behalf), and keylogging. The sheet also stops server-interaction attacks:
JSON hijacking in older browsers, XML or JSON injection from hand-built payloads, and abuse of
endpoints a user can call directly instead of only through your client. A second theme runs
throughout: never let client-side code make a security or business decision, because the user fully
controls that code.

## Controls

### Client-side

1. **Treat every external value as untrusted.** Validate and safely handle input from the user, API
   responses, third parties, internal services, caches, browser storage, and hidden fields before
   use.
2. **Avoid `innerHTML` for untrusted data.** It parses and renders markup, which is how injected
   script runs. Use it only in limited legacy cases: a small static snippet hardcoded in your source
   with no user input, or user-supplied HTML (for example from a rich-text editor) that you first
   run through a sanitizer such as DOMPurify. Prefer safer paths: auto-escaping templating engines;
   framework text bindings, which escape text rather than sanitize arbitrary markup; raw-HTML APIs
   such as React `dangerouslySetInnerHTML` only with already-trusted, sanitized HTML; and
   context-correct controls for URL and style bindings.
3. **Use `textContent` or `innerText` for text-only updates.** `textContent` inserts a value as
   literal text and does not parse tags, so it is the safe default and is slightly faster and more
   predictable. `innerText` respects CSS visibility and rendered formatting (for example it ignores
   text in `display: none`); use it only when that rendered formatting is required. Caveat: both are
   safe only for the text context. They do not protect HTML attribute, JavaScript event-handler, or
   URL contexts, so still validate and sanitize. Modern frameworks (React, Vue, Angular, Svelte)
   update text content automatically, so manual use is usually unnecessary.
4. **Never use `eval()`, `new Function()`, or any other dynamic code evaluation.** They open the
   door to remote code execution and XSS, and needing them signals a design problem.
5. **Encode data for its output context.** When building HTML, script, CSS, XML, or JSON, encode the
   value so its literal meaning is preserved and injection is prevented. The sheet points to the
   OWASP Java Encoder project.
6. **Do not rely on client-side logic for security.** The user can set breakpoints, skip code, and
   change values with browser tooling, so any security check that lives only in the browser can be
   bypassed.
7. **Duplicate important business rules on the server.** A rule enforced only in the client can be
   skipped, which can lead to unexpected or costly behavior.
8. **Do not hand-write serialization code.** It is error-prone and a small mistake becomes a large
   security issue; use a vetted framework.
9. **Do not build XML or JSON by hand.** Like hand-built HTML or SQL, this invites injection; use a
   safe or encoding library so attributes and element data are made safe.
10. **Never ship secrets down to the client.** Whatever reaches the browser is fully exposed, open
    to inspection and tampering by the user, so any secret material has to stay on the server.
11. **Let the threat model decide the encryption.** Transport is covered by TLS. Encrypting in the
    browser earns its place when you need end-to-end confidentiality, or when a file must be sealed
    before it is uploaded. Reach for protocols and libraries that others have already vetted instead
    of inventing your own scheme. And respect the limit of in-browser cryptography: it cannot keep
    cleartext or keys safe from hostile script sharing the same page, so you must still plan for XSS
    and for how keys are stored and rotated.
12. **Keep security-impacting logic off the client.** As a fail-safe, when a security decision is
    ambiguous, make it on the server.

### Server-side

1. **Use CSRF protection** on state-changing requests (see the Cross-Site Request Forgery
   Prevention guidance).
2. **Defend against JSON hijacking for older browsers.** Make the top-level value of every JSON
   response an object, not a bare array: a response like `[{...}]` is exploitable, while
   `{"object": "..."}` or `{"result": [{...}]}` is not. Also review the historical AngularJS JSON
   vulnerability protection mechanism.
3. **Do not hand-write serialization code server-side either.** Mind reference versus value types
   and use a reviewed library.
4. **Assume every service can be called directly.** A malicious user can hit an endpoint without
   going through your client, so validate all inputs and treat them as user-controlled.
5. **Build XML and JSON through the framework serializer, not by hand**, to avoid introducing
   injection bugs.
6. **Validate web-service inputs against a JSON or XML schema** using a vetted third-party library.

## @security scenario

```gherkin
@security @owasp:web-frontend @usecase:dom-xss-innerhtml
Scenario: Untrusted API data is shown as text, not parsed as HTML
  Given a page that displays a comment taken from an API response
  When the API returns the value "<img src=abc onerror=alert('xss!')>"
  Then the page writes it through "textContent" so the markup appears as literal text
  And no script runs and the DOM gains no element from the value
```

This scenario is the canonical copy. When you apply this sheet to real code, add it to the repo's
shared feature-file index (see `bdd-comprehensive-testing`, "Storing BDD scenarios permanently") and
wire it into CI (its "CI/CD wiring") so it runs as a blocking autotest alongside every other Gherkin
scenario.

## The real guarantee

The test checks one payload against one sink; the guarantee is the sink plus server authority.
Because the user controls all client-side code, no client check is a security boundary. Two things
actually hold: route untrusted data only into sinks that cannot execute it (`textContent`,
context-correct encoding, or sanitized `innerHTML`), and make every security and business decision
on the server, where the user cannot override it. Client-side validation and browser cryptography
are useful defense in depth and better UX, but they are not the boundary. A passing scenario is a
check; the safe sink and the server-side decision are the guarantee.

## Sources

- OWASP Web Frontend Security Cheat Sheet (<https://cheatsheetseries.owasp.org/cheatsheets/Web_Frontend_Security_Cheat_Sheet.html>, retrieved 2026-10-11): the untrusted-data mindset, the client-side sink and encoding rules (`innerHTML`, `textContent`, `innerText`, `eval()`, encoding, no secrets on the client, no client-side security or business logic), and the server-side rules (CSRF, JSON hijacking object wrapping, schema validation, framework serialization, directly callable services). `[documented]`
