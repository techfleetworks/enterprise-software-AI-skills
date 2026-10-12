# Third Party JavaScript Management

## What it is

How to manage the vendor JavaScript "tags" (marketing and analytics snippets, sometimes HTML image
elements when scripting is off) that a host site loads to collect data on user actions and browsing
context. This is the per-sheet guidance from the OWASP Third Party JavaScript Management Cheat Sheet,
condensed to the controls that hold and the attack they stop. Tags come in two kinds: user-interface
tags, which must run on the client because they change the DOM (a dialog, an image, some text), and
analytics tags, which read data from the DOM and send it to a vendor database. The "host" is the
original site the user visits that includes or fetches and runs the third-party code.

## The attack it stops

By far the most serious danger is an attacker taking over the vendor's own server and slipping
malicious code into the legitimate tag. This is the same card-skimming technique seen in the 2018
Ticketmaster breach and in Magecart's theft of payment-card data. The sheet frames three concrete
risks. First, loss of control over the client application: the vendor can change its code at any
time and break or subvert your page,
and an abandoned or expired vendor domain can be re-registered by an attacker who then serves
malicious code. Second, execution of arbitrary code on client systems: third-party code is rarely
reviewed before integration yet runs with the same privileges as the user, much like XSS, and it
arrives after your SAST, DAST, IAST, and RASP testing is done. Third, disclosure of sensitive
information to third parties: because the browser contacts the vendor directly, the request carries
the IP address, the referrer, and the vendor's existing cookies, letting the vendor profile your
users and cross-reference them across every other site that embeds the same tag.

## Controls

### Understand the deployment architecture you are securing

Each mechanism changes what you can review and control, and they combine.

1. **Vendor JavaScript placed on the page.** You host the vendor's code inline, so you can and must
   review it for XSS and for malicious actions such as exfiltrating DOM data, which is hard because
   the code is often obfuscated.
2. **A request to the vendor (`<script src=...>`).** The page fetches the script from the vendor on
   every load, so whatever the vendor serves at that moment runs in your users' browsers.
3. **An indirect request through a tag manager or aggregator.** The page loads a `container` script
   from the tag manager, which returns whatever vendor files the host's marketing staff configured in
   a GUI. Non-technical users can change which vendor file is returned and which DOM data is read and
   when, and the change deploys instantly on the next page request. This is hard to secure: you can
   only see the code by proxying requests or inspecting the GUI, and it is usually obfuscated.
   Subresource Integrity is one way to manage the risk.
4. **A server-direct data layer.** A tag-manager GUI can generate code that reads data from anywhere
   in the DOM (including unvalidated values such as URL parameters) and writes it anywhere on the
   page, which can create XSS. A host-defined data layer, built by host developers as a `<div>` of
   attributes or a set of JSON objects holding exactly the values vendors need, limits the data
   intended for collection; an event handler sends those values to the tag-manager server, which
   forwards them to vendors. This agreement does not restrict the privileges of code running in the
   page. A data layer gives you no sandbox. Because a container in the tag manager is free to run its
   own JavaScript and inject custom HTML tags, any handler configured remotely still sits squarely
   inside the trust boundary of your page. Lock down who may publish through the tag manager, and
   subject every change there to the same review you would give your own source.

### Apply the defensive controls

1. **Favor a server-side collector you own.** Any analytics work with no real need to execute in
   the browser should instead report a fixed set of events to a collector under your control, with
   the vendor integrations themselves running on the server. Doing that lets you screen exactly what
   gets forwarded to vendors and lifts the qualifying tags off the client entirely. What it cannot
   do is contain whatever scripts are still executing inside the page, and it does nothing for
   user-interface tags, whose entire purpose is to alter what the visitor sees rather than to ship
   data outward. Before asserting that only first-party code is present, inspect the scripts the
   page actually pulls in.
2. **Validate in the data layer.** Have the data layer validate values, especially user-exposed DOM
   values such as URL parameters and input fields. A good corporate-standard rule the sheet gives:
   tag JavaScript may read only host data-layer values and may never read a URL parameter directly.
3. **Harden indirect tag-manager use.** Favor aggregators that can technically restrict tags to
   data-layer values only (no other DOM access) and that can disable risky tag types such as custom
   HTML and custom JavaScript. Verify the tag-manager vendor's own security, including access controls
   on the tag configuration and two-factor authentication. Watch for XSS introduced when marketing
   staff pull data from a URL parameter into a scriptable location.
4. **Sandbox and clean DOM data.** Use a sanitizer such as DOMPurify (an XSS filter for HTML, MathML,
   and SVG that is secure by default and configurable) or a sandbox such as MentalJS (a JavaScript
   parser and sandbox that allow-lists code by requiring a `"$"` suffix on variables and accessors).
5. **Use Subresource Integrity.** Add `integrity` metadata (for example a `sha384-` hash) and
   `crossorigin="anonymous"` to the script element so the browser runs only the exact reviewed bytes.
   SRI requires the vendor host to enable CORS, and you must monitor the vendor file for changes,
   because an updated vendor file will be blocked as "secure but not working" until you update the
   hash.
6. **Keep JavaScript libraries updated.** Outdated libraries carry known vulnerabilities that
   typically lead to XSS; this is the OWASP Top 10 2025 A03 Software Supply Chain Failures problem.
   Scan with a tool such as RetireJS.
7. **Sandbox vendor code in a cross-domain iframe.** Hosting the vendor script in an iframe from a
   different domain acts as a "jail" with no direct access to the host page's DOM or cookies; the host
   and the frame communicate with `postMessage`, the receiver checks `event.origin` exactly, and the
   iframe carries a `sandbox` attribute (for example `sandbox="allow-same-origin allow-scripts"`). For
   high-risk applications add a Content Security Policy on top of the iframe sandbox.
8. **Use virtual iframe containment.** This technique runs iframes asynchronously from the main page
   and ships its own containment code that automates building the protected iframes from the marketing
   tag requirements.
9. **Put security terms in vendor agreements.** Require evidence in the contract or RFP that the
   third party uses secure coding and corporate server-access security, and in particular require
   monitoring and control of their source code to prevent and detect malicious changes.

### Run it as a program (MarTechSec and MarSecOps)

1. **MarTechSec, the security side.** Reduce marketing-JavaScript risk with contractual controls for
   risk reduction (require evidence of code security and code-integrity monitoring), contractual
   controls for risk transference (a penalty for serving malicious JavaScript), technical controls to
   prevent malicious execution (virtual iframes), technical controls to identify malicious code
   (Subresource Integrity), and a penetration-testing requirement that includes client-side malicious
   behavior.
2. **MarSecOps, the operations side.** Maintaining these controls needs ongoing cooperation among the
   marketing team, the martech provider, and the operations team to update SRI hashes (and the pages
   that carry them), virtual-iframe policies, tag-manager configuration, and data-layer changes. The
   most complete and preventive combination is a controlled collector with server-side vendor
   integrations (a data layer alone does not enforce code isolation), plus Subresource Integrity,
   plus virtual-frame containment. Be realistic: at the speed marketing wants to change tags, and
   without dedicated staff, keeping SRI and data-layer controls current can be impractical, which is a
   risk to plan for rather than ignore.

## @security scenario

```gherkin
@security @owasp:third-party-js @usecase:subresource-integrity
Scenario: A tampered vendor script is blocked by Subresource Integrity
  Given a host page that loads a vendor analytics script with an "integrity" hash and "crossorigin=anonymous"
  When the vendor server returns a script whose bytes no longer match the recorded hash
  Then the browser refuses to execute the script
  And the host page keeps working without running the altered third-party code
```

This scenario is the canonical copy. When you apply this sheet to real code, add it to the repo's
shared feature-file index (see `bdd-comprehensive-testing`, "Storing BDD scenarios permanently") and
wire it into CI (its "CI/CD wiring") so it runs as a blocking autotest alongside every other Gherkin
scenario.

## The real guarantee

You cannot fully trust code you do not control running in your page, so the real guarantee is to run
as little of it in the browser as possible. Subresource Integrity guarantees that the exact reviewed
bytes run and nothing else, which is what the scenario proves, but it only catches changed bytes: it
does not catch malicious behavior inside a release you approved, and it blocks legitimate vendor
updates until you refresh the hash. The stronger guarantee is architectural: move analytics to a
server-side collector you control so the sensitive data and the untrusted code leave the browser
entirely, pin and integrity-check whatever third-party code must remain, and isolate it in a
cross-domain sandboxed iframe under a Content Security Policy. The test is a check on one tampered
file; removing the code from the browser and pinning what is left is the guarantee.

## Sources

- OWASP Third Party JavaScript Management Cheat Sheet (<https://cheatsheetseries.owasp.org/cheatsheets/Third_Party_Javascript_Management_Cheat_Sheet.html>, retrieved 2026-10-11): the three risks (loss of control, arbitrary code execution, data disclosure), the four deployment architectures (vendor code on page, direct vendor request, tag-manager indirect request, server-direct data layer), the defensive controls (server-side collector, data-layer validation, tag-manager hardening, DOMPurify and MentalJS sandboxing, Subresource Integrity with `integrity` and `crossorigin="anonymous"`, library updating with RetireJS, cross-domain `sandbox` iframe plus `postMessage` and CSP, virtual iframe containment, vendor agreements), and the MarTechSec and MarSecOps program controls. `[documented]`
- OWASP Top 10 2025 A03 Software Supply Chain Failures (<https://owasp.org/Top10/2025/A03_2025-Software_Supply_Chain_Failures/>, retrieved 2026-10-11): the components-with-known-vulnerabilities risk the sheet cites for keeping JavaScript libraries updated. `[documented]`
