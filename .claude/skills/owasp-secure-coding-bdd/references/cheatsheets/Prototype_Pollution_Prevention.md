# Prototype Pollution Prevention

## What it is

Prototype pollution is a JavaScript flaw where an attacker reaches a shared object prototype through
special keys such as `__proto__` or `constructor.prototype` and adds or changes properties on it.
Because nearly every object inherits from that prototype, the injected property shows up across the
whole app, which can corrupt logic, escalate access, and in some cases enable remote code execution.

## The attack it stops

When code merges, clones, or assigns attacker-controlled keys into a plain object without guarding the
special keys, a payload whose key path is `__proto__.<prop>` (or `constructor.prototype.<prop>`) writes
onto `Object.prototype` itself. From then on every plain object reads that polluted property as if it
were its own, so the attacker can set defaults the code never intended: flipping a flag that an
authorization check later reads, or planting a value that flows into a dangerous sink elsewhere. The
cheat sheet is blunt about the ceiling: at worst this leads to attackers reading data they should
not, gaining elevated privileges, and in the most severe cases running their own code on the host.

## Controls

**Prefer collections that have no prototype pathway.** For sets of allowed values or key/value
lookups, use `new Set()` and `new Map()` instead of object literals. Their entries are real collection
members rather than properties on a prototype chain, so a key such as `__proto__` is stored as data
and cannot pollute anything. The sheet's example uses `allowedTags.add('b')` with `allowedTags.has('b')`
and `options.set('spaces', 1)` with `options.get('spaces')` in place of `{}` lookups.

**When you must use a plain object, remove its prototype.** Create objects with `Object.create(null)`
so they do not inherit from the `Object` prototype and have no `__proto__` setter to abuse. If you are
forced to write an object literal, set the prototype to null inline as a last resort with
`{__proto__: null}`.

**Freeze or seal to lock prototypes, knowing the limits.** Running `Object.freeze()` over a built-in
prototype stops new properties from being attached or old ones removed and turns its current data
properties read-only, which denies the exact write a pollution payload needs. Remember that the lock
covers only the top level: whatever those properties point to stays changeable until you freeze each
one on its own. Check that your dependencies still work beforehand, since any library that reassigns
parts of a built-in prototype may stop functioning once it is frozen. `Object.seal()` offers less: it
blocks adding, removing, or reconfiguring properties but leaves already-writable values free to
change, so it is no safeguard against a value being overwritten.

**Remove `__proto__` at the Node.js runtime as defense in depth.** Node.js can drop the `__proto__`
property entirely with the `--disable-proto=delete` flag. The sheet is explicit that this is a defense
in depth measure, not a complete fix: pollution through `constructor.prototype` is still possible, but
removing `__proto__` reduces the attack surface and blocks a class of attacks.

## @security scenario

```gherkin
@security @owasp:prototype-pollution @usecase:proto-key-merge
Scenario: A crafted __proto__ key cannot reach Object.prototype
  Given code that copies attacker-supplied keys into an object
  And the target object is created with "Object.create(null)"
  When an attacker submits a payload with the key path "__proto__.isAdmin" set to true
  Then the write lands on the prototype-less target, not on "Object.prototype"
  And a freshly created "{}" still has no "isAdmin" property
```

This scenario is the canonical copy. When you apply this sheet to real code, add it to the repo's
shared feature-file index (see `bdd-comprehensive-testing`, "Storing BDD scenarios permanently") and
wire it into CI (its "CI/CD wiring") so it runs as a blocking autotest in the same place as every
other Gherkin scenario.

## The real guarantee

The structural control is denying the write any path to a shared prototype. A `Map` or `Set`, or a
target built with `Object.create(null)`, has no inheritable prototype to pollute, so attacker keys can
only ever become own properties of a throwaway object. The `@security` scenario checks one `__proto__`
payload; the prototype-less container is what makes every special-key payload inert. Freezing built-in
prototypes and the Node.js flag are added layers, but the guarantee is that the object the attacker
writes into shares nothing with every other object in the app.

## Sources

- OWASP Prototype Pollution Prevention Cheat Sheet (<https://cheatsheetseries.owasp.org/cheatsheets/Prototype_Pollution_Prevention_Cheat_Sheet.html>, retrieved 2026-10-11) `[documented]`
