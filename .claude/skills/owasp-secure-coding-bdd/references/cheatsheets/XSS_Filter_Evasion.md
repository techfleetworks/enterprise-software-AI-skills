# XSS Filter Evasion

## What it is

Why you cannot block cross-site scripting with a filter, and what to do instead. The OWASP XSS Filter Evasion
Cheat Sheet is a large catalog of ways an attacker rewrites a script-bearing input so it slips past a
blocklist while still executing in the browser. This reference is written concept-only and deliberately
reproduces none of those payloads: the size of the catalog is itself the lesson. If one page can list that
many bypasses, a filter that tries to recognize "bad" input will always miss some.

## The attack it stops

A blocklist filter tries to spot malicious markup by matching known patterns and stripping or rejecting them.
Attackers defeat this by mutating the same payload in endless ways: changing letter case, inserting or
breaking up characters, using alternate encodings (such as HTML entities, URL escaping, and hex or decimal
numeric forms, sometimes layered), exploiting how leniently browser parsers recover from malformed markup,
reaching for less common tags, attributes, and event handlers, and hiding script inside URL schemes or style
contexts. Each variant does the same thing once the browser parses it, but it looks different to the filter.
The filter blocks the samples its author thought of and lets the next mutation through, so a filter-only
defense gives a false sense of safety while the cross-site scripting hole stays open.

## Controls

The defense is to stop trying to recognize bad input and instead make untrusted data inert wherever it is
placed. In concept:

- **Do not rely on blocklist filtering as an XSS defense.** Treat any "sanitize by removing dangerous
  patterns" approach as bypassable, and never as the primary control.
- **Encode output for its context.** Apply the correct encoding at the point where data is written into the
  page, because the rules differ for the HTML body, HTML attributes, JavaScript, URLs, and CSS. The same value
  can be safe in one context and dangerous in another. (The positive rules live in the OWASP Cross-Site
  Scripting Prevention Cheat Sheet.)
- **Use a framework that auto-encodes by default.** Modern UI frameworks escape interpolated values for you.
  Keep that protection and avoid the explicit escape hatches, meaning the APIs that render raw, unescaped
  markup, which reopen the hole the framework closed.
- **Prefer safe sinks.** Write values through an API that cannot execute markup rather than one that parses
  and runs it, so injected content becomes visible text instead of code.
- **If rich HTML is genuinely required, sanitize with a vetted allow-list library.** Use a maintained
  sanitizer that permits only a known-good set of elements and attributes, rather than a hand-written
  blocklist. An allow-list fails closed; a blocklist fails open.
- **Add a Content Security Policy as defense in depth.** A policy that blocks inline script and restricts
  sources reduces the impact of any injection that still gets through. It is a backstop, not a substitute for
  encoding.
- **Use input validation only as a secondary measure.** Validate against an allow-list where the expected
  format is known (for example, a number or a date), but never treat input validation as the thing that stops
  XSS.

## @security scenario

```gherkin
@security @owasp:xss-filter-evasion
Scenario: Input crafted to bypass a blocklist filter is still neutralized by output encoding
  Given a page that renders user-supplied text through a framework that auto-encodes for the output context
  And an attacker has mutated a script-bearing input so that it evades the application's blocklist filter
  When the attacker submits that filter-bypassing input and the value is later rendered
  Then the value is encoded for its context and displayed as inert text
  And no script executes in the victim's browser
```

This scenario is the canonical copy, and it is intentionally abstract: it asserts the outcome (a
filter-bypassing input is rendered inert by encoding) without naming any concrete payload. When you apply this
sheet to real code, add it to the repo's shared feature-file index (see `bdd-comprehensive-testing`, "Storing
BDD scenarios permanently") and wire it into CI (its "CI/CD wiring") so it runs as a blocking autotest
alongside every other Gherkin scenario.

## The real guarantee

What actually stops XSS is contextual output encoding performed at the sink, usually by a safe framework, so
untrusted data is treated as data no matter how it was shaped on the way in. A filter is a check the attacker
mutates around; encoding at the point of output makes the input inert regardless of the mutation. That is why
a cheat sheet full of bypasses is really an argument for a different defense. A filter is a guess; the
context-correct encoding is the guarantee.

## Sources

- OWASP XSS Filter Evasion Cheat Sheet (<https://cheatsheetseries.owasp.org/cheatsheets/XSS_Filter_Evasion_Cheat_Sheet.html>, retrieved 2026-10-11): cited by link only; this reference is written concept-only and intentionally reproduces none of the sheet's attack payloads. `[documented]`
- OWASP Cross-Site Scripting Prevention Cheat Sheet (<https://cheatsheetseries.owasp.org/cheatsheets/Cross_Site_Scripting_Prevention_Cheat_Sheet.html>, retrieved 2026-10-11): the positive controls this reference points to, namely contextual output encoding and a safe framework as the real XSS defense. `[documented]`
