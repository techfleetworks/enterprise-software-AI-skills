### Added

- Four gate-capable helpers are promoted to consumer-gates (ADR-0113), so their disciplines ship as tracked,
  hash-pinned, discrimination-tested gates instead of hand-run tools:
  - `claims-grounded` (skeptical-audit): walks a configured findings/review doc surface and runs
    `claim-lint --strict` over every file, so an untagged factual claim cannot escape review by never being
    named on a command line.
  - `readability-grade` (usability-ux-universal-design): walks a user-facing doc surface and fails any file
    above a configured Flesch-Kincaid grade.
  - `secret-leak` (comprehensive-test-strategy): scans configured build artifacts for the values of named CI
    environment variables (values resolved from the environment, never the committed config) and reports the
    env-var name, never the value, on a leak.
  - `verify-check-discrimination` (verifiable-quality-gates): the general mutation gate, already repo-level,
    is now classified as a consumer-gate.
  Each wrapper is self-contained, fails closed on an empty/missing surface, reuses the one underlying tool for
  detection (no re-implementation), and ships a discrimination test (no-op the gate and its test goes red).
  Released as a patch: `consumerRequiredGates` is classified only - `esk-genesis` installs neither it nor these
  gates into any consumer - so no currently-green consumer turns red.
