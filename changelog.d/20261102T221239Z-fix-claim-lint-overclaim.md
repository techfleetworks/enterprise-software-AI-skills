### Fixed

- `skeptical-audit/SKILL.md` no longer describes `claim-lint --strict` as already "wired as a blocking CI
  gate". It ships as a helper today (classified `bootstrap-v2-helper` in ADR-0109: not in `gate-manifest.json`
  and not wired as a doc gate in CI, though its own discriminating test runs under `npm test`), so the
  "becomes proven when" cell now states that plainly as a not-yet condition, matching the honest framing of
  the adjacent evidence-contract row. Closes the ADR-0109 follow-up on this overclaim.
