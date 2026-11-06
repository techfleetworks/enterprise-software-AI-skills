### Added (always-on)

- Gate coverage is now a `finish-check` precondition (ADR-0116, closes the session-layer half of #203 gap 2). In a
  repo that adopted the enterprise skills (a repo-level `.claude/.esk-installed` marker, or an `enterprise-gates`
  workflow), a file-changing Claude task cannot end while the repo is un-gated or drifted: `finish-check` delegates
  the verdict to `esk-genesis --check` (the one owner of "covered") and blocks, fails closed, and rides the existing
  block-cap escalation. It never checks a repo that did not opt in, and never the skills source repo itself. An
  operator can waive it (`{"step":"coverage","by":"operator","reason":...,"date":...}`) with a lapsing TTL
  (`ESK_COVERAGE_WAIVER_TTL_DAYS`, default 30; `0` = never); the agent cannot waive it for itself.
