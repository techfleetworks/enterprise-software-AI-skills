---
status: "accepted"
date: 2026-10-10
decision-makers: mdenner
---

# Add mechanical lints for the two text-detectable OWASP defects

## Context and Problem Statement

`owasp-secure-coding-bdd` turns secure-coding requirements into `@security` BDD scenarios, but most
of its guidance needs threat-modeling and judgment, not a lint. Two specific mistakes, however, are
reliably detectable in source text and are classic, high-impact bypasses: a JWT verified with
algorithm `none` (the `alg:none` bypass) and a cookie set without `HttpOnly`+`Secure`+`SameSite`. The
repo's thesis is to make a skill's enforceable rules structural; the open question is which OWASP
items can be a *sound* lint versus which would be theater.

## Decision Drivers

* Catch the two defects that are reliably text-detectable, with low false positives.
* Do NOT ship a noisy lint that trains people to disable it (a false-red is worse than no gate).
* Be honest about what a text lint cannot do — SSRF especially.
* Dependency-free and vendor-neutral; a reviewed exception is explicit and reasoned.

## Considered Options

* A `check-owasp-lints.mjs` gate with `jwt-alg-none` + `cookie-insecure`, and SSRF handled by
  architecture + BDD (not a lint).
* Also add a regex SSRF lint over outbound HTTP calls.
* No lint — rely entirely on `@security` scenarios and review.

## Decision Outcome

Chosen option: "the two precise lints; SSRF stays architectural." `jwt-alg-none` flags an algorithm
literal of `none`; `cookie-insecure` checks `.cookie(...)`/`setCookie(...)`/`setHeader(...Set-Cookie...)`
call spans and raw `Set-Cookie:` header strings and fails unless `HttpOnly`, `Secure`, and `SameSite`
all appear. **SSRF is deliberately excluded** — the skill's own structural control is a network egress
proxy with no route to internal infra ("the network boundary is what holds when a check is bypassed"),
so a regex over outbound calls would be mostly false positives and give false assurance; SSRF is
enforced by that egress architecture plus a `@security` scenario. Comments are blanked before matching,
and a reviewed exception uses an inline `// owasp-lint:ignore <reason>` (reason required).

### Consequences

* Good, because the `alg:none` bypass and flagless cookies — both common, both severe — now fail CI instead of relying on a reviewer to spot them.
* Good, because refusing to ship a regex SSRF lint keeps the gate credible: every finding it raises is a real defect, so the gate won't be disabled as noisy.
* Bad (honest limit), because the cookie check is span/heuristic-based (not a parser): an unusual cookie-setting idiom or a flag set far from the call can over- or under-match; the inline ignore and the test fixtures bound this.
* Neutral, because it is a reference gate an adopting repo points at its source tree in CI, complementing (not replacing) the `@security` BDD suite.

### Confirmation

`test/owasp-lints.test.mjs` (13 tests): `algorithms:['none']` / `"alg":"none"` fail while a pinned
`['HS256']` passes and an `alg:'none'` inside a comment does not; a flagful `res.cookie`/`Set-Cookie`
passes while a missing-`Secure` cookie fails and names the missing flag; a reasoned ignore (bare and
`=rule`) suppresses while a reason-less one does not; a zero-scan and a no-code-files path fail closed
(exit 2). All run in CI via `npm test`.

## More Information

Rules trace to `owasp-secure-coding-bdd/references/api-tokens-graphql-microservices.md` (alg),
`authentication-session.md` (cookies), and `file-upload-ssrf-deserialization.md` (SSRF = egress
architecture). Third Phase-3 structural gate (after migration-safety ADR-0009 and untagged-PII
ADR-0010); a test-shape gate and an axe gate follow.
