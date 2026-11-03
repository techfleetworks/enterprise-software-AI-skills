---
status: "accepted"
date: 2026-11-03
decision-makers: mdenner
---

# 0113 - Promote four gate-capable helpers to consumer-gates, so skeptical-audit, usability, secret-leak, and mutation detection ship as tracked gates

ADR-0109 classified every shipped `.mjs` with a scope marker and noted that four scripts marked
`bootstrap-v2-helper` are "gate-capable reference tools, not libraries": `verify-check-discrimination.mjs`,
`claim-lint.mjs`, `readability.mjs`, and `leak-check.mjs`. They were helpers only because none was in the
manifest. Whether to promote any of them to a shipped `consumer-gate` was left as an operator decision. The
operator chose to promote all four, done properly rather than by flipping markers.

## Context and Problem Statement

A `bootstrap-v2-helper` is a tool a contributor runs by hand; it is in no manifest section, so the downstream
automation (genesis, the future bot) never tracks it and a consumer never gets it as a gate. That left four
disciplines with no shipped enforcement: skeptical-audit's evidence contract (claim-lint), usability's reading
grade (readability), build-output secret leaks (leak-check), and the general mutation gate
(verify-check-discrimination). `[observed]` `skeptical-audit/SKILL.md` even described `claim-lint --strict` as
"wired as a blocking CI gate", which ADR-0109's follow-up (PR #208) corrected to "not yet".

The tools are not uniform, which is why promotion is not a marker flip:

- `[observed]` `verify-check-discrimination.mjs` is already a repo-level gate: config-driven, it enumerates a
  repo's checks, no-ops each, and requires its test to fail. It has discriminating tests in
  `test/verifiable-gates.test.mjs`.
- `[observed]` `claim-lint.mjs` and `readability.mjs` are SINGLE-FILE tools (`<file> --strict`,
  `<file> --max-grade N`). They have no repo-walking mode, so a bare marker flip would ship a gate with no
  defined surface - it would scan nothing and pass green (the vacuous-gate failure `verifiable-quality-gates`
  exists to stop).
- `[observed]` `leak-check.mjs` is a per-invocation oracle (`--secret VALUE <file>`): it needs the secret
  VALUES passed in. A committed repo config cannot safely carry secret values.

## Considered Options

- **Option 1: a thin `consumer-gate` wrapper per tool that walks a defined surface and runs the REAL tool.**
  The tool keeps ownership of detection; the wrapper owns only "which files". For leak-check, the wrapper
  reads secret VALUES from named CI environment variables (names in the config, values never committed).
- **Option 2: extract each tool's detection into a shared lib imported by both the CLI and the wrapper.**
- **Option 3: leave all four as helpers; document them as hand-run tools.**
- **Option 4: flip the four markers to `consumer-gate` with no surface wrapper.**

## Decision Outcome

Chosen: option 1. `verify-check-discrimination` is promoted as-is (marker + manifest entry; it was already a
repo gate). Each of the other three gets a new, self-contained, dependency-free `consumer-gate` wrapper that
walks a configured surface and shells out to the real underlying tool, so the detection logic has exactly one
owner and is not re-implemented:

- `[proven]` `skeptical-audit/scripts/check-claims-grounded.mjs` (id `claims-grounded`) walks a config's
  `roots` and runs `claim-lint --strict` per `.md`; any untagged claim fails the gate. A new findings doc
  cannot escape by never being named on a command line (`test/claims-grounded.test.mjs`, including the
  whole-tree-walk and fail-closed cases).
- `[proven]` `usability-ux-universal-design/scripts/check-readability.mjs` (id `readability-grade`) walks
  `roots` and runs `readability --max-grade N` per file; any file above the grade fails
  (`test/readability-gate.test.mjs`).
- `[proven]` `comprehensive-test-strategy/scripts/check-secret-leaks.mjs` (id `secret-leak`) resolves secret
  values from the config's `secretEnvVars` (names only) via `process.env`, walks the `scan` surface, and runs
  `leak-check` ONE secret at a time per artifact so a hit maps to an env-var NAME without ever printing the
  value (`test/secret-leaks.test.mjs`).
- `[observed]` all four are listed in `gate-manifest.json` under `consumerRequiredGates` with a pinned
  `sha256`, a `test`, a `testSha256`, and an `acceptance` contract; the upstream-integrity gate confirms
  source and manifest agree: `node always-on/run-check.mjs run judge-arch check-upstream-manifest-integrity.mjs`
  prints "11 upstream gate(s), 16 consumer-required gate(s)", exit 0.
- `[proven]` each new wrapper fails closed (missing config, no roots, a missing root, an EMPTY surface, an
  unreadable file, a tool failing closed) and each wrapper's test DISCRIMINATES: no-op the wrapper and its
  test goes red (verified by stubbing each gate to `process.exit(0)` and re-running its test, exit 1).

Option 2 was rejected as more change for the same result: it means refactoring three hardened, well-tested
tools, and the existing precedent (`check-has-test` importing `verifiable-lib`; `check-axe-results` pairing
with `run-axe`) shows a gate and its producer live in separate files here. Spawning the real tool is also the
more faithful reuse ("run the REAL check", `verifiable-quality-gates`). Option 3 keeps the gap ADR-0109 named.
Option 4 ships vacuous gates (no surface for claim-lint/readability, no safe input for leak-check) and is the
exact anti-pattern this repo forbids.

- **Semver: this is a PATCH (1.3.3), not a minor.** `[observed]` `esk-genesis.mjs` installs only
  `manifest.gates` and `manifest.machinery` (it reads `src.gates`, never `consumerRequiredGates`); repo-wide,
  `consumerRequiredGates` is read only by the integrity check, the schema, the BDD, and docs. So classifying
  four more consumer-gates installs nothing into, runs nothing in, and provenance-compares nothing against any
  consumer: no currently-green consumer turns red (the same rationale as ADR-0109's 1.3.2 patch).

### Consequences

- Good, because `[proven]` four disciplines now ship as tracked, hash-pinned, discrimination-tested gates the
  downstream automation can install and verify, instead of hand-run tools.
- Good, because `[observed]` `skeptical-audit/SKILL.md`'s evidence-contract row can now honestly say
  claim-lint's detection is wired as the `claims-grounded` consumer-gate (classified in the manifest), while
  still naming that it is not yet installed/run in a consumer.
- Bad, because editing any of these four tools now requires updating its manifest `sha256` in the same commit
  (the integrity gate names the file and the fix). This is the discipline every classified gate already carries.
- Neutral: this does not install or run the gates in a consumer; that is the genesis + bot work (ADR-0110).

### Confirmation

`test/claims-grounded.test.mjs`, `test/readability-gate.test.mjs`, and `test/secret-leaks.test.mjs` (happy
path, real-violation, whole-tree-walk, and fail-closed cases, each discriminating); `test/verifiable-gates.test.mjs`
(the mutation gate's own discrimination); `test/gate-manifest-schema.test.mjs` and the upstream-integrity gate
(the four consumer-gate entries are well-formed and agree with their source);
`features/repo-process/consumer-gate-promotion.feature` (executed by `npm run test:bdd`).

## What this does not fix, said plainly

- The gates are as precise as the tools they run. `claim-lint` is a smoke alarm and `readability` is a
  rule-of-thumb grade; both have intrinsic false positives and negatives on arbitrary prose. The wrappers do
  NOT reduce that error - they remove the "which files" escape hatch and make every misfire visible (precise
  file + line). The error is BOUNDED by each test's clean-must-pass / bad-must-fail fixtures and SURFACED, not
  eliminated. `[documented]`
- `consumerRequiredGates` are classified, bound to source, and pin `testSha256`, but this change does NOT yet
  install them into a consumer or run them there; that is the genesis + bot work (ADR-0110). `[documented]`
- The manifest-provenance gate (ADR-0044) does not yet compare `consumerRequiredGates` against the published
  release, so a consumer could weaken this section once it is installed. Provenance coverage lands with the
  genesis install. `[documented]`
- `check-secret-leaks` passes secret values to `leak-check` as process arguments, so the values appear in the
  child process's argv (visible to a local process listing). That is acceptable on an ephemeral CI runner; the
  gate never writes a value to disk and never prints one. A stricter value-passing channel would require
  changing `leak-check`'s interface, which this change does not. `[documented]`
- `check-secret-leaks` scans built OUTPUT for KNOWN secret values; it does not scan SOURCE for secret-shaped
  strings, which is owned by `owasp-secure-coding-bdd`'s lints. The two are complementary, not duplicates.
  `[documented]`
