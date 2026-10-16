---
status: "accepted"
date: 2026-10-16
decision-makers: mdenner
---

# esk-genesis bootstraps and reconciles a consumer repo from the upstream manifest

## Context and Problem Statement

ADR-0046 made the skills repo's `gate-manifest.json` the single upstream source of truth, kept drift-proof
at the source. The enforcement-core gates (parity, aggregator, provenance, presence) all run inside a
consumer repo. What was still missing is the step that actually PUTS that machinery into a consumer repo
and keeps it synced with the pinned skills version, with no per-dev guesswork. `features/genesis.feature`
and `features/version-updates.feature` describe this: genesis installs the machinery, reconcile keeps it
current, a dropped gate leaves no orphan, and a repo-local guard the consumer already had is left alone.

Without a generator, every consumer repo would hand-copy gate scripts and hand-write a manifest, which is
exactly the drift this program exists to remove.

## Decision Drivers

* One source of truth: the generator reads the upstream manifest (ADR-0046) and installs exactly what it
  lists, hash-verifying every copy, so the consumer cannot end up with gates the pinned version does not
  ship or miss ones it does.
* Reconcile, not clobber: a re-run updates changed scripts, removes gates dropped upstream, and leaves a
  consumer's own repo-local guards untouched (recording them as adopted so parity does not flag them).
* Safe by default: it prints a plan and writes nothing without `--yes`, backs up an existing manifest,
  and hash-verifies every copy, mirroring `esk-init`.
* The installed gates must resolve correctly in the consumer's layout, which differs from the upstream's.

## Decision

Add **`esk-genesis.mjs`** (in the `bootstrap` skill). Given `--source` (the upstream skills repo) and
`--target` (the consumer repo), it:

* reads the source manifest, resolves each upstream gate and machinery script at
  `<source>/.claude/skills/<skill>/scripts/<basename>`, and copies it to the consumer at the manifest's
  `script` path (`scripts/ci/...`), copying each gate's test too, and hash-verifying every gate and
  machinery SCRIPT against the manifest (a source that does not match its manifest sha256, or an entry
  with no string sha256, is a blocker, exit 1). Test files are copy-verified (the copied bytes match the
  source) but not manifest-hashed, since the manifest does not record test hashes. Every destination is
  checked to stay inside the target repo (no path traversal), and the upstream repo name is constrained to
  `owner/repo` before it is written into the scaffolded workflow;
* writes the consumer's `gate-manifest.json` (the version pin plus the upstream gates and machinery
  verbatim), and PRESERVES any `check-*.mjs` the consumer already had that the upstream does not ship,
  recording it as origin `repo-local` with its real hash and never touching the file;
* on a re-run, re-copies changed scripts, REMOVES a gate dropped from the new upstream version (its script
  and test deleted, so no orphan), leaves repo-local gates alone, and is a no-op when already current;
* scaffolds `.github/workflows/enterprise-gates.yml`, the single required check, which fetches the pinned
  upstream release manifest (so provenance can verify it) and runs the aggregator.

Because the gates default their repo-root resolution to their UPSTREAM location (four levels up, under
`.claude/skills/<skill>/scripts`) and live two levels up in a consumer (`scripts/ci`), the scaffolded
workflow sets `GATE_REPO_ROOT`, `GATE_MANIFEST_FILE`, and `GATE_DIR` to the workspace so every gate
resolves to the consumer root. This was found and fixed by running the generated consumer end to end: all
three gates pass only once the workflow supplies that env.

It is pinned by `test/esk-genesis.test.mjs` (14 cases), which builds a synthetic upstream and asserts the
produced files and manifest, byte-identical copies, repo-local preservation, reconcile removal of a
dropped gate, idempotency, the source-integrity blocker, path-traversal and skill-traversal and
injection-name blocks, reconcile-removal containment, the workflow env, the repo-local no-test warning,
and that a dry run writes nothing. The copy step and both containment guards were confirmed to be pinned:
neutralizing any of them turns a test red.

## Consequences

* A consumer repo is bootstrapped and kept in sync with one command; "the skills are enforced here"
  becomes a fact the gates prove, not a hope.
* The generator is the consumer-side complement to the upstream-integrity gate: integrity keeps the
  manifest honest at the source, genesis installs it faithfully, and parity/provenance/presence keep it
  honest in the consumer.
* Known limitation: a repo-local gate is recorded with a conventional test path; if the consumer has no
  test there, the generator warns and parity flags it until a test is added. The generator does not
  invent a test.
* Known limitation: enforcement is only live once an admin makes the aggregator a required status check
  (and keeps branch protection on). The generator cannot set branch protection; it scaffolds the workflow
  and says so. This is the same consumer-controlled-CI ceiling noted in ADR-0045 and ADR-0046.
* Known limitation: the scaffolded workflow is written only when absent; a consumer that has customized it
  keeps their version, so a later workflow change upstream is not force-applied. Re-scaffolding on demand
  is a future option.
* A genesis'd consumer's provenance gate stays red until the upstream publishes the release manifest
  asset (the deferred, human-gated release step in ADR-0044); until then provenance correctly fails
  closed on an unpublished version.
