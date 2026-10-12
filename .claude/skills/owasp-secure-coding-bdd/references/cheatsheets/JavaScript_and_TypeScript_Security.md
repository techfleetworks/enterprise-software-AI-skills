# JavaScript and TypeScript Security

## What it is

How to write JavaScript and TypeScript that holds up wherever the language runs: in the browser, in hybrid
apps, and on the server. This is the per-sheet guidance from the OWASP JavaScript and TypeScript Security Cheat
Sheet, condensed to the controls that hold and the attacks they stop. It covers risky language features,
prototype pollution, bad regular expressions, browser output sinks, and the false sense of safety that
TypeScript's types can give.

## The attack it stops

Several language traps turn attacker input into a working exploit. If input flows into `eval` or `new Function`,
the attacker runs their own code with the program's privileges. A greedy regular expression can be fed a
crafted string that hangs the thread for a very long time, which is a denial of service. Keys like `__proto__`
reaching a deep merge let an attacker rewrite the behavior that every object inherits. Untrusted strings placed
into HTML, script, or URL sinks become cross-site scripting. TypeScript does not stop any of these, because its
types vanish once the code runs.

## Controls

In the cheat sheet's order:
1. **Never compile code from strings.** Read data with `JSON.parse` rather than `eval`. Swap dynamic dispatch
   for fixed lookup maps of functions instead of building calls out of names. Do not use `with`. Enforce this
   with the `no-eval`, `no-implied-eval`, and `no-new-func` lint rules. In the browser, add an enforced (not
   report-only) Content Security Policy whose `script-src` or `default-src` leaves out `'unsafe-eval'` and
   `'trusted-types-eval'`. CSP is a browser-only guard, so the lint rules stay the main defense on the server.
2. **Keep regular expressions linear (anti-ReDoS).** Reach for well-tested validator libraries instead of
   hand-rolled patterns for things like emails and URLs. Stay away from nested quantifiers and overlapping
   alternation. Put a length limit on untrusted input before you match it, and reject input that fails rather
   than trying to clean it. Linear patterns are the primary control; length caps are backup.
3. **Run in strict mode.** Ship ES modules, which are strict already, or add `'use strict'`. Strict mode turns
   quiet mistakes into thrown errors, but treat it as basic hygiene, not a security wall.
4. **Guard objects against prototype pollution.** Keep untrusted input out of recursive merge and
   set-by-path helpers, and block the key segments `__proto__`, `constructor`, and `prototype` before any
   write. For untrusted dictionary keys use a `Map`, or build plain objects with `Object.create(null)` so they
   carry no prototype. Check parsed or copied data against a schema first, and strip `__proto__` early, since
   `Object.assign` routes it through the prototype setter.
5. **Build the DOM with safe sinks.** Prefer `textContent` and `createElement` over `innerHTML` and
   `insertAdjacentHTML`. When you truly must render HTML, clean it with a maintained allowlist sanitizer and
   turn on Trusted Types with no loose default policy. Keep untrusted data out of the framework escape hatches:
   React `dangerouslySetInnerHTML`, Vue `v-html`, and Angular `bypassSecurityTrustHtml` and its relatives.
6. **Handle async failures on purpose.** Keep promise chains flat and end each one with a real error handler, or
   wrap `await` in `try`/`catch`. An expected failure is caught where the caller decides what to do; a genuine
   bug stays visible. Never bury a rejection in an empty `catch`.
7. **Lock down `postMessage`.** On the receiving side, check `event.origin` against an explicit allowlist,
   confirm `event.source` when you expect a known partner, and validate `event.data` against a schema before
   acting. On the sending side, pass an exact `targetOrigin` and never `"*"` for anything sensitive. Prefer a
   narrow `MessageChannel` port over broadcasting where the design allows.
8. **Do not trust TypeScript types at runtime.** Treat `any` as a gap in every check and make `unknown` the
   default for untyped values so you must narrow before use. Keep `as` and `!` away from untrusted data, since
   they quiet the compiler without changing the value. Turn on `strict` (and `noUncheckedIndexedAccess` where
   you can) as a quality aid, not a trust boundary. At each trust boundary, such as network replies,
   `postMessage` payloads, and storage reads, validate with a runtime schema and let the type come from that
   schema.
9. **Lint and manage dependencies.** Use the `typescript-eslint` recommended sets plus the no-eval family of
   rules. Pin versions with a lockfile, review every dependency change, and watch advisories. For third-party
   scripts served from a CDN, pin a Subresource Integrity hash with the right `crossorigin` handling.

## @security scenario

```gherkin
@security @owasp:javascript @usecase:no-string-code-execution
Scenario: User input cannot be compiled and run as code
  Given a handler that processes attacker-controlled input
  When the input reaches a code path that could execute it
  Then the input is parsed as data with JSON.parse and never passed to eval or new Function
  And a lint rule and an enforced CSP without 'unsafe-eval' block any string compilation
```

This scenario is the canonical copy. When you apply this sheet to real code, add it to the repo's shared
feature-file index (see `bdd-comprehensive-testing`, "Storing BDD scenarios permanently") and wire it into CI
(its "CI/CD wiring") so it runs as a blocking autotest in the same place as every other Gherkin scenario.

## The real guarantee

The thing that actually keeps attacker input from becoming attacker code is refusing to compile strings at all:
parse data, dispatch through fixed maps, and let the lint rules and an enforcing CSP backstop the rule. The
`@security` scenario proves one payload stays inert; the no-compile design is what makes every payload inert.
The same pattern holds across this sheet, because runtime validation, not a TypeScript type, is what survives a
malicious caller. A test is a check; the design that never runs untrusted strings is the guarantee.

## Sources

- OWASP JavaScript and TypeScript Security Cheat Sheet (<https://cheatsheetseries.owasp.org/cheatsheets/JavaScript_and_TypeScript_Security_Cheat_Sheet.html>, retrieved 2026-10-11): the full control set covering dangerous language surface, ReDoS, strict mode, prototype pollution, DOM sinks, async and postMessage handling, TypeScript caveats, and linting and dependency tooling. `[documented]`
