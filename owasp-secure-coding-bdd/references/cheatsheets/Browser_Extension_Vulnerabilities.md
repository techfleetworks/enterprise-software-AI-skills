# Browser Extension Security Vulnerabilities

## What it is

How to build a browser extension that does not become the weakest link in a user's browser. This is the
per-sheet guidance from the OWASP Browser Extension Security Vulnerabilities Cheat Sheet, condensed to the
thirteen vulnerability classes it names and the control that closes each one. An extension runs with elevated
access across every site the user visits, so a flaw in one extension is a flaw everywhere the user browses.

## The attack it stops

An extension sits between the browser and every page the user opens, often with permission to read tabs,
history, and page content. An attacker who finds a weak extension, or who controls a page the extension
touches, can turn that reach against the user: read data from other sites, steal tokens the extension holds,
inject code into the extension's privileged context, or push a poisoned update to everyone who installed it.
Because the browser trusts the extension, the extension's mistakes become the attacker's capabilities.

## Controls

Grouped by the thirteen classes the sheet calls out, in its own words:

1. **Permissions overreach.** Request only the permissions the feature needs (least privilege). Prefer
   optional permissions asked for at the moment of use over broad grants at install time. Audit the manifest
   and drop anything no longer used. In Manifest V3, declare site access through `host_permissions` or
   `optional_host_permissions` rather than wildcard URLs.
2. **Data leakage.** Send all traffic over HTTPS so browsing activity cannot be read in transit. Collect the
   minimum data needed, state plainly in a privacy policy what you collect, and get the user's consent before
   gathering or transmitting anything personal.
3. **Cross-site scripting.** Never write untrusted input into the page with a sink that executes markup. Set a
   Content Security Policy that blocks inline script, sanitize any rich input with a vetted library such as
   DOMPurify, and prefer `textContent` over `innerHTML` so injected markup is shown as text, not run.
4. **Insecure communication.** Call external services only over HTTPS, and validate every server response
   before you act on it, so a tampered or unexpected reply cannot drive the extension.
5. **Code injection.** Do not load script from untrusted origins. Restrict script sources with CSP, avoid
   `eval()` and markup-executing sinks, and use the extension messaging APIs to coordinate instead of
   injecting script elements into pages.
6. **Malicious updates.** Ship updates through the browser's extension store with its signing, not a
   self-hosted fetch-and-run. Do not pull in or execute remote code at runtime. If code is ever fetched,
   verify its integrity and authenticity (a digital signature) before it runs.
7. **Third-party dependencies.** Keep libraries current and scan them with tools such as `npm audit` or OWASP
   Dependency-Check. Favor dependencies that are actively maintained and patched over abandoned ones.
8. **Weak or missing Content Security Policy.** Set `content_security_policy.extension_pages` in the manifest
   and load scripts only from the extension package. Keep inline script blocked and limit each resource type
   to what the extension actually needs. Do not carry ordinary web-page nonce or hash advice over to Manifest
   V3 extension pages, whose allowed script sources are already restricted.
9. **Insecure storage.** Treat extension storage as unencrypted. Do not persist secrets such as auth tokens.
   For data the extension needs only during a single browser session, reach for `chrome.storage.session`: it
   holds values in memory rather than on disk, and a content script cannot read it unless you deliberately
   widen that access. Leave the default restriction in place and wipe the data once you are done with it. Never
   hardcode API keys or credentials in extension code. This lowers exposure; it does not protect a compromised
   extension or device.
10. **Insufficient privacy controls.** Publish a clear privacy policy that describes what is collected, let
    users opt out, and disclose any data sharing so the extension meets rules such as GDPR and CCPA.
11. **DOM-based data skimming.** Do not render sensitive data (personal details, financial data, chat
    history) into a page's own DOM, where the page's scripts can read it. Show it in an extension-controlled
    surface instead: the toolbar popup, an options page, or the side panel (Firefox calls this the sidebar).
    A Shadow DOM is not enough, because page scripts can reach an open shadow root and another extension can
    pierce even a closed one via `openOrClosedShadowRoot()`.
12. **Prototype-based data skimming.** When your script runs in the page's "main world" context, its built-in
    objects and prototypes may have been overwritten by the page ("prototype pollution"), so using them with
    secrets can silently hand those secrets to the page. Keep sensitive data in the content script's isolated
    world. If you must talk to the page context, pass only non-sensitive, minimal values (for example, a
    validation result rather than the token itself). Do not rely on tricks to recover native prototypes, and
    do not assume a fresh iframe's context is clean even at `document_start`.
13. **Insecure message passing.** Treat every incoming message as untrusted. In the service worker, confirm
    the message came from your own extension by checking `sender.id`, restrict which pages may talk to you via
    `sender.url` or `sender.origin`, allow-list the action name and every parameter, and do not let web pages
    drive privileged logic through a content script. Content scripts are less trustworthy than extension
    pages and should be handled that way.

## @security scenario

```gherkin
@security @owasp:browser-extension
Scenario: The service worker ignores a privileged message from an untrusted sender
  Given an extension service worker that performs a privileged "fetchSecret" action on request
  When a message requesting "fetchSecret" arrives whose sender.id is not the extension's own id
  Then the handler returns without performing the fetch
  And no secret or privileged result is sent back to the caller
```

This scenario is the canonical copy. When you apply this sheet to real code, add it to the repo's shared
feature-file index (see `bdd-comprehensive-testing`, "Storing BDD scenarios permanently") and wire it into CI
(its "CI/CD wiring") so it runs as a blocking autotest alongside every other Gherkin scenario.

## The real guarantee

What actually keeps an extension safe is the boundary it draws around its own privilege: least-privilege
permissions, secrets kept out of page contexts and out of unencrypted storage, code loaded only from the
signed package, and every message checked against its sender before any privileged action runs. The
`@security` scenario proves one forged message is refused; the sender and action validation in the handler is
what refuses all of them. A test is a check; the trust boundary is the guarantee.

## Sources

- OWASP Browser Extension Security Vulnerabilities Cheat Sheet (<https://cheatsheetseries.owasp.org/cheatsheets/Browser_Extension_Vulnerabilities_Cheat_Sheet.html>, retrieved 2026-10-11): the thirteen vulnerability classes (permissions overreach, data leakage, cross-site scripting, insecure communication, code injection, malicious updates, third-party dependencies, weak CSP, insecure storage, privacy controls, DOM-based and prototype-based data skimming, insecure message passing) and the mitigation given for each. `[documented]`
