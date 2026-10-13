---
status: "accepted"
date: 2026-10-10
decision-makers: mdenner
---

# Operationalize the architecture gate on this repo (wire arch-gate live)

## Context and Problem Statement

This repo ships `arch-gate` (the mechanical scanner), `judge-arch` (the review skill), and `arch-encode`
(the rule-authoring skill) as a governance system for adopter repos. But the system was never turned on
for this repo itself. There was no root `arch-gate.config.json`, so `arch-gate` had nothing to scan here.
The review log in `docs/arch-reviews/log.jsonl` was appended by hand, and every entry recorded the
mechanical result as not applicable because there was no config to run. A library that sells an
architecture gate but does not run it on its own code fails its own bar, and nothing stopped house-style
or script-hygiene drift (for example an em dash in a rewritten skill, or an outbound web call in a gate
script) from merging.

The task was to both redesign and wire the system live, evolving the current pieces rather than rebuilding
them, so that pulling the repo gives a version that holds its own code and docs to the gate it ships.

## Decision Drivers

* The gate must actually run on this repo on every change, as a required, blocking CI check.
* It must be non-vacuous and proven so, with a discriminating test, so it cannot quietly become a no-op.
* It must enforce what is true and valuable for this repo without fighting the repo's own deliberate
  patterns (the gate scripts use best-effort catches, and the discriminate fixtures are intentionally bad
  code).
* Evolve the current scripts and docs. Do not rebuild them from scratch.
* Keep the honest-limit and evidence discipline the rest of the library already follows.

## Considered Options

* Add a root `arch-gate.config.json` scoped to what is true for this repo (house style plus script
  hygiene), wire it into CI via an `npm run check:architecture` script, and prove it with a discriminating
  test. Leave the error-handling built-ins off here and keep them on in the adopter presets.
* Turn the error-handling built-ins (empty catch, swallow-return, keep-in-sync) on repo-wide and waive
  each of the roughly ten deliberate catches and fixtures the repo's own tooling contains.
* Leave the gate unwired on this repo and keep appending reviews by hand.

## Decision Outcome

Chosen option: "a root config scoped to what is true here, wired into CI, proven by a test." The root
`arch-gate.config.json` enables two rules: `house-style-no-em-dash` (no em or en dashes in the prose of
the skills that have been rewritten clean) and `no-outbound-web-in-gate-scripts` (gate scripts are offline
CLI tools). `arch-gate.waivers.json` is empty. A new `npm run check:architecture` script runs the gate
against the whole repo, and `.github/workflows/test.yml` runs it as a blocking step after the unit tests.
`test/arch-gate-wired.test.mjs` proves the wiring: the repo is green under its own config, the committed
config is structurally non-vacuous (it cannot be silently gutted), and each committed rule still catches a
planted violation run through the real config.

The built-ins are left off here on purpose. This repo is a library of skills and offline gate scripts.
Its gate scripts use deliberate best-effort catches (a retry loop, a defensive restore), and
`judge-arch/assets/discriminate-fixtures` holds intentionally bad code that the mutation test depends on.
Turning the built-ins on repo-wide would flag the repo's own tooling and force waivers for deliberate
patterns. The built-ins belong in an adopter's application code, so they ship ON in the presets under
`judge-arch/assets/presets`, and the config comment records this split.

The `house-style-no-em-dash` rule is a ratchet. Its include list starts with the skills already rewritten
clean (`pattern-selector`, `arch-encode`, `architectural-decision-records`, `enterprise-architecture-standards`),
plus `judge-arch/SKILL.md` (rewritten in this change) and the two new docs READMEs. Each remaining skill
is added to the list as it is rewritten clean.

The docs were evolved to match: `judge-arch/SKILL.md` was rewritten in plain language with all em and en
dashes removed and its gate-confirmation steps updated to the live command; `arch-encode/SKILL.md` now
points at the live `npm run check:architecture` command and the correct script path; and
`docs/arch-reviews/README.md` and `docs/audit/README.md` were added to explain the log and the audits and
to record that the mechanical result field now carries a real value.

### Consequences

* Good, because the repo now holds its own code and docs to the gate it ships, and house-style or
  script-hygiene drift cannot merge.
* Good, because the wiring is proven non-vacuous by a discriminating test, so a future change that guts the
  config or weakens a rule turns the test red instead of silently disabling the gate.
* Good, because the ratchet makes the clean set grow one rewritten skill at a time, with the growth visible
  in the config.
* Bad (honest limit), because the live gate here enforces only house style and script hygiene, not the
  error-handling built-ins. Those are off for this repo by design and carried by the per-skill checkers and
  the presets instead. The review-coverage and discriminate gates run as unit-tested checks via `npm test`;
  full repo-wide review-coverage enforcement still depends on the planned change-type routing and is not
  claimed here.
* Neutral, because older review-log entries keep their not-applicable mechanical note. The log is
  append-only, so history is left as written and the new practice applies going forward.

### Confirmation

`test/arch-gate-wired.test.mjs` exercises the live wiring: the real gate exits 0 on the clean repo; the
committed config is asserted to keep at least one enforcing rule with a non-empty include and the em-dash
and no-web forbids (it cannot be silently gutted); a planted em dash in a scoped file and a planted
`fetch(` in a scripts file each fail the gate, and the same files without the violation pass
(discriminating). The gate also runs as the `Architecture gate` step in CI via `npm run check:architecture`,
and the engine's own behavior stays covered by `test/arch-gate.test.mjs`.

Evidence ledger for this decision (per [`skeptical-audit/references/evidence-discipline.md`](../../.claude/skills/skeptical-audit/references/evidence-discipline.md); every claim carries a state and a re-runnable source, and none is left `inferred` where it could be measured):

| Claim (falsifiable) | State | Source (re-runnable) | Limitation (not checked) |
|---|---|---|---|
| The gate runs against this repo and the repo is clean now | `observed` | `npm run check:architecture` scans the repo (about 200 files; the exact count tracks the working tree) and exits 0, reporting `PASS` with `no architecture violations` (2026-10-10) | a clean run now does not keep future changes clean; the next row covers that |
| The wired gate stays non-vacuous on every change | `proven` | `node --test test/arch-gate-wired.test.mjs`, 4 of 4 pass; it asserts the committed config keeps its rules and catches a planted em dash and a planted `fetch(` | proves the config is not gutted and the two live rules fire; it does not prove rules not yet added |
| The gate is a blocking CI step | `observed` | the `Architecture gate` step in `.github/workflows/test.yml` runs `npm run check:architecture` | read from the workflow file; it becomes proven-in-practice only once it has blocked a real PR |
| `judge-arch/SKILL.md` carries no em or en dash | `proven` | the `house-style-no-em-dash` rule now scopes `judge-arch/SKILL.md`; `npm run check:architecture` fails if a dash is reintroduced | covers SKILL.md only; the judge-arch reference files are a tracked follow-up, not yet on the ratchet |

## More Information

Builds directly on ADR-0002 (the test harness and CI for gate scripts) and the `judge-arch` and
`arch-encode` skills. The built-in error-handling checks and their rationale are unchanged from the
`arch-gate` engine; this decision only chooses which rules run against this repo and wires them in. Done
before the remaining Track B per-skill rewrites, so each of those is added to the house-style ratchet as it
lands.
