### Added (every consumer-facing checker declares its scope, ADR-0109)

- Every `check-*.mjs` under a skill's `scripts/` now carries exactly one scope marker: `bootstrap-v2-gate`
  (installable), `bootstrap-v2-consumer-gate` (needs the consumer's own input; listed in a new
  `gate-manifest.json` `consumerRequiredGates` section with an `acceptance` contract), `bootstrap-v2-upstream-only`
  (self-governance, never shipped), or `bootstrap-v2-machinery`. The upstream-integrity gate
  (`check-upstream-manifest-integrity.mjs`) now fails closed on any unclassified or misclassified checker, matches
  the marker only as a comment-only line, and runs against this repo itself in CI (a real-repo assertion in
  `test/upstream-manifest-integrity.test.mjs`, which `npm test` runs). This closes gap 1 of issue 203: a skill can
  no longer ship a consumer-facing gate the manifest never accounts for. The 12 previously unlisted consumer gates
  (the four BDD gates, test-shape, arch-review-coverage, arch-rules-discriminate, open-high-findings,
  security-coverage, a11y-checklist, axe-results, has-test) are now classified and manifested.
