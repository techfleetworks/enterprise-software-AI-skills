---
status: "accepted"
date: 2026-10-18
decision-makers: mdenner
---

# Engineering gates begin travelling to consumers: reference-links is the first

## Context and Problem Statement

Until now the manifest carried only the three self-protection gates (parity, provenance, presence) plus the
aggregator. A consumer therefore got the machinery that keeps the gate system honest, but **no engineering
gate** that checks the consumer's own code. ADR-0059 added `invoke` (per-gate CLI args) so an engineering
gate can declare what to scan. This change puts the first one in the manifest.

## Decision

Add `reference-links` to the manifest as a travelling engineering gate.

- It is marked `// bootstrap-v2-gate: reference-links` (upstream-integrity requires the self-declaring marker),
  listed with `skill: judge-arch`, its normalized sha256 (ADR-0058), its test, `lane: required`, and
  `invoke: ["--root", "."]` so it scans the consumer's whole tree.
- `reference-links` is the clean first case: it flags dangling `.md` references, passes on a repo with zero
  Markdown (verified), and needs no consumer-provided config.
- The manifest `version` is bumped to **1.2.0**. The engineering gates are a 1.2.0 feature, and 1.2.0 is
  unreleased, so origin-mode provenance passes (you may not change an already-published version's gates, but a
  not-yet-published version is the origin legitimately authoring it). `package.json`/`VERSION` stay at 1.1.0
  and move to 1.2.0 at the 1.2.0 release; the manifest version leads during development, as the gate set it
  pins is what is accumulating.

Verified end to end: upstream-integrity passes with the four gates (markers, hashes, tests match source);
genesis into a fresh consumer copies the gate and its test, `reference-links` runs there via its `invoke`, and
the consumer-green test (which now also runs the copied `reference-links` test) passes.

## Consequences

* A consumer now gets a real engineering check (dangling-link integrity over its own docs), not only the gate
  system's self-protection. This is the first proof that the "engineering gates travel" machinery works end to
  end through `invoke`.
* Consumers that genesis now pin `1.2.0`, which is unreleased, so their provenance gate fails closed until
  1.2.0 is published (correct: the engineering gates are not released yet). This is expected during the 1.2.0
  build and resolves when 1.2.0 ships.
* Finding that shaped the scope: scanning the whole consumer tree with the two code-scan gates
  (`no-ua-sniffing`, `owasp-lints`) **false-positives on the gate infrastructure and test fixtures** — the
  copied gate scripts and their test fixtures legitimately contain user-agent strings and insecure-cookie
  examples. Making those gates travel cleanly needs a scan-scope mechanism (skip the gate infra and test
  directories, without opening an evasion hole), which is a deliberate change deferred to its own ADR.
  `reference-links` does not have this problem (it reads `.md`, not the gate scripts), so it travels now.
* Known limitation: `reference-links` only checks Markdown link integrity; it is a modest but genuinely
  portable first gate. The higher-value code-scan gates follow once the scan-scope mechanism lands.
