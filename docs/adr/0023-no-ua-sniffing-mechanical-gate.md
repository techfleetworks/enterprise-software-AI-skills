---
status: "accepted"
date: 2026-10-12
decision-makers: mdenner
---

# Enforce feature-detection over user-agent sniffing with a mechanical gate

## Context and Problem Statement

`universal-browser-device-support` has one core rule: feature-detect, never UA-sniff. Branching on the
browser's user agent (reading `navigator.userAgent` and matching a brand string, or testing
`/Chrome|Safari|.../` against it) rots as browsers change their UA strings, is trivially spoofable, and
silently misses engines the author did not think to list, which is exactly how a site breaks in a
browser nobody tested. Until now this rule was prose only; an agent or a human could ship a
`navigator.userAgent.indexOf('MSIE')` branch and nothing would stop the merge. This skill was also one
of the last always-on skills with no mechanical gate at all. The repo's thesis is that a skill's
guidance must be structurally enforced, not advisory, with a discriminating test so the gate cannot rot.

## Decision Drivers

* Enforce the mechanically-detectable part of the rule at merge time: the user-agent sniffing surface.
* Dependency-free and vendor-neutral (it ships and is copied with the skill).
* Allow a genuine, reviewed exception (analytics capture, a documented quirk workaround that still has a
  feature-detected fallback) without weakening the default.
* A false red trains people to disable the gate, so the exception must be a one-line inline waiver with
  a reason, and the gate must err toward over-flagging rather than hiding a real sniff.

## Considered Options

* A bespoke `check-no-ua-sniffing.mjs` linter in the skill.
* Express it as `arch-gate` forbidden-regex config.
* Leave it as prose and rely on review.

## Decision Outcome

Chosen option: "a bespoke linter in the skill," mirroring the other skill gates (migration-safety,
alert-hygiene, owasp-lints). The `arch-gate` forbidden-regex engine could flag `navigator.userAgent`,
but it cannot express the two-signal `ua-brand-test` rule (a brand token AND a test operator on the same
line) without heavy false positives, nor the inline-ignore-with-required-reason discipline. The gate
scans JS and TS source, strips comments before matching (so a brand name in a comment is not flagged),
and applies two rules: `ua-api` (a read of `navigator.userAgent`, `vendor`, `appVersion`, `platform`,
or `userAgentData`) and `ua-brand-test` (a line that both names a browser brand and tests it with
`.test(`, `.match(`, `.indexOf(`, `.includes(`, or `==`). A reviewed exception is suppressed only by an
inline `// ua-sniff:ignore <reason>` (or `=rule`) on the flagged line or a comment-only line directly above
(a trailing ignore on a statement does not leak to the next line); a bare `ignore` with no reason does
not suppress.

### Consequences

* Good, because the sniffing the skill forbids now fails CI instead of relying on a reviewer to notice.
* Good, because the skill now carries the Mechanical gate section the Track-B template expects.
* Good, because stripping comments and requiring a test operator for the brand rule keep the common
  false positives (a brand in a comment, a plain `const name = 'Safari'`) green.
* Bad (honest limit), because it catches the sniffing surface, not whether a feature-detection fallback
  is correct. A sniff hidden in a variable passed across files, or a dynamically built property access,
  can evade it. That residue is for `judge-arch` and cross-engine tests, and each escape becomes a new
  pattern.
* Neutral, because it is a reference gate an adopting repo points at its own source in CI, and it fails
  closed on zero source files.

### Confirmation

`test/no-ua-sniffing.test.mjs` (16 tests): feature-detection code, a brand name in a comment, and a
plain brand string assignment all pass; a `navigator.userAgent`/`vendor`/`platform`/`userAgentData`
read, a brand `indexOf` test, a `/Chrome/.test(...)`, a brand equality comparison, and TypeScript source
all fail with the rule named; a reasoned inline or comment-only-line-above ignore (and a targeted
`=rule`) suppresses while a reason-less or wrong-rule ignore does not, and a trailing ignore does not
leak to a real sniff on the next line; an empty directory fails closed (exit 2). All run in
CI via `npm test`, and the discrimination gate confirms the tests fail when the check is stubbed to a
no-op.

## More Information

The rule traces to `universal-browser-device-support/references/feature-detection-progressive-enhancement.md`.
This is the mechanical gate added in the Track-B deep rewrite of the browser and usability skills; the
companion `usability-ux-universal-design` skill is deliberately left without a bespoke gate, since
usability is judgment, enforced by `judge-arch`, heuristic review, and the house-style prose rules.
