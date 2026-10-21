---
status: "accepted"
date: 2026-10-20
decision-makers: mdenner
---

# Three consumer-install fixes: the pre-push hook passes invoke, the scans skip vendored skills, the tests run the scripts/ci copy

## Context and Problem Statement

Installing v1.2.0 into a private consumer repo that also vendors the skills under `.claude/skills/` (issue
#112) surfaced three defects. Each is a correctness gap in how the travelling gates reach a consumer, not a
flaw in a gate's own detection logic, and each was reproduced on a clean checkout.

1. **The pre-push hook ran every gate with no arguments.** ADR-0059 added the manifest `invoke` field and the
   aggregator (`run-manifest-gates`) forwards it; the bootstrap-v2 pre-push template did not. So the gates that
   scan by CLI path (`reference-links`, `no-ua-sniffing`, `owasp-lints`, `migration-safety`, `alert-hygiene`,
   `untagged-pii`) ran locally with the wrong root or exited with "no paths given", failing 7 of 10 offline
   gates on a clean consumer, while CI (which runs them through the aggregator) passed. The hook test used stub
   gates with no `invoke`, so it never caught the gap, and this repo's own self-dogfood hook is a different
   npm-script hook, so dogfooding did not catch it either.

2. **The content-scan gates flagged a vendored copy of themselves.** A consumer that vendors the skills carries
   each gate script a second time under `.claude/skills/`, and those copies' own docstrings contain the exact
   patterns the gates look for (a `navigator.userAgent` read in `check-no-ua-sniffing.mjs`, an insecure example
   in `check-owasp-lints.mjs`). The published `invoke` skipped only `scripts/ci`, so a whole-tree scan reported
   the vendored copy as product findings. Because `manifest-provenance` now binds `invoke` (ADR-0061), the
   consumer cannot add an ignore of their own, so the `enterprise-gates` summary was red on every PR in such a
   repo.

3. **Each gate's discrimination test exercised the vendored skill copy, not the `scripts/ci` gate CI runs.**
   The per-gate test resolved the gate as the `.claude/skills` copy first and the `scripts/ci` copy second. In
   a consumer that vendors the skills both exist, so the "discrimination test run in the consumer" step
   (ADR-0065) tested the wrong file. Measured on a throwaway checkout, neutering each `scripts/ci` gate to
   `process.exit(0)` left all 11 tests green; neutering the vendored copy made all 11 fail. The parity gate
   still caught a changed `scripts/ci` gate by sha256, so this was a gap in the test step, not an open hole.

## Decision

Fix all three at the layer that owns each, and pin each fix with a discriminating test.

1. **The pre-push hook forwards `gate.invoke`.** It now validates `invoke` exactly as the aggregator does (an
   array of strings or absent) and fails closed on a malformed value, then passes it to the gate with no shell.
   The hook stays a standalone manifest reader (ADR-0048): it keeps skipping a gate whose script is absent and
   skipping the network gate, and it does not take on a dependency on the aggregator. The schema is mirrored,
   not re-derived, with a comment naming `run-manifest-gates` as the source of truth. A new hook test ships a
   gate that needs its `invoke` argument and proves the hook delivers it, blocks when it is dropped, and fails
   closed on a malformed `invoke`.

2. **The published `invoke` for the five content-scan gates also skips `.claude/skills`.** `no-ua-sniffing`,
   `owasp-lints`, `migration-safety`, `alert-hygiene`, and `untagged-pii` gain `--ignore .claude/skills`
   alongside the existing `--ignore scripts/ci`. This is the same exemption the copied gate infrastructure
   already gets (ADR-0061) applied to the other place the same non-product machinery is copied: a vendored
   skill tree is not product code. `arch-gate` is deliberately not changed here, because it is config-driven
   per consumer (ADR-0063) and a consumer owns its own ignore globs; `reference-links` is not changed because
   it was not reported to flag the vendored tree. The match is anchored at the working directory, so a decoy
   `src/.claude/skills` elsewhere is still scanned, keeping the anti-evasion property ADR-0061 established.

3. **Each gate's discrimination test runs the `scripts/ci` copy CI runs.** The resolution now prefers the gate
   under `GATE_DIR` (which the workflow sets), falling back to the `scripts/ci` path, and only then to the
   upstream skill copy, which this repo carries and a consumer that does not vendor also uses. Each of the 11
   tests asserts that when a `scripts/ci` copy exists it is the one under test, so a test that silently
   resolved the vendored copy would now fail. The generated `enterprise-gates.yml` sets `GATE_DIR` on the
   discrimination-test step so a consumer's test step targets the same copy explicitly.

Because `invoke` is provenance-bound to the published release asset, the `invoke` change ships as a version
bump to 1.2.1 (a backward-compatible patch): a consumer re-runs `esk-genesis` to pick the fixes up, and a repo
that does not vendor the skills sees no gate-behavior change.

## Consequences

* A developer in a consumer repo gets the same offline-gate result locally that CI gives, instead of a wall of
  false failures that trains them to push with `--no-verify`. The hook test now covers the argument path, so a
  future change that drops `invoke` again turns the suite red.
* A consumer that vendors the skills has a green `enterprise-gates` board that reflects their product code, not
  their vendored copy of the gate machinery. The exemption is narrow (`scripts/ci` and `.claude/skills`, the
  two places the machinery is copied) and anchored, so it does not open a path to hide real product code.
* The consumer's discrimination-test step now proves the `scripts/ci` gate it actually runs is not hollow,
  closing the gap where it proved nothing about that copy. Upstream behavior is unchanged: this repo has no
  `scripts/ci`, so the tests still resolve the `.claude/skills` gate here.
* Honest limit: these fixes are verified on Windows (Node 24) and in this repo's Linux CI through the meta
  tests, but the end-to-end consumer install that issue #112 describes was reproduced by hand, not by an
  automated consumer-install job. The `CONSUMER-TESTS` meta test bootstraps a consumer without vendoring the
  skills, so the vendored-skills case specifically is covered by the per-gate reproduction and the new hook
  and resolution tests, not by a standing vendored-consumer CI job.
