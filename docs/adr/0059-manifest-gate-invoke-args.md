---
status: "accepted"
date: 2026-10-18
decision-makers: mdenner
---

# A manifest gate can declare its CLI arguments (`invoke`)

## Context and Problem Statement

The aggregator (`run-manifest-gates`) ran every gate script with **no arguments**. That is fine for the
self-protection gates (parity, provenance, presence), which find their target through `GATE_*` env seams. But
the **engineering** gates we want to travel to consumers (owasp-lints, no-ua-sniffing, migration-safety,
arch-gate, and so on) are pointed at what to scan by **CLI path arguments** — they read neither
`GATE_REPO_ROOT` nor `GATE_DIR`. With no way to express those arguments in the manifest, an engineering gate
either could not run in a consumer at all, or would run with no target and scan nothing. The aggregator's own
docstring flagged this as the missing piece: "an `args`/`requires` field is a future schema addition."

This is the first foundational step of v1.2 ("engineering gates travel to consumers"): the manifest has to be
able to say *how* to run each gate before any engineering gate can be added to it.

## Decision

Add an optional `invoke` field to a gate entry: an **array of string CLI arguments** the aggregator passes to
the gate script when it runs it.

- Schema (`gate-manifest.schema.json`): `invoke` is `{ type: array, items: { type: string } }`, optional.
- Aggregator (`run-manifest-gates`): if a gate has `invoke`, it is validated strictly (an array of strings or
  absent) and **fails closed (exit 2) otherwise** — a malformed `invoke` must never be silently dropped,
  because a gate that silently loses its arguments would scan nothing and report green. The args are passed
  with `spawnSync` and **no shell**, so a value cannot inject a command; and the manifest itself is
  parity- and provenance-protected, so the args are trusted content.
- A gate with no `invoke` runs with no arguments, exactly as before (backward compatible).

It is pinned by tests: the aggregator test proves the arg is actually delivered (a fixture gate exits 0 only
when it receives its `invoke` arg, and fails without it, so a dropped arg would turn the test red) and that a
malformed `invoke` fails closed; the schema test proves `invoke` of strings validates and a non-string element
or a non-array is rejected.

## Consequences

* An engineering gate that scans the consumer's code can now be expressed in the manifest (it declares what to
  scan via `invoke`, e.g. `["."]` for the whole repo). This unblocks adding the Tier-1 code-scan gates next.
* No behavior change for existing gates: they have no `invoke` and run argument-free as before.
* The injection surface is nil (no shell), and a malformed `invoke` fails closed rather than scanning nothing,
  so the field cannot be used to silently weaken a gate.
* Known limitation: `invoke` is a static argument list in the manifest. A gate that needs a *runtime* value
  (for example the PR's changed-file list) still needs that value supplied by the workflow, not the manifest;
  `invoke` carries only the fixed arguments (such as the scan root). Those runtime-fed gates are handled when
  their workflow wiring is added, not here.
