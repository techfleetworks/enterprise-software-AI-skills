---
status: "accepted"
date: 2026-11-02
decision-makers: mdenner
---

# 0109 - Every consumer-facing checker declares its scope, so a skill cannot ship a gate the manifest never installs

A skill could ship a `check-*.mjs`, tell consumers in its SKILL.md to run it, and have the gate-manifest never
list it. `esk-genesis` installs only what the manifest lists, so the gate never reached a consumer, and nothing
flagged the omission. This was filed as issue 203 (gap 1), observed on a real new repo (`techfleetworks/job-decoder`).

## Context and Problem Statement

The manifest (`gate-manifest.json`) is the single source of truth for which gates a consumer installs (ADR-0041).
The upstream-integrity gate (ADR-0046) proved the manifest matches its source, but only for scripts that carried a
`bootstrap-v2-gate` or `bootstrap-v2-machinery` marker:

- `[observed]` `check-upstream-manifest-integrity.mjs` skipped any source with no marker (its reverse scan did
  `if (matches.length === 0) continue`), so a `check-*.mjs` with no marker was invisible to it.
- `[observed]` 12 consumer-facing checkers shipped under skill `scripts/` folders carried no marker and were in no
  manifest section: the four BDD gates, `check-test-shape`, `check-arch-review-coverage`,
  `check-arch-rules-discriminate`, `check-open-high-findings`, `check-security-coverage`, `check-a11y-checklist`,
  `check-axe-results`, `check-has-test`. Re-runnable:
  `find .claude/skills -path "*/scripts/check-*.mjs"` minus the manifest's gate list.
- `[observed]` the real-repo integrity gate was never run against this repo in CI (only its fixture test ran via
  `npm test`), so even a marked-but-unmanifested script would not have been caught here.

So the defect-catching gates (BDD execution, coverage, mutation, accessibility, arch-review coverage, security
coverage) were exactly the ones no consumer ever got, and no check made that a red state.

## Considered Options

- **Option 1: a scope marker on every checker, enforced bidirectionally by the upstream-integrity gate, run
  against this repo in CI.**
- **Option 2: a `gates:` block in each skill's SKILL.md frontmatter (as issue 203 proposed).**
- **Option 3: leave the manifest hand-curated and review for omissions.**

## Decision Outcome

Chosen: option 1. EVERY `.mjs` under a skill's `scripts/`, whatever its name and at any depth, declares exactly
one scope with a self-declaring comment marker, and the upstream-integrity gate fails closed on any unclassified
or misclassified script.

- The five scopes: `bootstrap-v2-gate` (installable, in `manifest.gates`); `bootstrap-v2-consumer-gate` (needs the
  consumer's own input, in a new `manifest.consumerRequiredGates` section with a machine-readable `acceptance`
  contract and a pinned `testSha256`); `bootstrap-v2-upstream-only` (a check that governs only this authoring
  repo, in no manifest section); `bootstrap-v2-machinery` (a non-gate runner, in `manifest.machinery`); and
  `bootstrap-v2-helper` (a shipped script that is NOT a gate: a library, runner, generator, installer, scaffold,
  or reference tool, in no manifest section).
- `[proven]` Keying completeness on EVERY `.mjs`, not just `check-*`, is the fix for the first review's HIGH
  finding: a gate shipped under a name other than `check-*` (the live example was `claim-lint.mjs`) could escape
  the old filename-scoped rule. Now an unmarked `.mjs` of any name, including one nested in a subdirectory, is a
  violation (`test/upstream-manifest-integrity.test.mjs`, the F1 and F3 cases).
- `[proven]` An unmarked script is a violation, a consumer-gate marked source must be in `consumerRequiredGates`,
  an upstream-only or helper marked source must be in no section, each consumer-gate must carry a non-empty
  `acceptance`, each gate AND consumer-gate must pin its `testSha256` (the F2 case), and an id reused across
  sections fails closed (the F4 case) (`test/upstream-manifest-integrity.test.mjs`).
- `[proven]` The gate runs against THIS repo in CI, not only fixtures: `test/upstream-manifest-integrity.test.mjs`
  asserts `run(process.cwd())` exits 0, and `npm test` runs in the `test` job on Node 20 and 24
  (`.github/workflows/test.yml`). So a script added later without a marker, or marked but unmanifested, turns the
  required build red.
- `[proven]` A change-time routing rule (`new-gate-needs-manifest` in `routing-rules.config.json`) adds a second,
  earlier line of defense (issue 204 criterion C): adding a new `scripts/check-*.mjs` requires a `gate-manifest.json`
  change in the same PR (`test/change-routing.test.mjs`, the REAL-config case). It is keyed on `added`, not
  `changed`, on purpose: editing an existing `upstream-only` or `helper` script needs no manifest change, so a
  `changed` rule would false-fire on it. The CI integrity gate above is the precise, always-on enforcer (it also
  covers edits and correctness, which a glob rule cannot); the routing rule is the belt-and-suspenders that catches
  the omission at change time. The one exception, a new self-governance gate deliberately left `upstream-only`, is
  waived with a reason.
- The marker is matched only as a comment line that is nothing but the marker (anchored, multiline), so the gate
  never matches a marker-shaped string inside code (its own regex literals, an error message, a `<id>` doc
  example). `[observed]` the gate passes against the real repo:
  `GATE_MANIFEST_FILE=./gate-manifest.json GATE_SKILLS_DIR=./.claude/skills node
  .claude/skills/judge-arch/scripts/check-upstream-manifest-integrity.mjs` prints
  "11 upstream gate(s), 12 consumer-required gate(s) and 2 machinery entry(ies) ... and every shipped .mjs under a
  skill's scripts/ is classified", exit 0.

Option 2 was rejected because a SKILL.md `gates:` block is a second copy of a fact the marker and the manifest
already hold, and `[inferred]` two copies drift (the same data-ownership failure the architecture gate exists to
stop). The marker lives in the one file that is the gate, so there is one owner.

### Consequences

- Good, because `[proven]` a consumer-facing checker can no longer be added without the manifest accounting for it:
  the omission that hid 12 gates is now a red CI state at the source.
- Good, because the manifest now records, per consumer gate, the `acceptance` contract a consumer must satisfy,
  which the downstream automation (the genesis bot, future work) reads to decide what to install and verify.
- Bad, because editing any classified checker now requires updating its manifest `sha256` in the same commit
  (the integrity gate names the file and the fix). This is the same discipline installable gates already carry,
  extended to consumer gates.
- Neutral: this closes gap 1 (the upstream completeness hole). Gap 2 (a consumer that never ran `esk-genesis`
  still gets no gates) is not closed here; nothing committed in one repo can enforce another repo, so it needs the
  org-level automation tracked separately.

### Confirmation

`test/upstream-manifest-integrity.test.mjs` (the ADR-0109 cases plus the real-repo assertion),
`test/gate-manifest-schema.test.mjs` (the `consumerRequiredGates` contract accepts a valid entry and rejects a bad
one), and `features/repo-process/consumer-gate-classification.feature` (executed by `npm run test:bdd`).

## What this does not fix, said plainly

- The guarantee is precise: a gate cannot SILENTLY escape the manifest, because every shipped `.mjs` must declare
  a scope. It is NOT that no script can ever be miscategorised: a contributor could mark a real gate
  `bootstrap-v2-helper` to keep it out of the manifest. That is now a visible, reviewable statement in the diff
  (and the judge-arch review and the skill receipt look for it), not a silent gap behind a naming convention. The
  residual is a judgment call a human reviews, the same honest ceiling the architecture gate states. `[documented]`
- Several scripts classified `helper` here are gate-capable reference tools, not libraries: `claim-lint.mjs`,
  `readability.mjs`, `leak-check.mjs`, and `verify-check-discrimination.mjs`. They are `helper` because none is in
  the manifest or wired into this repo's CI today. `[observed]` `skeptical-audit/SKILL.md` nonetheless describes
  `claim-lint --strict` as "wired as a blocking CI gate", which overstates the current state. Whether to PROMOTE
  any of these to a shipped `consumer-gate` (and correct that SKILL.md line) is a product decision left to the
  operator, tracked as a follow-up. `[documented]`
- `consumerRequiredGates` are classified, bound to their source, and pin `testSha256`, but this change does NOT yet
  install them into a consumer or run them there; that is the genesis + bot work. `[documented]`
- The manifest-provenance gate (ADR-0044) does not yet compare `consumerRequiredGates` against the published
  release, so a consumer could weaken that section once it is installed. Provenance coverage of the new section
  lands with the genesis install. `[documented]`
- The completeness scan covers a skill's `scripts/` tree; a gate placed outside `scripts/` (for example under
  `tools/`) cannot be a manifest gate anyway (the manifest resolves every source under `scripts/`), so such a
  script could only ever be a hand-run tool. `[documented]`
- A repo that never ran `esk-genesis` is still un-gated; this ADR makes the upstream manifest complete, not the
  consumer install un-skippable (gap 2). `[documented]`
