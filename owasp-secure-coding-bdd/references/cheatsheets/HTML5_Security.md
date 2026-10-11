# HTML5 Security

## What it is

How to use HTML5 browser features safely, based on the OWASP HTML5 Security Cheat Sheet. HTML5 moved a lot of
capability into the browser (cross-document messaging, cross-origin requests, server-sent events, client-side
storage and databases, geolocation, web workers, service workers, sandboxed frames), and each capability is a
place where untrusted data or a careless default can turn into a client-side compromise. This sheet is the
per-feature checklist for using them without opening those holes.

## The attack it stops

The risks across these features tend to end in a few outcomes. DOM-based XSS happens when data from a message,
a storage object, a worker, or an event stream is evaluated as code or written into the page with `innerHTML`.
Cross-origin data theft happens when CORS is too loose or a wildcard origin is reflected back. Session or
secret theft happens when tokens live in JavaScript-readable storage that any XSS can read. Reverse tabnabbing
lets a page you open rewrite the tab that opened it. Clickjacking happens when your page can be framed. Request
interception happens when a malicious or compromised service worker sits in front of your pages. On top of
these come information leakage through referrer and geolocation, and denial of service from workers that burn
CPU.

## Controls

### Cross-document messaging (postMessage)

- When you send a message, pass the exact expected target origin as the second argument to `postMessage`,
  never `*`, so a redirect or origin change cannot deliver it to the wrong place.
- When you receive a message, always check the event `origin` against the expected sender and validate the
  shape of event `data` before using it.
- Never assume you control `data`: an XSS in the sending page lets an attacker send any format, so treat every
  message as untrusted input.
- Treat messages as data only. Never pass them to `eval()` or assign them with `innerHTML`, which creates
  DOM-based XSS; assign with `textContent` instead.
- Match the origin against the full expected FQDN exactly. A substring test such as checking whether the
  origin contains `.owasp.org` is unsafe, because `owasp.org.attacker.com` passes it.
- If you must embed untrusted third-party gadgets that run their own scripts (strongly discouraged), isolate
  them in a sandboxed frame.

### Cross-Origin Resource Sharing (CORS)

- Validate URLs passed to `XMLHttpRequest.open`; browsers allow cross-domain values there, which can enable
  remote code injection, so scrutinize absolute URLs in particular.
- Do not expose sensitive content on any URL that answers with `Access-Control-Allow-Origin: *`; apply that
  header only to chosen cross-domain URLs, not the whole domain.
- Allow only specific, trusted origins in `Access-Control-Allow-Origin`. Prefer an explicit allow-list over
  `*`, and never blindly reflect the request `Origin` back.
- Remember CORS does not stop data from reaching an unauthorized location, so keep doing server-side CSRF
  prevention.
- Do not count on a preflight: the Fetch standard recommends an `OPTIONS` preflight, but some implementations
  skip it, so ordinary `GET` and `POST` handlers must enforce access control themselves.
- Reject plain-HTTP requests that carry HTTPS origins, to avoid mixed-content bugs.
- Do not use the `Origin` header alone for access control. Browsers always send it on CORS requests, but it
  can be spoofed outside a browser, so protect sensitive data with application-level checks.

### WebSockets

- For WebSocket connections, follow the dedicated protections in the OWASP WebSocket Security Cheat Sheet.

### Server-Sent Events

- Before opening an `EventSource`, vet the URL you give its constructor. A stream from a different origin
  travels over CORS, so the server that provides the stream must grant permission.
- Handle `event.data` strictly as data; do not render or run it as HTML or script.
- Confirm `event.origin` sits on your allow-list of trusted domains before a message is trusted.

### Client-side storage

- Local and session storage are not a safe place for anything that assumes authentication: the underlying
  store varies by browser, and anyone with local access to the machine can read it. Do not put sensitive data
  there if access is meant to imply authentication.
- Use `sessionStorage` rather than `localStorage` when persistence is not needed, since it is scoped to the
  window or tab and cleared when it closes.
- A single XSS can read everything in these objects and can also write malicious data into them, so do not
  store sensitive information there and do not trust what you read back.
- Watch for `localStorage.getItem` and `setItem` usage in review; it is where sensitive data tends to end up
  by mistake.
- Never store session identifiers in local storage, because JavaScript can always read it; keep session IDs in
  cookies with the `httpOnly` flag so scripts cannot reach them.
- Local storage has no per-path scoping like a cookie's `path`; every value is shared across the whole origin
  under the Same Origin Policy, so avoid hosting multiple applications on one origin and use separate
  subdomains instead.

### Client-side databases

- Steer clear of Web SQL Database: the W3C abandoned it in 2010 and every major browser has since dropped it.
  When you genuinely need SQL in the browser, reach for a compiled-in engine such as SQLite built to
  WebAssembly (`sqlite-wasm`), persisting its data through IndexedDB or through the Origin Private File System.
- For structured storage on the client, IndexedDB is today's standard choice.
- Never rely on IndexedDB for confidentiality. Its backing store differs from one browser and OS to the next,
  and anyone (a person or a process) who can reach the browser profile is able to read or alter whatever sits
  there. Keep session tokens, credentials, and other secrets out of it entirely. When something sensitive
  genuinely has to live on the client, plan the encryption and key handling around a threat model where the
  device itself is reachable; remember too that marking a `CryptoKey` non-extractable only blocks exporting it
  through Web Crypto, and does nothing to shield a stored key once the device is compromised or to stop a
  hostile script already on the page from calling that key.
- Any single XSS flaw can both read and overwrite everything in IndexedDB, so handle what you load from it as
  hostile input: run it through the same validation and output-encoding you apply to anything arriving over the
  network.

### Geolocation

- The Geolocation API prompts the user for permission, but whether that choice is remembered varies by
  browser, so for privacy require an explicit user action before calling `getCurrentPosition` or
  `watchPosition`.

### Web Workers

- Workers can make same-origin and CORS requests with `XMLHttpRequest`, so apply the CORS guidance above to
  worker code.
- Workers have no DOM access, but a malicious worker can burn CPU to cause denial of service or abuse CORS for
  further attacks, so make sure worker scripts are not hostile and never build a worker script from
  user-supplied input.
- Validate the messages exchanged with a worker, and never pass JavaScript snippets to be run with `eval()`,
  which would introduce DOM-based XSS.

### Tabnabbing

- Reverse tabnabbing lets a page you open reach back through the `opener` reference and change the content or
  location of the original tab. It applies to HTML links and to `window.open` calls that use a `target` which
  does not replace the current page.
- Cut the back link. On HTML links add `rel="noopener"`, or `rel="noopener noreferrer"` to also drop the
  referrer. For `window.open`, pass `noopener,noreferrer` in the window-features argument.
- For the broadest browser coverage, add `rel="noopener noreferrer"` to every link, use a helper that always
  includes `noopener,noreferrer` when opening windows from JavaScript, and send `Referrer-Policy: no-referrer`
  on every response.

### Sandboxed frames

- Wrap untrusted content in an `iframe` with the `sandbox` attribute. An empty `sandbox` forces a unique
  origin, disables forms and scripts, stops links targeting other browsing contexts, blocks auto-triggered
  features, and disables plugins; you can loosen individual restrictions with specific `sandbox` token values
  when needed.
- Old browsers ignore the attribute, so use it as an added layer or feature-detect support and only show
  untrusted content where it is honored.
- Also set `X-Frame-Options` (`deny` or `same-origin`) against clickjacking and unwanted framing; do not rely
  on JavaScript framebusting.

### Credential and PII input hints

- Read the autofill-related form attributes as suggestions the browser may ignore, not as guarantees. Setting
  `autocomplete="off"` requests that a field not be remembered or pre-populated, yet many browsers will still
  prompt to store a sign-in and fill it in later, so the attribute is no safeguard against someone reusing
  saved credentials on a shared machine. In the same way `spellcheck="false"`, `autocorrect="off"`, and
  `autocapitalize="off"` only tune the typing aids on offer; none of them obliges the browser to keep a value
  out of storage.

### Offline applications and service workers

- The legacy HTML5 Application Cache (the `manifest` attribute together with `.appcache` files) is gone from
  every major browser, so drop it and move any leftover use onto service workers paired with the Cache API.
- Because a service worker lives on its own scriptable thread and sits in front of every network request
  within its scope, it is a genuine attack surface. Register one only from an origin you control, deliver its
  script over HTTPS under a filename that defeats caching (such as `sw.<hash>.js`), and pin its reach tightly,
  through the `scope` option or the `Service-Worker-Allowed` header, so that a worker gone bad cannot reach
  paths it was never meant to serve.
- Keep a recovery plan ready. Since a hostile or hijacked worker will answer requests for any page inside its
  control, write down the steps to push an update or tear the worker down and wipe the caches it left behind,
  and keep in mind that letting cached entries age out will not deregister the worker itself.
- Do not let responses that carry sensitive data land in the Cache API. That store ignores HTTP cache
  directives and never ages entries out on its own, so your worker code has to leave such responses out
  deliberately, purge any that were saved earlier, and go on emitting `Cache-Control: no-store` to govern the
  HTTP caches.

### Progressive enhancement

- Detect the capabilities a browser supports and add substitutes only for what is missing. Do not fall back to
  obsolete plugins (Flash, Java applets, Silverlight, and ActiveX are all end-of-life and removed); native
  HTML5 (`<video>`, `<audio>`, `<canvas>`, WebAssembly) covers those legacy needs.

### Security headers

- Apply the browser-level defenses from the OWASP Secure Headers Project across the application (see the HTTP
  Security Response Headers reference).

## @security scenario

```gherkin
@security @owasp:html5 @usecase:postmessage-origin-and-data
Scenario: A cross-document message from an untrusted origin is rejected and never executed
  Given a page that handles "message" events and expects messages only from "https://trusted.example.com"
  When a message arrives whose "origin" does not exactly match the expected FQDN
  Then the handler ignores the message
  And any accepted payload is written with "textContent" and never with "innerHTML" or "eval"
```

This scenario is the canonical copy. When you apply this sheet to real code, add it to the repo's shared
feature-file index (see `bdd-comprehensive-testing`, "Storing BDD scenarios permanently") and wire it into CI
(its "CI/CD wiring") so it runs as a blocking autotest in the same place as every other Gherkin scenario.

## The real guarantee

HTML5 pushes both data and code to the client, so the protection is a single discipline applied everywhere:
treat every client-side input (postMessage data, storage values, worker messages, event-stream data) as
untrusted, validate and output-encode it, and never evaluate it as code; keep session identifiers and secrets
out of JavaScript-readable storage and in `httpOnly` cookies instead; check origins against the exact FQDN;
and lean on browser-enforced boundaries (the `sandbox` attribute, the Same Origin Policy, a restricted
service-worker scope) rather than JavaScript workarounds. The scenario proves one hostile message is rejected;
the guarantee is that same discipline of never executing client data and never storing secrets client-side,
holding across every HTML5 feature the page uses.

## Sources

- OWASP HTML5 Security Cheat Sheet (<https://cheatsheetseries.owasp.org/cheatsheets/HTML5_Security_Cheat_Sheet.html>, retrieved 2026-10-11): the per-feature controls for Web Messaging, CORS, Server-Sent Events, local and session storage, client-side databases (IndexedDB over the removed Web SQL), geolocation, web workers, tabnabbing, sandboxed frames, autofill hints, service workers and the removed Application Cache, and progressive enhancement. `[documented]`
