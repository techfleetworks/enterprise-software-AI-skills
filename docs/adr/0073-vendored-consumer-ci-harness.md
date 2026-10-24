---
status: "accepted"
date: 2026-10-23
decision-makers: mdenner
---

# A vendored-consumer CI harness: run the scaffolded gates on the documented vendoring layout, upstream, before release

## Context and Problem Statement

Every consumer-install bug (issues #112 and #117–#153) has lived in the EXISTING/VENDORING consumer path that
the origin self-dogfood never exercises: the origin has one real gate copy, its own hook, and is never a
vendoring consumer of itself. ADR-0070 named this gap directly ("a standing vendored-skills consumer run
remains a tracked follow-up"), and issue #133 is that follow-up: nothing upstream builds a repo that vendors
the skills under `.claude/skills/` and runs the scaffolded gates, so a gate that reports the vendored machinery
as product code (for example #142, #118) reaches a release before anyone notices.

A second, subtler hole (#119) makes a naive harness worthless: a child `node --test` inherits
`NODE_TEST_CONTEXT` from the parent run and reports exit 0 even when its tests FAIL, so a harness that runs a
copied gate's discrimination test as a child would pass even if that test were neutered.

## Decision

Add `test/vendored-consumer-harness.test.mjs`, wired into `npm test` (a required check). It:

1. Builds the documented vendoring layout: `git init` a throwaway repo, copy `.claude/skills` into it, add a
   `package.json` + `pyproject.toml` + a Python source file (the reported Python + npm consumer shape).
2. Runs `esk-genesis` into it.
3. Runs EXACTLY the scaffolded workflow steps: the gate matrix, then for every gate
   `run-manifest-gates --only <id>` with the `GATE_*` env the workflow sets, asserting each exits 0, and
   asserting each gate's discrimination test file is installed (#128 cross-check).
4. Runs a representative gate's discrimination test (arch-gate) in the consumer layout with `GATE_DIR` set and
   `NODE_TEST_CONTEXT`/`NODE_TEST_WORKER_ID` stripped, so a neutered copied test would be caught (#119).
5. A separate guard proves the strip works: a deliberately failing child `node --test` must report non-zero.

For the offline provenance gate, `GATE_UPSTREAM_FILE` points at a copy of the consumer's own manifest (which is
the 1.3.x release manifest), so provenance compares it to itself and passes without a network fetch; the release
round-trip itself is covered by `test/manifest-provenance.test.mjs`, not here.

This is repo-self (upstream's own test), so it ships in the 1.3.1 line with no version bump of its own.

## Consequences

* A change that breaks a vendoring consumer turns the upstream suite red before release. Discrimination is
  proven: reverting the #142 invoke fix makes the harness fail with `gate "arch-gate" FAILED on the vendoring
  consumer`. This is the structural guard (#133) that keeps the whole consumer-install bug class from recurring.
* #119 is closed and pinned: the harness strips the node:test child context, and the vacuity guard fails if the
  strip regresses, so the harness can never silently pass with a broken copied gate test.
* Honest limits. The harness runs ALL gates on the vendored layout (the install-green core) but executes only
  ONE representative discrimination test nested, because running all of them nested is prohibitively heavy on
  some hosts (observed: >400s locally, ~10s trimmed). Every gate test shares byte-identical three-way `GATE_DIR`
  resolution code, so running arch-gate's test validates that code for all of them; the per-test resolution
  assertions themselves are dormant upstream (they are guarded on a `scripts/ci` copy that only a consumer has),
  so the guarantee for the other ten is the shared code, not an exercised assertion. The harness still runs every
  gate's SCRIPT green on the vendored layout and asserts every gate's test file is installed. A forward guard
  asserts every manifest gate is lane `required` (the per-gate exit-0 check assumes that). The harness pins the
  current vendoring layout and runs on Linux CI; it skips cleanly where git is unavailable.
