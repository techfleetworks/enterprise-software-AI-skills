---
status: "accepted"
date: 2026-10-18
decision-makers: mdenner
---

# The two code-scan gates travel: scan-scope flag, the genesis invoke fix, and binding invoke to provenance

## Context and Problem Statement

ADR-0060 shipped `reference-links` as the first travelling engineering gate and deferred the two code-scan
gates, `no-ua-sniffing` and `owasp-lints`. The reason it deferred them: when the aggregator scans the whole
consumer tree, both gates flag the copied gate infrastructure itself. The gate scripts live at `scripts/ci`
in a consumer and their own docstrings carry user-agent strings and an insecure-cookie example, so a
whole-repo scan reports findings in `scripts/ci/check-no-ua-sniffing.mjs` and `scripts/ci/check-owasp-lints.mjs`
that are not product defects. That is a false red on the gate's own machinery.

While verifying the fix end to end, a second and more serious problem surfaced: **genesis was silently
dropping the `invoke` field** when it wrote the consumer manifest. The installer rebuilt each gate object
field by field (`id`, `origin`, `skill`, `script`, `sha256`, `test`, `lane`, `couples`) and never copied
`invoke`. So in every consumer, `reference-links` ran with no `--root`, and `no-ua-sniffing` and `owasp-lints`
ran with no path at all and failed closed with "no paths given". The "engineering gates travel" mechanism
from ADR-0059 and ADR-0060 did not actually reach consumers. The aggregator supported `invoke`, the source
manifest declared it, and the installer threw it away in between.

## Decision

Make both code-scan gates travel, and fix the install step that was dropping their arguments.

1. **Add a `--ignore <relpath>` flag** (repeatable) to `check-no-ua-sniffing.mjs` and `check-owasp-lints.mjs`.
   It skips a directory the gate must never lint, resolved against the current working directory, matched as
   a path prefix. The manifest `invoke` for both gates becomes `["--allow-empty", "--ignore", "scripts/ci", "."]`:
   scan the whole consumer tree, skip only the gate infrastructure, and pass a genuinely empty scan.
   - The match is anchored at the working directory, not by basename. A decoy directory named `scripts/ci`
     somewhere else in the tree (for example `src/scripts/ci`) is still scanned. This is the anti-evasion
     property for the flag itself: you cannot dodge the gate by naming a folder after the ignored one.

2. **Preserve `invoke` in genesis.** The consumer-manifest builder now carries `invoke` through verbatim when
   it is present, and omits it when it is not (no spurious empty field). This is the fix that makes any
   travelling gate, including `reference-links` from ADR-0060, actually run in a consumer.

3. **Bind `invoke` to provenance.** A fresh-context review caught a hole in the first draft of this change:
   `invoke` controls what a gate scans, but no gate protected it. `check-manifest-provenance.mjs` compared only
   `id`, `sha256` and `lane`; parity and upstream-integrity bind the gate script content, not the manifest's
   arg fields. So a consumer could edit their committed manifest's `invoke` to `--ignore src` (or `--ignore .`),
   make both code-scan gates skip all product code, let `--allow-empty` turn the empty scan green, and still
   pass every gate. Reproduced live: honest `--ignore scripts/ci` caught a `navigator.userAgent` branch in
   `src/` (exit 1); tampered `--ignore .` passed it (exit 0). The fix adds `invoke` to the provenance
   comparison: a committed upstream gate's `invoke` must deep-equal the published release's `invoke`, or
   provenance fails. A consumer can no longer change a gate's scan scope and stay green. A discrimination test
   in `test/manifest-provenance.test.mjs` flips a consumer's `invoke` four ways (narrowed, whole-tree, dropped,
   added) and asserts provenance goes red each time.

Both gates are marked `// bootstrap-v2-gate: <id>` (upstream-integrity requires the self-declaring marker),
listed with their skill, their normalized sha256 (ADR-0058), their test, `lane: required`, and the `invoke`
above. Test directories (`test`, `tests`, `__tests__`, `spec`) were already added to each gate's ignore set
so fixtures that carry intentional bad patterns do not false-positive; `--ignore scripts/ci` handles the gate
infrastructure, which is the remaining source of self-triggering.

## Consequences

* A consumer now runs three real engineering checks over its own code (dangling links, user-agent sniffing,
  the two OWASP source lints), not only the gate system's self-protection. Verified end to end: genesis into a
  fresh consumer, then run the aggregator. With clean product code all six gates pass; with a
  `navigator.userAgent` branch and an `alg: "none"` literal in `src/`, `no-ua-sniffing` and `owasp-lints` go
  red and the aggregator fails. The copied gate scripts under `scripts/ci` are not flagged.
* The genesis bug means **every consumer bootstrapped before this fix has a broken travelling-gate set**: its
  manifest has no `invoke`, so `reference-links` scans the wrong root and the two code-scan gates fail closed.
  Re-running genesis against a source at this version or later rewrites the consumer manifest with `invoke`
  preserved and repairs it. A regression test now asserts `invoke` survives into the consumer manifest, so the
  drop cannot come back silently.
* Honest limitation of `--ignore`: it is a path-prefix skip, so an over-broad ignore in `invoke` would hide
  product code. That risk is now bounded by provenance comparing `invoke` against the published release (fix 3):
  for a released version, a consumer that edits `invoke` diverges from the asset and fails provenance. Two gaps
  remain and are deliberate. First, in **origin mode** on an **unreleased** version provenance has nothing to
  compare against and passes, so the origin repo is trusted to author `invoke` honestly (the same trust the
  origin already has over every gate's content); the published release is what freezes it for consumers.
  Second, the gate scripts themselves still accept any `--ignore` value on the command line: the manifest, not
  the script, is the control point, which is why the protection lives in provenance. If a later gate needs a
  consumer-configurable scope, that belongs in a config file the gate validates, not in a developer-editable
  manifest field.
* Honest limitation of the gates themselves is unchanged: these catch the sniffing surface and two source
  lints, not a correct feature-detection fallback or a full threat model. They are structural floors, and
  judge-arch plus the BDD scenarios remain the real review.
