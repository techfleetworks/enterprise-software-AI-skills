# DOM Based XSS Prevention

## What it is

DOM based XSS is a cross-site scripting flaw that lives entirely in the browser: the page's own
JavaScript takes attacker-controllable input from a source in the document and writes it into a sink
that the browser parses as HTML or script. Nothing unsafe has to pass through the server for the
injected code to run.

## The attack it stops

The page reads a value the attacker can influence (for example `location.hash`, `location.search`,
`document.URL`, or `document.baseURI`) and hands it to a sink that executes markup or code. The
cheat sheet's variant-analysis example is the whole bug in three lines: `var x =
location.hash.split("#")[1]; document.write(x);`. An attacker puts a payload after the `#` in the
URL, the fragment never reaches the server (so server-side filters never see it), and `document.write`
parses it as HTML, running attacker script in the victim's session. The same pattern applies to any
untrusted source flowing into `innerHTML`, `eval`, an event-handler attribute, a `javascript:` URL,
or a CSS `url()`, because each of those contexts will treat the data as code.

## Controls

The sheet frames DOM XSS as a question of which sink receives untrusted data, and in which parsing
context. Work from the safest option down to the most fragile.

**Prefer safe sinks over encoding (Rules 6 and 7).** The most reliable fix is to assign untrusted
data to `textContent`, which sets text and never parses markup or script. When you only need to show
text inside an element, write to `textContent` (or `innerText`) instead of `innerHTML`. Rule 7 gives
the general repair for a discovered bug: replace the dangerous sink with the right one rather than
trying to encode the output. Never pass user-controlled input to `eval`; the sheet calls that a sign
of lazy code, so remove it instead of trying to sanitize around it.

**If you must inject into a context, encode for that exact subcontext (Rules 1 to 5).** Inside a
JavaScript execution context the four subcontexts each need their own nested encoding, applied from
the inside out:

- HTML subcontext (Rule 1): data going to `innerHTML`, `outerHTML`, `document.write()`, or
  `document.writeln()` must be HTML encoded and then JavaScript encoded.
- HTML attribute subcontext (Rule 2): for attributes that do not execute code (anything other than
  event handlers, CSS, and URL attributes), JavaScript encode only. Do not add HTML attribute
  encoding here; in an execution context it double-encodes and corrupts the displayed value (the
  sheet's example turns "Johnson & Johnson" into visible entity text).
- Event handler and script subcontext (Rule 3): do not place untrusted data here at all. JavaScript
  encoding does not disarm this context, because an encoded identifier still executes once the
  surrounding syntax is valid. `setAttribute(name, value)` is dangerous here because it coerces the
  value into the attribute's datatype, so an event-handler name turns the value into executable code.
  The same risk applies to `setTimeout`, `setInterval`, and `Function`. Assigning a string to a
  handler property such as `onclick` just sets the property to null (that is type coercion at
  work, not a protective feature); the safe approach is to point the property at a function you
  control and pass any untrusted value into that function as plain data.
- CSS subcontext (Rule 4): `expression()` is effectively disabled in this context, but data passed
  to the CSS `url()` method must be URL encoded and then JavaScript encoded.
- URL subcontext (Rule 5): URL encode and then JavaScript encode. Do not URL encode a whole absolute
  URL, because encoding the `:` after the scheme breaks `http:` (and, by the same token, neutralizes
  a `javascript:` payload only by breaking the link).

**Build DOM nodes with safe constructors (Guideline 3).** Prefer `document.createElement()`,
`element.setAttribute()`, and `element.appendChild()` to assemble interfaces. `setAttribute` is safe
only for a limited set of non-executing attributes (the sheet lists safe ones such as `class`,
`width`, `title`, and many more); never use it for command attributes such as `onclick` or `onblur`.

**Treat untrusted data as inert data only.** Guideline 1: untrusted data is displayable text, never
code or markup. Guideline 2: when building templated JavaScript, JavaScript encode untrusted data and
wrap it in quoted string delimiters as it enters the app (for example `Encode.forJavaScript(...)`).
Guideline 4: keep untrusted data out of `innerHTML`, `outerHTML`, `document.write()`, and
`document.writeln()`. Guideline 5: avoid the many methods that implicitly `eval()` their input; if
one is unavoidable, delimit the data as a string, wrap it in a closure or JavaScript encode it to the
right number of levels (one extra level for each implicit eval it passes through), and wrap it in a
custom function that does not forward it to another eval-like sink.

**Do not let untrusted data choose what gets written.** Guideline 6: put untrusted data only on the
right side of an assignment, never the left, because `window[userInput] = "..."` lets an attacker
target arbitrary window properties. Guideline 8: when using `object[x]` accessors, add a layer of
indirection (map the input through a known-key check, such as comparing it to a literal before
assigning) so the attacker cannot reach arbitrary object properties.

**Sanitize markup separately, and parse JSON safely.** Guideline 9: when the app genuinely must
render untrusted HTML, run it through a dedicated HTML sanitizer such as DOMPurify; a sanitizer
filters markup and is not a sandbox, so you still must never hand untrusted code to `eval()` or
`Function()`. Guideline 10: never `eval()` JSON; use `JSON.parse()` to deserialize and
`JSON.stringify()` to serialize. Because `JSON.parse()` accepts only well-formed JSON and throws
on anything else, it gives an attacker no route to run code the way `eval()` would. Note that
`JSON.stringify()` is not an output encoder: to place JSON in a page, favor a separate
`application/json` response that the client reads with `JSON.parse()`. When the data has to live
inside an inline script instead, guard the surrounding script element as well as the JavaScript
itself, including any literal `</script` sequence that would close the block early.

**Watch the documented pitfalls.** Guideline 7: character sets in the DOM are not clearly defined, so
be careful when URL encoding there. Context can be layered: a `javascript:` URL inside an `href` that
then flows into `window.location` needs URL-then-JavaScript encoding across the hop. Encoding
libraries vary in quality, so pick one that works on an allow-list and encodes all non-alphanumeric
characters (the sheet cites the OWASP Java Encoder and ESAPI). HTML encoding does not protect
`text/xhtml` or `.xhtml` pages, and encodings are reversed when you read a value back through a DOM
element's `value` property. Even a usually-safe sink can be unsafe: setting `innerText` on a
`<script>` element executes code. Use variant analysis (for example a Semgrep rule) to find
source-to-sink flows across the codebase.

## @security scenario

```gherkin
@security @owasp:dom-xss @usecase:fragment-to-sink
Scenario: A page renders URL fragment data as text, not markup
  Given a page that reads untrusted data from "location.hash"
  When an attacker loads the page with the fragment "#<img src=x onerror=alert(1)>"
  Then the value is written to the DOM through "textContent" so it displays as inert text
  And no script runs and no "innerHTML" or "document.write" sink receives the raw value
```

This scenario is the canonical copy. When you apply this sheet to real code, add it to the repo's
shared feature-file index (see `bdd-comprehensive-testing`, "Storing BDD scenarios permanently") and
wire it into CI (its "CI/CD wiring") so it runs as a blocking autotest in the same place as every
other Gherkin scenario.

## The real guarantee

The thing that actually makes DOM XSS impossible on a flow is the choice of a safe sink: assigning to
`textContent` (or, where real markup is required, routing through a vetted sanitizer) means untrusted
data never reaches a parser that would treat it as code. The `@security` scenario proves one payload
is rendered as text; the safe-sink choice is what makes every payload inert. Context-specific encoding
is fragile and easy to get wrong, so the durable guarantee is not handing attacker data to an
executing sink in the first place.

## Sources

- OWASP DOM based XSS Prevention Cheat Sheet (<https://cheatsheetseries.owasp.org/cheatsheets/DOM_based_XSS_Prevention_Cheat_Sheet.html>, retrieved 2026-10-11) `[documented]`
