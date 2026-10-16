---
status: "accepted"
date: 2026-10-15
decision-makers: mdenner
---

# The committed gate manifest must match the published upstream release it pins

## Context and Problem Statement

ADR-0041 made `gate-manifest.json` the single source of truth for which gates a repo must run, and
ADR-0042 added the parity gate, which proves the committed gate scripts match the hashes in that same
manifest. There is a hole between them: both gates trust the committed manifest. Nothing proves the
committed manifest is itself a faithful copy of the official one the skills repo published for the
version it claims. An attacker (or a careless bump) can edit the manifest directly: drop a gate, flip a
required gate to advisory, or point a gate at a weakened script and update that gate's `sha256` to
match. Parity still passes, because the scripts match the tampered manifest. The repo looks green while
enforcement has been quietly gutted. This is the `@forged-manifest` red path in the malicious-actor
feature, which names `check-manifest-provenance` but does not build it.

The chain must be: the published release is the trusted anchor, provenance proves the committed manifest
is a faithful copy of it, parity proves the scripts match the committed manifest, and the aggregator
runs them. Each link is checked by the next. This ADR adds the first link.

## Decision Drivers

* Data ownership (the four questions): "what version X's gates are" has exactly one owner, the published
  release. The committed manifest is a copy; provenance proves the copy faithful rather than letting a
  second, editable source of truth exist.
* Detect tampering by comparison, not judgment: content-addressed `sha256` plus id and lane, compared
  against a copy the PR cannot edit.
* The origin repo (the skills repo itself) must still be able to author the next version, so the gate
  cannot simply demand that every manifest match an existing release.
* Fail closed: if provenance cannot be verified, the result is red, never a vacuous green.
* Dependency-free to run (Node built-ins plus the platform `fetch`), so it travels with the skill.

## Considered Options

### Where the upstream truth lives

* **An immutable release asset (chosen).** Each skills release attaches `gate-manifest.json`, and the
  repo's immutable-releases setting freezes the tag and its assets so a published version cannot be
  silently re-pointed. Strongest anchor available on the current plan.
* **A file read at the git tag.** Rejected as the primary anchor: a tag can be force-moved by anyone
  with push access, so the "original" it compares against is not tamper-evident.
* **A hash vendored inside the consumer repo.** Rejected as the primary anchor: the same PR that
  weakens the manifest can edit the vendored hash, so it catches accidents but not a deliberate forge.

### How the gate resists the PR it is checking

* **Base-branch execution plus code owners (chosen).** The gates run from the workflow on the base
  branch (a `pull_request_target`-style read-only job that inspects the PR's files as data and runs no
  PR code and needs no secrets), so a PR cannot rewrite the gate that judges it. `CODEOWNERS` over the
  enforcement paths is the human backstop. Both work on the current plan.
* **Code-owner review only.** Rejected as the sole control: it makes a human approval the only line of
  defense, with no mechanism behind it.
* **An org-level required workflow.** Not chosen now: it is the hardest to tamper with but is not
  verified available on the current (free) plan, so it is not something this ADR can rely on yet.

## Decision

Add **`check-manifest-provenance.mjs`** (PROVENANCE-001, in the `judge-arch` skill). It reads the
committed manifest and the published upstream manifest and compares the upstream-origin gates. Every
committed upstream gate must appear in the published manifest with the same `id`, `sha256`, and `lane`,
and no published gate may be missing from the committed manifest. Gates with `origin` `repo-local` were
adopted at genesis, are not governed by upstream, and are ignored here.

The gate makes no network call. The CI workflow downloads the release asset `gate-manifest.json` for tag
`v<version>` and points the gate at the downloaded file (`GATE_UPSTREAM_FILE`), the same pattern the
OWASP verbatim gate uses when it vendors its source before the offline gate runs. This keeps the gate an
offline, deterministic CLI tool and satisfies the repo's own `no-outbound-web-in-gate-scripts`
architecture rule (the download is IO at the workflow boundary; the gate is pure comparison). A download
failure is the workflow's step to fail, before the gate runs; a 404 (no release for that version) leaves
the file absent, which the gate reads as "not published."

Mode is decided by identity. When `GITHUB_REPOSITORY` equals the upstream repo, the gate runs in
**origin** mode: an already-published version must still match (the skills repo cannot rewrite 1.2.0's
gates while still calling it 1.2.0), but a not-yet-published version passes, because the origin is
legitimately authoring it. Any other repo runs in **consumer** mode, where a pinned version with no
published release fails closed, so provenance cannot be escaped by pinning a version that was never
released.

Exit codes: 0 = faithful copy (or origin authoring an unreleased version); 1 = the committed manifest
diverges from the published upstream (forged or weakened); 2 = fail closed (a manifest cannot be read or
parsed, the upstream cannot be reached, or, as a consumer, the pinned version has no published release).

It is pinned by `test/manifest-provenance.test.mjs` (14 cases), which builds a committed manifest and a
stand-in published manifest and asserts every exit path and both modes; the test was confirmed to fail on
a neutralized gate (11 of the 14 cases go red when the gate is forced to exit 0; the 3 that stay green
are the cases that legitimately expect exit 0 - a faithful copy, a repo-local gate ignored, and origin
authoring an unreleased version).

`CODEOWNERS` is added over the enforcement paths (gate scripts, manifest and schema, workflows, the
always-on directive) as the human backstop.

### Scope of this PR, stated plainly

This PR ships the mechanism that travels: the gate, its discrimination test, and `CODEOWNERS`. It does
**not** ship the release-publish workflow (attach `gate-manifest.json` to each release), does not flip
the immutable-releases repo setting, and does not wire provenance into this repo's own CI. Those three
need this repo to first adopt its own root `gate-manifest.json`, which is the dogfood step (a later PR);
publishing them now would be half-wired config against a manifest that does not yet exist. The
immutable-releases setting and the "require code-owner review" ruleset rule are repo-settings changes,
confirmed with a human before they are flipped, not applied by this PR.

## Consequences

* The manifest is now anchored to the release it claims to come from, closing the gap parity left: a
  weakened manifest that still matches its own scripts is caught by provenance.
* The origin repo can still author the next version without the gate blocking it, while an
  already-published version is frozen against silent rewrites.
* Known limitation: provenance checks that the committed manifest matches the published one; it does not
  prove the published manifest is itself well-designed. In origin mode it does not stop the version
  field from being decremented. The origin is the trusted authoring repo, and immutable releases plus
  branch protection on `main` cover release history; this is stated rather than hidden.
* Known limitation: origin-vs-consumer mode is decided from `GITHUB_REPOSITORY` and `GATE_UPSTREAM_REPO`,
  which are only as trustworthy as the workflow that sets them. A self-hosting consumer owns its own
  `.github/workflows/` and can override those env vars to assert origin mode and take the lenient
  "unreleased version passes" path, bypassing provenance. This is the same ceiling every CI gate has: a
  repo that controls its own CI can neutralize any check. The real control against it is the org-level
  required workflow (a consumer cannot edit), which is noted above as unavailable on the current plan;
  until it lands, origin mode is trustworthy only when the workflow is the org-controlled one.
* Known limitation: `CODEOWNERS` and immutable releases only take effect once the matching repo settings
  are enabled. Committing the file and writing this ADR is necessary but not sufficient; the settings
  changes are tracked separately and gated on a human.
* Because the download is the workflow's job and the gate is a pure offline comparison, the gate's full
  logic is exercised by the fixture unit test (every exit path and both modes), and only the download
  step itself is left to CI. This matches the split the OWASP verbatim gate already uses (vendor the
  source in the workflow, run the offline gate against it).
