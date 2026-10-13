---
status: "accepted"
date: 2026-10-13
decision-makers: mdenner
---

# Harden every mechanical gate against the holes a final adversarial pass found

## Context and Problem Statement

Before tagging v1.0.0, four fresh-context auditors ran an adversarial false-negative / false-positive pass over
every mechanical gate in the repo: for each gate they crafted an input that SHOULD fail but might slip (the
dangerous case), a legitimate input that might be wrongly flagged, and probed for vacuous-pass and fail-open
paths, confirming each finding empirically. They found about twenty real holes, six of them HIGH. Every gate had
shipped with its own discriminating test, yet these slipped, because those tests were written thinking like the
gate's author, not like an attacker. For a repo whose entire value proposition is "gates you can trust," shipping
a release with a meta-gate that does not fully discriminate, or an architecture gate that misses the two most
natural swallowed-error shapes, would hollow out the thesis. So the pass is the point, and the holes must close
before 1.0.

## Decision Drivers

* Fix the root cause, not each symptom: the findings collapse into a few recurring classes, so fixing the
  pattern closes several at once and prevents the next instance.
* Every fix ships an ADVERSARIAL discriminating test (an evasion case, not just a clean pass and one obvious
  fail), so the same hole cannot silently reopen.
* Preserve real behavior: the tightened gates must still pass the real repo, the 61-entry pattern catalog, and
  the 137 OWASP sheets. Each was verified.
* Be honest about what stays a limitation: a couple of findings are inherent to a dependency-free text gate and
  are documented rather than papered over.

## Decision Outcome

The twenty-odd findings were fixed by five root-cause classes:

* **Weak reason/placeholder validation, applied unevenly.** Several gates accepted a whitespace, ".", "tbd", or
  "soon" where others already required a real, non-placeholder value. Standardized the bar across
  `check-security-coverage` (waiver reason/approver), `check-retention-basis` (lawful basis), and
  `check-axe-results` (suppression reason). A security surface or a critical a11y finding can no longer be waived
  by a one-character reason.
* **Presence check not scoped to the meaningful region.** `check-owasp-lints` tested cookie flags over the whole
  call including the cookie NAME (so `res.cookie('session_secure', t)` passed); now it tests the options code,
  not the name string. `check-cheatsheet-catalog` accepted a present-but-empty section and a one-line fake
  scenario; now a section needs real content and the `@security` scenario needs Given/When/Then each on its own
  line in order. `claim-lint` now looks ahead one line for the evidence state (a backed claim on the next line is
  no longer a false positive).
* **Credits or counts content that does not execute.** `verify-check-discrimination` (the mutation meta-gate)
  only checked that a test FAILS against a no-op check, never that it PASSES against the real one, so an
  always-red test was certified as discriminating; it now requires a PASS->FAIL transition. `check-test-shape`
  counted commented-out `<testcase>` lines (a commented ice-cream cone read as a pyramid); it now strips comments
  and CDATA. `check-has-test` could be credited from a comment; crediting now strips comments (not strings, since
  the check's name legitimately lives in the exec path string). A zero-step BDD scenario satisfied all three BDD
  gates; `check-bdd-coverage` now requires at least one step per scenario.
* **Hardcoded enumerations that are not exhaustive.** `check-alert-hygiene` keyed on an 8-token cause list, so a
  page on heap, a connection pool, file descriptors, or threads slipped; it now flags any paging alert with NO
  user-facing symptom token (symptom-absence), which catches a page on any cause. `check-untagged-pii` missed
  `ip_addr` / `client_ip` / `age` / `salary` / `citizenship`; the indicators were broadened. `check-migration-safety`
  was Postgres-only despite a vendor-neutral claim; MySQL `MODIFY` / `CHANGE` rules were added, and string
  literals are now blanked so a keyword inside a string cannot trip a rule. `arch-gate`'s `emptyCatch` and
  `swallowReturn` missed `catch { ; }` and `catch { return; }` (and bare/empty returns); both were extended, and
  a catch that returns a real recovery value is still not flagged.
* **Vacuous-when-unconfigured, bad dates, and case.** `check-a11y-checklist` accepted a `pass-manual` verdict
  dated in the future (a fabricated "2099" sign-off); future dates are now rejected. `check-test-shape` with a
  layers-only config printed "on-pyramid" while enforcing nothing; it now discloses the pyramid was NOT enforced
  rather than overclaiming. `check-reference-links` missed an uppercase `.MD` dangling reference (case-insensitive
  now). `check-arch-review-coverage` certified a full review when every cell was `n/a` with no evidence; an `n/a`
  cell now needs a reason too. `check-change-routing` required a test only for a new `check-*` gate; it now routes
  every new `scripts/*.mjs`, so a `verify-*` / `run-*` / lint gate cannot ship untested.

The TFN end-to-end test (a fresh agent on a real change) showed the receipt could be skipped under an "it is too
small to bother" rationalization, so the always-on directive now states there is NO triviality exemption for the
skill-application receipt.

### Acknowledged limitations (documented, not fixed)

* `check-skill-evidence-contract` is presence-based by design (it checks the section, a resolving link, and the
  ledger phrase, not the substance); an empty section plus the phrase passes. It does resist the broken-link
  bypass. The substance is a judge-arch and human-review concern, as the evidence contract already states.
* `check-no-ua-sniffing` is a dependency-free regex line linter; aliasing `navigator` to another identifier or
  splitting a brand literal across lines evades it. Its docstring already scopes it to the "sniffing surface." An
  AST/dataflow check is out of scope for a dependency-free gate.

### Consequences

* Good, because the gates now resist the natural evasions, and each fix is pinned by an adversarial test that
  fails if the hole reopens. The meta-gate in particular now actually certifies discrimination (a pass->fail
  transition), which was the keystone.
* Good, because the recurring placeholder/reason, region-scoping, and execute-only-counts patterns were fixed
  once each and applied across the gates that shared them.
* Bad (minor), because a few gates are now stricter and may flag an adopter's previously-green input (a future
  review date, a layers-only shape config, a bare `n/a` review cell); that is the intended tightening, each with
  an inline-ignore or a reason as the escape.
* Neutral, because the documented limits (evidence-contract substance, UA-sniffing AST) are unchanged and stated.

### Confirmation

`npm test` passes (440 pass, 0 fail, 2 skip; the two skips are the OS-gated symlink test and a conditional
owasp-verbatim; the intermittent WSL-bash `check-adr` flake is environmental and green in CI). Every fix carries
a discriminating test that fails without the fix. `npm run check:architecture`, `check:links`, `check:routing`,
and `check:receipt` all pass. The tightened gates were re-run against the real repo: the 61-entry pattern catalog
and all 137 OWASP sheets still pass.

Evidence ledger:

| Claim | State | Source | Limitation |
|------|-------|--------|-----------|
| Each hardened gate now flags the evasion the auditor found | proven | the adversarial case added to each gate's test; `npm test` | Proves the engine on crafted fixtures |
| The meta-gate now requires a pass->fail transition | proven | the always-red case in `test/verifiable-gates.test.mjs` | Verifies the transition, not the quality of the test |
| The tightened gates still pass the real repo/catalog/sheets | observed | `check-catalog-completeness` on the 2 catalogs; `check-cheatsheet-catalog` 137/137; `check:links`/`check:architecture` exit 0 | Current tree only |
| The documented limits remain | documented | evidence-contract presence-only; UA-sniffing regex scope | Both stated in-gate; not closed |

## More Information

Follows the full re-audit and ADR-0031..0039. The merge-blocking CI wiring for the receipt and review-coverage
gates stays deferred to the techfleetnetwork CI/CD release. The meta-lesson (every gate test should carry an
adversarial case, not only a clean pass and an obvious fail) is the practice this pass encodes by example.
